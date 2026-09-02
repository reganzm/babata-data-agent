export const DATA_SOURCE_TYPES = [
  'doris',
  'mysql',
  'clickhouse',
  'starrocks',
  'file_csv',
  'sqlite',
  'virtual',
] as const

export type DataSourceType = (typeof DATA_SOURCE_TYPES)[number]

export const SQL_ENGINE_DATA_SOURCE_TYPES = [
  'doris',
  'mysql',
  'clickhouse',
  'starrocks',
] as const

export type SqlEngineDataSourceType = (typeof SQL_ENGINE_DATA_SOURCE_TYPES)[number]

export type SqlEngineSourceConfig = {
  host: string
  port: number
  user: string
  database: string
  passwordCipher: string
}

export type SqliteSourceConfig = {
  filePath: string
  databaseName: string
}

export type CsvColumnDefinition = {
  name: string
  sqlType: 'TEXT' | 'INTEGER' | 'REAL'
}

export type CsvTableDefinition = {
  tableName: string
  physicalTableName: string
  rowCount: number
  columns: CsvColumnDefinition[]
  originalFilename: string
}

export type CsvSourceConfig = {
  databaseName: string
  tables: CsvTableDefinition[]
}

export type VirtualTableBinding = {
  parentDataSourceId: string
  tableName: string
  exposedName: string
  description?: string
}

export type VirtualSourceConfig = {
  tables: VirtualTableBinding[]
}

export type PublicCsvTableDefinition = {
  tableName: string
  rowCount: number
  columns: CsvColumnDefinition[]
  originalFilename: string
}

export type PublicCsvConfig = {
  kind: 'csv'
  databaseName: string
  tables: PublicCsvTableDefinition[]
}

export type DataSourceConfig =
  | SqlEngineSourceConfig
  | SqliteSourceConfig
  | CsvSourceConfig
  | VirtualSourceConfig

export type PublicSqlEngineConfig = {
  kind: 'sql_engine'
  host: string
  port: number
  user: string
  database: string
  passwordSet: boolean
}

export type PublicSqliteConfig = {
  kind: 'sqlite'
  filePath: string
  databaseName: string
}

export type LegacyCsvSourceConfig = {
  databaseName: string
  tableName: string
  physicalTableName: string
  rowCount: number
  columns: CsvColumnDefinition[]
  originalFilename: string
}

export type PublicVirtualTableBinding = {
  exposedName: string
  tableName: string
  parentDataSourceId: string
  parentDataSourceName: string
  parentDataSourceType: DataSourceType
  description?: string
}

export type PublicVirtualConfig = {
  kind: 'virtual'
  parentCount: number
  tableCount: number
  tables: PublicVirtualTableBinding[]
}

export type PublicDataSourceConfig =
  | PublicSqlEngineConfig
  | PublicSqliteConfig
  | PublicCsvConfig
  | PublicVirtualConfig

export const DEFAULT_SQL_ENGINE_PORTS: Record<SqlEngineDataSourceType, number> = {
  doris: 9030,
  mysql: 3306,
  clickhouse: 8123,
  starrocks: 9030,
}

export const DATA_SOURCE_TYPE_LABELS: Record<DataSourceType, string> = {
  doris: 'Doris',
  mysql: 'MySQL',
  clickhouse: 'ClickHouse',
  starrocks: 'StarRocks',
  file_csv: 'CSV 文件',
  sqlite: 'SQLite',
  virtual: '虚拟数据源',
}

export const PHYSICAL_DATA_SOURCE_TYPES = DATA_SOURCE_TYPES.filter(
  (type): type is Exclude<DataSourceType, 'virtual'> => type !== 'virtual',
)

export function isVirtualType(type: DataSourceType): type is 'virtual' {
  return type === 'virtual'
}

export function isPhysicalDataSourceType(
  type: DataSourceType,
): type is Exclude<DataSourceType, 'virtual'> {
  return !isVirtualType(type)
}

export function isSqlEngineType(type: DataSourceType): type is SqlEngineDataSourceType {
  return (SQL_ENGINE_DATA_SOURCE_TYPES as readonly string[]).includes(type)
}

export function isCsvType(type: DataSourceType): type is 'file_csv' {
  return type === 'file_csv'
}

export function isSqliteType(type: DataSourceType): type is 'sqlite' {
  return type === 'sqlite'
}

export function assertSqlEngineConfig(
  type: DataSourceType,
  config: DataSourceConfig,
): SqlEngineSourceConfig {
  if (!isSqlEngineType(type)) {
    throw new Error('该数据源不是 SQL 引擎类型')
  }
  return config as SqlEngineSourceConfig
}

export function assertCsvConfig(config: DataSourceConfig): CsvSourceConfig {
  if (!('databaseName' in config) || !('tables' in config)) {
    throw new Error('该数据源不是 CSV 类型')
  }
  const csvConfig = config as CsvSourceConfig
  if (!Array.isArray(csvConfig.tables)) {
    throw new Error('该数据源不是 CSV 类型')
  }
  if ('filePath' in config || 'host' in config || 'parentDataSourceId' in (config as object)) {
    throw new Error('该数据源不是 CSV 类型')
  }
  return csvConfig
}

export function assertSqliteConfig(config: DataSourceConfig): SqliteSourceConfig {
  if (!('filePath' in config) || 'tables' in config) {
    throw new Error('该数据源不是 SQLite 类型')
  }
  return config as SqliteSourceConfig
}

export function assertVirtualConfig(config: DataSourceConfig): VirtualSourceConfig {
  if (!('tables' in config) || !Array.isArray((config as VirtualSourceConfig).tables)) {
    throw new Error('该数据源不是虚拟数据源')
  }
  if ('host' in config || 'filePath' in config || 'databaseName' in config) {
    throw new Error('该数据源不是虚拟数据源')
  }
  return config as VirtualSourceConfig
}

