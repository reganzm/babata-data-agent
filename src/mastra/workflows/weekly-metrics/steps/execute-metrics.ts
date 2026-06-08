import { createStep } from '@mastra/core/workflows'
import { executeReadonlySqlOperation } from '@/mastra/tools/db'
import { afterExecuteSchema, afterPlanSchema } from '../schemas'

export const executeMetricsStep = createStep({
  id: 'execute-metrics',
  inputSchema: afterPlanSchema,
  outputSchema: afterExecuteSchema,
  execute: async ({ inputData }) => {
    const results = []
    for (const template of inputData.templates) {
      const out = await executeReadonlySqlOperation(template.sql)
      results.push({
        id: template.id,
        label: template.label,
        sql: out.sql,
        rowCount: out.rowCount,
        rows: out.rows,
      })
    }
    return {
      ...inputData,
      results,
    }
  },
})
