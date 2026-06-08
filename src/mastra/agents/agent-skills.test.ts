import test from 'node:test'
import assert from 'node:assert/strict'
import { babataAgent } from './babata'
import { chestnutAgent } from './chestnut'
import { hundunAgent } from './hundun'
import { ximoAgent } from './ximo'

const agents = [
  ['babata', babataAgent],
  ['ximo', ximoAgent],
  ['hundun', hundunAgent],
  ['chestnut', chestnutAgent],
] as const

test('agents include skill usage instructions', async () => {
  for (const [agentId, agent] of agents) {
    const instructions = await agent.getInstructions()

    assert.match(String(instructions), /## Skill 使用/, agentId)
    assert.match(
      String(instructions),
      /只能使用当前 Agent Workspace 暴露的 skills/,
      agentId,
    )
  }
})

test('agents have isolated skill workspaces when skills are enabled', async () => {
  for (const [agentId, agent] of agents) {
    assert.equal(agent.hasOwnWorkspace(), true, agentId)
    assert.ok(await agent.getWorkspace(), agentId)
  }
})

