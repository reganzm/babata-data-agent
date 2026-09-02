import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { truncateRows } from '@/lib/storage-limits'
import { assertAnalyticsConfigured } from './analytics-client'
import { queryDoris } from './doris-client'
import {
  getSqlTimeoutMs,
  withTimeout,
} from './sql-guard'

/**
 * 埋点验收专用查询工具（供巨斧使用）
 *
 * 固定查询埋点事件明细表 prod.ods_doris_event_v3_1h，封装成参数化只读查询，
 * 避免让 Agent 手写全表 SQL 造成误扫或注入。所有列名走白名单校验，所有值走参数化。
 */

/** 事件明细表全限定名；可用 EVENT_TRACKING_TABLE 覆盖 */
function getEventTable(): string {
  return process.env.EVENT_TRACKING_TABLE?.trim() || 'prod.ods_doris_event_v3_1h'
}

/** app→app_key 维表全限定名；可用 APP_MAPPING_TABLE 覆盖 */
function getAppMappingTable(): string {
  return process.env.APP_MAPPING_TABLE?.trim() || 'prod.ods_dim_doris_app_mapping'
}

/** ods_doris_event_v3_1h 全部列白名单（来自建表 DDL） */
export const EVENT_TABLE_COLUMNS = new Set<string>([
  'ds',
  'hh',
  'date_hour_partition',
  'event_id',
  'event_time',
  'nginx_date',
  'nginx_hour',
  'nginx_time',
  'imei',
  'mac',
  'imsi',
  'idfa',
  'android_id',
  'device_id',
  'os',
  'os_version',
  'model',
  'brand',
  'product',
  'board',
  'network',
  'lang',
  'time_zone',
  'qemu',
  'has_bluetooth',
  'disable_bluetooth',
  'hardware',
  'has_gps',
  'has_temperature',
  'battery_status',
  'bat_level',
  'battery_temperature',
  'screen_height',
  'screen_width',
  'is_root',
  'app_key',
  'app_version',
  'uid',
  'app_version_code',
  'sdk_version',
  'channel',
  'pkg',
  'lat',
  'lon',
  'city_key',
  'country',
  'province',
  'city',
  'session_id',
  'event_name',
  'duration',
  'element_id',
  'reference',
  'module',
  'position',
  'content_id',
  'content_model',
  'project',
  'p_table',
  'cm_module',
  'cm_id',
  'alg_from',
  'args',
  'screen_orientation',
  'ip',
  'user_agent',
  'touch_x',
  'touch_y',
  'x3d',
  'y3d',
  'z3d',
  'virtual_id',
  'is_first_day',
  'oaid',
  'aaid',
  'df_id',
  'has_phone_state',
  'has_storage',
  'ad_from',
  'caid',
  'business_version_code',
  'df_id_ios',
  'device_spec',
  'uuid',
  'protocol_type',
  'additional_fields',
  'event_type',
  'partition_id',
  'device_cpu',
  'device_fps',
  'install_time',
])

/** sample 模式默认返回、便于验收阅读的列 */
const DEFAULT_SAMPLE_FIELDS = [
  'ds',
  'hh',
  'event_time',
  'event_name',
  'event_type',
  'uid',
  'device_id',
  'app_key',
  'app_version',
  'channel',
  'os',
  'element_id',
  'module',
  'position',
  'content_id',
  'content_model',
  'args',
  'additional_fields',
  'reference',
  'duration',
]

const propertyFilterSchema = z.object({
  field: z.string().describe('过滤列名，须为表内真实列'),
  value: z
    .union([z.string(), z.number(), z.null()])
    .describe('过滤值，等值匹配；null 表示筛选该列为 NULL'),
})

function assertColumn(name: string): string {
  if (!EVENT_TABLE_COLUMNS.has(name)) {
    throw new Error(
      `未知埋点列名：${name}（不在 ods_doris_event_v3_1h 列白名单内）`,
    )
  }
  return name
}

/** 今天（Asia/Shanghai）的 ds（YYYYMMDD int） */
function todayShanghaiDs(): number {
  const formatted = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
  return Number(formatted.replace(/-/g, ''))
}

type BuiltQuery = { sql: string; params: unknown[] }

/** 版本号字符串 → [major, minor, patch] 三段数值，并校验合法性 */
function parseVersion(version: string): [number, number, number] {
  const parts = version.trim().split('.')
  if (parts.length !== 3 || !parts.every((p) => /^\d+$/.test(p))) {
    throw new Error(`非法版本号：${version}（应为 major.minor.patch 数字形式，如 2.37.3）`)
  }
  const [major, minor, patch] = parts.map(Number)
  if (minor > 99 || patch > 99) {
    throw new Error(
      `版本号 ${version} 的 minor/patch 超过两位，无法用 major*10000+minor*100+patch 规则转换`,
    )
  }
  return [major, minor, patch]
}

