import { assertSafeTableName } from '@/mastra/tools/db/sql-guard'

/** 周报指标 SQL 模板（表名来自 WEEKLY_METRICS_TABLE 或运行时传入） */
export function buildWeeklyMetricTemplates(table: string) {
  assertSafeTableName(table)
  const q = `\`${table}\``
  return [
    {
      id: 'row_count',
      label: `${table} 行数`,
      sql: `SELECT COUNT(*) AS row_count FROM ${q}`,
    },
    {
      id: 'sample',
      label: `${table} 样例数据`,
      sql: `SELECT * FROM ${q}`,
    },
  ] as const
}
