/** 匹配常见 emoji（含 ZWJ 序列、肤色修饰） */
const EMOJI_REGEX =
  /\p{Extended_Pictographic}(?:\p{Emoji_Modifier}|\uFE0F|\u200D\p{Extended_Pictographic})*/gu

export const MAX_DISPLAY_EMOJIS = 2

export function limitEmojis(text: string, max = MAX_DISPLAY_EMOJIS): string {
  if (!text) return text
  let seen = 0
  return text
    .replace(EMOJI_REGEX, (match) => {
      seen += 1
      return seen <= max ? match : ''
    })
    .replace(/ {2,}/g, ' ')
}

/** 表格等结构化区域：去掉 emoji，避免 Canvas 渲染成乱码 */
export function stripEmojis(text: string): string {
  if (!text) return text
  return text.replace(EMOJI_REGEX, '').replace(/\uFFFD/g, '').trim()
}

export function sanitizeTableCellText(text: string): string {
  const cleaned = stripEmojis(text).replace(/\s{2,}/g, ' ').trim()
  return cleaned || '—'
}
