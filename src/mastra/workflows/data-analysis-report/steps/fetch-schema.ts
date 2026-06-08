import { createStep } from '@mastra/core/workflows'
import {
  describeTableOperation,
  listTablesOperation,
} from '@/mastra/tools/db'
import {
  clarificationRequiresDs,
  resolvePartitionField,
} from '@/lib/partition-field'
import { resolveUserClarification } from '@/lib/sql-clarification'
import { evaluateIntentClarificationRequirement } from '@/lib/intent-clarification'
import {
  afterParseSchema,
  afterSchemaSchema,
  intentClarificationSuspendSchema,
  sqlApprovalResumeSchema,
} from '../schemas'

function normalizeTableName(value: string): string {
  return value.trim().toLowerCase()
}

function detectTableFromText(
  text: string,
  tables: Array<{ name: string }>,
): string | null {
  const normalizedText = text.toLowerCase()
  for (const table of tables) {
    const name = table.name.toLowerCase()
    if (
      normalizedText.includes(`\`${name}\``) ||
      normalizedText.includes(name)
    ) {
      return table.name
    }
  }
  return null
}

export const fetchSchemaStep = createStep({
  id: 'fetch-schema',
  inputSchema: afterParseSchema,
  outputSchema: afterSchemaSchema,
  resumeSchema: sqlApprovalResumeSchema,
  suspendSchema: intentClarificationSuspendSchema,
  execute: async ({ inputData, resumeData, suspend }) => {
    const { tables } = await listTablesOperation()
    const mergedClarificationInput = {
      ...inputData.userClarification,
      ...(resumeData?.clarification ?? {}),
    }
    const clarification = resolveUserClarification({
      rejectionFeedback: inputData.rejectionFeedback,
      userClarification: mergedClarificationInput,
    })

    const requirement = evaluateIntentClarificationRequirement({
      userQuery: inputData.userQuery,
      intentSummary: inputData.intentSummary,
      rejectionFeedback: inputData.rejectionFeedback,
      clarification: clarification ?? undefined,
      tables,
    })

    if (requirement.required) {
      console.info('[intent-clarification] suspend@fetch-schema', {
        reason: requirement.reason,
        candidateTables: requirement.candidateTables,
        requiredFields: requirement.requiredFields,
        inferredTable: requirement.inferredTable ?? null,
      })
      await suspend({
        approvalType: 'intent-clarification',
        clarificationStage: 'intent-disambiguation',
        reason: requirement.reason,
        candidateTables: requirement.candidateTables,
        requiredFields: requirement.requiredFields,
        inferredTable: requirement.inferredTable,
      })
      return {
        ...inputData,
        tables: [],
        columns: [],
        primaryTable: requirement.inferredTable ?? '__pending_clarification__',
      }
    }

    const clarificationTable = clarification?.tableName?.trim() || ''
    const tableFromText = detectTableFromText(
      `${inputData.userQuery}\n${inputData.intentSummary}`,
      tables,
    )
    const preferredTable = clarificationTable || tableFromText || ''

    let primary = tables[0]?.name
    if (preferredTable) {
      const exists = tables.some(
        (t) => normalizeTableName(t.name) === normalizeTableName(preferredTable),
      )
      if (!exists) {
        console.info('[intent-clarification] suspend@fetch-schema-invalid-table', {
          selectedTable: preferredTable,
        })
        await suspend({
          approvalType: 'intent-clarification',
          clarificationStage: 'intent-disambiguation',
          reason: `指定表不存在或不可用：${preferredTable}。请在澄清中重新选择可用表。`,
          candidateTables: tables.map((t) => t.name).slice(0, 20),
          requiredFields: ['tableName'],
        })
        return {
          ...inputData,
          tables: [],
          columns: [],
          primaryTable: '__pending_clarification__',
        }
      }
      primary = preferredTable
    }

    if (!primary) {
      throw new Error('未找到可用数据表')
    }

    const { columns: allColumns } = await describeTableOperation(primary)
    let partitionField = resolvePartitionField(allColumns, clarification)
    if (!partitionField && clarificationRequiresDs(clarification)) {
      partitionField = 'ds'
    }
    if (process.env.NODE_ENV === 'development') {
      console.info('[fetch-schema] table selection', {
        clarificationTable: clarificationTable || null,
        tableFromText,
        selectedTable: primary,
      })
    }

    return {
      ...inputData,
      tables,
      columns: allColumns,
      primaryTable: primary,
      partitionField: partitionField ?? undefined,
      userClarification: clarification
        ? {
            tableName: clarification.tableName,
            dimensions: clarification.dimensions,
            metrics: clarification.metrics,
            timeStart: clarification.timeStart,
            timeEnd: clarification.timeEnd,
            analysisStrategyId: clarification.analysisStrategyId,
            additionalNotes: clarification.additionalNotes,
          }
        : inputData.userClarification,
    }
  },
})
