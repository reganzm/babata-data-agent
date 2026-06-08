import { createWorkflow } from '@mastra/core/workflows'
import { weeklyInputSchema, weeklyOutputSchema } from './weekly-metrics/schemas'
import { planMetricsStep } from './weekly-metrics/steps/plan-metrics'
import { executeMetricsStep } from './weekly-metrics/steps/execute-metrics'
import { formatWeeklyReportStep } from './weekly-metrics/steps/format-report'

export const weeklyMetricsWorkflow = createWorkflow({
  id: 'weekly-metrics',
  description: '周报指标流水线：固定模板 SQL → 批量执行 → 模板化报告',
  inputSchema: weeklyInputSchema,
  outputSchema: weeklyOutputSchema,
})
  .then(planMetricsStep)
  .then(executeMetricsStep)
  .then(formatWeeklyReportStep)
  .commit()
