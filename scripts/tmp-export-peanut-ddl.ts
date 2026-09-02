/**
 * 临时脚本：列出 Doris business / prod 库中表名含 peanut 或 pn 的表，并导出 SHOW CREATE TABLE。
 * 用法: pnpm exec tsx --env-file=.env scripts/tmp-export-peanut-ddl.ts
 */
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { queryDoris, getDorisPool } from '../src/mastra/tools/db/doris-client'

const SCHEMAS = ['business', 'prod'] as const
const OUT_PATH = resolve(
  process.cwd(),
  'docs/tmp-peanut-pn-create-tables.md',
)

type TableRow = {
  table_schema: string
  table_name: string
}

function matchesPeanutOrPn(tableName: string): boolean {
  const lower = tableName.toLowerCase()
  return lower.includes('peanut') || lower.includes('pn')
}

async function listMatchingTables(): Promise<TableRow[]> {
  const rows = await queryDoris(
    `SELECT TABLE_SCHEMA AS table_schema, TABLE_NAME AS table_name
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA IN (?, ?)
     ORDER BY TABLE_SCHEMA, TABLE_NAME`,
    [...SCHEMAS],
  )
  return (rows as TableRow[]).filter((r) => matchesPeanutOrPn(r.table_name))
}

async function showCreateTable(
  schema: string,
  table: string,
): Promise<{ kind: 'table' | 'view'; ddl: string }> {
  const qualified = `\`${schema}\`.\`${table}\``
  const rows = await queryDoris(`SHOW CREATE TABLE ${qualified}`)
  const row = rows[0] as Record<string, unknown> | undefined
  if (!row) {
    throw new Error(`SHOW CREATE TABLE 无结果: ${schema}.${table}`)
  }

  const tableDdl = pickStringField(row, ['Create Table', 'Create Table'])
  if (tableDdl && /create\s+table/i.test(tableDdl)) {
    return { kind: 'table', ddl: tableDdl.trim() }
  }

  const viewDdl = pickStringField(row, ['Create View', 'Create View'])
  if (viewDdl && /create\s+(or\s+replace\s+)?view/i.test(viewDdl)) {
    return { kind: 'view', ddl: viewDdl.trim() }
  }

  const fallback = Object.values(row).find(
    (v) => typeof v === 'string' && /create\s+(table|view)/i.test(v),
  ) as string | undefined
  if (fallback?.trim()) {
    const kind = /create\s+(or\s+replace\s+)?view/i.test(fallback)
      ? 'view'
      : 'table'
    return { kind, ddl: fallback.trim() }
  }

  throw new Error(
    `无法解析建表语句: ${schema}.${table} keys=${Object.keys(row).join(',')}`,
  )
}

function pickStringField(
  row: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const value = row[key]
    if (typeof value === 'string' && value.trim()) return value
  }
  // Doris 返回列名大小写可能不一致
  const lowerMap = new Map(
    Object.entries(row).map(([k, v]) => [k.toLowerCase(), v]),
  )
  for (const key of keys) {
    const value = lowerMap.get(key.toLowerCase())
    if (typeof value === 'string' && value.trim()) return value
  }
  return undefined
}

async function main() {
  console.log('连接 Doris，扫描 business / prod …')
  const tables = await listMatchingTables()
  console.log(`命中 ${tables.length} 张表（表名含 peanut 或 pn）`)

  const sections: string[] = [
    '# Doris peanut / pn 相关表建表语句',
    '',
    `生成时间：${new Date().toISOString()}`,
    '',
    `库范围：\`${SCHEMAS.join('`, `')}\``,
    '',
    '匹配规则：表名（不区分大小写）包含 `peanut` 或 `pn`',
    '',
    `命中表数：${tables.length}`,
    '',
    '## 目录',
    '',
  ]

  for (const t of tables) {
    sections.push(`- [\`${t.table_schema}.${t.table_name}\`](#${t.table_schema}${t.table_name})`)
  }
  sections.push('')

  let ok = 0
  let fail = 0
  for (const t of tables) {
    const full = `${t.table_schema}.${t.table_name}`
    process.stdout.write(`SHOW CREATE TABLE ${full} … `)
    try {
      const { kind, ddl } = await showCreateTable(t.table_schema, t.table_name)
      const title =
        kind === 'view' ? `\`${full}\`（VIEW）` : `\`${full}\``
      sections.push(`## ${title}`)
      sections.push('')
      sections.push('```sql')
      sections.push(ddl)
      sections.push('```')
      sections.push('')
      ok += 1
      console.log(kind === 'view' ? 'ok (view)' : 'ok')
    } catch (err) {
      fail += 1
      const message = err instanceof Error ? err.message : String(err)
      sections.push(`## \`${full}\``)
      sections.push('')
      sections.push(`> 获取失败：${message}`)
      sections.push('')
      console.log(`FAIL: ${message}`)
    }
  }

  writeFileSync(OUT_PATH, sections.join('\n'), 'utf8')
  console.log(`已写入 ${OUT_PATH}（成功 ${ok}，失败 ${fail}）`)
  await getDorisPool().end()
}

main().catch(async (err) => {
  console.error(err instanceof Error ? err.message : err)
  try {
    await getDorisPool().end()
  } catch {
    /* ignore */
  }
  process.exit(1)
})
