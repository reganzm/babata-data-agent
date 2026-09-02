import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { executeReadonlySqlOnSource } from '@/lib/db/source-query'
import {
  assertDaxAgentInteractionMode,
  requireDaxUserId,
  resolveRuntimeDataSourceId,
} from '@/lib/dax-runtime-context'
import { defaultToolHooks, runToolWithHooks } from '@/mastra/tools/hooks'

const rowSchema = z.record(z.union([z.string(), z.number(), z.null()]))

export async function executeReadonlySqlOnSourceToolOperation(input: {
  sql: string
  dataSourceId?: string
}) {
  assertDaxAgentInteractionMode('执行 SQL')
  const dataSourceId = resolveRuntimeDataSourceId(input.dataSourceId)
  if (!dataSourceId) {
    throw new Error('当前对话未选择数据源，无法查数。请先选择 Doris 数据源。')
  }
  return executeReadonlySqlOnSource({
    dataSourceId,
    userId: requireDaxUserId(),
    sql: input.sql,
  })
}

export const executeReadonlySqlOnSourceTool = createTool({
  id: 'execute-readonly-sql-on-source',
  description:
    '对当前对话选中的 Doris 数据源执行只读 SQL。仅允许单条 WITH/CTE + SELECT（含子查询、UNION）；禁止 INSERT/UPDATE/DELETE/DDL 与多语句。禁止使用全局 DORIS_* 连接。',
  inputSchema: z.object({
    sql: z
      .string()
      .describe('单条只读 SQL：仅允许 WITH/CTE 与 SELECT，禁止写操作与分号多语句'),
    dataSourceId: z.string().optional(),
  }),
  outputSchema: z.object({
    sql: z.string(),
    rowCount: z.number(),
    rows: z.array(rowSchema),
    truncated: z.boolean().optional(),
    note: z.string(),
    dataSourceId: z.string(),
  }),
  execute: async (input) =>
    runToolWithHooks({
      agent: 'dax',
      tool: 'execute-readonly-sql-on-source',
      input,
      hooks: defaultToolHooks,
      execute: executeReadonlySqlOnSourceToolOperation,
    }),
})
