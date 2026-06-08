export function extractPrimaryTableName(sql: string): string | null {
  const normalized = sql.replace(/\s+/g, ' ')
  const fromMatch = normalized.match(/\bfrom\s+`?([a-zA-Z0-9_.]+)`?/i)
  if (!fromMatch?.[1]) return null
  return fromMatch[1]
}

