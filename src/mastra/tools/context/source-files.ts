import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { execFile } from 'node:child_process'
import { open, readdir, realpath, stat } from 'node:fs/promises'
import { basename, extname, isAbsolute, relative, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import { defaultToolHooks, runToolWithHooks } from '@/mastra/tools/hooks'
import { getHundunSourceConfig, type HundunSourceConfig } from './source-config'

const execFileAsync = promisify(execFile)

type SourceFile = {
  path: string
  size: number
}

type InternalSourceFile = SourceFile & {
  root: string
  fullPath: string
}

type SourceMatch = {
  path: string
  line: number
  line_number: number
  text: string
}

type SearchTarget = Awaited<ReturnType<typeof resolveRealSourceTarget>>

type RipgrepCommand = {
  command: string
  argsPrefix: string[]
}

const SENSITIVE_NAMES = new Set(['.env'])

function toDisplayPath(root: string, filePath: string): string {
  return relative(root, filePath).split(sep).join('/')
}

function isWithinRoot(root: string, filePath: string): boolean {
  const rel = relative(root, filePath)
  return Boolean(rel) && !rel.startsWith('..') && !isAbsolute(rel)
}

function isAllowedSourceFile(filePath: string, config: HundunSourceConfig): boolean {
  const name = basename(filePath).toLowerCase()
  if (SENSITIVE_NAMES.has(name)) return false
  return config.extensions.includes(extname(filePath).toLowerCase())
}

function globToRegExp(pattern: string): RegExp {
  const normalized = pattern.replaceAll('\\', '/')
  let source = ''
  for (let index = 0; index < normalized.length;) {
    const char = normalized[index]
    const next = normalized[index + 1]
    const afterNext = normalized[index + 2]
    if (char === '*' && next === '*' && afterNext === '/') {
      source += '(?:.*/)?'
      index += 3
      continue
    }
    if (char === '*' && next === '*') {
      source += '.*'
      index += 2
      continue
    }
    if (char === '*') {
      source += '[^/]*'
      index += 1
      continue
    }
    if (char === '?') {
      source += '[^/]'
      index += 1
      continue
    }
    source += char.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    index += 1
  }
  return new RegExp(`^${source}$`)
}

function matchesGlob(path: string, pattern: string | undefined): boolean {
  if (!pattern) return true
  if (pattern === '*' || pattern === '**/*') return true
  const normalized = path.replaceAll('\\', '/')
  const fileName = normalized.split('/').at(-1) ?? normalized
  const regex = globToRegExp(pattern)
  return regex.test(normalized) || regex.test(fileName)
}

function prefixTargetPath(targetDirectory: string, path: string): string {
  if (!targetDirectory || targetDirectory === '.') return path
  return `${targetDirectory.replace(/\/$/, '')}/${path}`
}

async function collectSourceFiles(
  config: HundunSourceConfig,
  limit = config.searchLimit,
  startRoots = config.roots,
  includeFile: (file: InternalSourceFile) => boolean = () => true,
): Promise<InternalSourceFile[]> {
  const files: InternalSourceFile[] = []
  for (const root of startRoots) {
    if (files.length >= limit) break
    await walkSourceRoot(root, root, config, files, limit, includeFile)
  }
  return files.slice(0, limit)
}

async function walkSourceRoot(
  root: string,
  current: string,
  config: HundunSourceConfig,
  files: InternalSourceFile[],
  limit: number,
  includeFile: (file: InternalSourceFile) => boolean,
): Promise<void> {
  if (files.length >= limit) return
  let entries
  try {
    entries = await readdir(current, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    if (files.length >= limit) return
    const fullPath = resolve(current, entry.name)
    if (entry.isDirectory()) {
      await walkSourceRoot(root, fullPath, config, files, limit, includeFile)
      continue
    }
    if (!entry.isFile() || !isAllowedSourceFile(fullPath, config)) continue
    const info = await stat(fullPath)
    const file = {
      root,
      fullPath,
      path: toDisplayPath(root, fullPath),
      size: info.size,
    }
    if (includeFile(file)) files.push(file)
  }
}

function resolveSourcePath(inputPath: string, config: HundunSourceConfig): {
  root: string
  fullPath: string
  displayPath: string
} {
  for (const root of config.roots) {
    const fullPath = resolve(root, inputPath)
    if (!isWithinRoot(root, fullPath)) continue
    if (!isAllowedSourceFile(fullPath, config)) {
      throw new Error('文件类型不在混沌源码白名单内')
    }
    return {
      root,
      fullPath,
      displayPath: toDisplayPath(root, fullPath),
    }
  }
  throw new Error('文件不在混沌源码白名单目录内')
}

async function resolveRealSourcePath(inputPath: string, config: HundunSourceConfig) {
  const resolved = resolveSourcePath(inputPath, config)
  const realFullPath = await realpath(resolved.fullPath)
  const realRoot = await realpath(resolved.root)
  if (!isWithinRoot(realRoot, realFullPath)) {
    throw new Error('文件不在混沌源码白名单目录内')
  }
  if (!isAllowedSourceFile(realFullPath, config)) {
    throw new Error('文件类型不在混沌源码白名单内')
  }
  return {
    ...resolved,
    root: realRoot,
    fullPath: realFullPath,
  }
}

async function resolveRealSourceDirectory(
  inputPath: string | undefined,
  config: HundunSourceConfig,
) {
  const rawPath = inputPath?.trim() || '.'
  for (const root of config.roots) {
    const directoryPath = resolve(root, rawPath)
    if (directoryPath !== root && !isWithinRoot(root, directoryPath)) continue
    const realDirectory = await realpath(directoryPath)
    const realRoot = await realpath(root)
    if (realDirectory !== realRoot && !isWithinRoot(realRoot, realDirectory)) {
      continue
    }
    const info = await stat(realDirectory)
    if (!info.isDirectory()) {
      throw new Error(`目录不存在: ${rawPath}`)
    }
    return {
      root: realDirectory,
      displayPath:
        realDirectory === realRoot ? '.' : toDisplayPath(realRoot, realDirectory),
    }
  }
  throw new Error('目录不在混沌源码白名单目录内')
}

async function resolveRealSourceTarget(
  inputPath: string | undefined,
  config: HundunSourceConfig,
) {
  const rawPath = inputPath?.trim() || '.'
  for (const root of config.roots) {
    const targetPath = resolve(root, rawPath)
    if (targetPath !== root && !isWithinRoot(root, targetPath)) continue
    const realTarget = await realpath(targetPath)
    const realRoot = await realpath(root)
    if (realTarget !== realRoot && !isWithinRoot(realRoot, realTarget)) {
      continue
    }
    const info = await stat(realTarget)
    if (info.isDirectory()) {
      return {
        kind: 'directory' as const,
        root: realTarget,
        displayPath:
          realTarget === realRoot ? '.' : toDisplayPath(realRoot, realTarget),
      }
    }
    if (info.isFile()) {
      if (!isAllowedSourceFile(realTarget, config)) {
        throw new Error('文件类型不在混沌源码白名单内')
      }
      return {
        kind: 'file' as const,
        root: realRoot,
        fullPath: realTarget,
        displayPath: toDisplayPath(realRoot, realTarget),
        size: info.size,
      }
    }
  }
  throw new Error(`路径不存在: ${rawPath}`)
}

async function readSourcePrefix(filePath: string, maxChars: number): Promise<string> {
  const handle = await open(filePath, 'r')
  try {
    const buffer = Buffer.alloc(maxChars)
    const { bytesRead } = await handle.read(buffer, 0, maxChars, 0)
    return buffer.subarray(0, bytesRead).toString('utf8')
  } finally {
    await handle.close()
  }
}

function effectiveLimit(requested: number | undefined, configured: number): number {
  return Math.min(requested ?? configured, configured)
}

function ripgrepArgsPrefix(): string[] {
  const raw = process.env.RIPGREP_ARGS_PREFIX_JSON
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')
      ? parsed
      : []
  } catch {
    return []
  }
}

function ripgrepCandidates(): RipgrepCommand[] {
  const envPath = process.env.RIPGREP_PATH?.trim()
  const candidates = envPath ? [envPath, 'rg', 'rg.exe'] : ['rg', 'rg.exe']
  return Array.from(new Set(candidates)).map((command) => ({
    command,
    argsPrefix: command === envPath ? ripgrepArgsPrefix() : [],
  }))
}

async function findRipgrepExecutable(): Promise<RipgrepCommand | null> {
  for (const candidate of ripgrepCandidates()) {
    try {
      await execFileAsync(candidate.command, [...candidate.argsPrefix, '--version'], {
        timeout: 2000,
        windowsHide: true,
      })
      return candidate
    } catch {
      continue
    }
  }
  return null
}

function displayPathForSearchMatch(target: SearchTarget, rawPath: string): string {
  const absolutePath = resolve(rawPath)
  if (target.kind === 'file') return target.displayPath
  return prefixTargetPath(target.displayPath, toDisplayPath(target.root, absolutePath))
}

function parseRipgrepJsonLine(line: string, target: SearchTarget): SourceMatch | null {
  if (!line) return null
  let payload: {
    type?: string
    data?: {
      path?: { text?: string }
      lines?: { text?: string }
      line_number?: number
    }
  }
  try {
    payload = JSON.parse(line) as typeof payload
  } catch {
    return null
  }
  if (payload.type !== 'match') return null
  const pathText = payload.data?.path?.text
  const lineText = payload.data?.lines?.text
  const lineNumber = payload.data?.line_number
  if (!pathText || !lineText || lineNumber == null) return null
  return {
    path: displayPathForSearchMatch(target, pathText),
    line: lineNumber,
    line_number: lineNumber,
    text: lineText.trimEnd(),
  }
}

function isRipgrepNoMatchError(error: unknown): error is { code: number | string; stdout?: string | Buffer } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 1
  )
}

