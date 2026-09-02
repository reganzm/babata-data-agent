const HEX_COLOR_PATTERN = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i
const RGB_COLOR_PATTERN = /^rgba?\(/i

/** ECharts 无法正确处理 oklch/color-mix，hover 时曲线会变透明 */
const OKLCH_CHART_FALLBACKS: Record<string, string> = {
  'oklch(0.52 0.17 185)': '#0f766e',
  'oklch(0.50 0.18 155)': '#059669',
  'oklch(0.55 0.15 260)': '#4f46e5',
  'oklch(0.70 0.16 85)': '#ca8a04',
  'oklch(0.55 0.22 25)': '#dc2626',
  'oklch(0.58 0.14 320)': '#c026d3',
  'oklch(0.78 0.14 185)': '#2dd4bf',
  'oklch(0.76 0.16 155)': '#34d399',
  'oklch(0.70 0.15 260)': '#818cf8',
  'oklch(0.80 0.16 85)': '#facc15',
  'oklch(0.65 0.2 25)': '#f87171',
  'oklch(0.72 0.12 320)': '#e879f9',
}

export function normalizeChartColor(color: string): string {
  const trimmed = color.trim()
  if (!trimmed) return trimmed
  if (HEX_COLOR_PATTERN.test(trimmed) || RGB_COLOR_PATTERN.test(trimmed)) {
    return trimmed
  }

  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (context) {
      context.fillStyle = '#010203'
      context.fillStyle = trimmed
      const normalized = context.fillStyle
      if (normalized && normalized !== '#010203') {
        return normalized
      }
    }
  }

  return OKLCH_CHART_FALLBACKS[trimmed] ?? trimmed
}

export function normalizeChartPalette(colors: string[]): string[] {
  return colors.map(normalizeChartColor)
}
