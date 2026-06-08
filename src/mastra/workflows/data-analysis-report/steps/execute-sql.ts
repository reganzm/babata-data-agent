import { createStep } from '@mastra/core/workflows'
import { executeReadonlySqlOperation } from '@/mastra/tools/db'
import { afterExecuteSchema, afterSqlSchema } from '../schemas'

export const executeSqlStep = createStep({
  id: 'execute-sql',
  inputSchema: afterSqlSchema,
  outputSchema: afterExecuteSchema,
  execute: async ({ inputData }) => {
    const queryResult = await executeReadonlySqlOperation(inputData.sql)
    return {
      ...inputData,
      queryResult,
    }
  },
})
