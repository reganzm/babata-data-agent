import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@libsql/client'
import { ensureSchema } from './schema'
import { getDbClient } from './client'
import type { InValue } from '@libsql/client'
import { decryptSecret, encryptSecret } from '@/lib/data-source-secret'
import {
  DATA_SOURCE_TYPES,
  DEFAULT_SQL_ENGINE_PORTS,
  type CsvSourceConfig,
  type CsvTableDefinition,
  type DataSourceConfig,
  type DataSourceType,
  type PublicDataSourceConfig,
  type SqlEngineDataSourceType,
  type SqlEngineSourceConfig,
  type SqliteSourceConfig,
  assertCsvConfig,
  assertSqlEngineConfig,
  assertVirtualConfig,
  buildPublicVirtualConfig,
  isCsvType,
  isSqlEngineType,
  isSqliteType,
  isVirtualType,
  parseDataSourceConfig,
  toPublicDataSourceConfig,
  type DataSourceRecordLookup,
  type VirtualSourceConfig,
  type VirtualTableBinding,
} from './data-source-config'
import {
  validateVirtualTableBindings,
} from './virtual-source-sql'
import { buildDataSourceAccessFilter, canAccessDataSource } from './rbac'
import {
  buildPhysicalCsvTableName,
  coerceCsvCellValue,
  parseCsvDocument,
  resolveCsvTableNameFromFilename,
  sanitizeSqlIdentifier,
} from './csv-data-source'

export { DATA_SOURCE_TYPES, type DataSourceType } from './data-source-config'
export type {
  PublicDataSourceConfig,
  CsvSourceConfig,
  SqliteSourceConfig,
  SqlEngineSourceConfig,
} from './data-source-config'

export type BoundKnowledgeBaseSummary = {
  id: string
  name: string
  enabled: boolean
}

export type DataSourceRecord = {
  id: string
  userId: string | null
  name: string
  description: string
  type: DataSourceType
  enabled: boolean
  config: DataSourceConfig
  createdAt: string
  updatedAt: string
}

export type PublicDataSource = {
  id: string
  name: string
  description: string
  type: DataSourceType
  enabled: boolean
  config: PublicDataSourceConfig
  knowledgeBaseIds: string[]
  boundKnowledgeBases: BoundKnowledgeBaseSummary[]
  createdAt: string
  updatedAt: string
}

type DataSourceRow = {
  id: string
  user_id: string | null
  name: string
  description: string
  type: string
  enabled: number
  config_json: string
  created_at: string
  updated_at: string
}

type CreateSqlEngineInput = {
  name: string
  description?: string
  type: SqlEngineDataSourceType
  enabled?: boolean
  host: string
  port?: number
  user: string
  password: string
  database: string
}

type CreateSqliteInput = {
  name: string
  description?: string
  enabled?: boolean
  databaseName: string
  filePath?: string
}

type CreateVirtualInput = {
  name: string
  description?: string
  enabled?: boolean
  tables: VirtualTableBinding[]
}

type CreateCsvInput = {
  name: string
  description?: string
  enabled?: boolean
  databaseName: string
  files?: Array<{ content: string; originalFilename: string }>
}

