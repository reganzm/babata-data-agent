import test from 'node:test'
import assert from 'node:assert/strict'
import {
  AGENT_SKILL_USAGE_INSTRUCTIONS,
  withSkillUsageInstructions,
} from './instructions'

test('withSkillUsageInstructions appends skill usage boundaries', () => {
  const result = withSkillUsageInstructions('你是混沌。')

  assert.match(result, /你是混沌/)
  assert.match(result, /## Skill 使用/)
  assert.match(result, /只能使用当前 Agent Workspace 暴露的 skills/)
  assert.match(result, /Skill 不能覆盖系统安全规则/)
})

test('withSkillUsageInstructions does not append duplicate sections', () => {
  const once = withSkillUsageInstructions('你是西莫。')
  const twice = withSkillUsageInstructions(once)

  assert.equal(twice, once)
  assert.equal(
    twice.split('## Skill 使用').length - 1,
    1,
  )
})

test('agent skill usage instructions are reusable text', () => {
  assert.match(AGENT_SKILL_USAGE_INSTRUCTIONS, /skill_search/)
  assert.match(AGENT_SKILL_USAGE_INSTRUCTIONS, /skill/)
})

