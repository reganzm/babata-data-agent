import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  SKILL_AGENT_IDS,
  type SkillAgentId,
  getAgentSkillsConfig,
} from './config'
import {
  createAgentSkillResolver,
  createAgentSkillWorkspace,
  discoverAgentSkillPaths,
  getAgentSkillBasePath,
  getAgentSkillRootPath,
} from './workspace'

function withSkillRoot<T>(run: (root: string) => Promise<T> | T): Promise<T> | T {
  const root = mkdtempSync(join(tmpdir(), 'agent-skills-'))
  try {
    const result = run(root)
    if (result instanceof Promise) {
      return result.finally(() => rmSync(root, { recursive: true, force: true }))
    }
    rmSync(root, { recursive: true, force: true })
    return result
  } catch (error) {
    rmSync(root, { recursive: true, force: true })
    throw error
  }
}

function writeSkill(root: string, agent: string, skill: string, frontmatterAgent = agent) {
  const directory = join(root, 'agents', agent, 'skills', skill)
  mkdirSync(directory, { recursive: true })
  writeFileSync(
    join(directory, 'SKILL.md'),
    [
      '---',
      `name: ${skill}`,
      `description: ${skill} skill`,
      `agent: ${frontmatterAgent}`,
      'version: 0.1.0',
      '---',
      '',
      `# ${skill}`,
    ].join('\n'),
  )
}

test('discoverAgentSkillPaths only returns skills for the requested agent', async () => {
  await withSkillRoot(async (root) => {
    writeSkill(root, 'babata', 'intent-routing')
    writeSkill(root, 'ximo', 'text-to-sql-analysis')

    const paths = await discoverAgentSkillPaths('babata', {
      enabled: true,
      root,
      dynamicDiscovery: true,
    })

    assert.deepEqual(paths, ['skills/intent-routing'])
  })
})

test('discoverAgentSkillPaths ignores invalid skill directories', async () => {
  await withSkillRoot(async (root) => {
    writeSkill(root, 'hundun', 'context-recon')
    writeSkill(root, 'hundun', 'wrong-agent', 'ximo')
    mkdirSync(join(root, 'agents', 'hundun', 'skills', 'missing-skill-md'), {
      recursive: true,
    })
    mkdirSync(join(root, 'agents', 'hundun', 'skills', '.hidden'), {
      recursive: true,
    })

    const paths = await discoverAgentSkillPaths('hundun', {
      enabled: true,
      root,
      dynamicDiscovery: true,
    })

    assert.deepEqual(paths, ['skills/context-recon'])
  })
})

test('agent skill paths are scoped to a single agent directory', () => {
  const root = join(tmpdir(), 'agent-skill-root')

  assert.equal(
    getAgentSkillBasePath('ximo', {
      enabled: true,
      root,
      dynamicDiscovery: true,
    }),
    join(root, 'agents', 'ximo'),
  )
  assert.equal(
    getAgentSkillRootPath('ximo', {
      enabled: true,
      root,
      dynamicDiscovery: true,
    }),
    join(root, 'agents', 'ximo', 'skills'),
  )
})

test('createAgentSkillWorkspace returns undefined when skills are disabled', () => {
  const workspace = createAgentSkillWorkspace('babata', {
    enabled: false,
    root: join(tmpdir(), 'disabled-skills'),
    dynamicDiscovery: true,
  })

  assert.equal(workspace, undefined)
})

test('createAgentSkillWorkspace creates a workspace when enabled', () => {
  const workspace = createAgentSkillWorkspace('babata', {
    enabled: true,
    root: join(tmpdir(), 'enabled-skills'),
    dynamicDiscovery: true,
  })

  assert.ok(workspace)
})

test('agent skill resolver caches paths when dynamic discovery is disabled', async () => {
  await withSkillRoot(async (root) => {
    writeSkill(root, 'babata', 'intent-routing')
    const resolver = createAgentSkillResolver('babata', {
      enabled: true,
      root,
      dynamicDiscovery: false,
    })

    assert.deepEqual(await resolver(), ['skills/intent-routing'])
    writeSkill(root, 'babata', 'new-routing')
    assert.deepEqual(await resolver(), ['skills/intent-routing'])
  })
})

test('discoverAgentSkillPaths ignores symlinks that point outside agent skills root', async (t) => {
  await withSkillRoot(async (root) => {
    const externalRoot = mkdtempSync(join(tmpdir(), 'external-skill-'))
    try {
      writeSkill(externalRoot, 'hundun', 'external-context')
      const skillsRoot = join(root, 'agents', 'hundun', 'skills')
      mkdirSync(skillsRoot, { recursive: true })
      try {
        symlinkSync(
          join(externalRoot, 'agents', 'hundun', 'skills', 'external-context'),
          join(skillsRoot, 'external-context'),
          'dir',
        )
      } catch {
        t.skip('当前系统不允许创建 symlink')
        return
      }

      const paths = await discoverAgentSkillPaths('hundun', {
        enabled: true,
        root,
        dynamicDiscovery: true,
      })

      assert.deepEqual(paths, [])
    } finally {
      rmSync(externalRoot, { recursive: true, force: true })
    }
  })
})

test('initial repository skills are discoverable only by their owning agent', async () => {
  const expected: Record<SkillAgentId, string[]> = {
    babata: ['skills/intent-routing'],
    ximo: ['skills/text-to-sql-analysis'],
    hundun: ['skills/context-recon'],
    chestnut: ['skills/report-polishing'],
    juju: ['skills/event-tracking-acceptance'],
    dax: ['skills/local-knowledge-sql'],
  }

  const config = getAgentSkillsConfig({
    AGENT_SKILLS_ROOT: 'workspace',
    AGENT_SKILLS_ENABLED: 'true',
    AGENT_SKILLS_DYNAMIC_DISCOVERY: 'true',
  })

  for (const agentId of SKILL_AGENT_IDS) {
    assert.deepEqual(await discoverAgentSkillPaths(agentId, config), expected[agentId])
  }
})