async function runRipgrepSearch(params: {
  executable: RipgrepCommand
  pattern: string
  limit: number
  target: SearchTarget
  config: HundunSourceConfig
  files: InternalSourceFile[]
}): Promise<SourceMatch[]> {
  if (params.files.length === 0) return []
  const args = [
    ...params.executable.argsPrefix,
    '--json',
    '--max-filesize',
    String(params.config.readMaxChars),
    params.pattern,
    ...params.files.map((file) => file.fullPath),
  ]
  let stdout: string
  try {
    const completed = await execFileAsync(params.executable.command, args, {
      encoding: 'utf8',
      timeout: 10000,
      maxBuffer: Math.max(params.config.readMaxChars * params.limit, 1024 * 1024),
      windowsHide: true,
    })
    stdout = completed.stdout
  } catch (error) {
    if (!isRipgrepNoMatchError(error)) throw error
    stdout = Buffer.isBuffer(error.stdout)
      ? error.stdout.toString('utf8')
      : error.stdout ?? ''
  }
  const matches: SourceMatch[] = []
  for (const line of stdout.split(/\r?\n/)) {
    const match = parseRipgrepJsonLine(line, params.target)
    if (!match) continue
    matches.push(match)
    if (matches.length >= params.limit) break
  }
  return matches
}

