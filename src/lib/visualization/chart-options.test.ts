import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildEChartsOption,
  buildTableEChartsOption,
  DEFAULT_CHART_THEME,
} from './chart-options'
import type { ChartSpec, TableSpec } from './types'

const lineSpec: ChartSpec = {
  id: 'chart-1',
  type: 'line',
  title: '收入趋势',
  encoding: {
    x: { field: 'ds' },
    y: { field: 'revenue' },
  },
  data: [
    { ds: '20260601', revenue: 120 },
    { ds: '20260602', revenue: 180 },
  ],
}

const graphSpec: ChartSpec = {
  id: 'lineage-graph',
  type: 'graph',
  title: '血缘关系图',
  encoding: {},
  data: [
    {
      source: 'business.ods_source',
      target: 'business.ads_target',
      id: '1',
    },
  ],
  options: {
    graph: {
      nodes: [
        { id: 'business.ods_source', label: 'business.ods_source' },
        { id: 'business.ads_target', label: 'business.ads_target', matched: true },
      ],
      edges: [
        {
          id: '1',
          source: 'business.ods_source',
          target: 'business.ads_target',
        },
      ],
    },
  },
}

test('buildEChartsOption renders lineage graph charts as graph series', () => {
  const option = buildEChartsOption(graphSpec)
  const series = option.series as Array<{
    type: string
    data: Array<{ id: string; name: string; itemStyle?: { color?: string } }>
    links: Array<{ source: string; target: string }>
    layout: string
    roam: boolean
  }>

  assert.equal(series[0].type, 'graph')
  assert.equal(series[0].layout, 'force')
  assert.equal(series[0].roam, true)
  assert.deepEqual(series[0].links, [
    { source: 'business.ods_source', target: 'business.ads_target' },
  ])
  assert.equal(series[0].data[0].itemStyle?.color, '#f9a8d4')
  assert.equal(series[0].data[1].itemStyle?.color, DEFAULT_CHART_THEME.palette[0])
})

test('buildEChartsOption enlarges typography and plot area in fullscreen mode', () => {
  const normal = buildEChartsOption(lineSpec)
  const fullscreen = buildEChartsOption(lineSpec, undefined, {
    fullscreen: true,
  })

  assert.equal((normal.textStyle as { fontSize: number }).fontSize, 12)
  const normalSeries = normal.series as Array<{
    showSymbol?: boolean
    emphasis?: { focus: string; showSymbol?: boolean; lineStyle?: { color: string } }
    lineStyle?: { width: number; opacity: number; color: string }
    symbolSize?: number
  }>
  assert.equal(normalSeries[0].showSymbol, false)
  assert.equal(normalSeries[0].lineStyle?.width, 2)
  assert.equal(normalSeries[0].lineStyle?.opacity, 1)
  assert.equal(normalSeries[0].lineStyle?.color, '#2dd4bf')
  assert.equal(normalSeries[0].emphasis?.focus, 'none')
  assert.equal(normalSeries[0].emphasis?.showSymbol, true)
  assert.equal(normalSeries[0].emphasis?.lineStyle?.color, '#2dd4bf')
  assert.equal(normalSeries[0].symbolSize, 7)

  assert.equal((fullscreen.textStyle as { fontSize: number }).fontSize, 15)
  assert.deepEqual((fullscreen.tooltip as { padding: number[] }).padding, [
    14, 16,
  ])
  assert.equal(
    (fullscreen.tooltip as { textStyle: { fontSize: number } }).textStyle
      .fontSize,
    14,
  )
  assert.equal((fullscreen.grid as { top: number }).top, 86)
  assert.equal(
    (fullscreen.legend as { textStyle: { fontSize: number } }).textStyle
      .fontSize,
    13,
  )

  const series = fullscreen.series as Array<{
    lineStyle?: { width: number }
    symbolSize?: number
  }>
  assert.equal(series[0].lineStyle?.width, 3)
  assert.equal(series[0].symbolSize, 9)
  assert.equal(series[0].emphasis?.showSymbol, true)
})

