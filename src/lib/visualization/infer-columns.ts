import type { ColumnKind, DataRow } from './types'

const TEMPORAL_NAME =
  /date|time|month|year|ds|timestamp|period|hour|minute|日期|时间|月份|年份|hour_id|day_id/i
const WEEKDAY_FIELD = /星期|weekday|week_day|dow/i
const FUNNEL_NAME =
  /stage|step|funnel|phase|level|层级|步骤|转化|漏斗|环节/i
const METRIC_NAME =
  /amount|count|total|sum|avg|rate|percent|ratio|value|num|qty|sales|revenue|metric|指标|金额|数量|合计|比率|占比|uv|pv|gmv|流水|营收|收入/i

export interface InferredColumn {
  field: string
  kind: ColumnKind
  cardinality: number
  numericRatio: number
  temporalRatio: number
}

function isTemporalValue(value: unknown): boolean {
  if (value == null) return false
  if (typeof value === 'number') {
    const n = Math.trunc(value)
    if (n >= 19700101 && n <= 21001231 && String(n).length === 8) return true
    const year = new Date(value).getFullYear()
    return year >= 1970 && year <= 2100
  }
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  if (!trimmed) return false
  if (/^\d{8}$/.test(trimmed)) return true
  if (/^\d{4}[-/]\d{1,2}([-/]\d{1,2})?/.test(trimmed)) return true
  if (/^\d{1,2}:\d{2}/.test(trimmed)) return true
  if (/^\d{1,2}\/\d{1,2}$/.test(trimmed)) return true
  if (/^\d{1,2}-\d{1,2}$/.test(trimmed)) return true
  const parsed = Date.parse(trimmed)
  return Number.isFinite(parsed)
}

function sampleValues(rows: DataRow[], field: string, limit = 40): unknown[] {
  const values: unknown[] = []
  for (const row of rows) {
    if (values.length >= limit) break
    values.push(row[field])
  }
  return values
}

function isParseableNumeric(value: unknown): boolean {
  if (value == null) return false
  return toNumeric(value as string | number | null) != null
}

export function isTemporalFieldName(field: string): boolean {
  if (WEEKDAY_FIELD.test(field)) return false
  if (/环比|同比|占比|增长率/i.test(field)) return false
  if (/^ds$/i.test(field)) return true
  return TEMPORAL_NAME.test(field)
}

function inferKind(field: string, rows: DataRow[]): InferredColumn {
  const values = sampleValues(rows, field)
  const nonNull = values.filter((v) => v != null && String(v).trim() !== '')
  const numericRatio =
    nonNull.length === 0
      ? 0
      : nonNull.filter((v) => isParseableNumeric(v)).length / nonNull.length
  const temporalRatio =
    nonNull.length === 0
      ? 0
      : nonNull.filter((v) => isTemporalValue(v)).length / nonNull.length

  const unique = new Set(nonNull.map((v) => String(v)))
  const cardinality = unique.size

  let kind: ColumnKind = 'nominal'
  if (isTemporalFieldName(field) || temporalRatio >= 0.6) {
    kind = 'temporal'
  } else if (
    numericRatio >= 0.8 ||
    (isMetricName(field) && numericRatio >= 0.5)
  ) {
    kind = 'quantitative'
  } else if (/环比|同比|占比|增长率|rate/i.test(field) && numericRatio >= 0.5) {
    kind = 'quantitative'
  } else if (cardinality <= 12 && nonNull.length > 0) {
    kind = 'ordinal'
  }

  return {
    field,
    kind,
    cardinality,
    numericRatio,
    temporalRatio,
  }
}

export function inferColumns(rows: DataRow[]): InferredColumn[] {
  if (rows.length === 0) return []
  const fields = Object.keys(rows[0] ?? {})
  return fields.map((field) => inferKind(field, rows))
}

function temporalColumnPriority(field: string): number {
  if (/^ds$/i.test(field)) return 0
  if (/^dt$/i.test(field)) return 50
  if (isTemporalFieldName(field)) return 10
  return 20
}