/** 版本号字符串 → app_version_code：major*10000 + minor*100 + patch（如 2.37.3 → 23703） */
function versionToCode(version: string): number {
  const [major, minor, patch] = parseVersion(version)
  return major * 10000 + minor * 100 + patch
}

/**
 * 版本号 → 验收版本区间 [下限 code, 上限 code]（闭区间）。
 * 下限为文档版本号本身；上限为下一个 minor 的 .0（major.(minor+1).0），即封顶到该 minor 之上。
 * 例：2.37.2 → [23702, 23800]（2.37.2 ~ 2.38.0），只验收 2.37.x 且不超过 2.38.0。
 */
function versionCodeRange(version: string): { min: number; max: number } {
  const [major, minor] = parseVersion(version)
  const min = versionToCode(version)
  // 上限：下一个 minor 的 .0；minor 进位到 major+1.0.0（覆盖 minor=99 的边界）
  const max = minor >= 99 ? (major + 1) * 10000 : major * 10000 + (minor + 1) * 100
  return { min, max }
}

function buildWhere(
  eventName: string,
  ds: number,
  filters: Array<{ field: string; value: string | number | null }>,
  appKeys: string[] | undefined,
  minAppVersion: string | undefined,
): BuiltQuery {
  const clauses: string[] = ['ds = ?', 'event_name = ?']
  const params: unknown[] = [ds, eventName]

  // app_key 多值过滤：peanut 旗下多个 app_key（各 os 版本）
  if (appKeys && appKeys.length > 0) {
    const placeholders = appKeys.map(() => '?').join(', ')
    clauses.push(`app_key IN (${placeholders})`)
    params.push(...appKeys)
  }

  // 版本区间：文档版本号（major.minor.patch）转 app_version_code 做闭区间过滤。
  // 下限=版本号本身；上限=下一个 minor 的 .0（如 2.37.2 → [2.37.2, 2.38.0]），封顶避免混入更高 minor。
  if (minAppVersion !== undefined && minAppVersion.trim() !== '') {
    const { min, max } = versionCodeRange(minAppVersion)
    clauses.push('app_version_code >= ?')
    params.push(min)
    clauses.push('app_version_code <= ?')
    params.push(max)
  }

  for (const filter of filters) {
    const column = assertColumn(filter.field)
    if (filter.value === null) {
      clauses.push(`${column} IS NULL`)
    } else {
      clauses.push(`${column} = ?`)
      params.push(filter.value)
    }
  }
  return { sql: clauses.join(' AND '), params }
}

/** 参数化执行只读 SELECT，复用只读校验 / 超时 / 行截断 / 审计（queryDoris 内） */
async function runParameterizedSelect(sql: string, params: unknown[]) {
  assertAnalyticsConfigured()
  // 仅允许简单 SELECT 或带 CTE 的 SELECT（WITH ... SELECT），拒绝其他任何形式
  const stripped = sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ').replace(/\s+/g, ' ').trim()
  if (!/^(WITH\b[\s\S]*\bSELECT\b|SELECT\b)/i.test(stripped)) {
    throw new Error('仅允许简单 SELECT 或带 CTE 的 SELECT 语句，拒绝其他 SQL 形式')
  }
  if (/\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|TRUNCATE|MERGE|UPSERT|GRANT|REVOKE|CALL|EXECUTE|LOAD|SET|KILL|SHOW|DESCRIBE|EXPLAIN|USE)\b/i.test(stripped)) {
    throw new Error('SQL 包含禁止的关键字，仅允许只读 SELECT')
  }
  const rows = await withTimeout(
    queryDoris(sql, params),
    getSqlTimeoutMs(),
    '埋点查询',
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
  const cap = 1000
  const { rows: cappedRows, truncated, totalCount } = truncateRows(normalized, cap)
  return { sql, rows: cappedRows, truncated, totalCount, maxRows: cap }
}

const rowSchema = z.record(z.union([z.string(), z.number(), z.null()]))

