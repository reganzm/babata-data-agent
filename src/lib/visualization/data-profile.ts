import {
  inferColumns,
  isMetricName,
  normalizeRows,
  pickNominalColumns,
  pickNumericColumns,
  pickTemporalColumn,
} from './infer-columns'
import type { DataRow } from './types'

export type DataShape =
  | 'time-series-multi'
  | 'time-series'
  | 'category-compare'
  | 'matrix'
  | 'distribution'
  | 'generic'

export interface DataProfile {
  shape: DataShape
  rowCount: number
  timeField?: string
  categoryField?: string
  seriesField?: string
  measures: string[]
  /** 不参与绘图的辅助列（如 daily_total_wan 重复字段） */
  auxiliaryFields: string[]
}

function isAuxiliaryField(field: string): boolean {
  return /daily_total|total_wan|row_count|note/i.test(field)
}

function pickCategoryField(
  nominalCols: ReturnType<typeof inferColumns>,
  temporalField?: string,
): string | undefined {
  const candidates = nominalCols
    .filter((col) => col.field !== temporalField)
    .filter((col) => col.cardinality >= 2 && col.cardinality <= 24)
    .sort((a, b) => {
      const aScore =
        (/type|类型|category|name|room|渠道|区域|城市/i.test(a.field) ? 2 : 0) +
        (a.cardinality <= 12 ? 1 : 0)
      const bScore =
        (/type|类型|category|name|room|渠道|区域|城市/i.test(b.field) ? 2 : 0) +
        (b.cardinality <= 12 ? 1 : 0)
      return bScore - aScore
    })

  return candidates[0]?.field
}

function pickMeasures(columns: ReturnType<typeof inferColumns>): string[] {
  const numeric = pickNumericColumns(columns).filter(
    (col) => !isAuxiliaryField(col.field) && !/pct|占比|ratio|rate/i.test(col.field),
  )

  const prioritized = [
    ...numeric.filter((col) => isMetricName(col.field)),
    ...numeric.filter((col) => !isMetricName(col.field)),
  ]

  return prioritized.map((col) => col.field)
}

export function analyzeDataProfile(rows: DataRow[]): DataProfile {
  const normalized = normalizeRows(rows)
  const columns = inferColumns(normalized)
  const temporal = pickTemporalColumn(columns)
  const nominal = pickNominalColumns(columns)
  const measures = pickMeasures(columns)
  const categoryField = pickCategoryField(nominal, temporal?.field)

  const auxiliaryFields = columns
    .filter((col) => isAuxiliaryField(col.field))
    .map((col) => col.field)

  const timeCardinality = temporal?.cardinality ?? 0
  const categoryCardinality = categoryField
    ? columns.find((col) => col.field === categoryField)?.cardinality ?? 0
    : 0

  let shape: DataShape = 'generic'

  if (temporal && categoryField && measures.length > 0 && timeCardinality >= 2) {
    shape = 'time-series-multi'
  } else if (temporal && measures.length > 0 && timeCardinality >= 2) {
    shape = 'time-series'
  } else if (categoryField && measures.length > 0 && categoryCardinality >= 2) {
    shape =
      categoryCardinality <= 8 && normalized.length <= 16
        ? 'distribution'
        : 'category-compare'
  } else if (nominal.length >= 2 && measures.length > 0) {
    shape = 'matrix'
  }

  return {
    shape,
    rowCount: normalized.length,
    timeField: temporal?.field,
    categoryField,
    seriesField: shape === 'time-series-multi' ? categoryField : undefined,
    measures,
    auxiliaryFields,
  }
}