export function pickTemporalColumn(columns: InferredColumn[]): InferredColumn | undefined {
  const temporal = columns.filter((c) => c.kind === 'temporal')
  if (temporal.length === 0) return undefined

  const hasDs = temporal.some((c) => /^ds$/i.test(c.field))
  const candidates = hasDs
    ? temporal.filter((c) => !/^dt$/i.test(c.field))
    : temporal

  const sorted = [...candidates].sort(
    (a, b) => temporalColumnPriority(a.field) - temporalColumnPriority(b.field),
  )
  return (
    sorted.find((c) => isTemporalFieldName(c.field)) ??
    sorted.find((c) => c.temporalRatio >= 0.6) ??
    sorted[0]
  )
}

export function pickNumericColumns(columns: InferredColumn[]): InferredColumn[] {
  return columns.filter((c) => c.kind === 'quantitative')
}

export function pickNominalColumns(columns: InferredColumn[]): InferredColumn[] {
  return columns.filter((c) => c.kind === 'nominal' || c.kind === 'ordinal')
}

export function isFunnelCandidate(column: InferredColumn): boolean {
  return FUNNEL_NAME.test(column.field)
}

export function isMetricName(field: string): boolean {
  return METRIC_NAME.test(field)
}

export function formatCellValue(value: string | number | null): string {
  if (value == null) return '—'
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return value.toLocaleString('zh-CN')
    return value.toLocaleString('zh-CN', {
      maximumFractionDigits: 2,
    })
  }
  return value
}

export function formatNumber(value: number): string {
  if (Number.isInteger(value)) return value.toLocaleString('zh-CN')
  return value.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
}

export function toNumeric(value: string | number | null): number | null {
  if (value == null) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const parsed = Number(value.replace(/,/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

export function sortRowsByField(
  rows: DataRow[],
  field: string,
  direction: 'asc' | 'desc' = 'asc',
): DataRow[] {
  return [...rows].sort((a, b) => {
    const av = a[field]
    const bv = b[field]
    const an = toNumeric(av)
    const bn = toNumeric(bv)
    if (an != null && bn != null) {
      return direction === 'asc' ? an - bn : bn - an
    }
    const as = String(av ?? '')
    const bs = String(bv ?? '')
    return direction === 'asc' ? as.localeCompare(bs) : bs.localeCompare(as)
  })
}

export function aggregateSum(rows: DataRow[], field: string): number | null {
  let sum = 0
  let count = 0
  for (const row of rows) {
    const n = toNumeric(row[field])
    if (n == null) continue
    sum += n
    count += 1
  }
  return count > 0 ? sum : null
}

export function aggregateAvg(rows: DataRow[], field: string): number | null {
  const sum = aggregateSum(rows, field)
  if (sum == null) return null
  let count = 0
  for (const row of rows) {
    if (toNumeric(row[field]) != null) count += 1
  }
  return count > 0 ? sum / count : null
}

export function aggregateExtreme(
  rows: DataRow[],
  field: string,
  mode: 'max' | 'min',
): number | null {
  let result: number | null = null
  for (const row of rows) {
    const n = toNumeric(row[field])
    if (n == null) continue
    if (result == null) {
      result = n
      continue
    }
    result = mode === 'max' ? Math.max(result, n) : Math.min(result, n)
  }
  return result
}

/** 将可解析的数字字符串统一为 number，便于图表绑定 */
export function normalizeRows(rows: DataRow[]): DataRow[] {
  return rows.map((row) => {
    const next: DataRow = { ...row }
    for (const [key, value] of Object.entries(next)) {
      if (typeof value === 'string') {
        const numeric = toNumeric(value)
        if (numeric != null && /^[+-]?[\d,]+(?:\.\d+)?%?$/.test(value.trim())) {
          next[key] = numeric
        }
      }
    }
    return next
  })
}
