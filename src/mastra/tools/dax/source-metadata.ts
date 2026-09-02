import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { describeSourceTable, listSourceTables } from '@/lib/db/source-query'
import {
  requireDaxUserId,
  resolveRuntimeDataSourceId,
} from '@/lib/dax-runtime-context'
import { defaultToolHooks, runToolWithHooks } from '@/mastra/tools/hooks'

function requireSelectedDataSourceId(explicit?: string): string {
  const dataSourceId = resolveRuntimeDataSourceId(explicit)
  if (!dataSourceId) {
    throw new Error('当前对话未选择数据源，无法读取表结构。')
  }
  return dataSourceId
}

export const listSourceTablesTool = createTool({
  id: 'list-source-tables',
  description: '列出当前选中 Doris 数据源中的表（只读元数据）',
  inputSchema: z.object({
    dataSourceId: z.string().optional(),
  }),
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
      agent: 'dax',
      tool: 'list-source-tables',
      input,
      hooks: defaultToolHooks,
      execute: async ({ dataSourceId }) =>
        listSourceTables({
          dataSourceId: requireSelectedDataSourceId(dataSourceId),
          userId: requireDaxUserId(),
        }),
    }),
})

export const describeSourceTableTool = createTool({
  id: 'describe-source-table',
  description: '查看当前选中 Doris 数据源中某张表的字段（只读元数据）',
  inputSchema: z.object({
    table: z.string().describe('表名'),
    dataSourceId: z.string().optional(),
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
      agent: 'dax',
      tool: 'describe-source-table',
      input,
      hooks: defaultToolHooks,
      execute: async ({ table, dataSourceId }) =>
        describeSourceTable({
          dataSourceId: requireSelectedDataSourceId(dataSourceId),
          userId: requireDaxUserId(),
          table,
        }),
    }),
})
