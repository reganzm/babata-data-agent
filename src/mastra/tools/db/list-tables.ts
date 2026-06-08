import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { listTablesOperation } from './operations'
import { defaultToolHooks, runToolWithHooks } from '@/mastra/tools/hooks'

export const listTablesTool = createTool({
  id: 'list-tables',
  description: '列出可访问的数据表',
  inputSchema: z.object({}),
  outputSchema: z.object({
    tables: z.array(
      z.object({
        name: z.string(),
        description: z.string().optional(),
      }),
    ),
  }),
  execute: async (input) =>
    runToolWithHooks({
      tool: 'list-tables',
      input,
      hooks: defaultToolHooks,
      execute: async () => listTablesOperation(),
    }),
})