test('buildEChartsOption uses item tooltip for pie charts', () => {
  const pieSpec: ChartSpec = {
    id: 'chart-pie',
    type: 'pie',
    title: 'Transaction Count构成',
    encoding: {
      x: { field: 'store_name' },
      value: { field: 'transaction_count' },
    },
    data: [
      { store_name: 'MT北京SKP店', transaction_count: 120 },
      { store_name: 'MT上海国金中心店', transaction_count: 98 },
    ],
  }

  const option = buildEChartsOption(pieSpec)
  const tooltip = option.tooltip as {
    trigger: string
    formatter?: (params: unknown) => string
  }
  const series = option.series as Array<{
    data: Array<{ itemStyle?: { color?: string } }>
  }>

  assert.equal(tooltip.trigger, 'item')
  assert.match(
    tooltip.formatter?.({
      name: 'MT北京SKP店',
      value: 120,
      percent: 55.05,
    }) ?? '',
    /MT北京SKP店/,
  )
  assert.match(
    tooltip.formatter?.({
      name: 'MT北京SKP店',
      value: 120,
      percent: 55.05,
    }) ?? '',
    /120/,
  )
  assert.equal(series[0].data[0].itemStyle?.color, DEFAULT_CHART_THEME.palette[0])
  assert.equal(series[0].data[0].emphasis?.itemStyle?.color, DEFAULT_CHART_THEME.palette[0])
})

test('buildEChartsOption keeps bar and pie colors on hover states', () => {
  const barSpec: ChartSpec = {
    id: 'chart-bar',
    type: 'bar',
    title: 'Member Count对比',
    encoding: {
      x: { field: 'store_name' },
      y: { field: 'member_count' },
    },
    data: [
      { store_name: 'MT上海国金中心店', member_count: 4 },
      { store_name: 'MT北京SKP店', member_count: 3 },
    ],
  }
  const barOption = buildEChartsOption(barSpec)
  const barSeries = barOption.series as Array<{
    emphasis?: { focus: string; itemStyle?: { color: string } }
    itemStyle?: { color: string }
  }>
  assert.equal(barSeries[0].itemStyle?.color, '#2dd4bf')
  assert.equal(barSeries[0].emphasis?.focus, 'none')
  assert.equal(barSeries[0].emphasis?.itemStyle?.color, '#2dd4bf')

  const pieSpec: ChartSpec = {
    id: 'chart-pie',
    type: 'pie',
    title: 'Member Count构成',
    encoding: {
      x: { field: 'tier' },
      value: { field: 'member_count' },
    },
    data: [
      { tier: '金牌', member_count: 120 },
      { tier: '银牌', member_count: 98 },
    ],
  }
  const pieOption = buildEChartsOption(pieSpec)
  const pieSeries = pieOption.series as Array<{
    emphasis?: { focus: string }
    data: Array<{ emphasis?: { itemStyle?: { color: string } }; itemStyle?: { color: string } }>
  }>
  assert.equal(pieSeries[0].emphasis?.focus, 'none')
  assert.equal(pieSeries[0].data[0].itemStyle?.color, '#2dd4bf')
  assert.equal(pieSeries[0].data[0].emphasis?.itemStyle?.color, '#2dd4bf')
})

test('buildTableEChartsOption adds tooltip only for truncated table text', () => {
  const table: TableSpec = {
    columns: [
      { field: 'short', label: '短列' },
      { field: 'long', label: '很长很长很长很长很长很长的列名' },
    ],
    rows: [
      {
        short: '短内容',
        long: '这是一段很长很长很长很长很长很长很长很长的表格内容',
      },
      {
        short: '第二行',
        long: '<script>alert(1)</script>这是一段很长很长很长很长的内容',
      },
    ],
    totalRows: 2,
    truncated: false,
  }

  const option = buildTableEChartsOption(table, DEFAULT_CHART_THEME, 240, 120)
  const graphic = option.graphic as Array<{
    type?: string
    style?: { text?: string }
    tooltip?: { formatter?: string }
  }>
  const truncatedCell = graphic.find(
    (item) => item.style?.text === '这是一段很长很长很长…',
  )
  const shortCell = graphic.find((item) => item.style?.text === '短内容')
  const truncatedHeader = graphic.find((item) => item.style?.text === '很长很长…')
  const escapedCell = graphic.find(
    (item) => item.style?.text === '<script>alert(1)…',
  )

  assert.equal(
    truncatedCell?.tooltip?.formatter,
    '这是一段很长很长很长很长很长很长很长很长的表格内容',
  )
  assert.equal(truncatedHeader?.tooltip?.formatter, '很长很长很长很长很长很长的列名')
  assert.equal(
    escapedCell?.tooltip?.formatter,
    '&lt;script&gt;alert(1)&lt;/script&gt;这是一段很长很长很长很长的内容',
  )
  assert.equal(shortCell?.tooltip, undefined)
})
