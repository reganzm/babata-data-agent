import { createStep } from '@mastra/core/workflows'
import { generateText } from 'ai'
import { getModelForRole } from '@/lib/model'
import { logLlmDebug } from '@/lib/llm-debug-log'
import {
  buildDefaultPartitionSqlHint,
  clarificationRequiresDs,
  diagnosePartitionEnforce,
  enforcePartitionFieldInSql,
  sqlUsesDtAsPartition,
} from '@/lib/partition-field'
import {
  buildSqlClarificationConstraints,
  resolveUserClarification,
  type SqlClarification,
} from '@/lib/sql-clarification'
import { assertReadonlySelect, normalizeGeneratedSql } from '@/mastra/tools/db/sql-guard'
import {
  afterSchemaSchema,
  afterSqlSchema,
  intentClarificationSuspendSchema,
  sqlApprovalResumeSchema,
} from '../schemas'

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalizeTableName(name: string): string {
  return name.replace(/`/g, '').trim().toLowerCase()
}

function hasExpectedTable(sql: string, expectedTable: string): boolean {
  const target = normalizeTableName(expectedTable)
  const tableRegex = /\b(?:from|join)\s+`?([a-zA-Z0-9_.]+)`?/gi
  let match: RegExpExecArray | null = null
  while ((match = tableRegex.exec(sql)) != null) {
    const hit = normalizeTableName(match[1] ?? '')
    if (hit === target || hit.endsWith(`.${target}`)) return true
  }
  return false
}

function validateSqlAgainstClarification(params: {
  sql: string
  clarification: SqlClarification | null
  primaryTable: string
}): string[] {
  const { sql, clarification, primaryTable } = params
  const violations: string[] = []

  const expectedTable = clarification?.tableName?.trim() || primaryTable
  if (expectedTable && !hasExpectedTable(sql, expectedTable)) {
    violations.push(`FROM/JOIN 未使用指定表：${expectedTable}`)
  }

  const requiredFields = new Set<string>([
    ...(clarification?.dimensions ?? []),
    ...(clarification?.metrics ?? []),
  ])
  for (const field of requiredFields) {
    if (!field.trim()) continue
    const fieldPattern = new RegExp(`\\b${escapeRegExp(field)}\\b`, 'i')
    if (!fieldPattern.test(sql)) {
      violations.push(`缺少澄清字段：${field}`)
    }
  }

  if (clarificationRequiresDs(clarification) && !/\bds\b/i.test(sql)) {
    violations.push('澄清要求使用 ds，但 SQL 未出现 ds')
  }
  if (clarificationRequiresDs(clarification) && sqlUsesDtAsPartition(sql)) {
    violations.push('澄清要求使用 ds，但 SQL 分区语境仍出现 dt')
  }

  return violations
}

function parseMissingClarificationFields(violations: string[]): string[] {
  return violations
    .map((item) => {
      const match = item.match(/^缺少澄清字段：(.+)$/)
      return match?.[1]?.trim()
    })
    .filter((item): item is string => Boolean(item))
}

export const generateSqlStep = createStep({
  id: 'generate-sql',
  inputSchema: afterSchemaSchema,
  outputSchema: afterSqlSchema,
  resumeSchema: sqlApprovalResumeSchema,
  suspendSchema: intentClarificationSuspendSchema,
  execute: async ({ inputData, resumeData, suspend }) => {
    const mergedClarificationInput = {
      ...inputData.userClarification,
      ...(resumeData?.clarification ?? {}),
    }
    const clarification = resolveUserClarification({
      rejectionFeedback: inputData.rejectionFeedback,
      userClarification: mergedClarificationInput,
    })
    const constraintBlock = buildSqlClarificationConstraints(clarification)
    const partitionHint =
      buildDefaultPartitionSqlHint(inputData.columns, clarification) ||
      (inputData.partitionField
        ? `【库表日期分区规范】必须使用列 \`${inputData.partitionField}\` 作为日期维度。`
        : '')

    const systemPrompt = `你是 SQL 生成器。目标库为 Apache Doris（MySQL 协议兼容）。
仅输出一条只读 SELECT，不要 markdown 包裹，不要解释。
禁止用分号拼接多条语句；禁止 INSERT/UPDATE/DELETE/DDL。无 LIMIT 时请加合理 LIMIT（如 LIMIT 1000）。
Doris 语法：优先简单子查询；避免复杂多层 CTE 或可能不支持的窗口/高级语法。
表含 ds 列时：日期分区、WHERE 范围、按日 GROUP BY 必须用 ds（yyyyMMdd），禁止默认使用 dt 或 CURRENT_DATE/DATE_SUB。
若存在用户澄清或硬性约束，必须逐条遵守；禁止照抄被驳回 SQL。
表：\`${inputData.primaryTable}\`
列：${inputData.columns.map((c) => `${c.name}(${c.type})`).join(', ')}${
      partitionHint ? `\n\n${partitionHint}` : ''
    }`

    const basePrompt = `用户意图：${inputData.intentSummary}\n原始问题：${inputData.userQuery}${
      constraintBlock ? `\n\n${constraintBlock}` : ''
    }${
      inputData.rejectionFeedback?.trim()
        ? `\n\n【驳回澄清全文】\n${inputData.rejectionFeedback.trim()}${
            inputData.lastRejectedSql?.trim()
              ? `\n\n被驳回 SQL（禁止照抄，尤其禁止继续使用错误的日期列如 dt）：\n${inputData.lastRejectedSql.trim()}`
              : ''
          }`
        : ''
    }`

    const first = await generateText({
      model: getModelForRole('ximo'),
      system: systemPrompt,
      prompt: basePrompt,
    })
    logLlmDebug({
      scene: 'generate-sql:first-pass',
      userInput: {
        userQuery: inputData.userQuery,
        intentSummary: inputData.intentSummary,
        primaryTable: inputData.primaryTable,
        clarification,
        rejectionFeedback: inputData.rejectionFeedback,
      },
      llmOutput: first.text,
    })
    const firstRawSql = assertReadonlySelect(normalizeGeneratedSql(first.text))
    let sql = enforcePartitionFieldInSql(
      firstRawSql,
      inputData.columns,
      clarification,
      inputData.partitionField,
    )
    if (sqlUsesDtAsPartition(sql)) {
      sql = enforcePartitionFieldInSql(
        sql,
        inputData.columns,
        clarification,
        'ds',
      )
    }

    let violations = validateSqlAgainstClarification({
      sql,
      clarification,
      primaryTable: inputData.primaryTable,
    })

    if (violations.length > 0) {
      const second = await generateText({
        model: getModelForRole('ximo'),
        system: `${systemPrompt}\n\n若违反澄清字段约束，必须重写直到满足后再输出。`,
        prompt: `${basePrompt}\n\n上一版 SQL（不合格）：\n${sql}\n\n不合格原因：\n- ${violations.join('\n- ')}\n\n请只输出一条修正后的 SELECT，且必须完全满足上述约束。`,
      })
      logLlmDebug({
        scene: 'generate-sql:second-pass',
        userInput: {
          basePrompt,
          previousSql: sql,
          violations,
        },
        llmOutput: second.text,
      })
      const secondRawSql = assertReadonlySelect(normalizeGeneratedSql(second.text))
      sql = enforcePartitionFieldInSql(
        secondRawSql,
        inputData.columns,
        clarification,
        inputData.partitionField,
      )
      if (sqlUsesDtAsPartition(sql)) {
        sql = enforcePartitionFieldInSql(
          sql,
          inputData.columns,
          clarification,
          'ds',
        )
      }
      violations = validateSqlAgainstClarification({
        sql,
        clarification,
        primaryTable: inputData.primaryTable,
      })
      if (violations.length > 0) {
        const missingFields = parseMissingClarificationFields(violations)
        const clarificationFields = new Set<string>([
          ...(clarification?.dimensions ?? []),
          ...(clarification?.metrics ?? []),
        ])
        const allMissingFieldsAlreadyClarified =
          missingFields.length > 0 &&
          missingFields.every((field) => clarificationFields.has(field))

        if (allMissingFieldsAlreadyClarified) {
          // 用户已明确澄清，不再反复弹澄清；交给后续 SQL 审批由人工最终裁决。
          if (process.env.NODE_ENV === 'development') {
            console.warn('[generate-sql] 澄清已提供但 SQL 仍缺字段，跳过二次澄清挂起', {
              missingFields,
              table: inputData.primaryTable,
            })
          }
          return {
            ...inputData,
            sql,
          }
        }

        await suspend({
          approvalType: 'intent-clarification',
          clarificationStage: 'sql-regeneration',
          reason: `SQL 未满足澄清约束：${violations.join('；')}。请补充或调整澄清后继续。`,
          candidateTables: [inputData.primaryTable],
          requiredFields: missingFields.length > 0 ? missingFields : ['metrics'],
          inferredTable: inputData.primaryTable,
        })
        console.info('[intent-clarification] suspend@generate-sql', {
          table: inputData.primaryTable,
          violations,
          requiredFields: missingFields.length > 0 ? missingFields : ['metrics'],
        })
        return {
          ...inputData,
          sql: `SELECT * FROM \`${inputData.primaryTable}\` LIMIT 1`,
        }
      }
    }

    const diag = diagnosePartitionEnforce(
      firstRawSql,
      inputData.columns,
      clarification,
      inputData.partitionField,
    )
    if (process.env.NODE_ENV === 'development') {
      console.info('[generate-sql] partition', {
        table: inputData.primaryTable,
        ...diag,
        hasClarification: Boolean(clarification),
        hasRejectionFeedback: Boolean(inputData.rejectionFeedback?.trim()),
      })
      if (sqlUsesDtAsPartition(sql)) {
        console.warn('[generate-sql] 校正后仍含 dt:', sql.slice(0, 280))
      }
    }
    return {
      ...inputData,
      sql,
    }
  },
})
