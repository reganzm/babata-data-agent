export function parseCsvRows(content: string): string[][] {
  const rows: string[][] = []
  let currentRow: string[] = []
  let currentCell = ''
  let inQuotes = false

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index]
    const next = content[index + 1]

    if (inQuotes) {
      if (char === '"' && next === '"') {
        currentCell += '"'
        index += 1
        continue
      }
      if (char === '"') {
        inQuotes = false
        continue
      }
      currentCell += char
      continue
    }

    if (char === '"') {
      inQuotes = true
      continue
    }
    if (char === ',') {
      currentRow.push(currentCell)
      currentCell = ''
      continue
    }
    if (char === '\r' && next === '\n') {
      currentRow.push(currentCell)
      rows.push(currentRow)
      currentRow = []
      currentCell = ''
      index += 1
      continue
    }
    if (char === '\n') {
      currentRow.push(currentCell)
      rows.push(currentRow)
      currentRow = []
      currentCell = ''
      continue
    }
    currentCell += char
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell)
    rows.push(currentRow)
  }

  return rows.filter((row) => row.some((cell) => cell.trim().length > 0))
}

export function sanitizeSqlIdentifier(raw: string, fallback: string): string {
  const normalized = raw
    .trim()
    .replace(/[^\w\u4e00-\u9fff]+/gu, '_')
    .replace(/^_+|_+$/g, '')
  if (!normalized) return fallback
  if (/^\d/.test(normalized)) return `_${normalized}`
  return normalized.slice(0, 48)
}

export function inferSqliteColumnType(values: string[]): 'TEXT' | 'INTEGER' | 'REAL' {
  const nonEmpty = values.map((value) => value.trim()).filter(Boolean)
  if (nonEmpty.length === 0) return 'TEXT'
  if (nonEmpty.every((value) => /^-?\d+$/.test(value))) return 'INTEGER'
  if (nonEmpty.every((value) => /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(value))) {
    return 'REAL'
  }
  return 'TEXT'
}

export function buildCsvColumnDefinitions(input: {
  headers: string[]
  rows: string[][]
}): Array<{ name: string; sqlType: 'TEXT' | 'INTEGER' | 'REAL' }> {
  return input.headers.map((header, index) => {
    const columnValues = input.rows.map((row) => row[index] ?? '')
    return {
      name: sanitizeSqlIdentifier(header, `column_${index + 1}`),
      sqlType: inferSqliteColumnType(columnValues),
    }
  })
}

export function parseCsvDocument(content: string): {
  headers: string[]
  rows: string[][]
  columns: Array<{ name: string; sqlType: 'TEXT' | 'INTEGER' | 'REAL' }>
} {
  const parsedRows = parseCsvRows(content)
  if (parsedRows.length === 0) {
    throw new Error('CSV 文件为空')
  }
  const headers = parsedRows[0] ?? []
  if (headers.length === 0) {
    throw new Error('CSV 缺少表头')
  }
  const rows = parsedRows.slice(1)
  const columns = buildCsvColumnDefinitions({ headers, rows })
  return { headers, rows, columns }
}

export function buildPhysicalCsvTableName(
  dataSourceId: string,
  tableName: string,
): string {
  const safeId = dataSourceId.replace(/-/g, '_')
  const safeTable = tableName.replace(/[^\w]+/g, '_').slice(0, 32)
  return `babata_csv_${safeId}_${safeTable}`
}

export function resolveCsvTableNameFromFilename(filename: string): string {
  const base = filename.replace(/\.csv$/i, '').trim()
  return sanitizeSqlIdentifier(base, 'csv_table')
}

export function coerceCsvCellValue(
  raw: string,
  sqlType: 'TEXT' | 'INTEGER' | 'REAL',
): string | number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (sqlType === 'INTEGER') {
    const parsed = Number.parseInt(trimmed, 10)
    return Number.isNaN(parsed) ? null : parsed
  }
  if (sqlType === 'REAL') {
    const parsed = Number.parseFloat(trimmed)
    return Number.isNaN(parsed) ? null : parsed
  }
  return trimmed
}
