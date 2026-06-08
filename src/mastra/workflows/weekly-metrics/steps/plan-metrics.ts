import { createStep } from '@mastra/core/workflows'
import { listTablesOperation } from '@/mastra/tools/db'
import { buildWeeklyMetricTemplates } from '../templates'
import { afterPlanSchema, weeklyInputSchema } from '../schemas'

export const planMetricsStep = createStep({
  id: 'plan-metrics',
  inputSchema: weeklyInputSchema,
  outputSchema: afterPlanSchema,
  execute: async ({ inputData }) => {
    const weekLabel = new Date().toISOString().slice(0, 10)
    const configured = process.env.WEEKLY_METRICS_TABLE?.trim()
    let table = configured
    if (!table) {
      const { tables } = await listTablesOperation()
      table = tables[0]?.name
    }
    if (!table) {
      throw new Error(
        '未找到可用数据表，请配置 WEEKLY_METRICS_TABLE 或确保 Doris 库中有表',
      )
    }
    const templates = buildWeeklyMetricTemplates(table)
    return {
      userQuery: inputData.userQuery,
      weekLabel,
      templates: templates.map((t) => ({
        id: t.id,
        label: t.label,
        sql: t.sql,
      })),
    }
  },
})
