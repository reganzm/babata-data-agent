import test from 'node:test'
import assert from 'node:assert/strict'
import {
  extractArtifactFromParts,
  mergeStructuredMetrics,
  resolveAssistantPresentation,
} from './extract-artifact-from-parts'
import { serializeVisualizationBlock } from './build-artifact'
import type { AnalysisArtifact } from './types'

const lineageArtifact: AnalysisArtifact = {
  version: 1,
  summary: '数据血缘关系：business.ads_target',
  charts: [
    {
      id: 'lineage-graph',
      type: 'graph',
      title: '数据血缘关系图',
      encoding: {},
      data: [
        {
          id: '1',
          source: 'business.ods_source',
          target: 'business.ads_target',
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
    },
  ],
}

test('extractArtifactFromParts reads visualization from lineage tool output', () => {
  const artifact = extractArtifactFromParts([
    {
      type: 'data-tool-agent',
      data: {
        visualization: lineageArtifact,
      },
    },
  ])

  assert.equal(artifact?.charts[0]?.type, 'graph')
})

test('resolveAssistantPresentation reads vizBlock from lineage tool output without final text', () => {
  const presentation = resolveAssistantPresentation([
    {
      type: 'data-tool-agent',
      data: {
        vizBlock: serializeVisualizationBlock(lineageArtifact),
      },
    },
  ])

  assert.equal(presentation.artifact?.charts[0]?.type, 'graph')
  assert.equal(presentation.markdown, '')
})

test('extractArtifactFromParts builds charts from executeReadonlySqlOnSource tool output', () => {
  const artifact = extractArtifactFromParts([
    {
      type: 'tool-executeReadonlySqlOnSource',
      state: 'output-available',
      output: {
        sql: 'SELECT product_name, sales_qty FROM t LIMIT 5',
        rowCount: 3,
        rows: [
          { product_name: '其他商品10', sales_qty: 403 },
          { product_name: '机能风连帽冲锋衣', sales_qty: 350 },
          { product_name: '经典款', sales_qty: 210 },
        ],
      },
    },
    {
      type: 'text',
      text: '## 商品销量 Top 5（按件数）\n\n## 商品销售额 Top 5（按支付金额）\n\n总结\n\n- 销量之王',
    },
  ])

  assert.ok(artifact)
  assert.ok(artifact!.charts.length > 0)
})

test('extractArtifactFromParts merges multiple SQL tool outputs into multiple charts', () => {
  const artifact = extractArtifactFromParts([
    {
      type: 'tool-executeReadonlySqlOnSource',
      state: 'output-available',
      output: {
        sql: 'SELECT product_name, sales_qty FROM t LIMIT 5',
        rowCount: 2,
        rows: [
          { product_name: 'A', sales_qty: 403 },
          { product_name: 'B', sales_qty: 350 },
        ],
      },
    },
    {
      type: 'tool-executeReadonlySqlOnSource',
      state: 'output-available',
      output: {
        sql: 'SELECT store_name, sales_amount FROM s LIMIT 5',
        rowCount: 2,
        rows: [
          { store_name: '上海店', sales_amount: 1200000 },
          { store_name: '北京店', sales_amount: 980000 },
        ],
      },
    },
  ])

  assert.ok(artifact)
  assert.ok(artifact!.charts.length >= 2)
  const chartIds = new Set(artifact!.charts.map((chart) => chart.id))
  assert.equal(chartIds.size, artifact!.charts.length)
})

test('resolveAssistantPresentation strips placeholder chart headings when artifact exists', () => {
  const presentation = resolveAssistantPresentation([
    {
      type: 'tool-executeReadonlySqlOnSource',
      state: 'output-available',
      output: {
        sql: 'SELECT product_name, sales_qty FROM t LIMIT 5',
        rowCount: 2,
        rows: [
          { product_name: 'A', sales_qty: 403 },
          { product_name: 'B', sales_qty: 350 },
        ],
      },
    },
    {
      type: 'text',
      text: '数据全部出来了！\n\n## 商品销量 Top 5（按件数）\n\n## 商品销售额 Top 5（按支付金额）\n\n总结\n\n- 销量之王',
    },
  ])

  assert.ok(presentation.artifact)
  assert.doesNotMatch(presentation.markdown, /商品销量 Top 5/)
  assert.match(presentation.markdown, /总结/)
})

test('resolveAssistantPresentation strips metrics json block when artifact comes from SQL tool', () => {
  const parts = [
    {
      type: 'tool-executeReadonlySqlOnSource',
      state: 'output-available',
      output: {
        sql: 'SELECT dt, total_enter_user FROM t',
        rowCount: 2,
        rows: [
          { dt: '2026-08-01', total_enter_user: 120000 },
          { dt: '2026-08-02', total_enter_user: 130000 },
        ],
      },
    },
    {
      type: 'text',
      text: '趋势如下\n\n```json\n{\n  "version": 1,\n  "metrics": [\n    { "label": "峰值", "value": "174,233" }\n  ]\n}\n```',
    },
  ]
  const presentation = resolveAssistantPresentation(parts)
  const artifact = mergeStructuredMetrics(presentation.artifact!, parts)

  assert.ok(artifact)
  assert.doesNotMatch(presentation.markdown, /"metrics"/)
  assert.equal(artifact.metrics?.[0]?.value, '174,233')
})

test('resolveAssistantPresentation hides incomplete viz json while streaming', () => {
  const presentation = resolveAssistantPresentation(
    [
      {
        type: 'text',
        text: '分析中\n\n```json\n{\n  "version": 1,\n  "metrics": [',
      },
    ],
    { isStreaming: true },
  )

  assert.equal(presentation.artifact, null)
  assert.doesNotMatch(presentation.markdown, /"version"/)
})
