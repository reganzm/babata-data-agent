import test from 'node:test'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { getAgentSkillsConfig, type SkillAgentId } from './config'

test('agent skills config enables skills by default outside production', () => {
  const config = getAgentSkillsConfig({
    NODE_ENV: 'development',
  })

  assert.equal(config.enabled, true)
  assert.equal(config.root, resolve('workspace'))
  assert.equal(config.dynamicDiscovery, true)
})

test('agent skills config can disable skills explicitly', () => {
  const config = getAgentSkillsConfig({
    AGENT_SKILLS_ENABLED: 'false',
    NODE_ENV: 'development',
  })

  assert.equal(config.enabled, false)
})

test('agent skills config normalizes custom root and parses dynamic discovery', () => {
  const config = getAgentSkillsConfig({
    AGENT_SKILLS_ROOT: './custom-skills',
    AGENT_SKILLS_DYNAMIC_DISCOVERY: 'false',
    NODE_ENV: 'development',
  })

  assert.equal(config.root, resolve('custom-skills'))
  assert.equal(config.dynamicDiscovery, false)
})

test('agent skills config defaults dynamic discovery off in production', () => {
  const config = getAgentSkillsConfig({
    NODE_ENV: 'production',
  })

  assert.equal(config.dynamicDiscovery, false)
})

test('skill agent id lists all supported agents', () => {
  const ids: SkillAgentId[] = ['babata', 'ximo', 'hundun', 'chestnut']

  assert.deepEqual(ids, ['babata', 'ximo', 'hundun', 'chestnut'])
})

