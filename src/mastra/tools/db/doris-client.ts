import mysql from 'mysql2/promise'
import type { Pool, RowDataPacket } from 'mysql2/promise'
import { logAuditEvent, logSqlAudit } from '@/lib/audit-log'

export type DorisConfig = {
  host: string
  port: number
  user: string
  password: string
  database: string
}

let pool: Pool | null = null

function parseMysqlUrl(url: string): DorisConfig {
  const parsed = new URL(url)
  if (parsed.protocol !== 'mysql:' && parsed.protocol !== 'mysql2:') {
    throw new Error(`不支持的连接协议: ${parsed.protocol}，请使用 mysql://`)
  }
  const database = parsed.pathname.replace(/^\//, '')
  if (!database) {
    throw new Error('DATABASE_URL 缺少数据库名，格式: mysql://user:pass@host:9030/dbname')
  }
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 9030,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database,
  }
}

export function getDorisConfig(): DorisConfig {
  const url =
    process.env.DORIS_DSN?.trim() ||
    process.env.DORIS_URL?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    ''
  if (url.startsWith('mysql://') || url.startsWith('mysql2://')) {
    return parseMysqlUrl(url)
  }

  const host = process.env.DORIS_HOST?.trim()
  const database = process.env.DORIS_DATABASE?.trim()
  if (!host || !database) {
    throw new Error(
      'Doris 未配置：请设置 DORIS_DSN（mysql://…）或 DORIS_HOST + DORIS_DATABASE + DORIS_USER',
    )
  }

  return {
    host,
    port: Number(process.env.DORIS_PORT?.trim() || '9030'),
    user: process.env.DORIS_USER?.trim() || '',
    password: process.env.DORIS_PASSWORD?.trim() || '',
    database,
  }
}

export function getDorisPool(): Pool {
  if (!pool) {
    const cfg = getDorisConfig()
    pool = mysql.createPool({
      host: cfg.host,
      port: cfg.port,
      user: cfg.user,
      password: cfg.password,
      database: cfg.database,
      waitForConnections: true,
      connectionLimit: Number(process.env.DORIS_POOL_SIZE?.trim() || '5'),
      connectTimeout: Number(process.env.SQL_TIMEOUT_MS?.trim() || '30000'),
      enableKeepAlive: true,
    })
  }
  return pool
}

export async function queryDoris<T extends RowDataPacket = RowDataPacket>(
  sql: string,
  params?: unknown[],
): Promise<T[]> {
  const startedAt = Date.now()
  logSqlAudit({ sql, queryParams: params })
  try {
    const [rows] = await getDorisPool().query(sql, params)
    const resultRows = rows as T[]
    logAuditEvent({
      event: 'sql.result',
      sql,
      params: params ?? [],
      rowCount: resultRows.length,
      durationMs: Date.now() - startedAt,
    })
    return resultRows
  } catch (error) {
    logAuditEvent({
      event: 'sql.error',
      sql,
      params: params ?? [],
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}
