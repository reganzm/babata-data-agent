import { resolve } from 'node:path'

export type SkillAgentId =
  | 'babata'
  | 'ximo'
  | 'hundun'
  | 'chestnut'
  | 'juju'
  | 'dax'

export const SKILL_AGENT_IDS: SkillAgentId[] = [
  'babata',
  'ximo',
  'hundun',
  'chestnut',
  'juju',
  'dax',
]

export type AgentSkillsConfig = {
  enabled: boolean
  root: string
  dynamicDiscovery: boolean
}

type SkillEnv = Record<string, string | undefined>

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  const normalized = value?.trim().toLowerCase()
  if (!normalized) return fallback
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true
  if (['false', '0', 'no', 'off'].includes(normalized)) return false
  return fallback
}

function defaultDynamicDiscovery(env: SkillEnv): boolean {
  return env.NODE_ENV !== 'production'
}

export function getAgentSkillsConfig(
  env: SkillEnv = process.env,
): AgentSkillsConfig {
  const root = env.AGENT_SKILLS_ROOT?.trim() || 'workspace'
  return {
    enabled: parseBoolean(env.AGENT_SKILLS_ENABLED, true),
    root: resolve(root),
    dynamicDiscovery: parseBoolean(
      env.AGENT_SKILLS_DYNAMIC_DISCOVERY,
      defaultDynamicDiscovery(env),
    ),
  }
}

