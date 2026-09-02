import { analyzeDataProfile } from './data-profile'
import {
  aggregateAvg,
  aggregateExtreme,
  aggregateSum,
  formatCellValue,
  formatNumber,
  inferColumns,
  isMetricName,
  normalizeRows,
  pickNominalColumns,
  pickNumericColumns,
  pickTemporalColumn,
  sortRowsByField,
  toNumeric,
} from './infer-columns'
import { humanizeFieldLabel } from './label-utils'
import type {
  AnalysisArtifact,
  ChartSpec,
  DataRow,
  MetricCard,
  QueryResultLike,
  TableSpec,
} from './types'

const MAX_CHART_ROWS = 200
const MAX_TABLE_ROWS = 100
const MAX_CHARTS = 4
export const MAX_MERGED_CHARTS = 6

function truncateRows(rows: DataRow[], limit = MAX_CHART_ROWS): DataRow[] {
  return rows.slice(0, limit)
}

function buildTableSpec(rows: DataRow[]): TableSpec {
  const columns = inferColumns(rows).map((col) => ({
    field: col.field,
    label: humanizeFieldLabel(col.field),
    kind: col.kind,
  }))

  const displayRows = rows.slice(0, MAX_TABLE_ROWS)
  return {
    columns,
    rows: displayRows,
    totalRows: rows.length,
    truncated: rows.length > MAX_TABLE_ROWS,
  }
}

function buildMetricCards(rows: DataRow[]): MetricCard[] {
  const normalized = normalizeRows(rows)
  const columns = inferColumns(normalized)
  const numericCols = pickNumericColumns(columns)

  if (normalized.length === 1) {
    return numericCols.slice(0, 4).map((col) => ({
      label: col.field,
      value: formatCellValue(normalized[0][col.field]),
    }))
  }

  const primary =
    numericCols.find((c) => isMetricName(c.field) && !/环比|同比/i.test(c.field)) ??
    numericCols[0]

  if (!primary) {
    return [
      {
        label: '结果行数',
        value: formatNumber(normalized.length),
      },
    ]
  }

  const temporalCol = pickTemporalColumn(columns)
  const sorted = temporalCol
    ? sortRowsByField(normalized, temporalCol.field, 'asc')
    : normalized
  const latestRow = sorted.at(-1)
  const latestValue = latestRow ? toNumeric(latestRow[primary.field]) : null
  const peak = aggregateExtreme(normalized, primary.field, 'max')
  const avg = aggregateAvg(normalized, primary.field)
  const total = aggregateSum(normalized, primary.field)

  const cards: MetricCard[] = []
  if (peak != null) {
    cards.push({
      label: `${primary.field} 峰值`,
      value: formatNumber(peak),
      hint: `${normalized.length} 天`,
    })
  }
  if (latestValue != null) {
    cards.push({
      label: `${primary.field} 最新`,
      value: formatNumber(latestValue),
    })
  }
  if (avg != null) {
    cards.push({
      label: `${primary.field} 均值`,
      value: formatNumber(avg),
    })
  }
  if (total != null && cards.length < 4) {
    cards.push({
      label: `${primary.field} 合计`,
      value: formatNumber(total),
    })
  }

  return cards.slice(0, 4)
}

function makeChart(
  partial: Omit<ChartSpec, 'id'> & { id?: string },
  index: number,
): ChartSpec {
  return {
    id: partial.id ?? `chart-${index + 1}`,
    ...partial,
  }
}

