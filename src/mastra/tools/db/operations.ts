import { assertAnalyticsConfigured } from './analytics-client'
import { queryDoris } from './doris-client'
import {
  getCachedTableList,
  getCachedTableSchema,
  setCachedTableList,
  setCachedTableSchema,
  type CachedTableMeta,
} from './metadata-cache'
import { truncateRows } from '@/lib/storage-limits'
import {
  assertReadonlySelect,
  assertSafeTableName,
  getSqlMaxRows,
  getSqlTimeoutMs,
  withTimeout,
} from './sql-guard'

function getTableAllowlist(): Set<string> | null {
  const raw = process.env.SQL_TABLE_ALLOWLIST?.trim()
  if (!raw) return null
  return new Set(raw.split(',').map((t) => t.trim()).filter(Boolean))
}

function applyTableAllowlist(tables: CachedTableMeta[]): CachedTableMeta[] {
  const allowlist = getTableAllowlist()
  if (!allowlist) return tables
  return tables.filter((t) => allowlist.has(t.name))
}

async function fetchTableListFromDoris(): Promise<CachedTableMeta[]> {
  const rows = await queryDoris(
    `SELECT TABLE_NAME AS name, TABLE_COMMENT AS description
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
     ORDER BY TABLE_NAME`,
  )
  const typed = rows as { name: string; description: string | null }[]
  return typed.map((r) => ({
    name: r.name,
    description: r.description?.trim() || undefined,
  }))
}

export async function listTablesOperation() {
  assertAnalyticsConfigured()

  let tables = await getCachedTableList()
  if (!tables) {
    tables = await fetchTableListFromDoris()
    await setCachedTableList(tables)
  }

  const result = { tables: applyTableAllowlist(tables) }
  return result
}

export async function describeTableOperation(table: string) {
  assertAnalyticsConfigured()
  assertSafeTableName(table)
  const allowlist = getTableAllowlist()
  if (allowlist && !allowlist.has(table)) {
    throw new Error(`表 ${table} 不在白名单中`)
  }

  let columns = await getCachedTableSchema(table)
  if (!columns) {
    const rows = await queryDoris(
      `SELECT COLUMN_NAME AS name, DATA_TYPE AS type, COLUMN_COMMENT AS description
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
       ORDER BY ORDINAL_POSITION`,
      [table],
    )
    const typed = rows as {
      name: string
      type: string
      description: string | null
    }[]
    columns = typed.map((row) => ({
      name: row.name,
      type: row.type,
      description: row.description?.trim() || undefined,
    }))
    await setCachedTableSchema(table, columns)
  }

  const result = { table, columns }
  return result
}

export async function executeReadonlySqlOperation(sql: string) {
  assertAnalyticsConfigured()
  const safeSql = assertReadonlySelect(sql, { maxRows: getSqlMaxRows() })

  const rows = await withTimeout(
    queryDoris(safeSql),
    getSqlTimeoutMs(),
    'SQL 执行',
  )
  const normalized = rows.map((row) => {
    const record: Record<string, string | number | null> = {}
    for (const [key, value] of Object.entries(row)) {
      record[key] =
        value === null || typeof value === 'string' || typeof value === 'number'
          ? (value as string | number | null)
          : value instanceof Date
            ? value.toISOString()
            : String(value)
    }
    return record
  })

  const maxRows = getSqlMaxRows()
  const { rows: cappedRows, truncated, totalCount } = truncateRows(
    normalized,
    maxRows,
  )

  const result = {
    sql: safeSql,
    rowCount: totalCount,
    rows: cappedRows,
    truncated,
    note: truncated
      ? `Doris 数仓查询结果（已截断为前 ${maxRows} 行，共 ${totalCount} 行）`
      : 'Doris 数仓查询结果',
  }
  return result
}