async function listSearchableFiles(params: {
  target: SearchTarget
  config: HundunSourceConfig
  glob?: string
}): Promise<InternalSourceFile[]> {
  const files =
    params.target.kind === 'file'
      ? [
          {
            root: params.target.root,
            fullPath: params.target.fullPath,
            path: params.target.displayPath,
            size: params.target.size,
          },
        ]
      : await collectSourceFiles(params.config, params.config.searchLimit, [
          params.target.root,
        ])

  return files.filter((file) => {
    const displayPath =
      params.target.kind === 'file'
        ? file.path
        : prefixTargetPath(params.target.displayPath, file.path)
    return isWithinRoot(file.root, file.fullPath) && matchesGlob(displayPath, params.glob)
  })
}

export async function globWarehouseSourcesOperation(input: {
  glob_pattern?: string
  target_directory?: string
  limit?: number
}) {
  const config = getHundunSourceConfig()
  if (!config.configured) {
    const result = {
      ok: false,
      configured: false,
      pattern: input.glob_pattern?.trim() || '**/*',
      target_directory: input.target_directory?.trim() || '.',
      count: 0,
      message: '混沌源码根目录未配置，无法探查数仓源文件。',
      files: [] as SourceFile[],
      paths: [] as string[],
      truncated: false,
    }
    return result
  }

  const pattern = input.glob_pattern?.trim() || '**/*'
  const target = await resolveRealSourceDirectory(input.target_directory, config)
  const limit = effectiveLimit(input.limit, config.searchLimit)
  const files = (await collectSourceFiles(config, limit, [target.root], (file) =>
    matchesGlob(prefixTargetPath(target.displayPath, file.path), pattern),
  ))
    .map((file) => ({
      ...file,
      path: prefixTargetPath(target.displayPath, file.path),
    }))
    .slice(0, limit)
    .map(({ path, size }) => ({
      path,
      size,
    }))
  const paths = files.map((file) => file.path).sort()
  const result = {
    ok: true,
    configured: true,
    pattern,
    target_directory: target.displayPath,
    count: paths.length,
    message: '已列出混沌可访问的数仓源文件。',
    files,
    paths,
    truncated: files.length >= limit,
  }
  return result
}

