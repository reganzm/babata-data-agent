import {
  parseMarkdownTables,
  type ParsedMarkdownTable,
} from '@/lib/visualization/parse-markdown-table'

export type MarkdownContentSegment =
  | { type: 'text'; content: string }
  | { type: 'table'; table: ParsedMarkdownTable }

export function splitMarkdownByTables(text: string): MarkdownContentSegment[] {
  const tables = parseMarkdownTables(text)
  if (tables.length === 0) {
    return text.trim() ? [{ type: 'text', content: text }] : []
  }

  const lines = text.split('\n')
  const segments: MarkdownContentSegment[] = []
  let lineIndex = 0

  for (const table of tables) {
    if (lineIndex < table.startIndex) {
      const chunk = lines.slice(lineIndex, table.startIndex).join('\n').trim()
      if (chunk) segments.push({ type: 'text', content: chunk })
    }
    segments.push({ type: 'table', table })
    lineIndex = table.endIndex + 1
  }

  const rest = lines.slice(lineIndex).join('\n').trim()
  if (rest) segments.push({ type: 'text', content: rest })

  return segments
}

export function markdownHasTables(text: string): boolean {
  return parseMarkdownTables(text).length > 0
}
