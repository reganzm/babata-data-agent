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
    lineStyle?: { width: number }
    symbolSize?: number
  }>
  assert.equal(normalSeries[0].lineStyle, undefined)
  assert.equal(normalSeries[0].symbolSize, undefined)

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
  assert.equal(series[0].symbolSize, 8)
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
