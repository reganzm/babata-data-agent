import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { executeReadonlySqlOperation } from './operations'
import { defaultToolHooks, runToolWithHooks } from '@/mastra/tools/hooks'

const rowSchema = z.record(z.union([z.string(), z.number(), z.null()]))

export const executeReadonlySqlTool = createTool({
  id: 'execute-readonly-sql',
  description: '执行只读 SELECT',
  inputSchema: z.object({
    sql: z.string().describe('只读 SELECT 语句'),
  }),
  outputSchema: z.object({
    sql: z.string(),
    rowCount: z.number(),
    rows: z.array(rowSchema),
    truncated: z.boolean().optional(),
    note: z.string(),
  }),
  execute: async (input) =>
    runToolWithHooks({
      tool: 'execute-readonly-sql',
      input,
      hooks: defaultToolHooks,
      execute: async ({ sql }) => executeReadonlySqlOperation(sql),
    }),
})
