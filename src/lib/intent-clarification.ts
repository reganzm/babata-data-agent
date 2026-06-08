import type { UserClarificationPayload } from '@/lib/sql-clarification'

type TableMeta = { name: string }

export type IntentClarificationRequirement = {
  required: boolean
  reason: string
  candidateTables: string[]
  requiredFields: string[]
  inferredTable?: string
}

function normalize(value: string): string {
  return value.trim().toLowerCase()
}

export function detectTableMatchesFromText(
  text: string,
  tables: TableMeta[],
): string[] {
  const normalizedText = text.toLowerCase()
  return tables
    .filter((table) => {
      const name = table.name.toLowerCase()
      return (
        normalizedText.includes(`\`${name}\``) || normalizedText.includes(name)
      )
    })
    .map((table) => table.name)
}

export function evaluateIntentClarificationRequirement(params: {
  userQuery: string
  intentSummary: string
  rejectionFeedback?: string
  clarification?: UserClarificationPayload | null
  tables: TableMeta[]
}): IntentClarificationRequirement {
  const { userQuery, intentSummary, clarification, tables } = params
  const tableMatches = detectTableMatchesFromText(
    `${userQuery}\n${intentSummary}`,
    tables,
  )

  const selectedTable = clarification?.tableName?.trim() ?? ''
  const hasDimensions = (clarification?.dimensions?.length ?? 0) > 0
  const hasMetrics = (clarification?.metrics?.length ?? 0) > 0
  const hasTimeStart = Boolean(clarification?.timeStart?.trim())
  const hasTimeEnd = Boolean(clarification?.timeEnd?.trim())
  const hasAnalysisStrategy = Boolean(clarification?.analysisStrategyId?.trim())

  const existingTableNames = new Set(tables.map((t) => normalize(t.name)))
  const tableExists =
    selectedTable.length > 0 && existingTableNames.has(normalize(selectedTable))

  const requiredFields: string[] = []
  if (!hasDimensions) requiredFields.push('dimensions')
  if (!hasMetrics) requiredFields.push('metrics')
  if (!hasTimeStart) requiredFields.push('timeStart')
  if (!hasTimeEnd) requiredFields.push('timeEnd')
  if (!hasAnalysisStrategy) requiredFields.push('analysisStrategyId')

  if (selectedTable && !tableExists) {
    return {
      required: true,
      reason: `你填写的目标表「${selectedTable}」不存在或不可用，请重新选择。`,
      candidateTables: tables.map((t) => t.name).slice(0, 20),
      requiredFields,
    }
  }

  if (!selectedTable && tableMatches.length === 0) {
    return {
      required: true,
      reason: '当前问题未能明确识别目标表，请先确认目标表后再继续分析。',
      candidateTables: tables.map((t) => t.name).slice(0, 20),
      requiredFields,
    }
  }

  if (!selectedTable && tableMatches.length > 1) {
    return {
      required: true,
      reason: `当前问题命中了多个候选表（${tableMatches.join('、')}），请明确选择目标表。`,
      candidateTables: tableMatches,
      requiredFields,
    }
  }

  if (requiredFields.length > 0) {
    return {
      required: true,
      reason:
        '当前分析意图不完整，请补充维度、指标、时间范围与分析方式后继续。',
      candidateTables: selectedTable
        ? [selectedTable]
        : tableMatches.length === 1
          ? tableMatches
          : tables.map((t) => t.name).slice(0, 20),
      requiredFields,
      inferredTable: selectedTable || tableMatches[0],
    }
  }

  return {
    required: false,
    reason: '',
    candidateTables: selectedTable
      ? [selectedTable]
      : tableMatches.length === 1
        ? tableMatches
        : [],
    requiredFields: [],
    inferredTable: selectedTable || tableMatches[0],
  }
}
