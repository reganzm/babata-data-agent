import { createClient } from '@libsql/client'
import mysql from 'mysql2/promise'
import type { Pool, RowDataPacket } from 'mysql2/promise'
import { decryptDataSourcePassword, type DataSourceRecord } from '@/lib/db/data-sources'
import {
  assertCsvConfig,
  assertSqlEngineConfig,
  assertSqliteConfig,
  assertVirtualConfig,
  isCsvType,
  isSqlEngineType,
  isSqliteType,
  isVirtualType,
} from '@/lib/db/data-source-config'
import { getDataSourceById } from '@/lib/db/data-sources'
import { getDbClient } from '@/lib/db/client'
import {
  assertSafeTableName,
  getSqlTimeoutMs,
} from '@/mastra/tools/db/sql-guard'

const mysqlPools = new Map<string, Pool>()
const sqliteClients = new Map<string, ReturnType<typeof createClient>>()

function getMysqlCompatiblePool(record: DataSourceRecord): Pool {
  const cached = mysqlPools.get(record.id)
  if (cached) return cached
  const config = assertSqlEngineConfig(record.type, record.config)
  const pool = mysql.createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: decryptDataSourcePassword(record),
    database: config.database,
    waitForConnections: true,
    connectionLimit: 3,
    connectTimeout: getSqlTimeoutMs(),
    enableKeepAlive: true,
  })
  mysqlPools.set(record.id, pool)
  return pool
}

function getSqliteClient(record: DataSourceRecord) {
  const cached = sqliteClients.get(record.id)
  if (cached) return cached
  const config = assertSqliteConfig(record.config)
  const client = createClient({ url: `file:${config.filePath}` })
  sqliteClients.set(record.id, client)
  return client
}

async function queryClickHouse(
  record: DataSourceRecord,
  sql: string,
): Promise<RowDataPacket[]> {
  const config = assertSqlEngineConfig(record.type, record.config)
  const auth = Buffer.from(
    `${config.user}:${decryptDataSourcePassword(record)}`,
  ).toString('base64')
  const url = new URL(`http://${config.host}:${config.port}/`)
  url.searchParams.set('database', config.database)
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'text/plain',
    },
    body: `${sql} FORMAT JSON`,
    signal: AbortSignal.timeout(getSqlTimeoutMs()),
  })
  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || 'ClickHouse 查询失败')
  }
  const payload = (await response.json()) as { data?: RowDataPacket[] }
  return payload.data ?? []
}

async function queryCsvSource(
  record: DataSourceRecord,
  sql: string,
): Promise<RowDataPacket[]> {
  const config = assertCsvConfig(record.config)
  let rewritten = sql
  for (const table of config.tables) {
    rewritten = rewritten.replace(
      new RegExp(`\\b${table.tableName}\\b`, 'gi'),
      table.physicalTableName,
    )
  }
  const db = getDbClient()
  const result = await db.execute({ sql: rewritten })
  return result.rows as RowDataPacket[]
}

export async function testDataSourceConnection(
  record: DataSourceRecord,
): Promise<void> {
  if (isVirtualType(record.type)) {
    const config = assertVirtualConfig(record.config)
    const parentIds = [...new Set(config.tables.map((binding) => binding.parentDataSourceId))]
    if (parentIds.length === 0) {
      throw new Error('虚拟数据源还没有绑定任何表')
    }
    for (const parentId of parentIds) {
      const parent = await getDataSourceById(parentId, record.userId)
      if (!parent) {
        throw new Error(`父数据源不存在：${parentId}`)
      }
      if (!parent.enabled) {
        throw new Error(`父数据源已停用：${parent.name}`)
      }
      await testDataSourceConnection(parent)
    }
    return
  }
  if (isSqlEngineType(record.type)) {
    if (record.type === 'clickhouse') {
      await queryClickHouse(record, 'SELECT 1 AS ok')
      return
    }
    const pool = getMysqlCompatiblePool(record)
    const connection = await pool.getConnection()
    try {
      await connection.query('SELECT 1')
    } finally {
      connection.release()
    }
    return
  }
  if (isSqliteType(record.type)) {
    const client = getSqliteClient(record)
    await client.execute('SELECT 1')
    return
  }
  if (isCsvType(record.type)) {
    const config = assertCsvConfig(record.config)
    if (config.tables.length === 0) {
      throw new Error('CSV 库中还没有表')
    }
    const db = getDbClient()
    await db.execute(
      `SELECT COUNT(*) AS row_count FROM ${config.tables[0]?.physicalTableName}`,
    )
    return
  }
  throw new Error('不支持的数据源类型')
}

export async function querySelectedDataSource<
  T extends RowDataPacket = RowDataPacket,
