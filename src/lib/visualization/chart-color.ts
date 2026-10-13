const HEX_COLOR_PATTERN = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i
const RGB_COLOR_PATTERN = /^rgba?\(/i

/** 设计稿中的主色板对应的 hex（ECharts 无法处理 oklch，hover 时曲线会变透明） */
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

type Oklch = { l: number; c: number; h: number; alpha: number }

const OKLCH_PATTERN = /^oklch\(\s*([^)]+?)\s*\)$/i

function parseNumber(token: string, percentScale: number): number | null {
  if (token === 'none') return 0
  const isPercent = token.endsWith('%')
  const value = Number.parseFloat(isPercent ? token.slice(0, -1) : token)
  if (!Number.isFinite(value)) return null
  return isPercent ? (value / 100) * percentScale : value
}

function parseHue(token: string): number | null {
  if (token === 'none') return 0
  const value = Number.parseFloat(token)
  if (!Number.isFinite(value)) return null
  if (token.endsWith('turn')) return value * 360
  if (token.endsWith('grad')) return value * 0.9
  if (token.endsWith('rad')) return (value * 180) / Math.PI
  return value
}

/** 解析 oklch(L C H [/ A])；L、C 支持百分比，H 支持 deg/turn/rad/grad */
export function parseOklch(color: string): Oklch | null {
  const match = color.trim().match(OKLCH_PATTERN)
  if (!match) return null
  const [body, alphaToken] = match[1].split('/').map((part) => part.trim())
  const tokens = body.split(/\s+/)
  if (tokens.length !== 3) return null
  const l = parseNumber(tokens[0], 1)
  const c = parseNumber(tokens[1], 0.4)
  const h = parseHue(tokens[2])
  const alpha = alphaToken ? parseNumber(alphaToken, 1) : 1
  if (l == null || c == null || h == null || alpha == null) return null
  return { l, c, h, alpha: Math.min(Math.max(alpha, 0), 1) }
}

function oklchKey({ l, c, h }: Oklch): string {
  return `${l.toFixed(4)} ${c.toFixed(4)} ${(((h % 360) + 360) % 360).toFixed(2)}`
}

const OKLCH_FALLBACK_BY_KEY = new Map<string, string>(
  Object.entries(OKLCH_CHART_FALLBACKS).flatMap(([source, hex]) => {
    const parsed = parseOklch(source)
    return parsed ? [[oklchKey(parsed), hex] as [string, string]] : []
  }),
)

function toSrgbChannel(linear: number): number {
  const value =
    linear <= 0.0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - 0.055
  return Math.round(Math.min(Math.max(value, 0), 1) * 255)
}

function oklchToRgb({ l, c, h }: Oklch): [number, number, number] {
  const hue = (h * Math.PI) / 180
  const a = c * Math.cos(hue)
  const b = c * Math.sin(hue)
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    toSrgbChannel(4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_),
    toSrgbChannel(-1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_),
    toSrgbChannel(-0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_),
  ]
}

function toHex(channels: [number, number, number]): string {
  return `#${channels.map((value) => value.toString(16).padStart(2, '0')).join('')}`
}

/** oklch → ECharts 可识别的颜色：不透明输出 6 位 hex（调用方会拼接 hex 透明度后缀），带透明度输出 rgba() */
function oklchToChartColor(parsed: Oklch): string {
  const rgb = oklchToRgb(parsed)
  const hex = OKLCH_FALLBACK_BY_KEY.get(oklchKey(parsed)) ?? toHex(rgb)
  if (parsed.alpha >= 1) return hex
  const [r, g, b] =
    hex.length === 7
      ? [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16))
      : rgb
  return `rgba(${r}, ${g}, ${b}, ${Number(parsed.alpha.toFixed(3))})`
}

export function normalizeChartColor(color: string): string {
  const trimmed = color.trim()
  if (!trimmed) return trimmed
  if (HEX_COLOR_PATTERN.test(trimmed) || RGB_COLOR_PATTERN.test(trimmed)) {
    return trimmed
  }

  // ECharts（zrender）不认识 oklch，且新版浏览器的 canvas 会原样返回 oklch 字符串，
  // 所以必须自己换算，不能依赖 canvas
  const oklch = parseOklch(trimmed)
  if (oklch) return oklchToChartColor(oklch)

  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (context) {
      context.fillStyle = '#010203'
      context.fillStyle = trimmed
      const normalized = context.fillStyle
      if (normalized && normalized !== '#010203' && !/^(oklch|oklab|lch|lab|color)\(/i.test(normalized)) {
        return normalized
      }
    }
  }

  return OKLCH_CHART_FALLBACKS[trimmed] ?? trimmed
}

export function normalizeChartPalette(colors: string[]): string[] {
  return colors.map(normalizeChartColor)
}
