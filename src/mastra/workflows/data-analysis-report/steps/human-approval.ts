import { createStep } from '@mastra/core/workflows'
import { enforcePartitionFieldInSql } from '@/lib/partition-field'
import {
  parseSqlClarificationFromFeedback,
  resolveUserClarification,
} from '@/lib/sql-clarification'
import {
  afterSqlSchema,
  sqlApprovalResumeSchema,
  sqlApprovalSuspendSchema,
} from '../schemas'

const skipHitl = () => process.env.BABATA_WORKFLOW_SKIP_HITL === 'true'
const MAX_SQL_REVISIONS = 3

export const humanApprovalStep = createStep({
  id: 'human-approval',
  inputSchema: afterSqlSchema,
  outputSchema: afterSqlSchema,
  resumeSchema: sqlApprovalResumeSchema,
  suspendSchema: sqlApprovalSuspendSchema,
  execute: async ({ inputData, resumeData, suspend }) => {
    if (skipHitl()) {
      return { ...inputData, sqlApproved: true }
    }

    const revisionCount = inputData.sqlRevisionCount ?? 0

    if (resumeData) {
      if (resumeData.approved) {
        return { ...inputData, sqlApproved: true }
      }

      const feedback =
        resumeData.feedback?.trim() ||
        '用户驳回了 SQL，请根据 Apache Doris 可执行语法重写（避免不支持的 CTE/函数）。'

      const userClarification =
        resumeData.clarification ??
        parseSqlClarificationFromFeedback(feedback) ??
        undefined

      if (revisionCount >= MAX_SQL_REVISIONS) {
        throw new Error(
          `SQL 已驳回 ${MAX_SQL_REVISIONS} 次仍未通过，流程已终止。请调整需求后重新发起分析。`,
        )
      }

      // 不再次 suspend：结束本步，由外层 dountil 带着澄清重跑 parse-intent → generate-sql
      return {
        ...inputData,
        sqlApproved: false,
        rejectionFeedback: feedback,
        userClarification,
        lastRejectedSql: inputData.sql,
        sqlRevisionCount: revisionCount + 1,
      }
    }

    const clarification = resolveUserClarification(inputData)
    const sqlForApproval = enforcePartitionFieldInSql(
      inputData.sql,
      inputData.columns,
      clarification,
      inputData.partitionField,
    )

    await suspend({
      approvalType: 'sql-approval',
      sql: sqlForApproval,
      intentSummary: inputData.intentSummary,
      sqlRevisionCount: revisionCount,
    })

    return inputData
  },
})
