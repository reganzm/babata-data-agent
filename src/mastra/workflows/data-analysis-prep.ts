import { createWorkflow } from '@mastra/core/workflows'
import {
  afterSqlSchema,
  prepLoopInputSchema,
} from './data-analysis-report/schemas'
import { parseIntentStep } from './data-analysis-report/steps/parse-intent'
import { fetchSchemaStep } from './data-analysis-report/steps/fetch-schema'
import { generateSqlStep } from './data-analysis-report/steps/generate-sql'
import { humanApprovalStep } from './data-analysis-report/steps/human-approval'

/**
 * 标准分析前半段：意图 → Schema → SQL → 审批。
 * 由主 workflow 以 dountil 包裹；SQL 驳回后整段重跑（非仅在审批步内改 SQL）。
 */
export const dataAnalysisPrepWorkflow = createWorkflow({
  id: 'data-analysis-prep',
  description: '意图解析 → 表结构 → SQL → 人工审批',
  inputSchema: prepLoopInputSchema,
  outputSchema: afterSqlSchema,
})
  .then(parseIntentStep)
  .then(fetchSchemaStep)
  .then(generateSqlStep)
  .then(humanApprovalStep)
  .commit()
