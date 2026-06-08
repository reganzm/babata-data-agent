import { formatCellValue } from './infer-columns'
import type { TableSpec } from './types'

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export function tableToCsv(table: TableSpec): string {
  const header = table.columns.map((col) => escapeCsvCell(col.label)).join(',')
  const lines = table.rows.map((row) =>
    table.columns
      .map((col) => escapeCsvCell(formatCellValue(row[col.field])))
      .join(','),
  )
  return [header, ...lines].join('\n')
}

export async function copyTableToClipboard(table: TableSpec): Promise<void> {
  await navigator.clipboard.writeText(tableToCsv(table))
}

export function downloadTableCsv(
  table: TableSpec,
  filename = 'babata-analysis.csv',
): void {
  const blob = new Blob(['\uFEFF', tableToCsv(table)], {
    type: 'text/csv;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function tableExportFilename(table: TableSpec): string {
  const stamp = new Date().toISOString().slice(0, 10)
  return `babata-analysis-${table.totalRows}rows-${stamp}.csv`
}
