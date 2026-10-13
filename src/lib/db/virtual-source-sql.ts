import {
  extractFirstReadonlyStatement,
  stripSqlComments,
  stripStringLiterals,
} from '@/mastra/tools/db/sql-guard'
import type { VirtualTableBinding } from './data-source-config'

const IDENTIFIER = /[a-zA-Z_][a-zA-Z0-9_]*/

function normalizeSqlForTableScan(sql: string): string {
  return stripStringLiterals(stripSqlComments(extractFirstReadonlyStatement(sql)))
    .replace(/\s+/g, ' ')
    .trim()
}

// 表引用可带库/catalog 前缀（db.table、catalog.db.table），整体捕获后再取最后一段作为表名
const TABLE_REFERENCE = /^((?:[a-zA-Z_][a-zA-Z0-9_]*\.){0,2}[a-zA-Z_][a-zA-Z0-9_]*)/
const JOIN_PATTERN =
  /\b(?:LEFT|RIGHT|INNER|FULL|CROSS)?\s*JOIN\s+((?:[a-zA-Z_][a-zA-Z0-9_]*\.){0,2}[a-zA-Z_][a-zA-Z0-9_]*)/gi

function tableNameOf(reference: string): string {
  return reference.slice(reference.lastIndexOf('.') + 1)
}

function addTableReference(target: Set<string>, raw: string): void {
  const match = raw.trim().match(TABLE_REFERENCE)
  if (match?.[1]) target.add(match[1])
}

const CLAUSE_BOUNDARY = /^(WHERE|GROUP\s+BY|ORDER\s+BY|HAVING|LIMIT|UNION|(?:LEFT|RIGHT|INNER|FULL|CROSS)?\s*JOIN)\b/i

function computeDepthAt(sql: string, pos: number): number {
  let depth = 0
  for (let i = 0; i < pos; i++) {
    if (sql[i] === '(') depth++
    else if (sql[i] === ')') depth--
  }
  return depth
}

// 从 FROM/JOIN 关键字之后开始扫描，按括号深度切分出同级的表引用列表
// （子查询内部的逗号、WHERE/GROUP BY 等关键字深度更深，不会被当成外层的子句边界）
function extractClauseItems(sql: string, start: number, baseDepth: number): string[] {
  const items: string[] = []
  let depth = baseDepth
  let itemStart = start
  let i = start
  while (i < sql.length) {
    const ch = sql[i]
    if (ch === '(') {
      depth++
      i++
      continue
    }
    if (ch === ')') {
      if (depth === baseDepth) break
      depth--
      i++
      continue
    }
    if (depth === baseDepth) {
      if (CLAUSE_BOUNDARY.test(sql.slice(i))) break
      if (ch === ',') {
        items.push(sql.slice(itemStart, i))
        itemStart = i + 1
        i++
        continue
      }
    }
    i++
  }
  items.push(sql.slice(itemStart, i))
  return items.map((item) => item.trim()).filter(Boolean)
}

// 返回 FROM/JOIN 中出现的完整表引用（可能带库前缀）
function collectTableReferences(sql: string): string[] {
  const normalized = normalizeSqlForTableScan(sql)
  const tables = new Set<string>()

  const fromPattern = /\bFROM\b/gi
  for (const match of normalized.matchAll(fromPattern)) {
    const start = match.index! + match[0].length
    const baseDepth = computeDepthAt(normalized, match.index!)
    for (const item of extractClauseItems(normalized, start, baseDepth)) {
      if (item.startsWith('(')) continue // 派生表/子查询，内部表名由其自身的 FROM/JOIN 处理
      addTableReference(tables, item)
    }
  }

  for (const match of normalized.matchAll(JOIN_PATTERN)) {
    if (match[1]) tables.add(match[1])
  }

  return [...tables]
}

