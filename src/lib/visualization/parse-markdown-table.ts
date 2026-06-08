import { sanitizeTableCellText } from '@/lib/text/emoji-limit'
import type { DataRow, QueryResultLike } from './types'
import { toNumeric } from './infer-columns'

export interface ParsedMarkdownTable {
  headers: string[]
  /** 表头原文，用于 HTML 展示 */
  displayHeaders: string[]
  rows: DataRow[]
  /** 单元格原文，用于 HTML 展示 */
  displayRows: string[][]
  startIndex: number
  endIndex: number
}

function displayCell(raw: string): string {
  return sanitizeTableCellText(raw.replace(/\*\*/g, ''))
}

function sanitizeHeader(header: string, index: number): string {
  const cleaned = header
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9_()（）%/.\-]/g, '')
    .trim()
  return cleaned || `col_${index + 1}`
}

function cleanCell(raw: string): string | number | null {
  const text = raw
    .replace(/[✅✓☑️❌⚠️🔥🚀📊💡]/g, '')
    .replace(/\*\*/g, '')
    .trim()
  if (!text || text === '—' || text === '-') return null

  const percentMatch = text.match(/^([+-]?\d[\d,]*(?:\.\d+)?)\s*%$/)
  if (percentMatch) {
    return toNumeric(percentMatch[1]) ?? text
  }

  const numeric = toNumeric(text)
  if (numeric != null && /^[+-]?[\d,]+(?:\.\d+)?/.test(text.replace(/,/g, ''))) {
    return numeric
  }

  return text
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim()
  if (!trimmed.startsWith('|')) return []
  const inner = trimmed.replace(/^\|/, '').replace(/\|$/, '')
  return inner.split('|').map((cell) => cell.trim())
}

function isSeparatorRow(cells: string[]): boolean {
  return cells.every((cell) => /^:?-{2,}:?$/.test(cell.replace(/\s/g, '')))
}

export function parseMarkdownTables(text: string): ParsedMarkdownTable[] {
  const lines = text.split('\n')
  const tables: ParsedMarkdownTable[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    if (!line.trim().startsWith('|')) {
      index += 1
      continue
    }

    const headerCells = splitTableRow(line)
    if (headerCells.length < 2) {
      index += 1
      continue
    }

    const separatorLine = lines[index + 1]
    const hasSeparator =
      separatorLine?.trim().startsWith('|') &&
      isSeparatorRow(splitTableRow(separatorLine))

    let dataStart = index + 1
    if (hasSeparator) {
      dataStart = index + 2
    } else {
      dataStart = index + 1
    }

    const headers = headerCells.map((cell, i) => sanitizeHeader(cell, i))
    const displayHeaders = headerCells.map((cell) => displayCell(cell))
    const rows: DataRow[] = []
    const displayRows: string[][] = []
    let cursor = dataStart

    while (cursor < lines.length) {
      const rowLine = lines[cursor]
      if (!rowLine.trim().startsWith('|')) break
      const cells = splitTableRow(rowLine)
      if (cells.length === 0) break
      if (isSeparatorRow(cells)) {
        cursor += 1
        continue
      }
      if (cells.length === headerCells.length) {
        const row: DataRow = {}
        headers.forEach((header, i) => {
          row[header] = cleanCell(cells[i] ?? '')
        })
        rows.push(row)
        displayRows.push(cells.map((cell) => displayCell(cell)))
      }
      cursor += 1
    }

    if (rows.length > 0) {
      tables.push({
        headers,
        displayHeaders,
        rows,
        displayRows,
        startIndex: index,
        endIndex: cursor - 1,
      })
    }

    index = cursor
    continue
  }

  return tables
}

export function pickBestMarkdownTable(
  tables: ParsedMarkdownTable[],
): ParsedMarkdownTable | null {
  if (tables.length === 0) return null
  return tables.reduce((best, current) =>
    current.rows.length > best.rows.length ? current : best,
  )
}

export function queryResultFromMarkdown(text: string): QueryResultLike | null {
  const table = pickBestMarkdownTable(parseMarkdownTables(text))
  if (!table || table.rows.length === 0) return null
  return {
    rowCount: table.rows.length,
    rows: table.rows,
    note: '从 Markdown 表格解析',
  }
}

export function stripMarkdownTables(text: string): string {
  const tables = parseMarkdownTables(text)
  if (tables.length === 0) return text

  const lines = text.split('\n')
  const remove = new Set<number>()
  for (const table of tables) {
    for (let i = table.startIndex; i <= table.endIndex; i += 1) {
      remove.add(i)
    }
  }

  return lines
    .filter((_, i) => !remove.has(i))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function hasMarkdownDataTable(text: string): boolean {
  const table = pickBestMarkdownTable(parseMarkdownTables(text))
  return Boolean(table && table.rows.length >= 2 && table.headers.length >= 2)
}
