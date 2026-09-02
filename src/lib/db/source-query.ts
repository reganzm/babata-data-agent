import type { RowDataPacket } from 'mysql2/promise'
import { logAuditEvent, logSqlAudit } from '@/lib/audit-log'
import { truncateRows } from '@/lib/storage-limits'
import { getDataSourceById, type DataSourceRecord } from '@/lib/db/data-sources'
import {
  assertVirtualConfig,
  isVirtualType,
} from '@/lib/db/data-source-config'
import {
  describeQueryableSourceTable,
  getSourceQueryNote,
  listQueryableSourceTables,
  querySelectedDataSource,
} from '@/lib/db/source-connection'
import { resolveVirtualSql } from '@/lib/db/virtual-source-sql'
import {
  assertReadonlySelect,
  assertSafeTableName,
  getSqlMaxRows,
  getSqlTimeoutMs,
  withTimeout,
} from '@/mastra/tools/db/sql-guard'

export type SourceQueryDependencies = {
  getDataSourceById: typeof getDataSourceById
  queryRows: (
    record: DataSourceRecord,
    sql: string,
    params?: unknown[],
  ) => Promise<RowDataPacket[]>
}

function normalizeRow(
  row: RowDataPacket,
): Record<string, string | number | null> {
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
}

async function auditedQueryRows(
  record: DataSourceRecord,
  sql: string,
  params?: unknown[],
  auditMeta?: { virtualDataSourceId?: string; parentDataSourceId?: string },
): Promise<RowDataPacket[]> {
  const startedAt = Date.now()
  logSqlAudit({ sql, queryParams: params })
  logAuditEvent({
    event: 'dax-source.sql.query',
    dataSourceId: auditMeta?.virtualDataSourceId ?? record.id,
    parentDataSourceId: auditMeta?.parentDataSourceId ?? record.id,
    sql,
  })
  try {
    const rows = await querySelectedDataSource(record, sql, params)
    logAuditEvent({
      event: 'dax-source.sql.result',
      dataSourceId: auditMeta?.virtualDataSourceId ?? record.id,
      parentDataSourceId: auditMeta?.parentDataSourceId ?? record.id,
      rowCount: rows.length,
      durationMs: Date.now() - startedAt,
    })
    return rows
  } catch (error) {
    logAuditEvent({
      event: 'dax-source.sql.error',
      dataSourceId: auditMeta?.virtualDataSourceId ?? record.id,
      parentDataSourceId: auditMeta?.parentDataSourceId ?? record.id,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

async function requireEnabledSource(
  dataSourceId: string,
  userId: string | null,
  getSource: typeof getDataSourceById,
): Promise<DataSourceRecord> {
  const record = await getSource(dataSourceId, userId)
  if (!record) {
    throw new Error('数据源不存在或无权访问，未使用全局 Doris 配置')
  }
  if (!record.enabled) {
    throw new Error('数据源已停用')
  }
  return record
}

export async function executeReadonlySqlOnSource(input: {
  dataSourceId: string
  userId: string | null
  sql: string
  dependencies?: Partial<SourceQueryDependencies>
}): Promise<{
  sql: string
  rowCount: number
  rows: Array<Record<string, string | number | null>>
  truncated: boolean
  note: string
  dataSourceId: string
}> {
  const getSource = input.dependencies?.getDataSourceById ?? getDataSourceById
  const queryRows = input.dependencies?.queryRows ?? auditedQueryRows
  const record = await requireEnabledSource(
    input.dataSourceId,
    input.userId,
    getSource,
  )
  const safeSql = assertReadonlySelect(input.sql, { maxRows: getSqlMaxRows() })
  let executionRecord = record
  let executionSql = safeSql
  let auditMeta: { virtualDataSourceId?: string; parentDataSourceId?: string } | undefined

  if (isVirtualType(record.type)) {
    const virtualConfig = assertVirtualConfig(record.config)
    const resolved = resolveVirtualSql(safeSql, virtualConfig.tables)
    const parent = await getSource(resolved.parentDataSourceId, input.userId)
    if (!parent) {
      throw new Error('父数据源不存在或无权访问')
    }
    if (isVirtualType(parent.type)) {
      throw new Error('虚拟数据源不能引用另一个虚拟数据源')
    }
    if (!parent.enabled) {
      throw new Error('父数据源已停用')
    }
    executionRecord = parent
    executionSql = assertReadonlySelect(resolved.rewrittenSql, {
      maxRows: getSqlMaxRows(),
    })
    auditMeta = {
      virtualDataSourceId: record.id,
      parentDataSourceId: parent.id,
    }
  }

  const rows = await withTimeout(
    auditMeta
      ? auditedQueryRows(executionRecord, executionSql, undefined, auditMeta)
      : queryRows(executionRecord, executionSql),
    getSqlTimeoutMs(),
    '所选数据源 SQL 执行',
  )
  const normalized = rows.map(normalizeRow)
  const maxRows = getSqlMaxRows()
  const { rows: cappedRows, truncated, totalCount } = truncateRows(
    normalized,
    maxRows,
  )
  const notePrefix = getSourceQueryNote(record.type)
  return {
    sql: safeSql,
    rowCount: totalCount,
    rows: cappedRows,
    truncated,
    dataSourceId: record.id,
    note: truncated
      ? `${notePrefix}（已截断为前 ${maxRows} 行，共 ${totalCount} 行）`
      : notePrefix,
  }
}

export async function listSourceTables(input: {
  dataSourceId: string
  userId: string | null
  dependencies?: Partial<SourceQueryDependencies>
}): Promise<{ tables: Array<{ name: string; description?: string }> }> {
  const getSource = input.dependencies?.getDataSourceById ?? getDataSourceById
  const record = await requireEnabledSource(
    input.dataSourceId,
    input.userId,
    getSource,
  )
  return { tables: await listQueryableSourceTables(record) }
}

export async function describeSourceTable(input: {
  dataSourceId: string
  userId: string | null
  table: string
  dependencies?: Partial<SourceQueryDependencies>
}): Promise<{
  table: string
  columns: Array<{ name: string; type: string; description?: string }>
}> {
  assertSafeTableName(input.table)
  const getSource = input.dependencies?.getDataSourceById ?? getDataSourceById
  const record = await requireEnabledSource(
    input.dataSourceId,
    input.userId,
    getSource,
  )
  return {
    table: input.table,
    columns: await describeQueryableSourceTable(record, input.table),
  }
}

export async function listParentSourceTables(input: {
  dataSourceId: string
  userId: string | null
}): Promise<{ tables: Array<{ name: string; description?: string }> }> {
  const record = await getDataSourceById(input.dataSourceId, input.userId)
  if (!record) {
    throw new Error('数据源不存在或无权访问')
  }
  if (isVirtualType(record.type)) {
    throw new Error('不能从虚拟数据源加载表，请选择物理数据源')
  }
  if (!record.enabled) {
    throw new Error('数据源已停用')
  }
  return { tables: await listQueryableSourceTables(record) }
}

export { querySelectedDataSource, getSourceQueryNote } from '@/lib/db/source-connection'