export function toPublicDataSource(
  record: DataSourceRecord,
  boundKnowledgeBases: BoundKnowledgeBaseSummary[] = [],
  recordLookup?: DataSourceRecordLookup,
): PublicDataSource {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    type: record.type,
    enabled: record.enabled,
    config: toPublicDataSourceConfig(record.type, record.config, recordLookup),
    knowledgeBaseIds: boundKnowledgeBases.map((item) => item.id),
    boundKnowledgeBases,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

function buildRecordLookup(
  records: DataSourceRecord[],
): DataSourceRecordLookup {
  return new Map(
    records.map((record) => [
      record.id,
      { id: record.id, name: record.name, type: record.type },
    ]),
  )
}

async function validateVirtualParentBindings(
  userId: string | null,
  bindings: VirtualTableBinding[],
): Promise<void> {
  validateVirtualTableBindings(bindings)
  for (const binding of bindings) {
    const parent = await getDataSourceById(binding.parentDataSourceId, userId)
    if (!parent) {
      throw new Error(`父数据源不存在：${binding.parentDataSourceId}`)
    }
    if (isVirtualType(parent.type)) {
      throw new Error('虚拟数据源不能引用另一个虚拟数据源')
    }
  }
}

function rowToRecord(row: DataSourceRow): DataSourceRecord {
  const type = row.type as DataSourceType
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    description: row.description,
    type,
    enabled: Boolean(row.enabled),
    config: parseDataSourceConfig(type, row.config_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function userFilter(userId: string | null): { sql: string; args: InValue[] } {
  if (userId) return { sql: 'user_id = ?', args: [userId] }
  return { sql: 'user_id IS NULL', args: [] }
}

export function decryptDataSourcePassword(record: DataSourceRecord): string {
  const config = assertSqlEngineConfig(record.type, record.config)
  return decryptSecret(config.passwordCipher)
}

async function insertDataSourceRecord(record: DataSourceRecord): Promise<void> {
  const db = getDbClient()
  await db.execute({
    sql: `INSERT INTO babata_data_sources
          (id, user_id, name, description, type, enabled, config_json, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      record.id,
      record.userId,
      record.name,
      record.description,
      record.type,
      record.enabled ? 1 : 0,
      JSON.stringify(record.config),
      record.createdAt,
      record.updatedAt,
    ],
  })
}

function dedupeCsvColumns(
  columns: Array<{ name: string; sqlType: 'TEXT' | 'INTEGER' | 'REAL' }>,
): Array<{ name: string; sqlType: 'TEXT' | 'INTEGER' | 'REAL' }> {
  const seen = new Map<string, number>()
  return columns.map((column, index) => {
    const baseName = column.name || `column_${index + 1}`
    const count = seen.get(baseName) ?? 0
    seen.set(baseName, count + 1)
    if (count === 0) return { ...column, name: baseName }
    return { ...column, name: `${baseName}_${count + 1}` }
  })
}

async function importCsvTable(input: {
  dataSourceId: string
  tableName: string
  content: string
  originalFilename: string
}): Promise<CsvTableDefinition> {
  const parsed = parseCsvDocument(input.content)
  const columns = dedupeCsvColumns(parsed.columns)
  const tableName = sanitizeSqlIdentifier(input.tableName, 'csv_table')
  const physicalTableName = buildPhysicalCsvTableName(input.dataSourceId, tableName)
  const db = getDbClient()
  await db.execute(`DROP TABLE IF EXISTS ${physicalTableName}`)
  const columnSql = columns
    .map((column) => `"${column.name}" ${column.sqlType}`)
    .join(', ')
  await db.execute(`CREATE TABLE ${physicalTableName} (${columnSql})`)

  for (const row of parsed.rows) {
    const values = columns.map((column, index) =>
      coerceCsvCellValue(row[index] ?? '', column.sqlType),
    )
    const placeholders = columns.map(() => '?').join(', ')
    await db.execute({
      sql: `INSERT INTO ${physicalTableName} (${columns.map((column) => `"${column.name}"`).join(', ')})
            VALUES (${placeholders})`,
      args: values as InValue[],
    })
  }

  return {
    tableName,
    physicalTableName,
    rowCount: parsed.rows.length,
    columns,
    originalFilename: input.originalFilename,
  }
}

async function persistCsvConfig(
  id: string,
  userId: string | null,
  csvConfig: CsvSourceConfig,
  meta?: { name?: string; description?: string; enabled?: boolean },
): Promise<PublicDataSource> {
  const existing = await getDataSourceById(id, userId)
  if (!existing || !isCsvType(existing.type)) {
    throw new Error('CSV 数据源不存在')
  }
  const next: DataSourceRecord = {
    ...existing,
    name: meta?.name?.trim() ?? existing.name,
    description: meta?.description?.trim() ?? existing.description,
    enabled: meta?.enabled ?? existing.enabled,
    config: csvConfig,
    updatedAt: new Date().toISOString(),
  }
  const db = getDbClient()
  await db.execute({
    sql: `UPDATE babata_data_sources
          SET name = ?, description = ?, enabled = ?, config_json = ?, updated_at = ?
          WHERE id = ?`,
    args: [
      next.name,
      next.description,
      next.enabled ? 1 : 0,
      JSON.stringify(next.config),
      next.updatedAt,
      id,
    ],
  })
  const bindings = await listBoundKnowledgeBaseSummaries(id, userId)
  return toPublicDataSource(next, bindings)
}

async function resolveSqliteFilePath(
  userId: string | null,
  dataSourceId: string,
  databaseName: string,
  filePath?: string,
): Promise<string> {
  if (filePath?.trim()) {
    return filePath.trim()
  }
  const directory = path.join('data', 'sqlite', userId ?? 'anonymous')
  await mkdir(directory, { recursive: true })
  const fileName = `${sanitizeSqlIdentifier(databaseName, dataSourceId)}.db`
  return path.join(directory, fileName)
}

async function initializeSqliteFile(filePath: string, databaseName: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true })
  const client = createClient({ url: `file:${filePath}` })
  try {
    await client.execute(
      `CREATE TABLE IF NOT EXISTS babata_sqlite_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )`,
    )
    await client.execute({
      sql: `INSERT INTO babata_sqlite_meta (key, value) VALUES ('database_name', ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      args: [databaseName],
    })
  } finally {
    client.close()
  }
}

export async function listDataSources(
  userId: string | null,
): Promise<PublicDataSource[]> {
  await ensureSchema()
  const db = getDbClient()
  const accessFilter = buildDataSourceAccessFilter(userId, 'data_source:read')
  const result = accessFilter
    ? await db.execute({
        sql: `SELECT id, user_id, name, description, type, enabled, config_json, created_at, updated_at
              FROM babata_data_sources
              WHERE ${accessFilter.sql}
              ORDER BY updated_at DESC`,
        args: accessFilter.args,
      })
    : await db.execute({
        sql: `SELECT id, user_id, name, description, type, enabled, config_json, created_at, updated_at
              FROM babata_data_sources
              WHERE user_id IS NULL
              ORDER BY updated_at DESC`,
      })
  const records = (result.rows as unknown as DataSourceRow[]).map(rowToRecord)
  const bindings = await listBindingSummariesForUser(userId)
  const recordLookup = buildRecordLookup(records)
  return records.map((record) =>
    toPublicDataSource(record, bindings.get(record.id) ?? [], recordLookup),
  )
}

export async function listAllDataSourcesForBinding(): Promise<
  Array<{ id: string; name: string; type: DataSourceType; ownerUserId: string | null }>
> {
  await ensureSchema()
  const db = getDbClient()
  const result = await db.execute(`
    SELECT id, name, type, user_id
    FROM babata_data_sources
    ORDER BY name
  `)
  return (result.rows as unknown as {
    id: string
    name: string
    type: DataSourceType
    user_id: string | null
  }[]).map((row) => ({
    id: row.id,
    name: row.name,
    type: row.type,
    ownerUserId: row.user_id,
  }))
}

export async function getDataSourceById(
  id: string,
  userId: string | null,
): Promise<DataSourceRecord | null> {
  await ensureSchema()
  const db = getDbClient()
  const accessFilter = buildDataSourceAccessFilter(userId, 'data_source:read')
  const result = accessFilter
    ? await db.execute({
        sql: `SELECT id, user_id, name, description, type, enabled, config_json, created_at, updated_at
              FROM babata_data_sources
              WHERE id = ? AND ${accessFilter.sql}`,
        args: [id, ...accessFilter.args],
      })
    : await db.execute({
        sql: `SELECT id, user_id, name, description, type, enabled, config_json, created_at, updated_at
              FROM babata_data_sources
              WHERE id = ? AND user_id IS NULL`,
        args: [id],
      })
  const row = result.rows[0] as unknown as DataSourceRow | undefined
  return row ? rowToRecord(row) : null
}

export async function createSqlEngineDataSource(
  userId: string | null,
  input: CreateSqlEngineInput,
): Promise<PublicDataSource> {
  if (!isSqlEngineType(input.type)) {
    throw new Error('不支持的数据源类型')
  }
  await ensureSchema()
  const now = new Date().toISOString()
  const record: DataSourceRecord = {
    id: crypto.randomUUID(),
    userId,
    name: input.name.trim(),
    description: input.description?.trim() ?? '',
    type: input.type,
    enabled: input.enabled ?? true,
    config: {
      host: input.host.trim(),
      port: input.port ?? DEFAULT_SQL_ENGINE_PORTS[input.type],
      user: input.user.trim(),
      database: input.database.trim(),
      passwordCipher: encryptSecret(input.password),
    },
    createdAt: now,
    updatedAt: now,
  }
  await insertDataSourceRecord(record)
  return toPublicDataSource(record, [])
}

export async function createSqliteDataSource(
  userId: string | null,
  input: CreateSqliteInput,
): Promise<PublicDataSource> {
  await ensureSchema()
  const now = new Date().toISOString()
  const id = crypto.randomUUID()
  const databaseName = sanitizeSqlIdentifier(input.databaseName, 'sqlite_db')
  const filePath = await resolveSqliteFilePath(
    userId,
    id,
    databaseName,
    input.filePath,
  )
  await initializeSqliteFile(filePath, databaseName)
  const record: DataSourceRecord = {
    id,
    userId,
    name: input.name.trim(),
    description: input.description?.trim() ?? '',
    type: 'sqlite',
    enabled: input.enabled ?? true,
    config: {
      filePath,
      databaseName,
    },
    createdAt: now,
    updatedAt: now,
  }
  await insertDataSourceRecord(record)
  return toPublicDataSource(record, [])
}

export async function createCsvDataSource(
  userId: string | null,
  input: CreateCsvInput,
): Promise<PublicDataSource> {
  await ensureSchema()
  const now = new Date().toISOString()
  const id = crypto.randomUUID()
  const databaseName = sanitizeSqlIdentifier(input.databaseName, 'csv_db')
  const tables: CsvTableDefinition[] = []
  for (const file of input.files ?? []) {
    const tableName = resolveCsvTableNameFromFilename(file.originalFilename)
    const imported = await importCsvTable({
      dataSourceId: id,
      tableName,
      content: file.content,
      originalFilename: file.originalFilename,
    })
    tables.push(imported)
  }
  const record: DataSourceRecord = {
    id,
    userId,
    name: input.name.trim(),
    description: input.description?.trim() ?? '',
    type: 'file_csv',
    enabled: input.enabled ?? true,
    config: {
      databaseName,
      tables,
    },
    createdAt: now,
    updatedAt: now,
  }
  await insertDataSourceRecord(record)
  return toPublicDataSource(record, [])
}

export async function createVirtualDataSource(
  userId: string | null,
  input: CreateVirtualInput,
): Promise<PublicDataSource> {
  await ensureSchema()
  await validateVirtualParentBindings(userId, input.tables)
  const now = new Date().toISOString()
  const record: DataSourceRecord = {
    id: crypto.randomUUID(),
    userId,
    name: input.name.trim(),
    description: input.description?.trim() ?? '',
    type: 'virtual',
    enabled: input.enabled ?? true,
    config: {
      tables: input.tables.map((binding) => ({
        parentDataSourceId: binding.parentDataSourceId,
        tableName: binding.tableName.trim(),
        exposedName: binding.exposedName.trim(),
        description: binding.description?.trim() || undefined,
      })),
    },
    createdAt: now,
    updatedAt: now,
  }
  await insertDataSourceRecord(record)
  const allRecords = (await listDataSourceRecords(userId)).concat(record)
  return toPublicDataSource(record, [], buildRecordLookup(allRecords))
}

async function listDataSourceRecords(
  userId: string | null,
): Promise<DataSourceRecord[]> {
  const db = getDbClient()
  const accessFilter = buildDataSourceAccessFilter(userId, 'data_source:read')
  const result = accessFilter
    ? await db.execute({
        sql: `SELECT id, user_id, name, description, type, enabled, config_json, created_at, updated_at
              FROM babata_data_sources
              WHERE ${accessFilter.sql}
              ORDER BY updated_at DESC`,
        args: accessFilter.args,
      })
    : await db.execute({
        sql: `SELECT id, user_id, name, description, type, enabled, config_json, created_at, updated_at
              FROM babata_data_sources
              WHERE user_id IS NULL
              ORDER BY updated_at DESC`,
      })
  return (result.rows as unknown as DataSourceRow[]).map(rowToRecord)
}

export async function createDataSource(
  userId: string | null,
  input: CreateSqlEngineInput,
): Promise<PublicDataSource> {
  return createSqlEngineDataSource(userId, input)
}

export async function updateDataSource(
  id: string,
  userId: string | null,
  input: {
    name?: string
    description?: string
    enabled?: boolean
    host?: string
    port?: number
    user?: string
    password?: string
    database?: string
    databaseName?: string
    filePath?: string
    tables?: VirtualTableBinding[]
  },
): Promise<PublicDataSource | null> {
  const existing = await getDataSourceById(id, userId)
  if (!existing) return null
  if (userId && !(await canAccessDataSource(userId, id, 'data_source:write'))) {
    return null
  }

  let nextConfig = existing.config
  if (isSqlEngineType(existing.type)) {
    const current = assertSqlEngineConfig(existing.type, existing.config)
    nextConfig = {
      host: input.host?.trim() ?? current.host,
      port: input.port ?? current.port,
      user: input.user?.trim() ?? current.user,
      database: input.database?.trim() ?? current.database,
      passwordCipher: input.password
        ? encryptSecret(input.password)
        : current.passwordCipher,
    }
  } else if (isSqliteType(existing.type)) {
    const current = existing.config as SqliteSourceConfig
    nextConfig = {
      filePath: input.filePath?.trim() ?? current.filePath,
      databaseName:
        sanitizeSqlIdentifier(
          input.databaseName ?? current.databaseName,
          current.databaseName,
        ),
    }
  } else if (isCsvType(existing.type)) {
    const current = assertCsvConfig(existing.config)
    nextConfig = {
      databaseName: sanitizeSqlIdentifier(
        input.databaseName ?? current.databaseName,
        current.databaseName,
      ),
      tables: current.tables,
    }
  } else if (isVirtualType(existing.type)) {
    const current = assertVirtualConfig(existing.config)
    if (input.tables) {
      await validateVirtualParentBindings(userId, input.tables)
      nextConfig = {
        tables: input.tables.map((binding) => ({
          parentDataSourceId: binding.parentDataSourceId,
          tableName: binding.tableName.trim(),
          exposedName: binding.exposedName.trim(),
          description: binding.description?.trim() || undefined,
        })),
      }
    } else {
      nextConfig = current
    }
  }

  const next: DataSourceRecord = {
    ...existing,
    name: input.name?.trim() ?? existing.name,
    description: input.description?.trim() ?? existing.description,
    enabled: input.enabled ?? existing.enabled,
    config: nextConfig,
    updatedAt: new Date().toISOString(),
  }
  const db = getDbClient()
  await db.execute({
    sql: `UPDATE babata_data_sources
          SET name = ?, description = ?, enabled = ?, config_json = ?, updated_at = ?
          WHERE id = ?`,
    args: [
      next.name,
      next.description,
      next.enabled ? 1 : 0,
      JSON.stringify(next.config),
      next.updatedAt,
      id,
    ],
  })
  const bindings = await listBoundKnowledgeBaseSummaries(id, userId)
  const allRecords = await listDataSourceRecords(userId)
  return toPublicDataSource(next, bindings, buildRecordLookup(allRecords))
}

export async function getPublicDataSourceById(
  id: string,
  userId: string | null,
): Promise<PublicDataSource | null> {
  const record = await getDataSourceById(id, userId)
  if (!record) return null
  const bindings = await listBoundKnowledgeBaseSummaries(id, userId)
  const allRecords = await listDataSourceRecords(userId)
  return toPublicDataSource(record, bindings, buildRecordLookup(allRecords))
}

async function dropCsvPhysicalTable(physicalTableName: string): Promise<void> {
  const db = getDbClient()
  await db.execute(`DROP TABLE IF EXISTS ${physicalTableName}`)
}

async function dropAllCsvPhysicalTables(config: CsvSourceConfig): Promise<void> {
  for (const table of config.tables) {
    await dropCsvPhysicalTable(table.physicalTableName)
  }
}

export async function deleteDataSource(
  id: string,
  userId: string | null,
): Promise<boolean> {
  const existing = await getDataSourceById(id, userId)
  if (!existing) return false
  if (userId && !(await canAccessDataSource(userId, id, 'data_source:delete'))) {
    return false
  }
  if (isCsvType(existing.type)) {
    await dropAllCsvPhysicalTables(assertCsvConfig(existing.config))
  }
  if (isSqliteType(existing.type)) {
    const config = existing.config as SqliteSourceConfig
    await rm(config.filePath, { force: true })
  }
  const db = getDbClient()
  await db.execute({
    sql: `DELETE FROM babata_data_source_knowledge_bindings WHERE data_source_id = ?`,
    args: [id],
  })
  await db.execute({
    sql: `DELETE FROM babata_data_sources WHERE id = ?`,
    args: [id],
  })
  return true
}

export async function replaceDataSourceBindings(
  dataSourceId: string,
  userId: string | null,
  knowledgeBaseIds: string[],
): Promise<string[]> {
  const existing = await getDataSourceById(dataSourceId, userId)
  if (!existing) throw new Error('数据源不存在')
  const db = getDbClient()
  await db.execute({
    sql: `DELETE FROM babata_data_source_knowledge_bindings WHERE data_source_id = ?`,
    args: [dataSourceId],
  })
  const unique = [...new Set(knowledgeBaseIds.filter(Boolean))]
  for (const knowledgeBaseId of unique) {
    await db.execute({
      sql: `INSERT INTO babata_data_source_knowledge_bindings
            (data_source_id, knowledge_base_id, user_id)
            VALUES (?, ?, ?)`,
      args: [dataSourceId, knowledgeBaseId, userId],
    })
  }
  return unique
}

export async function listBoundKnowledgeBaseIds(
  dataSourceId: string,
  userId: string | null,
): Promise<string[]> {
  await ensureSchema()
  const db = getDbClient()
  const result = await db.execute({
    sql: `SELECT b.knowledge_base_id AS id
          FROM babata_data_source_knowledge_bindings b
          INNER JOIN babata_knowledge_bases k ON k.id = b.knowledge_base_id
          WHERE b.data_source_id = ?
            AND k.enabled = 1
            AND (${userId ? 'k.user_id = ?' : 'k.user_id IS NULL'})`,
    args: userId ? [dataSourceId, userId] : [dataSourceId],
  })
  return (result.rows as unknown as { id: string }[]).map((row) => row.id)
}

function mapBindingSummaryRows(
  rows: {
    data_source_id: string
    id: string
    name: string | null
    enabled: number | null
  }[],
): Map<string, BoundKnowledgeBaseSummary[]> {
  const map = new Map<string, BoundKnowledgeBaseSummary[]>()
  for (const row of rows) {
    const list = map.get(row.data_source_id) ?? []
    list.push({
      id: row.id,
      name: row.name?.trim() || '未知知识库',
      enabled: Boolean(row.enabled),
    })
    map.set(row.data_source_id, list)
  }
  return map
}

export async function listBoundKnowledgeBaseSummaries(
  dataSourceId: string,
  userId: string | null,
): Promise<BoundKnowledgeBaseSummary[]> {
  await ensureSchema()
  const db = getDbClient()
  const filter = userFilter(userId)
  const result = await db.execute({
    sql: `SELECT b.data_source_id, b.knowledge_base_id AS id, k.name, k.enabled
          FROM babata_data_source_knowledge_bindings b
          LEFT JOIN babata_knowledge_bases k ON k.id = b.knowledge_base_id
          WHERE b.data_source_id = ? AND b.${filter.sql}
          ORDER BY k.name ASC`,
    args: [dataSourceId, ...filter.args],
  })
  return mapBindingSummaryRows(
    result.rows as unknown as {
      data_source_id: string
      id: string
      name: string | null
      enabled: number | null
    }[],
  ).get(dataSourceId) ?? []
}

async function listBindingSummariesForUser(
  userId: string | null,
): Promise<Map<string, BoundKnowledgeBaseSummary[]>> {
  const db = getDbClient()
  const filter = userFilter(userId)
  const result = await db.execute({
    sql: `SELECT b.data_source_id, b.knowledge_base_id AS id, k.name, k.enabled
          FROM babata_data_source_knowledge_bindings b
          LEFT JOIN babata_knowledge_bases k ON k.id = b.knowledge_base_id
          WHERE b.${filter.sql}
          ORDER BY k.name ASC`,
    args: filter.args,
  })
  return mapBindingSummaryRows(
    result.rows as unknown as {
      data_source_id: string
      id: string
      name: string | null
      enabled: number | null
    }[],
  )
}

export async function addCsvTableToDataSource(
  id: string,
  userId: string | null,
  input: { content: string; originalFilename: string },
): Promise<PublicDataSource> {
  const existing = await getDataSourceById(id, userId)
  if (!existing || !isCsvType(existing.type)) {
    throw new Error('CSV 数据源不存在')
  }
  const current = assertCsvConfig(existing.config)
  const tableName = resolveCsvTableNameFromFilename(input.originalFilename)
  const imported = await importCsvTable({
    dataSourceId: id,
    tableName,
    content: input.content,
    originalFilename: input.originalFilename,
  })
  const tables = [
    ...current.tables.filter((table) => table.tableName !== imported.tableName),
    imported,
  ]
  return persistCsvConfig(id, userId, {
    databaseName: current.databaseName,
    tables,
  })
}

export async function removeCsvTableFromDataSource(
  id: string,
  userId: string | null,
  tableName: string,
): Promise<PublicDataSource> {
  const existing = await getDataSourceById(id, userId)
  if (!existing || !isCsvType(existing.type)) {
    throw new Error('CSV 数据源不存在')
  }
  const current = assertCsvConfig(existing.config)
  const target = current.tables.find((table) => table.tableName === tableName)
  if (!target) {
    throw new Error('CSV 表不存在')
  }
  await dropCsvPhysicalTable(target.physicalTableName)
  return persistCsvConfig(id, userId, {
    databaseName: current.databaseName,
    tables: current.tables.filter((table) => table.tableName !== tableName),
  })
}
