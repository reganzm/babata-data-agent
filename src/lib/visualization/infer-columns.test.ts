import test from 'node:test'
import assert from 'node:assert/strict'
import { buildVisualizationFromQuery } from './build-artifact'
import { inferColumns } from './infer-columns'

test('inferColumns treats sales quantity numbers as quantitative, not temporal', () => {
  const columns = inferColumns([
    { product_name: '其他商品10', sales_qty: 403 },
    { product_name: '机能风连帽冲锋衣', sales_qty: 350 },
  ])

  const salesQty = columns.find((column) => column.field === 'sales_qty')
  assert.equal(salesQty?.kind, 'quantitative')
})

test('buildVisualizationFromQuery renders bar chart for product sales top rows', () => {
  const artifact = buildVisualizationFromQuery({
    rowCount: 2,
    rows: [
      { product_name: '其他商品10', sales_qty: 403 },
      { product_name: '机能风连帽冲锋衣', sales_qty: 350 },
    ],
  })

  assert.ok(artifact)
  assert.ok(artifact!.charts.some((chart) => chart.type === 'bar' || chart.type === 'pie'))
})
