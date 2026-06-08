import { sanitizeTableCellText } from '@/lib/text/emoji-limit'
import { formatCellValue, toNumeric } from './infer-columns'
import type { ChartSpec, MetricCard, TableSpec } from './types'

export interface ChartThemeColors {
  text: string
  muted: string
  border: string
  surface: string
  tableHeader: string
  tableStripe: string
  tableRowLine: string
  palette: string[]
}

export const DEFAULT_CHART_THEME: ChartThemeColors = {
  text: 'oklch(0.93 0.005 260)',
  muted: 'oklch(0.68 0.01 260)',
  border: 'oklch(0.32 0.018 260)',
  surface: 'oklch(0.21 0.014 260)',
  tableHeader: 'oklch(0.27 0.016 260)',
  tableStripe: 'oklch(0.24 0.014 260 / 55%)',
  tableRowLine: 'oklch(0.34 0.018 260 / 45%)',
  palette: [
    'oklch(0.78 0.14 185)',
    'oklch(0.76 0.16 155)',
    'oklch(0.70 0.15 260)',
    'oklch(0.80 0.16 85)',
    'oklch(0.65 0.2 25)',
    'oklch(0.72 0.12 320)',
  ],
}

const LINEAGE_OUTER_NODE_FILL = '#f9a8d4'
const LINEAGE_OUTER_NODE_BORDER = '#f472b6'

export type ChartOptionBuildMode = {
  fullscreen?: boolean
}

function yFields(spec: ChartSpec): string[] {
  const y = spec.encoding.y
  if (!y) return []
  if ('fields' in y) return y.fields.map((f) => f.field)
  return [y.field]
}

function categories(spec: ChartSpec, field: string): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const row of spec.data) {
    const value = row[field]
    const key = value == null ? '—' : String(value)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(key)
  }
  return result
}

function formatCategoryLabel(field: string, value: unknown): string {
  const raw = value == null ? '—' : String(value)
  if (/^ds$/i.test(field) || /date/i.test(field)) {
    if (/^\d{8}$/.test(raw)) return `${raw.slice(4, 6)}/${raw.slice(6, 8)}`
  }
  return raw
}

function sortedCategories(spec: ChartSpec, field: string): string[] {
  const cats = categories(spec, field)
  if (/^ds$/i.test(field)) {
    return [...cats].sort((a, b) => Number(a) - Number(b))
  }
  return cats
}

function multiSeriesData(
  spec: ChartSpec,
  xField: string,
  yField: string,
  seriesField: string,
  fullscreen = false,
): Array<{
  name: string
  type: string
  data: number[]
  smooth?: boolean
  showSymbol?: boolean
  symbolSize?: number
  lineStyle?: { width: number }
  barMaxWidth?: number
}> {
  const xCats = sortedCategories(spec, xField)
  const seriesNames = categories(spec, seriesField)
  return seriesNames.map((seriesName) => ({
    name: seriesName,
    type: spec.type === 'line' ? 'line' : 'bar',
    smooth: spec.options?.smooth ?? true,
    showSymbol: spec.data.length <= 24,
    symbolSize: spec.type === 'line' && fullscreen ? 8 : undefined,
    lineStyle: spec.type === 'line' && fullscreen ? { width: 3 } : undefined,
    barMaxWidth: spec.type === 'bar' && fullscreen ? 44 : undefined,
    data: xCats.map((x) => {
      const row = spec.data.find(
        (item) =>
          String(item[xField] ?? '') === x &&
          String(item[seriesField] ?? '') === seriesName,
      )
      return toNumeric(row ? row[yField] ?? null : null) ?? 0
    }),
  }))
}

function seriesValues(spec: ChartSpec, xField: string, yField: string): number[] {
  const map = new Map<string, number>()
  for (const row of spec.data) {
    const key = row[xField] == null ? '—' : String(row[xField])
    const value = toNumeric(row[yField])
    if (value == null) continue
    map.set(key, value)
  }
  const xs = categories(spec, xField)
  return xs.map((x) => map.get(x) ?? 0)
}

