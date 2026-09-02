import { getSqlMaxRows } from '@/lib/storage-limits'

export { getSqlMaxRows } from '@/lib/storage-limits'

/** 仅匹配独立 SQL 关键字（不含 ORDER BY 的 DESC 等） */
const FORBIDDEN_KEYWORDS =
  /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|TRUNCATE|MERGE|UPSERT|GRANT|REVOKE|CALL|EXECUTE|PREPARE|DEALLOCATE|LOAD|OUTFILE|INFILE|DUMP|IMPORT|EXPORT|SET|KILL|SHUTDOWN|ADMIN|REFRESH|SYNC|HANDLER|REPAIR|OPTIMIZE|ANALYZE|PRAGMA|ATTACH|DETACH|VACUUM|REINDEX|SHOW|DESCRIBE|EXPLAIN|USE|RENAME|BACKUP|RESTORE|INSTALL|UNINSTALL)\b/i

const FORBIDDEN_SELECT_MODIFIERS =
  /\b(INTO|FOR\s+UPDATE|LOCK\s+IN\s+SHARE\s+MODE)\b/i

export type SqlGuardOptions = {
  maxRows?: number
}

/** 去掉 -- 与块注释，便于做关键字校验（不用于执行，仅校验） */
export function stripSqlComments(sql: string): string {
  let out = sql.replace(/\/\*[\s\S]*?\*\//g, ' ')
  out = out.replace(/--[^\n\r]*/g, ' ')
  return out
}

/** 去掉字符串字面量，避免关键字误报（如 WHERE status = 'DELETE'） */
export function stripStringLiterals(sql: string): string {
  let out = ''
  let i = 0
  while (i < sql.length) {
    const ch = sql[i]
    if (ch === "'") {
      out += ' '
      i++
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") {
          i += 2
          continue
        }
        if (sql[i] === "'") {
          i++
          break
        }
        i++
      }
      continue
    }
    if (ch === '"') {
      out += ' '
      i++
      while (i < sql.length) {
        if (sql[i] === '\\' && i + 1 < sql.length) {
          i += 2
          continue
        }
        if (sql[i] === '"') {
          i++
          break
        }
        i++
      }
      continue
    }
    if (ch === '`') {
      out += ' '
      i++
      while (i < sql.length && sql[i] !== '`') i++
      i++
      continue
    }
    out += ch
    i++
  }
  return out
}

function hasSemicolonOutsideStrings(sql: string): boolean {
  return stripStringLiterals(stripSqlComments(sql)).includes(';')
}

/** 在字符串/注释外按分号切分 */
export function splitBySemicolonOutsideStrings(sql: string): string[] {
  const parts: string[] = []
  let current = ''
  let i = 0
  while (i < sql.length) {
    const ch = sql[i]
    if (ch === "'") {
      current += ch
      i++
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") {
          current += "''"
          i += 2
          continue
        }
        if (sql[i] === "'") {
          current += "'"
          i++
          break
        }
        current += sql[i]
        i++
      }
      continue
    }
    if (ch === '"') {
      current += ch
      i++
      while (i < sql.length) {
        if (sql[i] === '\\' && i + 1 < sql.length) {
          current += sql[i] + sql[i + 1]
          i += 2
          continue
        }
        if (sql[i] === '"') {
          current += '"'
          i++
          break
        }
        current += sql[i]
        i++
      }
      continue
    }
    if (ch === '`') {
      current += ch
      i++
      while (i < sql.length && sql[i] !== '`') {
        current += sql[i]
        i++
      }
      if (i < sql.length) {
        current += '`'
        i++
      }
      continue
    }
    if (ch === ';') {
      parts.push(current)
      current = ''
      i++
      continue
    }
    current += ch
    i++
  }
  parts.push(current)
  return parts
}

function looksLikeReadQuery(fragment: string): boolean {
  const normalized = stripSqlComments(fragment).replace(/\s+/g, ' ').trim()
  return /^(WITH\b[\s\S]*\bSELECT\b|SELECT\b)/i.test(normalized)
}

/**
 * 模型常输出多条以分号分隔的语句；执行层只保留第一条可读 SELECT/WITH。
 */
