import { z } from 'zod'
import { analysisArtifactSchema } from '@/lib/visualization/types'
import {
  workflowUserQueryInputSchema,
  workflowUserQueryObjectSchema,
} from '@/mastra/workflows/normalize-workflow-input'

export const workflowInputSchema = workflowUserQueryInputSchema

export const reportOutputSchema = z.object({
  report: z.string(),
  structured: z.object({
    sql: z.string().optional(),
    summary: z.string(),
    numbers: z.array(
      z.object({
        label: z.string(),
        value: z.union([z.string(), z.number()]),
      }),
    ),
    caveats: z.array(z.string()),
    visualization: analysisArtifactSchema.optional(),
  }),
})

export const fewShotDraftSchema = z.object({
  originalQuestion: z.string(),
  finalIntentSummary: z.string(),
  clarificationRecord: z.string(),
  generatedSql: z.string(),
  reportMarkdown: z.string(),
  generatedAt: z.string(),
})

export const interpretOutputSchema = reportOutputSchema.extend({
  fewShotDraft: fewShotDraftSchema,
})

export const userClarificationFieldsSchema = z.object({
  tableName: z.string().optional(),
  dimensions: z.array(z.string()).optional(),
  metrics: z.array(z.string()).optional(),
  timeStart: z.string().optional(),
  timeEnd: z.string().optional(),
  analysisStrategyId: z.string().optional(),
  additionalNotes: z.string().optional(),
})

export const userClarificationSchema = userClarificationFieldsSchema.optional()

/** 驳回后 dountil 再入 prep 时携带的上下文字段 */
export const prepLoopCarrySchema = workflowUserQueryObjectSchema.extend({
  intentSummary: z.string().optional(),
  rejectionFeedback: z.string().optional(),
  lastRejectedSql: z.string().optional(),
  sqlRevisionCount: z.number().int().nonnegative().optional(),
  sqlApproved: z.boolean().optional(),
  userClarification: userClarificationSchema,
})

/** carry 分支必须在前，否则 union 会先匹配仅含 userQuery 的对象并丢弃驳回澄清字段 */
export const prepLoopInputSchema = z.union([
  prepLoopCarrySchema,
  workflowUserQueryInputSchema,
])

export type PrepLoopCarry = z.infer<typeof prepLoopCarrySchema>

export function parsePrepLoopInput(inputData: unknown): PrepLoopCarry {
  const parsed = prepLoopInputSchema.parse(inputData)
  if (typeof parsed === 'string') {
    return { userQuery: parsed }
  }
  return prepLoopCarrySchema.parse(parsed)
}

export const afterParseSchema = workflowUserQueryObjectSchema.extend({
  intentSummary: z.string(),
  rejectionFeedback: z.string().optional(),
  lastRejectedSql: z.string().optional(),
  sqlRevisionCount: z.number().int().nonnegative().optional(),
  userClarification: userClarificationSchema,
})

export const afterSchemaSchema = afterParseSchema.extend({
  tables: z.array(z.object({ name: z.string() })),
  columns: z.array(
    z.object({
      name: z.string(),
      type: z.string(),
    }),
  ),
  primaryTable: z.string(),
  /** 默认日期分区列（如 ds） */
  partitionField: z.string().optional(),
})

export const afterSqlSchema = afterSchemaSchema.extend({
  sql: z.string(),
  /** SQL 被驳回后重生成次数 */
  sqlRevisionCount: z.number().int().nonnegative().optional(),
  /** human-approval 批准后为 true，dountil 退出条件 */
  sqlApproved: z.boolean().optional(),
  rejectionFeedback: z.string().optional(),
  lastRejectedSql: z.string().optional(),
  userClarification: userClarificationSchema,
})

export const afterExecuteSchema = afterSqlSchema.extend({
  queryResult: z.object({
    sql: z.string(),
    rowCount: z.number(),
    rows: z.array(z.record(z.union([z.string(), z.number(), z.null()]))),
    note: z.string(),
  }),
})

export const sqlApprovalSuspendSchema = z.object({
  approvalType: z.literal('sql-approval').optional(),
  sql: z.string(),
  intentSummary: z.string(),
  sqlRevisionCount: z.number().int().nonnegative().optional(),
})

export const sqlApprovalResumeSchema = z.object({
  approved: z.boolean(),
  /** 驳回时填写：如不兼容 Doris、CTE 不支持等，用于触发 SQL 重写 */
  feedback: z.string().optional(),
  /** 结构化澄清（与弹窗表单一致，优先于从 feedback 文本解析） */
  clarification: userClarificationFieldsSchema.optional(),
})

export const intentClarificationSuspendSchema = z.object({
  approvalType: z.literal('intent-clarification'),
  clarificationStage: z.enum(['intent-disambiguation', 'sql-regeneration']),
  reason: z.string(),
  candidateTables: z.array(z.string()).optional(),
  requiredFields: z.array(z.string()).optional(),
  inferredTable: z.string().optional(),
})

export const fewShotApprovalSuspendSchema = z.object({
  approvalType: z.literal('few-shot-save'),
  draft: fewShotDraftSchema,
})

export const fewShotApprovalResumeSchema = z.object({
  approved: z.boolean(),
  editedDraft: fewShotDraftSchema.optional(),
})