export function buildEChartsOption(
  spec: ChartSpec,
  theme: ChartThemeColors = DEFAULT_CHART_THEME,
  mode: ChartOptionBuildMode = {},
): Record<string, unknown> {
  const fullscreen = Boolean(mode.fullscreen)
  const textFontSize = fullscreen ? 15 : 12
  const axisFontSize = fullscreen ? 13 : undefined
  const legendFontSize = fullscreen ? 13 : 11
  const tooltipFontSize = fullscreen ? 14 : 12
  const grid = {
    left: fullscreen ? 32 : 12,
    right: fullscreen ? 40 : 16,
    top: fullscreen ? 86 : 56,
    bottom: spec.options?.showDataZoom
      ? fullscreen
        ? 92
        : 68
      : fullscreen
        ? 54
        : 28,
    containLabel: true,
  }
  const base = {
    color: theme.palette,
    backgroundColor: 'transparent',
    textStyle: {
      color: theme.text,
      fontFamily: 'inherit',
      fontSize: textFontSize,
    },
    tooltip: {
      trigger: spec.type === 'heatmap' ? 'item' : 'axis',
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderWidth: 1,
      padding: fullscreen ? [14, 16] : [10, 12],
      textStyle: { color: theme.text, fontSize: tooltipFontSize },
      axisPointer: {
        type: 'line',
        lineStyle: { color: theme.border, type: 'dashed' },
      },
    },
    grid,
    animationDuration: 450,
    animationEasing: 'cubicOut',
  }

  if (spec.type === 'metric' || spec.type === 'table') {
    return base
  }

  if (spec.type === 'graph') {
    const graph = spec.options?.graph
    const nodes = graph?.nodes ?? []
    const edges = graph?.edges ?? []
    return {
      ...base,
      tooltip: {
        ...base.tooltip,
        trigger: 'item',
      },
      legend: undefined,
      series: [
        {
          type: 'graph',
          layout: 'force',
          roam: true,
          draggable: true,
          focusNodeAdjacency: true,
          label: {
            show: true,
            color: theme.text,
            fontSize: fullscreen ? 13 : 11,
            formatter: '{b}',
          },
          edgeSymbol: ['none', 'arrow'],
          edgeSymbolSize: fullscreen ? 10 : 8,
          edgeLabel: { show: false },
          lineStyle: {
            color: theme.border,
            width: fullscreen ? 1.4 : 1,
            curveness: 0.16,
            opacity: 0.82,
          },
          force: {
            repulsion: fullscreen ? 420 : 260,
            edgeLength: fullscreen ? [90, 180] : [70, 140],
          },
          data: nodes.map((node) => ({
            id: node.id,
            name: node.label ?? node.id,
            symbolSize: node.matched ? (fullscreen ? 58 : 46) : fullscreen ? 42 : 34,
            itemStyle: {
              color: node.matched ? theme.palette[0] : LINEAGE_OUTER_NODE_FILL,
              borderColor: node.matched ? theme.palette[1] : LINEAGE_OUTER_NODE_BORDER,
              borderWidth: node.matched ? 2 : 1,
            },
            label: {
              color: node.matched ? theme.text : theme.muted,
              fontWeight: node.matched ? 600 : 400,
            },
          })),
          links: edges.map((edge) => ({
            source: edge.source,
            target: edge.target,
          })),
          emphasis: {
            focus: 'adjacency',
            lineStyle: { width: 2 },
          },
        },
      ],
    }
  }

  if (spec.type === 'pie') {
    const nameField = spec.encoding.x?.field ?? spec.encoding.series?.field ?? 'name'
    const valueField = spec.encoding.value?.field ?? yFields(spec)[0]
    return {
      ...base,
      legend: {
        bottom: fullscreen ? 12 : 0,
        textStyle: { color: theme.muted, fontSize: legendFontSize },
      },
      series: [
        {
          type: 'pie',
          radius: fullscreen ? ['34%', '62%'] : ['38%', '68%'],
          center: fullscreen ? ['50%', '48%'] : ['50%', '46%'],
          itemStyle: { borderColor: theme.border, borderWidth: 1 },
          label: { color: theme.text, fontSize: axisFontSize },
          data: spec.data.map((row) => ({
            name: String(row[nameField] ?? '—'),
            value: toNumeric(row[valueField]) ?? 0,
          })),
        },
      ],
    }
  }

  if (spec.type === 'funnel') {
    const nameField = spec.encoding.x?.field ?? 'stage'
    const valueField = spec.encoding.value?.field ?? yFields(spec)[0]
    return {
      ...base,
      series: [
        {
          type: 'funnel',
          left: fullscreen ? '14%' : '10%',
          top: fullscreen ? 48 : 24,
          bottom: fullscreen ? 48 : 24,
          width: fullscreen ? '72%' : '80%',
          sort: 'descending',
          gap: 4,
          label: { color: theme.text, fontSize: axisFontSize },
          itemStyle: { borderColor: theme.border, borderWidth: 1 },
          data: spec.data.map((row) => ({
            name: String(row[nameField] ?? '—'),
            value: toNumeric(row[valueField]) ?? 0,
          })),
        },
      ],
    }
  }

  if (spec.type === 'heatmap') {
    const xField = spec.encoding.x?.field
    const yField =
      spec.encoding.y && 'field' in spec.encoding.y
        ? spec.encoding.y.field
        : undefined
    const valueField = spec.encoding.value?.field
    if (!xField || !yField || !valueField) return base

    const xCats = categories(spec, xField)
    const yCats = categories(spec, yField)
    const heatData: [number, number, number | string][] = []
    let min = Number.POSITIVE_INFINITY
    let max = Number.NEGATIVE_INFINITY

    for (const row of spec.data) {
      const xi = xCats.indexOf(String(row[xField] ?? '—'))
      const yi = yCats.indexOf(String(row[yField] ?? '—'))
      const val = toNumeric(row[valueField]) ?? 0
      if (xi < 0 || yi < 0) continue
      min = Math.min(min, val)
      max = Math.max(max, val)
      heatData.push([xi, yi, val])
    }

    return {
      ...base,
      grid: { ...base.grid, bottom: fullscreen ? 88 : 64 },
      xAxis: {
        type: 'category',
        data: xCats,
        splitArea: { show: true },
        axisLabel: {
          color: theme.muted,
          fontSize: axisFontSize,
          rotate: xCats.length > 8 ? 35 : 0,
        },
      },
      yAxis: {
        type: 'category',
        data: yCats,
        splitArea: { show: true },
        axisLabel: { color: theme.muted, fontSize: axisFontSize },
      },
      visualMap: {
        min: Number.isFinite(min) ? min : 0,
        max: Number.isFinite(max) ? max : 1,
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: fullscreen ? 18 : 0,
        textStyle: { color: theme.muted, fontSize: axisFontSize },
        inRange: { color: ['#1a2740', theme.palette[0], theme.palette[1]] },
      },
      series: [
        {
          type: 'heatmap',
          data: heatData,
          label: {
            show: heatData.length <= 36,
            color: theme.text,
            fontSize: axisFontSize,
          },
          emphasis: {
            itemStyle: { shadowBlur: 8, shadowColor: 'rgba(0,0,0,0.35)' },
          },
        },
      ],
    }
  }

  const xField = spec.encoding.x?.field
  if (!xField) return base

  const yFieldList = yFields(spec)
  const horizontal = spec.options?.horizontal
  const seriesField = spec.encoding.series?.field
  const rawXCats = sortedCategories(spec, xField)
  const xLabels = rawXCats.map((value) => formatCategoryLabel(xField, value))

  const categoryAxis = {
    type: 'category' as const,
    data: xLabels,
    axisLabel: {
      color: theme.muted,
      fontSize: axisFontSize,
      rotate: !horizontal && xLabels.length > 8 ? 35 : 0,
    },
    axisLine: { lineStyle: { color: theme.border } },
  }

  const valueAxis = {
    type: 'value' as const,
    axisLabel: { color: theme.muted, fontSize: axisFontSize },
    splitLine: { lineStyle: { color: theme.border, type: 'dashed' as const } },
  }

  const yField = yFieldList[0]
  const series = seriesField && yField
    ? multiSeriesData(spec, xField, yField, seriesField, fullscreen)
    : spec.type === 'line'
      ? yFieldList.map((field) => ({
          name: field,
          type: 'line',
          smooth: spec.options?.smooth ?? true,
          showSymbol: spec.data.length <= 24,
          symbolSize: fullscreen ? 8 : undefined,
          lineStyle: fullscreen ? { width: 3 } : undefined,
          data: seriesValues(spec, xField, field),
        }))
      : yFieldList.map((field) => ({
          name: field,
          type: 'bar',
          stack: spec.options?.stack ? 'total' : undefined,
          barMaxWidth: fullscreen ? 44 : undefined,
          data: seriesValues(spec, xField, field),
          itemStyle: {
            borderRadius: horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0],
          },
        }))

  const option: Record<string, unknown> = {
    ...base,
    legend: {
      top: 8,
      left: 12,
      itemWidth: 10,
      itemHeight: 10,
      itemGap: 14,
      textStyle: { color: theme.muted, fontSize: legendFontSize },
      type: series.length > 6 ? 'scroll' : 'plain',
      pageIconColor: theme.muted,
      pageTextStyle: { color: theme.muted },
    },
    xAxis: horizontal ? valueAxis : categoryAxis,
    yAxis: horizontal ? categoryAxis : valueAxis,
    series,
  }

  if (spec.options?.showDataZoom) {
    option.dataZoom = [
      {
        type: 'inside',
        xAxisIndex: horizontal ? undefined : 0,
        yAxisIndex: horizontal ? 0 : undefined,
      },
      {
        type: 'slider',
        height: 18,
        bottom: fullscreen ? 18 : 8,
        borderColor: theme.border,
        fillerColor: 'oklch(0.74 0.14 185 / 18%)',
        handleStyle: { color: theme.palette[0] },
        textStyle: { color: theme.muted },
      },
    ]
  }

  return option
}