export function extractFirstReadonlyStatement(sql: string): string {
  const raw = sql.trim()
  if (!raw) return raw
  if (!hasSemicolonOutsideStrings(raw)) {
    return raw.replace(/;\s*$/, '').trim()
  }

  const segments = splitBySemicolonOutsideStrings(raw)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  for (const segment of segments) {
    if (looksLikeReadQuery(segment)) {
      return segment.replace(/;\s*$/, '').trim()
    }
  }

  const first = segments[0]
  return (first ?? raw).replace(/;\s*$/, '').trim()
}

/** 去掉 markdown 围栏并规范为单条查询 */
export function normalizeGeneratedSql(text: string): string {
  return extractFirstReadonlyStatement(
    text.trim().replace(/^```sql?\s*/i, '').replace(/```\s*$/, ''),
  )
}

/** 仅用于展示：把单行 SQL 按主要子句换行，提升可读性 */
export function formatSqlForDisplay(sql: string): string {
  let text = sql.trim().replace(/\s+/g, ' ')
  const clausePatterns = [
    /\bFROM\b/gi,
    /\bWHERE\b/gi,
    /\bGROUP\s+BY\b/gi,
    /\bHAVING\b/gi,
    /\bORDER\s+BY\b/gi,
    /\bLIMIT\b/gi,
    /\bLEFT\s+JOIN\b/gi,
    /\bRIGHT\s+JOIN\b/gi,
    /\bINNER\s+JOIN\b/gi,
    /\bFULL\s+JOIN\b/gi,
    /\bJOIN\b/gi,
    /\bON\b/gi,
  ]

  for (const pattern of clausePatterns) {
    text = text.replace(pattern, (match) => `\n${match}`)
  }

  return text.replace(/\n{2,}/g, '\n').trim()
}

/**
 * 允许：单条只读查询 — SELECT、子查询、UNION、多层 WITH AS（含 RECURSIVE）。
 * 禁止：分号分隔的多条语句、DML/DDL 及 SELECT INTO 等写操作修饰。
 */
function assertReadQueryShape(normalized: string): void {
  if (!/^(WITH\b[\s\S]*\bSELECT\b|SELECT\b)/i.test(normalized)) {
    throw new Error(
      '仅允许单条只读查询（WITH/CTE + SELECT，含子查询与 UNION；不可含分号分隔的多语句）',
    )
  }

  const withoutStrings = stripStringLiterals(normalized).replace(/\s+/g, ' ').trim()

  if (FORBIDDEN_KEYWORDS.test(withoutStrings)) {
    throw new Error('SQL 包含禁止的关键字')
  }
  if (FORBIDDEN_SELECT_MODIFIERS.test(withoutStrings)) {
    throw new Error('SQL 包含禁止的 SELECT 修饰（如 INTO、FOR UPDATE）')
  }
}

export function assertSafeTableName(table: string): void {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table)) {
    throw new Error('非法表名')
  }
}

export function assertReadonlySelect(sql: string, options?: SqlGuardOptions): string {
  const raw = extractFirstReadonlyStatement(sql.trim())
  if (!raw) {
    throw new Error('SQL 不能为空')
  }
  if (hasSemicolonOutsideStrings(raw)) {
    throw new Error('不允许多条 SQL 语句（分号分隔）')
  }

  const normalized = stripSqlComments(raw).replace(/\s+/g, ' ').trim()
  if (!normalized) {
    throw new Error('SQL 不能为空')
  }

  assertReadQueryShape(normalized)

  const maxRows = options?.maxRows ?? getSqlMaxRows()
  const checkLimit = stripStringLiterals(normalized).replace(/\s+/g, ' ').trim()
  if (!/\bLIMIT\b/i.test(checkLimit)) {
    return `${raw} LIMIT ${maxRows}`
  }
  // 已有 LIMIT（可能在子查询内）时不改写 SQL，由 executeReadonlySqlOperation 结果截断兜底
  return raw
}

export function getSqlTimeoutMs(): number {
  const n = Number(process.env.SQL_TIMEOUT_MS ?? '30000')
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 30000
}

export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} 超时（${ms}ms）`)), ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