function recommendChartSpecs(rows: DataRow[]): ChartSpec[] {
  if (rows.length === 0) return []

  const normalized = normalizeRows(rows)
  const profile = analyzeDataProfile(normalized)
  const measure = profile.measures[0]
  if (!measure) return []

  const data = truncateRows(normalized)
  const charts: ChartSpec[] = []
  const measureLabel = humanizeFieldLabel(measure)

  const encodingField = (field: string, type?: 'temporal' | 'quantitative' | 'nominal' | 'ordinal') => ({
    field,
    type,
    label: humanizeFieldLabel(field),
  })

  if (profile.shape === 'time-series-multi' && profile.timeField && profile.seriesField) {
    charts.push(
      makeChart(
        {
          type: 'line',
          title: `${measureLabel}趋势`,
          description: `按${humanizeFieldLabel(profile.seriesField)}拆分`,
          encoding: {
            x: encodingField(profile.timeField, 'temporal'),
            y: encodingField(measure, 'quantitative'),
            series: encodingField(profile.seriesField, 'nominal'),
          },
          data,
          options: {
            layout: 'primary',
            showDataZoom: profile.rowCount > 12,
            smooth: true,
          },
        },
        charts.length,
      ),
    )

    if (charts.length < MAX_CHARTS && profile.categoryField) {
      const peakValue = Math.max(
        ...data.map((row) => toNumeric(row[profile.timeField!]) ?? 0),
      )
      const peakRows = data.filter(
        (row) => toNumeric(row[profile.timeField!]) === peakValue,
      )
      if (peakRows.length >= 2) {
        charts.push(
          makeChart(
            {
              type: 'bar',
              title: '峰值对比',
              description: `${humanizeFieldLabel(profile.categoryField)} × ${measureLabel}`,
              encoding: {
                x: encodingField(profile.categoryField, 'nominal'),
                y: encodingField(measure, 'quantitative'),
              },
              data: sortRowsByField(peakRows, measure, 'desc'),
              options: {
                layout: 'secondary',
                horizontal: peakRows.length > 6,
              },
            },
            charts.length,
          ),
        )
      }
    }
  } else if (profile.shape === 'time-series' && profile.timeField) {
    charts.push(
      makeChart(
        {
          type: 'line',
          title: `${measureLabel}趋势`,
          encoding: {
            x: encodingField(profile.timeField, 'temporal'),
            y: encodingField(measure, 'quantitative'),
          },
          data,
          options: {
            layout: 'primary',
            showDataZoom: profile.rowCount > 7,
            smooth: true,
          },
        },
        charts.length,
      ),
    )
  } else if (
    (profile.shape === 'category-compare' || profile.shape === 'distribution') &&
    profile.categoryField
  ) {
    charts.push(
      makeChart(
        {
          type: profile.shape === 'distribution' ? 'pie' : 'bar',
          title: profile.shape === 'distribution' ? `${measureLabel}构成` : `${measureLabel}对比`,
          encoding: {
            x: encodingField(profile.categoryField, 'nominal'),
            y: encodingField(measure, 'quantitative'),
            value: encodingField(measure, 'quantitative'),
          },
          data: sortRowsByField(data, measure, 'desc'),
          options: {
            layout: 'primary',
            horizontal:
              profile.shape === 'category-compare' &&
              (inferColumns(normalized).find((c) => c.field === profile.categoryField)
                ?.cardinality ?? 0) > 8,
          },
        },
        charts.length,
      ),
    )
  } else if (profile.shape === 'matrix') {
    const nominal = pickNominalColumns(inferColumns(normalized))
    const xCol = nominal[0]
    const yCol = nominal[1]
    if (xCol && yCol) {
      charts.push(
        makeChart(
          {
            type: 'heatmap',
            title: `${measureLabel}分布`,
            encoding: {
              x: encodingField(xCol.field, 'nominal'),
              y: encodingField(yCol.field, 'nominal'),
              value: encodingField(measure, 'quantitative'),
            },
            data,
            options: { layout: 'primary' },
          },
          charts.length,
        ),
      )
    }
  }

  return charts.slice(0, MAX_CHARTS)
}

export interface BuildArtifactOptions {
  summary?: string
  metrics?: MetricCard[]
  preferTable?: boolean
}

export function buildAnalysisArtifact(
  queryResult: QueryResultLike,
  options: BuildArtifactOptions = {},
): AnalysisArtifact {
  const rows = normalizeRows(queryResult.rows ?? [])
  const metrics =
    options.metrics && options.metrics.length > 0
      ? options.metrics
      : buildMetricCards(rows)
  const charts = recommendChartSpecs(rows)
  const table = rows.length > 0 ? buildTableSpec(rows) : undefined

  return {
    version: 1,
    summary: options.summary,
    metrics: metrics.length > 0 ? metrics : undefined,
    charts,
    table: options.preferTable !== false ? table : undefined,
  }
}

export function mergeArtifactCharts(
  artifact: AnalysisArtifact,
  llmCharts: ChartSpec[] | undefined,
): AnalysisArtifact {
  if (!llmCharts?.length) return artifact
  return {
    ...artifact,
    charts: llmCharts.slice(0, MAX_CHARTS),
  }
}

export function rowsFromNumbers(numbers: { label: string; value: string }[]): DataRow[] | null {
  for (const item of numbers) {
    try {
      const parsed = JSON.parse(item.value)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return [parsed as DataRow]
      }
    } catch {
      /* not json row */
    }
  }
  return null
}

export function artifactHasRenderableContent(artifact: AnalysisArtifact): boolean {
  return Boolean(
    artifact.charts.length > 0 ||
      artifact.table ||
      (artifact.metrics && artifact.metrics.length > 0),
  )
}

export { recommendChartSpecs, buildMetricCards, buildTableSpec }