const TABLE_HEADER_HEIGHT = 36
const TABLE_ROW_HEIGHT = 32
const TABLE_PADDING = 8

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return `${text.slice(0, Math.max(0, maxChars - 1))}…`
}

function escapeTooltipHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function tableTextTooltip(fullText: string, displayText: string) {
  if (fullText === displayText) return undefined
  return {
    formatter: escapeTooltipHtml(fullText),
    backgroundColor: 'oklch(0.16 0.018 260 / 96%)',
    borderColor: 'oklch(0.44 0.03 260 / 70%)',
    textStyle: {
      color: 'oklch(0.96 0.006 260)',
      fontSize: 12,
      lineHeight: 18,
      width: 320,
      overflow: 'break',
    },
    padding: [8, 10],
    extraCssText:
      'max-width: 360px; white-space: normal; word-break: break-word; box-shadow: 0 12px 32px rgba(0,0,0,0.22);',
  }
}

export function estimateTableCanvasHeight(table: TableSpec): number {
  return (
    TABLE_PADDING * 2 +
    TABLE_HEADER_HEIGHT +
    table.rows.length * TABLE_ROW_HEIGHT +
    (table.truncated ? 24 : 0)
  )
}

export function estimateMetricsCanvasHeight(metrics: MetricCard[]): number {
  const cols = Math.min(Math.max(metrics.length, 1), 4)
  const rows = Math.ceil(metrics.length / cols)
  return rows * 84 + 12
}

