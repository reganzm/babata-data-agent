import {
  inferColumns,
  pickNumericColumns,
  pickTemporalColumn,
  toNumeric,
} from './infer-columns'
import { humanizeFieldLabel } from './label-utils'
import type { ChartSpec, ChartType, TableSpec } from './types'

export type TableChartType = Extract<ChartType, 'line' | 'bar' | 'pie'>

export type TableChartSelection = {
  chartType: TableChartType
  categoryField: string
  valueField: string
}

export type TableChartColumnOption = {
  field: string
  label: string
}

const SUMMARY_LABEL = /^(合计|总计|total|sum|all)$/i

function isSummaryRow(row: Record<string, string | number | null>, categoryField: string): boolean {
  const label = String(row[categoryField] ?? '').trim()
  return SUMMARY_LABEL.test(label)
}

function chartableRows(
  table: TableSpec,
  categoryField: string,
  valueField: string,
) {
  if (categoryField === valueField) return []
  return table.rows.filter((row) => {
    if (isSummaryRow(row, categoryField)) return false
    const category = row[categoryField]
    if (category == null || String(category).trim() === '') return false
    return toNumeric(row[valueField]) != null
  })
}

export function canBuildTableChart(table: TableSpec): boolean {
  const { categories, values } = getTableChartColumnOptions(table)

  return categories.some((category) =>
    values.some(
      (value) =>
        category.field !== value.field &&
        chartableRows(table, category.field, value.field).length > 0,
    ),
  )
}

export function getTableChartColumnOptions(table: TableSpec): {
  categories: TableChartColumnOption[]
  values: TableChartColumnOption[]
} {
  const inferred = inferColumns(table.rows)
  const fieldSet = new Set<string>()
  for (const col of table.columns) fieldSet.add(col.field)
  for (const col of inferred) fieldSet.add(col.field)

  const optionFields = [...fieldSet].sort((a, b) => {
    const aIsDs = /^ds$/i.test(a)
    const bIsDs = /^ds$/i.test(b)
    if (aIsDs && !bIsDs) return -1
    if (!aIsDs && bIsDs) return 1
    const aIndex = table.columns.findIndex((col) => col.field === a)
    const bIndex = table.columns.findIndex((col) => col.field === b)
    if (aIndex >= 0 && bIndex >= 0) return aIndex - bIndex
    if (aIndex >= 0) return -1
    if (bIndex >= 0) return 1
    return a.localeCompare(b)
  })

  const labelOf = (field: string) =>
    table.columns.find((col) => col.field === field)?.label ??
    humanizeFieldLabel(field)

  const options = optionFields.map((field) => ({
    field,
    label: labelOf(field),
  }))

  return {
    categories: options,
    values: options,
  }
}

export function suggestTableChartDefaults(table: TableSpec): TableChartSelection {
  const { categories, values } = getTableChartColumnOptions(table)
  const inferred = inferColumns(table.rows)
  const temporal = pickTemporalColumn(inferred)
  const numeric = pickNumericColumns(inferred)

  // 规则：维度默认取下拉第一项
  const categoryField =
    categories[0]?.field ??
    table.columns[0]?.field ??
    ''

  // 规则：指标默认取下拉最后一项；若与维度相同则回退到倒数第二项
  const defaultLastValueField = values.at(-1)?.field ?? ''
  const valueField =
    (defaultLastValueField && defaultLastValueField !== categoryField
      ? defaultLastValueField
      : values
          .slice()
          .reverse()
          .find((col) => col.field !== categoryField)?.field) ??
    values.find(
      (col) =>
        col.field !== categoryField &&
        numeric.some((numCol) => numCol.field === col.field) &&
        !/排名|rank|序号|index|占比|pct|percent|ratio/i.test(col.field),
    )?.field ??
    table.columns.find((col) => col.field !== categoryField)?.field ??
    ''

  const chartType: TableChartType = temporal
    ? 'line'
    : categories.length > 0 && numeric.length > 0
      ? 'bar'
      : 'pie'

  return {
    chartType,
    categoryField,
    valueField,
  }
}

export function buildChartFromTableSelection(
  table: TableSpec,
  selection: TableChartSelection,
): ChartSpec | null {
  const { chartType, categoryField, valueField } = selection
  if (!categoryField || !valueField || categoryField === valueField) return null

  const rows = chartableRows(table, categoryField, valueField)
  if (rows.length === 0) return null

  const categoryLabel =
    table.columns.find((col) => col.field === categoryField)?.label ??
    humanizeFieldLabel(categoryField)
  const valueLabel =
    table.columns.find((col) => col.field === valueField)?.label ??
    humanizeFieldLabel(valueField)

  const inferred = inferColumns(rows)
  const categoryKind =
    inferred.find((col) => col.field === categoryField)?.kind ?? 'nominal'

  if (chartType === 'pie') {
    return {
      id: `table-chart-${categoryField}-${valueField}-pie`,
      type: 'pie',
      title: `${valueLabel} 构成`,
      description: `按 ${categoryLabel} 分布`,
      encoding: {
        x: { field: categoryField, label: categoryLabel, type: categoryKind },
        value: { field: valueField, label: valueLabel, type: 'quantitative' },
      },
      data: rows.slice(0, 24),
      options: { layout: 'secondary' },
    }
  }

  return {
    id: `table-chart-${categoryField}-${valueField}-${chartType}`,
    type: chartType,
    title: `${valueLabel} · ${categoryLabel}`,
    encoding: {
      x: { field: categoryField, label: categoryLabel, type: categoryKind },
      y: { field: valueField, label: valueLabel, type: 'quantitative' },
    },
    data: rows.slice(0, chartType === 'line' ? 120 : 48),
    options: {
      smooth: chartType === 'line',
      showDataZoom: rows.length > 12,
      horizontal: chartType === 'bar' && rows.length <= 8,
      layout: 'secondary',
    },
  }
}

export const TABLE_CHART_TYPES: TableChartType[] = ['line', 'bar', 'pie']
