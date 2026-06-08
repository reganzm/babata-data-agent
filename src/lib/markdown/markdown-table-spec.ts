import type { ParsedMarkdownTable } from '@/lib/visualization/parse-markdown-table'
import type { TableSpec } from '@/lib/visualization/types'

export function parsedMarkdownTableToTableSpec(
  table: ParsedMarkdownTable,
): TableSpec {
  const rows = table.displayRows.map((displayRow) => {
    const row: Record<string, string | number | null> = {}
    table.headers.forEach((field, index) => {
      row[field] = displayRow[index] ?? null
    })
    return row
  })

  return {
    columns: table.headers.map((field, index) => ({
      field,
      label: table.displayHeaders[index] ?? field,
    })),
    rows,
    totalRows: rows.length,
    truncated: false,
  }
}