export function buildMetricsEChartsOption(
  metrics: MetricCard[],
  theme: ChartThemeColors,
  width: number,
  height: number,
): Record<string, unknown> {
  if (metrics.length === 0) {
    return { backgroundColor: 'transparent' }
  }

  const cols = Math.min(metrics.length, width < 640 ? 2 : 4)
  const cardWidth = width / cols
  const cardHeight = 76
  const graphic: Record<string, unknown>[] = []

  metrics.forEach((metric, index) => {
    const col = index % cols
    const row = Math.floor(index / cols)
    const x = col * cardWidth + 6
    const y = row * cardHeight + 6
    const innerWidth = cardWidth - 12

    graphic.push(
      {
        type: 'rect',
        left: x,
        top: y,
        shape: { width: innerWidth, height: cardHeight - 8, r: 8 },
        style: {
          fill: theme.surface,
          stroke: theme.border,
          lineWidth: 1,
        },
      },
      {
        type: 'rect',
        left: x,
        top: y + 6,
        shape: { width: 2, height: cardHeight - 20, r: 1 },
        style: { fill: theme.palette[0] },
      },
      {
        type: 'text',
        left: x + 12,
        top: y + 14,
        style: {
          text: truncateText(metric.label, 18),
          fill: theme.muted,
          fontSize: 11,
          fontWeight: 500,
        },
      },
      {
        type: 'text',
        left: x + 12,
        top: y + 34,
        style: {
          text: metric.value,
          fill: theme.text,
          fontSize: 20,
          fontWeight: 600,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        },
      },
    )

    if (metric.hint) {
      graphic.push({
        type: 'text',
        left: x + 12,
        top: y + 56,
        style: {
          text: truncateText(metric.hint, 24),
          fill: theme.muted,
          fontSize: 10,
        },
      })
    }
  })

  return {
    backgroundColor: 'transparent',
    animation: false,
    height,
    graphic,
  }
}

