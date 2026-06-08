import { readdir, readFile, realpath, stat } from 'node:fs/promises'
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { LocalFilesystem, Workspace } from '@mastra/core/workspace'
import {
  getAgentSkillsConfig,
  type AgentSkillsConfig,
  type SkillAgentId,
} from './config'

const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function isWithinRoot(root: string, target: string): boolean {
  const rel = relative(root, target)
  return Boolean(rel) && !rel.startsWith('..') && !isAbsolute(rel)
}

function toWorkspacePath(basePath: string, skillPath: string): string {
  return relative(basePath, skillPath).split(sep).join('/')
}

function readFrontmatterValue(content: string, key: string): string | undefined {
  if (!content.startsWith('---')) return undefined
  const end = content.indexOf('\n---', 3)
  if (end === -1) return undefined
  const frontmatter = content.slice(3, end)
  const line = frontmatter
    .split(/\r?\n/)
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${key}:`))
  return line?.slice(key.length + 1).trim().replace(/^['"]|['"]$/g, '')
}

async function hasMatchingSkillAgent(skillFile: string, agentId: SkillAgentId) {
  const content = await readFile(skillFile, 'utf8')
  return readFrontmatterValue(content, 'agent') === agentId
}

export function getAgentSkillBasePath(
  agentId: SkillAgentId,
  config: AgentSkillsConfig = getAgentSkillsConfig(),
): string {
  return join(config.root, 'agents', agentId)
}

export function getAgentSkillRootPath(
  agentId: SkillAgentId,
  config: AgentSkillsConfig = getAgentSkillsConfig(),
): string {
  return join(getAgentSkillBasePath(agentId, config), 'skills')
}

export async function discoverAgentSkillPaths(
  agentId: SkillAgentId,
  config: AgentSkillsConfig = getAgentSkillsConfig(),
): Promise<string[]> {
  if (!config.enabled) return []
  const basePath = getAgentSkillBasePath(agentId, config)
  const skillsRoot = getAgentSkillRootPath(agentId, config)

  let realBasePath: string
  let realSkillsRoot: string
  try {
    realBasePath = await realpath(basePath)
    realSkillsRoot = await realpath(skillsRoot)
  } catch {
    return []
  }
  if (realSkillsRoot !== realBasePath && !isWithinRoot(realBasePath, realSkillsRoot)) {
    return []
  }

  let entries
  try {
    entries = await readdir(realSkillsRoot, { withFileTypes: true })
  } catch {
    return []
  }

  const paths: string[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (entry.name.startsWith('.') || !SKILL_NAME_PATTERN.test(entry.name)) continue
    const skillDirectory = resolve(realSkillsRoot, entry.name)
    const realSkillDirectory = await realpath(skillDirectory)
    if (!isWithinRoot(realSkillsRoot, realSkillDirectory)) continue

    const skillFile = join(realSkillDirectory, 'SKILL.md')
    try {
      const info = await stat(skillFile)
      if (!info.isFile()) continue
      if (!(await hasMatchingSkillAgent(skillFile, agentId))) continue
      paths.push(toWorkspacePath(realBasePath, realSkillDirectory))
    } catch {
      continue
    }
  }

  return paths.sort()
}

export function createAgentSkillResolver(
  agentId: SkillAgentId,
  config: AgentSkillsConfig = getAgentSkillsConfig(),
) {
  let cachedPaths: string[] | undefined
  return async () => {
    if (!config.dynamicDiscovery && cachedPaths) return cachedPaths
    const paths = await discoverAgentSkillPaths(agentId, config)
    if (!config.dynamicDiscovery) cachedPaths = paths
    return paths
  }
}

export function createAgentSkillWorkspace(
  agentId: SkillAgentId,
  config: AgentSkillsConfig = getAgentSkillsConfig(),
) {
  if (!config.enabled) return undefined
  const basePath = getAgentSkillBasePath(agentId, config)
  return new Workspace({
    id: `${agentId}-skills`,
    name: `${agentId} skills`,
    filesystem: new LocalFilesystem({
      basePath,
      contained: true,
      readOnly: true,
    }),
    skills: createAgentSkillResolver(agentId, config),
    checkSkillFileMtime: config.dynamicDiscovery,
  })
}