export async function searchWarehouseSourcesOperation(input: {
  pattern?: string
  path?: string
  glob?: string
  query?: string
  limit?: number
}) {
  const config = getHundunSourceConfig()
  if (!config.configured) {
    const result = {
      ok: false,
      configured: false,
      backend: 'typescript_fallback',
      fallback_reason: 'source_roots_not_configured',
      count: 0,
      message: '混沌源码根目录未配置，无法搜索数仓源文件。',
      matches: [] as SourceMatch[],
      truncated: false,
    }
    return result
  }

  const pattern = input.pattern?.trim() || input.query?.trim()
  if (!pattern) throw new Error('search 工具参数 pattern 不能为空。')
  const target = await resolveRealSourceTarget(input.path, config)
  const limit = effectiveLimit(input.limit, config.searchLimit)
  const searchableFiles = await listSearchableFiles({
    target,
    config,
    glob: input.glob,
  })
  const ripgrep =
    config.searchBackend === 'typescript' ? null : await findRipgrepExecutable()
  if (ripgrep) {
    try {
      const matches = await runRipgrepSearch({
        executable: ripgrep,
        pattern,
        limit,
        target,
        config,
        files: searchableFiles,
      })
      const result = {
        ok: true,
        configured: true,
        backend: 'ripgrep',
        fallback_reason: null,
        count: matches.length,
        message: '已使用 ripgrep 搜索混沌可访问的数仓源文件。',
        matches,
        truncated: matches.length >= limit,
      }
      return result
    } catch {
      return searchWarehouseSourcesWithTypescript({
        input,
        config,
        target,
        pattern,
        limit,
        files: searchableFiles,
        fallbackReason: 'ripgrep_execution_failed',
      })
    }
  }

  return searchWarehouseSourcesWithTypescript({
    input,
    config,
    target,
    pattern,
    limit,
    files: searchableFiles,
    fallbackReason:
      config.searchBackend === 'typescript' ? 'backend_typescript' : 'ripgrep_not_installed',
  })
}

async function searchWarehouseSourcesWithTypescript(params: {
  input: {
    pattern?: string
    path?: string
    glob?: string
    query?: string
    limit?: number
  }
  config: HundunSourceConfig
  target: SearchTarget
  pattern: string
  limit: number
  files: InternalSourceFile[]
  fallbackReason: string
}) {
  const regex = new RegExp(params.pattern)
  const matches: SourceMatch[] = []
  for (const file of params.files) {
    if (matches.length >= params.limit) break
    const displayPath =
      params.target.kind === 'file'
        ? file.path
        : prefixTargetPath(params.target.displayPath, file.path)
    const content = await readSourcePrefix(file.fullPath, params.config.readMaxChars)
    addMatchesFromContent(displayPath, content, regex, matches, params.limit)
  }

  const result = {
    ok: true,
    configured: true,
    backend: 'typescript_fallback',
    fallback_reason: params.fallbackReason,
    count: matches.length,
    message: '已搜索混沌可访问的数仓源文件。',
    matches,
    truncated: matches.length >= params.limit,
  }
  return result
}

function addMatchesFromContent(
  path: string,
  content: string,
  regex: RegExp,
  matches: SourceMatch[],
  limit: number,
) {
  const lines = content.split(/\r?\n/)
  for (const [index, line] of lines.entries()) {
    if (matches.length >= limit) return
    if (!regex.test(line)) continue
    matches.push({
      path,
      line: index + 1,
      line_number: index + 1,
      text: line.trim(),
    })
  }
}

