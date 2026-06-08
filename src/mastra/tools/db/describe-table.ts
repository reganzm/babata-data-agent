import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { describeTableOperation } from './operations'
import { defaultToolHooks, runToolWithHooks } from '@/mastra/tools/hooks'

export const describeTableTool = createTool({
  id: 'describe-table',
  description: '查看表结构',
  inputSchema: z.object({
    table: z.string().describe('表名'),
  }),
  outputSchema: z.object({
    table: z.string(),
    columns: z.array(
      z.object({
        name: z.string(),
        type: z.string(),
        description: z.string().optional(),
      }),
    ),
  }),
  execute: async (input) =>
    runToolWithHooks({
      tool: 'describe-table',
      input,
      hooks: defaultToolHooks,
      execute: async ({ table }) => describeTableOperation(table),
    }),
})
