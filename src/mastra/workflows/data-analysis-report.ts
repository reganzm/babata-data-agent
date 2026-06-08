import { createWorkflow } from '@mastra/core/workflows'
import { workflowInputSchema, reportOutputSchema } from './data-analysis-report/schemas'
import { dataAnalysisPrepWorkflow } from './data-analysis-prep'
import { executeSqlStep } from './data-analysis-report/steps/execute-sql'
import { interpretResultsStep } from './data-analysis-report/steps/interpret-results'
import { fewShotApprovalStep } from './data-analysis-report/steps/few-shot-approval'

export const dataAnalysisReportWorkflow = createWorkflow({
  id: 'data-analysis-report',
  description:
    '标准数据分析报告：意图 → Schema → SQL → [HITL] → 执行 → 解读（驳回则回到意图重跑）',
  inputSchema: workflowInputSchema,
  outputSchema: reportOutputSchema,
})
  .dountil(
    dataAnalysisPrepWorkflow,
    async ({ inputData }) => inputData.sqlApproved === true,
  )
  .then(executeSqlStep)
  .then(interpretResultsStep)
  .then(fewShotApprovalStep)
  .commit()
