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

function addTableName(target: Set<string>, raw: string): void {
  const match = raw.trim().match(/^([a-zA-Z_][a-zA-Z0-9_]*)/)
  if (match?.[1]) target.add(match[1])
}

function extractTablesFromFromClause(clause: string, target: Set<string>): void {
  for (const part of clause.split(',')) {
    addTableName(target, part)
  }
}

export function extractReferencedTableNames(sql: string): string[] {
  const normalized = normalizeSqlForTableScan(sql)
  const tables = new Set<string>()

  const fromMatch = normalized.match(
    /\bFROM\s+(.+?)(?=\bWHERE\b|\bGROUP\s+BY\b|\bORDER\s+BY\b|\bHAVING\b|\bLIMIT\b|\bUNION\b|$)/i,
  )
  if (fromMatch?.[1]) {
    extractTablesFromFromClause(fromMatch[1], tables)
  }

  const joinPattern = /\b(?:LEFT|RIGHT|INNER|FULL|CROSS)?\s*JOIN\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi
  for (const match of normalized.matchAll(joinPattern)) {
    if (match[1]) tables.add(match[1])
  }

  return [...tables]
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
