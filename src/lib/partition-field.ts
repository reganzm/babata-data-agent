import type { SqlClarification } from '@/lib/sql-clarification'
import {
  inferPartitionField,
  isValidYyyyMMdd,
  yyyyMMddFromDate,
} from '@/lib/sql-clarification'

/** Doris 数仓常见日期分区列（优先级从高到低） */
export const PREFERRED_PARTITION_COLUMNS = ['ds'] as const

const DATE_SUB_CURRENT_INTERVAL =
  /DATE_SUB\s*\(\s*CURRENT_DATE\s*,\s*INTERVAL\s+(\d+)\s+DAY\s*\)/gi

export function columnNamesInclude(
  columns: { name: string }[],
  field: string,
): boolean {
  const target = field.toLowerCase()
  return columns.some((c) => c.name.toLowerCase() === target)
}

export function clarificationRequiresDs(
  clarification?: SqlClarification | null,
): boolean {
  if (!clarification) return false
  if (inferPartitionField(clarification) === 'ds') return true
  return clarification.dimensions.some((d) => /^ds$/i.test(d.trim()))
}

/** 从表结构 + 用户澄清解析应使用的日期分区列 */
export function resolvePartitionField(
  columns: { name: string }[],
  clarification?: SqlClarification | null,
): string | null {
  if (clarificationRequiresDs(clarification)) {
    return 'ds'
  }

  const fromClarification = clarification
    ? inferPartitionField(clarification)
    : null
  if (
    fromClarification &&
    (fromClarification === 'ds' || columnNamesInclude(columns, fromClarification))
  ) {
    return fromClarification
  }
  for (const preferred of PREFERRED_PARTITION_COLUMNS) {
    if (columnNamesInclude(columns, preferred)) return preferred
  }
  return null
}

/** 是否应对 SQL 做 ds 分区强制校正 */
export function shouldEnforceDsPartition(
  columns: { name: string }[],
  clarification?: SqlClarification | null,
  explicitPartitionField?: string | null,
): boolean {
  if (explicitPartitionField === 'ds') return true
  if (clarificationRequiresDs(clarification)) return true
  if (columnNamesInclude(columns, 'ds')) return true
  return false
}

/** 近 N 天（含今天）的 yyyyMMdd 起止 */
export function computeDsRangeForLastDays(dayCount: number): {
  start: string
  end: string
} {
  const n = Math.max(1, dayCount)
  const end = new Date()
  end.setHours(0, 0, 0, 0)
  const start = new Date(end)
  start.setDate(start.getDate() - (n - 1))
  return { start: yyyyMMddFromDate(start), end: yyyyMMddFromDate(end) }
}

function resolveDsRangeFromClarification(
  clarification?: SqlClarification | null,
): { start: string; end: string } | null {
  if (
    clarification &&
    isValidYyyyMMdd(clarification.timeStart) &&
    isValidYyyyMMdd(clarification.timeEnd)
  ) {
    return {
      start: clarification.timeStart,
      end: clarification.timeEnd,
    }
  }
  return null
}

function replaceDateSubPredicates(
  sql: string,
  range: { start: string; end: string },
): string {
  const between = `ds >= '${range.start}' AND ds <= '${range.end}'`
  let out = sql

  out = out.replace(
    /\b(?:dt|ds)\s*>=\s*DATE_SUB\s*\(\s*CURRENT_DATE\s*,\s*INTERVAL\s+(\d+)\s+DAY\s*\)/gi,
    () => between,
  )

  out = out.replace(
    /\b(?:dt|ds)\s*>=\s*DATE_SUB\s*\(\s*CURRENT_DATE\s*,\s*INTERVAL\s+(\d+)\s+DAY\s*\)\s*AND\s+(?:dt|ds)\s*<=\s*CURRENT_DATE\b/gi,
    () => between,
  )

  out = out.replace(DATE_SUB_CURRENT_INTERVAL, () => `'${range.start}'`)
  out = out.replace(/\bCURRENT_DATE\b/gi, `'${range.end}'`)

  return out
}

