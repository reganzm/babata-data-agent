const PREFIX = 'SQL 未满足澄清约束：'

export function parseClarificationError(message: string): string[] {
  const text = message.trim()
  if (!text.startsWith(PREFIX)) return []
  const body = text.slice(PREFIX.length).trim()
  if (!body) return []
  return body
    .split(/[；;]\s*/)
    .map((item) => item.trim())
    .filter(Boolean)
}