export const eventTrackingQueryTool = createTool({
  id: 'event-tracking-query',
  description:
    '查询埋点事件明细表 prod.ods_doris_event_v3_1h。按事件名 + ds 日期分区范围做参数化只读查询，支持三种模式：sample 取样本行看字段实际取值、count 统计上报量判断是否遗漏、field-stats 对某列做 GROUP BY 看取值分布是否越界。列名走白名单，值走参数化。',
  inputSchema: z.object({
    eventName: z.string().min(1).describe('埋点事件名，匹配 event_name 列'),
    appKeys: z
      .array(z.string())
      .optional()
      .describe(
        '按 app_key 过滤（app_key IN (...)）。先用 list-app-keys 工具查 peanut 的 app_key 列表，再传入要验收的 app_key',
      ),
    minAppVersion: z
      .string()
      .optional()
      .describe(
        '埋点文档里的版本号（major.minor.patch，如 2.37.2）。工具按 major*10000+minor*100+patch 转 app_version_code，并生成闭区间过滤：下限为该版本本身，上限为下一个 minor 的 .0（2.37.2 → app_version_code ∈ [23702, 23800]，即 2.37.2 ~ 2.38.0），只验收该版本起、不超过下一个 minor 的上报，避免混入更高版本。',
      ),
    mode: z
      .enum(['sample', 'count', 'field-stats'])
      .default('sample')
      .describe('查询模式：sample 样本 / count 计数 / field-stats 单列取值分布'),
    fields: z
      .array(z.string())
      .optional()
      .describe('sample 模式返回的列（省略用默认列集）；须为表内真实列'),
    groupField: z
      .string()
      .optional()
      .describe('field-stats 模式必填：要统计取值分布的列名'),
    propertyFilters: z
      .array(propertyFilterSchema)
      .optional()
      .describe('额外等值过滤条件（如 channel / os）'),
  }),
  outputSchema: z.object({
    table: z.string(),
    mode: z.string(),
    sql: z.string(),
    params: z.array(z.union([z.string(), z.number(), z.null()])),
    rowCount: z.number(),
    rows: z.array(rowSchema),
    truncated: z.boolean().optional(),
    note: z.string(),
  }),
  execute: async ({
    eventName,
    appKeys,
    minAppVersion,
    mode = 'sample',
    fields,
    groupField,
    propertyFilters,
  }) => {
    const table = getEventTable()
    const ds = todayShanghaiDs()
    const filters = propertyFilters ?? []
    const where = buildWhere(eventName, ds, filters, appKeys, minAppVersion)
    const cap = 1000

    let sql: string
    if (mode === 'count') {
      sql =
        `SELECT COUNT(*) AS event_count, ` +
        `COUNT(DISTINCT uid) AS distinct_uid, ` +
        `COUNT(DISTINCT device_id) AS distinct_device, ` +
        `MIN(event_time) AS min_event_time, ` +
        `MAX(event_time) AS max_event_time ` +
        `FROM ${table} WHERE ${where.sql}`
    } else if (mode === 'field-stats') {
      if (!groupField) {
        throw new Error('field-stats 模式必须提供 groupField')
      }
      const column = assertColumn(groupField)
      sql =
        `SELECT ${column} AS field_value, COUNT(*) AS cnt ` +
        `FROM ${table} WHERE ${where.sql} ` +
        `GROUP BY ${column} ORDER BY cnt DESC LIMIT ${cap}`
    } else {
      const selected = (fields && fields.length > 0 ? fields : DEFAULT_SAMPLE_FIELDS)
        .map(assertColumn)
        .join(', ')
      sql =
        `SELECT ${selected} FROM ${table} WHERE ${where.sql} ` +
        `ORDER BY event_time DESC LIMIT ${cap}`
    }

    const result = await runParameterizedSelect(sql, where.params)
    return {
      table,
      mode,
      sql: result.sql,
      params: where.params as (string | number | null)[],
      rowCount: result.totalCount,
      rows: result.rows,
      truncated: result.truncated,
      note: result.truncated
        ? `埋点表查询结果（ds=${ds}，已截断为前 1000 行，共 ${result.totalCount} 行）`
        : `埋点表查询结果（ds=${ds}）`,
    }
  },
})

const appKeyRowSchema = z.record(z.union([z.string(), z.number(), z.null()]))

export const listAppKeysTool = createTool({
  id: 'list-app-keys',
  description:
    '查询 app→app_key 映射维表 prod.ods_dim_doris_app_mapping，返回某个 app 旗下的全部有效 app_key（app_key > 0，含 app_name、os；维表中的负值 app_key 属无效数据会被过滤）。默认 app=peanut。用于在验收埋点前拿到目标 app_key 列表，再传给 event-tracking-query 的 appKeys。',
  inputSchema: z.object({
    app: z
      .string()
      .default('peanut')
      .describe('业务 app 标识，默认 peanut'),
  }),
  outputSchema: z.object({
    app: z.string(),
    table: z.string(),
    sql: z.string(),
    rowCount: z.number(),
    appKeys: z.array(z.string()),
    rows: z.array(appKeyRowSchema),
    note: z.string(),
  }),
  execute: async ({ app = 'peanut' }) => {
    const table = getAppMappingTable()
    // app_key 须为正整数；维表中存在 -92430001 这类无效负值，需过滤掉
    const sql =
      `SELECT DISTINCT app_key, app_name, os FROM ${table} ` +
      `WHERE app = ? AND app_key > 0 ORDER BY app_key LIMIT 1000`
    const result = await runParameterizedSelect(sql, [app])
    const appKeys = result.rows
      .map((r) => r.app_key)
      .filter((v): v is string | number => v !== null && v !== undefined)
      .map((v) => String(v))
    return {
      app,
      table,
      sql: result.sql,
      rowCount: result.totalCount,
      appKeys,
      rows: result.rows,
      note: `${app} 旗下共 ${appKeys.length} 个 app_key`,
    }
  },
})
