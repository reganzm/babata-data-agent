import test from 'node:test'
import assert from 'node:assert/strict'
import { canBuildTableChart } from './table-to-chart'
import type { TableSpec } from './types'

test('canBuildTableChart returns false when no numeric value column exists', () => {
  const table: TableSpec = {
    columns: [
      { field: 'range', label: '侦察范围' },
      { field: 'description', label: '说明' },
    ],
    rows: [
      { range: '华东', description: '稳定' },
      { range: '华南', description: '波动' },
    ],
    totalRows: 2,
    truncated: false,
  }

  assert.equal(canBuildTableChart(table), false)
})

test('canBuildTableChart returns true when a category and numeric value can form a chart', () => {
  const table: TableSpec = {
    columns: [
      { field: 'range', label: '侦察范围' },
      { field: 'count', label: '数量' },
    ],
    rows: [
      { range: '华东', count: 12 },
      { range: '华南', count: 8 },
    ],
    totalRows: 2,
    truncated: false,
  }

  assert.equal(canBuildTableChart(table), true)
})
