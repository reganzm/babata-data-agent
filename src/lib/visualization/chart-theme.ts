import type { ChartThemeColors } from './chart-options'
import { normalizeChartColor, normalizeChartPalette } from './chart-color'

export function readCssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim()
  return value || fallback
}

// ECharts 无法解析 oklch，所有传给图表的颜色都要先换算成 hex/rgba
const cssColor = (name: string, fallback: string): string =>
  normalizeChartColor(readCssVar(name, fallback))

export function buildChartThemeFromCss(): ChartThemeColors {
  return {
    text: cssColor('--foreground', 'oklch(0.93 0.005 260)'),
    muted: cssColor('--muted-foreground', 'oklch(0.68 0.01 260)'),
    border: cssColor('--border', 'oklch(0.32 0.018 260)'),
    surface: normalizeChartColor(
      readCssVar('--viz-surface', readCssVar('--card', 'oklch(0.21 0.014 260)')),
    ),
    tableHeader: normalizeChartColor(
      readCssVar(
        '--viz-table-header',
        readCssVar('--viz-surface-elevated', 'oklch(0.25 0.015 260)'),
      ),
    ),
    tableStripe: cssColor('--viz-table-stripe', 'oklch(0.24 0.014 260 / 55%)'),
    tableRowLine: normalizeChartColor(
      readCssVar('--viz-table-row-line', readCssVar('--border', 'oklch(0.32 0.018 260)')),
    ),
    palette: normalizeChartPalette([
      readCssVar('--chart-1', 'oklch(0.78 0.14 185)'),
      readCssVar('--chart-2', 'oklch(0.76 0.16 155)'),
      readCssVar('--chart-3', 'oklch(0.70 0.15 260)'),
      readCssVar('--chart-4', 'oklch(0.80 0.16 85)'),
      readCssVar('--chart-5', 'oklch(0.65 0.2 25)'),
      readCssVar('--chart-6', 'oklch(0.72 0.12 320)'),
    ]),
  }
}