/** 写入 LLM system / prompt 的默认分区说明 */
export function buildDefaultPartitionSqlHint(
  columns: { name: string }[],
  clarification?: SqlClarification | null,
): string {
  const partition = resolvePartitionField(columns, clarification)
  if (!partition) return ''

  const hasDt = columnNamesInclude(columns, 'dt')
  const clarRange = resolveDsRangeFromClarification(clarification)
  const lines = [
    '【库表日期分区规范 — 必须遵守】',
    `- 本表日期过滤、按日 GROUP BY、ORDER BY 时间轴一律使用列 \`${partition}\`（yyyyMMdd 整数）`,
    `- 禁止使用 dt 列；禁止使用 CURRENT_DATE()、DATE_SUB、DATE_FORMAT`,
    clarRange
      ? `- 时间范围示例：\`${partition}\` >= '${clarRange.start}' AND \`${partition}\` <= '${clarRange.end}'`
      : `- 近 15 天示例：\`${partition}\` >= 'yyyyMMdd' AND \`${partition}\` <= 'yyyyMMdd'（用字面量，勿写 DATE_SUB）`,
  ]
  if (partition === 'ds' && (hasDt || clarificationRequiresDs(clarification))) {
    lines.push(
      '- 不得使用 dt：即使用户未在 schema 列表中看到 ds，分区列仍为 ds（yyyyMMdd）',
    )
  }
  return lines.join('\n')
}

/** 生成 SQL 后强制校正为 ds 分区写法 */
export function enforcePartitionFieldInSql(
  sql: string,
  columns: { name: string }[],
  clarification?: SqlClarification | null,
  explicitPartitionField?: string | null,
): string {
  if (!shouldEnforceDsPartition(columns, clarification, explicitPartitionField)) {
    return sql
  }

  const clarRange = resolveDsRangeFromClarification(clarification)
  const intervalMatch = sql.match(
    /(?:dt|ds)\s*>=\s*DATE_SUB\s*\(\s*CURRENT_DATE\s*,\s*INTERVAL\s+(\d+)\s+DAY\s*\)/i,
  )
  const defaultRange =
    clarRange ??
    (intervalMatch
      ? computeDsRangeForLastDays(parseInt(intervalMatch[1], 10) + 1)
      : computeDsRangeForLastDays(15))

  let out = sql
  out = replaceDateSubPredicates(out, defaultRange)

  out = out.replace(/\bWHERE\s+dt\b/gi, 'WHERE ds')
  out = out.replace(/\bAND\s+dt\s*(>=|<=|=|>|<|BETWEEN)/gi, 'AND ds $1')
  out = out.replace(/\bGROUP\s+BY\s+dt\b/gi, 'GROUP BY ds')
  out = out.replace(/\bORDER\s+BY\s+dt\b/gi, 'ORDER BY ds')
  out = out.replace(/\bSELECT\s+dt\s*,/gi, 'SELECT ds,')
  out = out.replace(/,\s*dt\s*(?=,|FROM|ORDER|GROUP|LIMIT|$)/gi, ', ds')
  out = out.replace(/\bdt\b/gi, 'ds')

  return out
}

/** 检测 SQL 是否仍用 dt 作分区 */
export function sqlUsesDtAsPartition(sql: string): boolean {
  return /\b(?:WHERE|GROUP\s+BY|ORDER\s+BY)\b[^;]*\bdt\b/i.test(sql)
}

export type PartitionEnforceDiagnostics = {
  enforced: boolean
  reason: string
  columnNames: string[]
  hasDsInSchema: boolean
  clarificationRequiresDs: boolean
  partitionField?: string
  changed: boolean
}

export function diagnosePartitionEnforce(
  sql: string,
  columns: { name: string }[],
  clarification?: SqlClarification | null,
  explicitPartitionField?: string | null,
): PartitionEnforceDiagnostics {
  const enforced = shouldEnforceDsPartition(
    columns,
    clarification,
    explicitPartitionField,
  )
  const corrected = enforcePartitionFieldInSql(
    sql,
    columns,
    clarification,
    explicitPartitionField,
  )
  return {
    enforced,
    reason: enforced
      ? '已启用 ds 校正'
      : '未启用：schema 无 ds 且澄清未要求 ds',
    columnNames: columns.map((c) => c.name),
    hasDsInSchema: columnNamesInclude(columns, 'ds'),
    clarificationRequiresDs: clarificationRequiresDs(clarification),
    partitionField: explicitPartitionField ?? undefined,
    changed: corrected !== sql,
  }
}