function normalizeVirtualConfig(parsed: Record<string, unknown>): VirtualSourceConfig {
  const tables = Array.isArray(parsed.tables) ? parsed.tables : []
  return {
    tables: tables.map((item) => {
      const binding = item as Record<string, unknown>
      return {
        parentDataSourceId: String(binding.parentDataSourceId ?? ''),
        tableName: String(binding.tableName ?? ''),
        exposedName: String(binding.exposedName ?? binding.tableName ?? ''),
        description:
          typeof binding.description === 'string' ? binding.description : undefined,
      }
    }),
  }
}

function normalizeLegacyCsvConfig(parsed: Record<string, unknown>): CsvSourceConfig {
  if (Array.isArray(parsed.tables)) {
    return {
      databaseName: String(parsed.databaseName ?? 'csv_db'),
      tables: (parsed.tables as CsvTableDefinition[]).map((table) => ({
        tableName: String(table.tableName ?? ''),
        physicalTableName: String(table.physicalTableName ?? ''),
        rowCount: Number(table.rowCount ?? 0),
        columns: Array.isArray(table.columns)
          ? (table.columns as CsvColumnDefinition[])
          : [],
        originalFilename: String(table.originalFilename ?? ''),
      })),
    }
  }
  if (parsed.physicalTableName) {
    const legacy = parsed as unknown as LegacyCsvSourceConfig
    return {
      databaseName: String(legacy.databaseName ?? 'csv_db'),
      tables: [
        {
          tableName: String(legacy.tableName ?? 'csv_table'),
          physicalTableName: String(legacy.physicalTableName ?? ''),
          rowCount: Number(legacy.rowCount ?? 0),
          columns: Array.isArray(legacy.columns) ? legacy.columns : [],
          originalFilename: String(legacy.originalFilename ?? ''),
        },
      ],
    }
  }
  return {
    databaseName: String(parsed.databaseName ?? 'csv_db'),
    tables: [],
  }
}

export function parseDataSourceConfig(
  type: DataSourceType,
  raw: string,
): DataSourceConfig {
  const parsed = JSON.parse(raw) as Record<string, unknown>
  if (isVirtualType(type)) {
    return normalizeVirtualConfig(parsed)
  }
  if (isCsvType(type)) {
    return normalizeLegacyCsvConfig(parsed)
  }
  if (isSqliteType(type)) {
    return {
      filePath: String(parsed.filePath ?? ''),
      databaseName: String(parsed.databaseName ?? ''),
    }
  }
  return {
    host: String(parsed.host ?? ''),
    port: Number(parsed.port ?? DEFAULT_SQL_ENGINE_PORTS[type as SqlEngineDataSourceType] ?? 9030),
    user: String(parsed.user ?? ''),
    database: String(parsed.database ?? ''),
    passwordCipher: String(parsed.passwordCipher ?? ''),
  }
}

export type DataSourceRecordLookup = Map<
  string,
  { id: string; name: string; type: DataSourceType }
>

export function buildPublicVirtualConfig(
  config: VirtualSourceConfig,
  recordLookup: DataSourceRecordLookup = new Map(),
): PublicVirtualConfig {
  const tables = config.tables.map((binding) => {
    const parent = recordLookup.get(binding.parentDataSourceId)
    return {
      exposedName: binding.exposedName,
      tableName: binding.tableName,
      parentDataSourceId: binding.parentDataSourceId,
      parentDataSourceName: parent?.name ?? '已删除',
      parentDataSourceType: parent?.type ?? 'doris',
      description: binding.description,
    }
  })
  return {
    kind: 'virtual',
    parentCount: new Set(config.tables.map((binding) => binding.parentDataSourceId)).size,
    tableCount: config.tables.length,
    tables,
  }
}

export function toPublicDataSourceConfig(
  type: DataSourceType,
  config: DataSourceConfig,
  recordLookup?: DataSourceRecordLookup,
): PublicDataSourceConfig {
  if (isVirtualType(type)) {
    return buildPublicVirtualConfig(assertVirtualConfig(config), recordLookup)
  }
  if (isCsvType(type)) {
    const csvConfig = assertCsvConfig(config)
    return {
      kind: 'csv',
      databaseName: csvConfig.databaseName,
      tables: csvConfig.tables.map((table) => ({
        tableName: table.tableName,
        rowCount: table.rowCount,
        columns: table.columns,
        originalFilename: table.originalFilename,
      })),
    }
  }
  if (isSqliteType(type)) {
    const sqliteConfig = assertSqliteConfig(config)
    return {
      kind: 'sqlite',
      filePath: sqliteConfig.filePath,
      databaseName: sqliteConfig.databaseName,
    }
  }
  const sqlConfig = assertSqlEngineConfig(type, config)
  return {
    kind: 'sql_engine',
    host: sqlConfig.host,
    port: sqlConfig.port,
    user: sqlConfig.user,
    database: sqlConfig.database,
    passwordSet: Boolean(sqlConfig.passwordCipher),
  }
}

export function formatPublicDataSourceSummary(
  type: DataSourceType,
  config: PublicDataSourceConfig,
): string {
  if (config.kind === 'csv') {
    const totalRows = config.tables.reduce((sum, table) => sum + table.rowCount, 0)
    return `${config.databaseName} · ${config.tables.length} 张表 · ${totalRows} 行`
  }
  if (config.kind === 'sqlite') {
    return `${config.databaseName} · ${config.filePath}`
  }
  if (config.kind === 'virtual') {
    return `${config.parentCount} 个父源 · ${config.tableCount} 张表`
  }
  return `${config.host}:${config.port}/${config.database}`
}
