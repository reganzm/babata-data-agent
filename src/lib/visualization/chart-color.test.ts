import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeChartColor, normalizeChartPalette } from './chart-color'

test('normalizeChartColor converts oklch palette values to hex', () => {
  assert.equal(normalizeChartColor('oklch(0.78 0.14 185)'), '#2dd4bf')
  assert.equal(normalizeChartColor('#ff00aa'), '#ff00aa')
  assert.equal(normalizeChartColor('rgb(12, 34, 56)'), 'rgb(12, 34, 56)')
})

test('normalizeChartPalette normalizes every series color', () => {
  const palette = normalizeChartPalette([
    'oklch(0.78 0.14 185)',
    'oklch(0.76 0.16 155)',
  ])
  assert.deepEqual(palette, ['#2dd4bf', '#34d399'])
})
