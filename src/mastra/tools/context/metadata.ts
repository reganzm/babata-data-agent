import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import {
  describeTableOperation,
  listTablesOperation,
} from '@/mastra/tools/db'
import { defaultToolHooks, runToolWithHooks } from '@/mastra/tools/hooks'

export const listContextTablesTool = createTool({
  id: 'list-context-tables',
  description: '列出混沌可用于上下文侦察的数据表元数据',
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
      agent: 'hundun',
      tool: 'list-context-tables',
      input,
      hooks: defaultToolHooks,
      execute: async () => listTablesOperation(),
    }),
})

export const describeContextTableTool = createTool({
  id: 'describe-context-table',
  description: '查看混沌候选数据表的字段、类型与注释',
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
      agent: 'hundun',
      tool: 'describe-context-table',
      input,
      hooks: defaultToolHooks,
      execute: async ({ table }) => describeTableOperation(table),
    }),
})
