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

test('normalizeChartColor handles browser-serialized oklch (trailing zeros trimmed)', () => {
  // 浏览器把 oklch(0.50 0.18 155) 序列化为 oklch(0.5 0.18 155)，仍应命中主色板
  assert.equal(normalizeChartColor('oklch(0.5 0.18 155)'), '#059669')
  assert.equal(normalizeChartColor('oklch(0.52 0.17 185)'), '#0f766e')
})

test('normalizeChartColor converts arbitrary oklch to hex ECharts can parse', () => {
  assert.match(normalizeChartColor('oklch(0.98 0 0)'), /^#[0-9a-f]{6}$/)
  assert.equal(normalizeChartColor('oklch(1 0 0)'), '#ffffff')
  assert.equal(normalizeChartColor('oklch(0 0 0)'), '#000000')
  assert.equal(normalizeChartColor('oklch(0.5 0 0 )'), '#636363')
})

test('normalizeChartColor keeps alpha as rgba()', () => {
  assert.equal(normalizeChartColor('oklch(1 0 0 / 50%)'), 'rgba(255, 255, 255, 0.5)')
  assert.match(
    normalizeChartColor('oklch(0.975 0.004 250 / 85%)'),
    /^rgba\(\d+, \d+, \d+, 0\.85\)$/,
  )
})

test('normalizeChartColor leaves no oklch for ECharts for every theme token in globals.css', async () => {
  const { readFileSync } = await import('node:fs')
  const css = readFileSync(new URL('../../app/globals.css', import.meta.url), 'utf8')
  const values = css.match(/oklch\([^)]*\)/g) ?? []
  assert.ok(values.length > 20)
  for (const value of values) {
    assert.doesNotMatch(normalizeChartColor(value), /oklch/i, value)
  }
})
