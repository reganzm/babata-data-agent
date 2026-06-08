import { resolve } from 'node:path'

const DEFAULT_EXTENSIONS = ['.sql', '.hql', '.md', '.yaml', '.yml', '.ts', '.tsx']
const DENIED_EXTENSIONS = new Set(['.env', '.pem', '.key', '.crt', '.log'])
const MAX_SEARCH_LIMIT = 100
const MAX_READ_MAX_CHARS = 50000

export type HundunSourceConfig = {
  configured: boolean
  roots: string[]
  extensions: string[]
  searchLimit: number
  readMaxChars: number
  searchBackend: 'auto' | 'ripgrep' | 'typescript'
}

type SourceEnv = Record<string, string | undefined>

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

function parseCappedPositiveInteger(
  value: string | undefined,
  fallback: number,
  max: number,
): number {
  return Math.min(parsePositiveInteger(value, fallback), max)
}

function normalizeExtension(extension: string): string | null {
  const trimmed = extension.trim()
  if (!trimmed) return null
  const normalized = trimmed.startsWith('.') ? trimmed : `.${trimmed}`
  const lower = normalized.toLowerCase()
  if (DENIED_EXTENSIONS.has(lower)) return null
  return lower
}

function parseExtensions(raw: string | undefined): string[] {
  const source = raw?.trim() ? raw : DEFAULT_EXTENSIONS.join(',')
  return Array.from(
    new Set(
      source
        .split(',')
        .map(normalizeExtension)
        .filter((value): value is string => Boolean(value)),
    ),
  )
}

function parseRoots(raw: string | undefined): string[] {
  if (!raw?.trim()) return []
  return raw
    .split(',')
    .map((root) => root.trim())
    .filter(Boolean)
    .map((root) => resolve(root))
}

export function getHundunSourceConfig(env: SourceEnv = process.env): HundunSourceConfig {
  const roots = parseRoots(env.HUNDUN_SOURCE_ROOTS)
  const searchBackend =
    env.HUNDUN_SOURCE_SEARCH_BACKEND === 'ripgrep' ||
    env.HUNDUN_SOURCE_SEARCH_BACKEND === 'typescript'
      ? env.HUNDUN_SOURCE_SEARCH_BACKEND
      : 'auto'
  return {
    configured: roots.length > 0,
    roots,
    extensions: parseExtensions(env.HUNDUN_SOURCE_EXTENSIONS),
    searchLimit: parseCappedPositiveInteger(
      env.HUNDUN_SOURCE_SEARCH_LIMIT,
      20,
      MAX_SEARCH_LIMIT,
    ),
    readMaxChars: parseCappedPositiveInteger(
      env.HUNDUN_SOURCE_READ_MAX_CHARS,
      12000,
      MAX_READ_MAX_CHARS,
    ),
    searchBackend,
  }
}