>(
  record: DataSourceRecord,
  sql: string,
  params?: unknown[],
): Promise<T[]> {
  if (isSqlEngineType(record.type)) {
    if (record.type === 'clickhouse') {
      return (await queryClickHouse(record, sql)) as T[]
    }
    const [rows] = await getMysqlCompatiblePool(record).query(sql, params)
    return rows as T[]
  }
  if (isSqliteType(record.type)) {
    const result = await getSqliteClient(record).execute({
      sql,
      args: (params ?? []) as (string | number | null)[],
    })
    return result.rows as unknown as T[]
  }
  if (isCsvType(record.type)) {
    return (await queryCsvSource(record, sql)) as T[]
  }
  if (isVirtualType(record.type)) {
    throw new Error('虚拟数据源不能直接执行 SQL，请通过虚拟数据源路由')
  }
  throw new Error('不支持的数据源类型')
}

export async function listQueryableSourceTables(
  record: DataSourceRecord,
): Promise<Array<{ name: string; description?: string }>> {
  if (isVirtualType(record.type)) {
    const config = assertVirtualConfig(record.config)
    return config.tables.map((binding) => ({
      name: binding.exposedName,
      description: binding.description ?? binding.tableName,
    }))
  }
  if (isCsvType(record.type)) {
    const config = assertCsvConfig(record.config)
    return config.tables.map((table) => ({
      name: table.tableName,
      description: table.originalFilename,
    }))
  }
  if (isSqliteType(record.type)) {
    const result = await getSqliteClient(record).execute(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
       ORDER BY name`,
    )
    return (result.rows as unknown as Array<{ name: string }>).map((row) => ({
      name: row.name,
    }))
  }
  const rows = await querySelectedDataSource(
    record,
    record.type === 'clickhouse'
      ? `SELECT name, comment AS description
         FROM system.tables
         WHERE database = currentDatabase()
         ORDER BY name`
      : `SELECT TABLE_NAME AS name, TABLE_COMMENT AS description
         FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE()
         ORDER BY TABLE_NAME`,
  ) as Array<{ name: string; description: string | null }>
  return rows.map((row) => ({
    name: row.name,
    description: row.description?.trim() || undefined,
  }))
}

export async function describeQueryableSourceTable(
  record: DataSourceRecord,
  table: string,
): Promise<Array<{ name: string; type: string; description?: string }>> {
  if (isVirtualType(record.type)) {
    const config = assertVirtualConfig(record.config)
    const binding = config.tables.find((item) => item.exposedName === table)
    if (!binding) {
      throw new Error('虚拟数据源中不存在该表')
    }
    const parent = await getDataSourceById(binding.parentDataSourceId, record.userId)
    if (!parent) {
      throw new Error('父数据源不存在或无权访问')
    }
    return describeQueryableSourceTable(parent, binding.tableName)
  }
  if (isCsvType(record.type)) {
    const config = assertCsvConfig(record.config)
    const target = config.tables.find((item) => item.tableName === table)
    if (!target) {
      throw new Error('CSV 表不存在')
    }
    return target.columns.map((column) => ({
      name: column.name,
      type: column.sqlType,
    }))
  }
  if (isSqliteType(record.type)) {
    assertSafeTableName(table)
    const rows = await querySelectedDataSource(
      record,
      `PRAGMA table_info('${table.replace(/'/g, "''")}')`,
    ) as Array<{ name: string; type: string }>
    return rows.map((row) => ({ name: row.name, type: row.type }))
  }
  const rows = await querySelectedDataSource(
    record,
    record.type === 'clickhouse'
      ? `SELECT name, type, comment AS description
         FROM system.columns
         WHERE database = currentDatabase() AND table = ?
         ORDER BY position`
      : `SELECT COLUMN_NAME AS name, DATA_TYPE AS type, COLUMN_COMMENT AS description
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
         ORDER BY ORDINAL_POSITION`,
    [table],
  ) as Array<{ name: string; type: string; description: string | null }>
  return rows.map((row) => ({
    name: row.name,
    type: row.type,
    description: row.description?.trim() || undefined,
  }))
}

export function getSourceQueryNote(type: DataSourceRecord['type']): string {
  switch (type) {
    case 'doris':
      return '所选 Doris 查询结果'
    case 'mysql':
      return '所选 MySQL 查询结果'
    case 'clickhouse':
      return '所选 ClickHouse 查询结果'
    case 'starrocks':
      return '所选 StarRocks 查询结果'
    case 'sqlite':
      return '所选 SQLite 查询结果'
    case 'file_csv':
      return '所选 CSV 元数据库查询结果'
    case 'virtual':
      return '所选虚拟数据源查询结果'
    default:
      return '所选数据源查询结果'
  }
}