export async function readWarehouseSourceOperation(input: {
  path: string
  offset?: number
  limit?: number
}) {
  const config = getHundunSourceConfig()
  if (!config.configured) {
    const result = {
      ok: false,
      configured: false,
      message: '混沌源码根目录未配置，无法读取数仓源文件。',
      path: input.path,
      content: '',
      line_count: 0,
      total_line_count: 0,
      truncated: false,
    }
    return result
  }

  const resolved = await resolveRealSourcePath(input.path, config)
  const info = await stat(resolved.fullPath)
  const fullContent = await readSourcePrefix(resolved.fullPath, config.readMaxChars)
  const lines = fullContent.split(/\r?\n/)
  const totalLineCount = lines.length
  const startIndex = Math.max((input.offset ?? 1) - 1, 0)
  const requestedLimit = input.limit ?? totalLineCount
  if (requestedLimit < 0) throw new Error('read 工具参数 limit 不能小于 0。')
  const sliced = lines.slice(startIndex, startIndex + requestedLimit)
  const content = sliced.join('\n')
  const truncated =
    info.size > Buffer.byteLength(fullContent, 'utf8') ||
    startIndex + sliced.length < totalLineCount
  const result = {
    ok: true,
    configured: true,
    message: '已读取混沌可访问的数仓源文件。',
    path: resolved.displayPath,
    content,
    line_count: sliced.length,
    total_line_count: totalLineCount,
    truncated,
  }
  return result
}

export const globWarehouseSourcesTool = createTool({
  id: 'glob-warehouse-sources',
  description: '列出混沌可访问的数仓源文件',
  inputSchema: z.object({
    glob_pattern: z.string().optional().describe('Glob 匹配模式，如 *.sql 或 **/*.sql'),
    target_directory: z.string().optional().describe('白名单根目录内的目标目录'),
    limit: z.number().int().positive().max(100).optional(),
  }),
  outputSchema: z.object({
    ok: z.boolean().optional(),
    configured: z.boolean(),
    pattern: z.string().optional(),
    target_directory: z.string().optional(),
    count: z.number().optional(),
    message: z.string(),
    files: z.array(z.object({ path: z.string(), size: z.number() })),
    paths: z.array(z.string()).optional(),
    truncated: z.boolean(),
  }),
  execute: async (input) =>
    runToolWithHooks({
      agent: 'hundun',
      tool: 'glob-warehouse-sources',
      input,
      hooks: defaultToolHooks,
      execute: globWarehouseSourcesOperation,
    }),
})

export const searchWarehouseSourcesTool = createTool({
  id: 'search-warehouse-sources',
  description: '搜索混沌可访问的数仓源文件片段',
  inputSchema: z.object({
    pattern: z.string().optional().describe('正则搜索表达式'),
    path: z.string().optional().describe('白名单根目录内的目标文件或目录'),
    glob: z.string().optional().describe('文件名或相对路径 glob 过滤'),
    query: z.string().optional().describe('兼容旧版的搜索关键词'),
    limit: z.number().int().positive().max(100).optional(),
  }),
  outputSchema: z.object({
    ok: z.boolean().optional(),
    configured: z.boolean(),
    backend: z.string().optional(),
    fallback_reason: z.string().nullable().optional(),
    count: z.number().optional(),
    message: z.string(),
    matches: z.array(
      z.object({
        path: z.string(),
        line: z.number(),
        line_number: z.number(),
        text: z.string(),
      }),
    ),
    truncated: z.boolean(),
  }),
  execute: async (input) =>
    runToolWithHooks({
      agent: 'hundun',
      tool: 'search-warehouse-sources',
      input,
      hooks: defaultToolHooks,
      execute: searchWarehouseSourcesOperation,
    }),
})

export const readWarehouseSourceTool = createTool({
  id: 'read-warehouse-source',
  description: '读取混沌可访问的单个数仓源文件片段',
  inputSchema: z.object({
    path: z.string().describe('白名单根目录内的相对文件路径'),
    offset: z.number().int().positive().optional(),
    limit: z.number().int().nonnegative().optional(),
  }),
  outputSchema: z.object({
    ok: z.boolean().optional(),
    configured: z.boolean(),
    message: z.string(),
    path: z.string(),
    content: z.string(),
    line_count: z.number().optional(),
    total_line_count: z.number().optional(),
    truncated: z.boolean(),
  }),
  execute: async (input) =>
    runToolWithHooks({
      agent: 'hundun',
      tool: 'read-warehouse-source',
      input,
      hooks: defaultToolHooks,
      execute: readWarehouseSourceOperation,
    }),
})
