import type { ParsedMarkdownTable } from '@/lib/visualization/parse-markdown-table'
import type { TableSpec } from '@/lib/visualization/types'

/** 与结构化结果表（recommend-charts）的展示上限保持一致，避免画布元素过多 */
export const MAX_INLINE_TABLE_ROWS = 100

export function parsedMarkdownTableToTableSpec(
  table: ParsedMarkdownTable,
): TableSpec {
  const rows = table.displayRows.slice(0, MAX_INLINE_TABLE_ROWS).map((displayRow) => {
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
    totalRows: table.displayRows.length,
    truncated: table.displayRows.length > MAX_INLINE_TABLE_ROWS,
  }
}
