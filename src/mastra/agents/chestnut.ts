import { Agent } from '@mastra/core/agent'
import { getModelForRole } from '@/lib/model'
import { chestnutDescription, chestnutInstructions } from '@/mastra/instructions'
import { withSkillUsageInstructions } from '@/mastra/skills/instructions'
import { createAgentSkillWorkspace } from '@/mastra/skills/workspace'

export const chestnutAgent = new Agent({
  id: 'chestnut',
  name: '小栗子',
  description: chestnutDescription,
  model: getModelForRole('chestnut'),
  workspace: createAgentSkillWorkspace('chestnut'),
  instructions: withSkillUsageInstructions(chestnutInstructions),
})