export function buildTableEChartsOption(
  table: TableSpec,
  theme: ChartThemeColors,
  width: number,
  height: number,
): Record<string, unknown> {
  const colCount = Math.max(table.columns.length, 1)
  const innerWidth = width - TABLE_PADDING * 2
  const colWidth = innerWidth / colCount
  const bodyTop = TABLE_PADDING + TABLE_HEADER_HEIGHT
  const graphic: Record<string, unknown>[] = []

  graphic.push({
    type: 'rect',
    left: TABLE_PADDING,
    top: TABLE_PADDING,
    shape: { width: innerWidth, height: height - TABLE_PADDING * 2, r: 10 },
    style: {
      fill: theme.surface,
      stroke: theme.border,
      lineWidth: 1,
    },
  })

  graphic.push({
    type: 'rect',
    left: TABLE_PADDING + 1,
    top: TABLE_PADDING + 1,
    shape: { width: innerWidth - 2, height: TABLE_HEADER_HEIGHT - 1, r: [8, 8, 0, 0] },
    style: {
      fill: theme.tableHeader,
      stroke: 'transparent',
    },
  })

  table.columns.forEach((col, columnIndex) => {
    const displayText = truncateText(
      col.label,
      Math.max(8, Math.floor(colWidth / 10)),
    )
    graphic.push({
      type: 'text',
      left: TABLE_PADDING + columnIndex * colWidth + 10,
      top: TABLE_PADDING + 11,
      style: {
        text: displayText,
        fill: theme.muted,
        fontSize: 11,
        fontWeight: 600,
      },
      tooltip: tableTextTooltip(col.label, displayText),
    })
  })

  graphic.push({
    type: 'line',
    shape: {
      x1: TABLE_PADDING + 8,
      y1: bodyTop - 0.5,
      x2: TABLE_PADDING + innerWidth - 8,
      y2: bodyTop - 0.5,
    },
    style: {
      stroke: theme.tableRowLine,
      lineWidth: 1,
    },
  })

  table.rows.forEach((row, rowIndex) => {
    const y = bodyTop + rowIndex * TABLE_ROW_HEIGHT

    if (rowIndex % 2 === 1) {
      graphic.push({
        type: 'rect',
        left: TABLE_PADDING + 1,
        top: y,
        shape: { width: innerWidth - 2, height: TABLE_ROW_HEIGHT },
        style: { fill: theme.tableStripe },
      })
    }

    graphic.push({
      type: 'line',
      shape: {
        x1: TABLE_PADDING + 8,
        y1: y + TABLE_ROW_HEIGHT - 0.5,
        x2: TABLE_PADDING + innerWidth - 8,
        y2: y + TABLE_ROW_HEIGHT - 0.5,
      },
      style: {
        stroke: theme.tableRowLine,
        lineWidth: 1,
      },
    })

    table.columns.forEach((col, columnIndex) => {
      const raw = sanitizeTableCellText(formatCellValue(row[col.field]))
      const numeric = toNumeric(row[col.field]) != null
      const displayText = truncateText(raw, Math.max(8, Math.floor(colWidth / 9)))
      graphic.push({
        type: 'text',
        left: TABLE_PADDING + columnIndex * colWidth + 10,
        top: y + 9,
        style: {
          text: displayText,
          fill: theme.text,
          fontSize: 12,
          fontWeight: rowIndex === 0 ? 500 : 400,
          fontFamily: numeric
            ? 'ui-monospace, SFMono-Regular, Menlo, monospace'
            : 'inherit',
        },
        tooltip: tableTextTooltip(raw, displayText),
      })
    })
  })

  if (table.truncated) {
    graphic.push({
      type: 'text',
      left: TABLE_PADDING + 10,
      top: height - TABLE_PADDING - 16,
      style: {
        text: `共 ${table.totalRows} 行，展示 ${table.rows.length} 行`,
        fill: theme.muted,
        fontSize: 10,
      },
    })
  }

  return {
    backgroundColor: 'transparent',
    animation: false,
    tooltip: {
      show: true,
      triggerOn: 'mousemove',
      confine: true,
      appendToBody: true,
    },
    height,
    graphic,
  }
}
