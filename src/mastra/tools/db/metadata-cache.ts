import { ensureSchema } from '@/lib/db/schema'
import { getDbClient } from '@/lib/db/client'
import { getDorisConfig } from './doris-client'

export type CachedTableMeta = {
  name: string
  description?: string
}

export type CachedColumnMeta = {
  name: string
  type: string
  description?: string
}

function isMetadataCacheEnabled(): boolean {
  return process.env.DORIS_METADATA_CACHE !== 'false'
}

function getCacheTtlMs(): number {
  const n = Number(process.env.DORIS_METADATA_CACHE_TTL_MS ?? '86400000')
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 86400000
}

/** 区分 Doris 实例 + 库，避免换连接串后读到旧缓存 */
function getCacheScope(): string {
  const cfg = getDorisConfig()
  return `${cfg.host}:${cfg.port}/${cfg.database}`
}

function tablesCacheKey(): string {
  return `tables:${getCacheScope()}`
}

function columnsCacheKey(table: string): string {
  return `columns:${getCacheScope()}:${table}`
}

async function readCache<T>(key: string): Promise<T | null> {
  if (!isMetadataCacheEnabled()) return null

  await ensureSchema()
  const db = getDbClient()
  const result = await db.execute({
    sql: `SELECT payload, fetched_at FROM babata_doris_metadata_cache WHERE cache_key = ?`,
    args: [key],
  })
  const row = result.rows[0] as unknown as
    | { payload: string; fetched_at: string }
    | undefined
  if (!row) return null

  const fetchedAt = Date.parse(row.fetched_at)
  if (!Number.isFinite(fetchedAt) || Date.now() - fetchedAt > getCacheTtlMs()) {
    return null
  }

  return JSON.parse(row.payload) as T
}

async function writeCache(key: string, payload: unknown): Promise<void> {
  if (!isMetadataCacheEnabled()) return

  await ensureSchema()
  const db = getDbClient()
  await db.execute({
    sql: `INSERT INTO babata_doris_metadata_cache (cache_key, payload, fetched_at)
          VALUES (?, ?, ?)
          ON CONFLICT(cache_key) DO UPDATE SET
            payload = excluded.payload,
            fetched_at = excluded.fetched_at`,
    args: [key, JSON.stringify(payload), new Date().toISOString()],
  })
}

export async function getCachedTableList(): Promise<CachedTableMeta[] | null> {
  return readCache<CachedTableMeta[]>(tablesCacheKey())
}

export async function setCachedTableList(tables: CachedTableMeta[]): Promise<void> {
  await writeCache(tablesCacheKey(), tables)
}

export async function getCachedTableSchema(
  table: string,
): Promise<CachedColumnMeta[] | null> {
  return readCache<CachedColumnMeta[]>(columnsCacheKey(table))
}

export async function setCachedTableSchema(
  table: string,
  columns: CachedColumnMeta[],
): Promise<void> {
  await writeCache(columnsCacheKey(table), columns)
}