export function extractReferencedTableNames(sql: string): string[] {
  return [...new Set(collectTableReferences(sql).map(tableNameOf))]
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function rewriteVirtualSql(
  sql: string,
  bindings: VirtualTableBinding[],
): string {
  const sorted = [...bindings].sort(
    (left, right) => right.exposedName.length - left.exposedName.length,
  )
  let rewritten = sql

  // 带库前缀的引用（如 default_catalog.chatbot.t）整体视为暴露表名，
  // 避免前缀残留，也避免借前缀访问白名单之外的库
  let references: string[] = []
  try {
    references = collectTableReferences(sql)
  } catch {
    // 非只读/无法解析的 SQL 交由上游校验报错
  }
  for (const reference of references) {
    if (!reference.includes('.')) continue
    const binding = bindings.find((item) => item.exposedName === tableNameOf(reference))
    if (!binding) continue
    const pattern = new RegExp(`(?<![\\w.])${escapeRegExp(reference)}(?![\\w])`, 'g')
    rewritten = rewritten.replace(pattern, binding.exposedName)
  }

  for (const binding of sorted) {
    const pattern = new RegExp(`\\b${escapeRegExp(binding.exposedName)}\\b`, 'g')
    rewritten = rewritten.replace(pattern, binding.tableName)
  }
  return rewritten
}

export function resolveVirtualSql(
  sql: string,
  bindings: VirtualTableBinding[],
): {
  parentDataSourceId: string
  rewrittenSql: string
  referencedTables: string[]
} {
  const referencedTables = extractReferencedTableNames(sql)
  if (referencedTables.length === 0) {
    throw new Error('SQL 未引用虚拟数据源中的任何表')
  }

  const bindingByExposedName = new Map(
    bindings.map((binding) => [binding.exposedName, binding]),
  )
  const usedBindings: VirtualTableBinding[] = []

  for (const tableName of referencedTables) {
    const binding = bindingByExposedName.get(tableName)
    if (!binding) {
      throw new Error(`表 ${tableName} 不在当前虚拟数据源允许列表中`)
    }
    usedBindings.push(binding)
  }

  const parentIds = new Set(usedBindings.map((binding) => binding.parentDataSourceId))
  if (parentIds.size > 1) {
    throw new Error(
      '虚拟数据源不支持跨父源查询。当前 SQL 同时引用了多个父数据源下的表，请拆成多次查询。',
    )
  }

  return {
    parentDataSourceId: usedBindings[0]!.parentDataSourceId,
    rewrittenSql: rewriteVirtualSql(sql, bindings),
    referencedTables,
  }
}

export function validateVirtualTableBindings(bindings: VirtualTableBinding[]): void {
  if (bindings.length === 0) {
    throw new Error('虚拟数据源至少需要选择一张表')
  }

  const exposedNames = new Set<string>()
  for (const binding of bindings) {
    if (!binding.parentDataSourceId.trim()) {
      throw new Error('父数据源不能为空')
    }
    if (!binding.tableName.trim()) {
      throw new Error('原表名不能为空')
    }
    if (!binding.exposedName.trim()) {
      throw new Error('暴露表名不能为空')
    }
    if (!IDENTIFIER.test(binding.exposedName)) {
      throw new Error(`暴露表名 ${binding.exposedName} 格式非法`)
    }
    if (exposedNames.has(binding.exposedName)) {
      throw new Error(`暴露表名 ${binding.exposedName} 重复`)
    }
    exposedNames.add(binding.exposedName)
  }
}

export function suggestVirtualExposedName(input: {
  parentName: string
  tableName: string
  existingExposedNames: string[]
}): string {
  const base = input.tableName
  if (!input.existingExposedNames.includes(base)) return base
  const parentSlug = input.parentName
    .trim()
    .replace(/[^\w\u4e00-\u9fff]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24) || 'source'
  const candidate = `${parentSlug}_${input.tableName}`
  if (!input.existingExposedNames.includes(candidate)) return candidate
  let index = 2
  while (input.existingExposedNames.includes(`${candidate}_${index}`)) {
    index += 1
  }
  return `${candidate}_${index}`
}
