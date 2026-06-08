import { Agent } from '@mastra/core/agent'
import { getModelForRole } from '@/lib/model'
import { hundunDescription, hundunInstructions } from '@/mastra/instructions'
import { withSkillUsageInstructions } from '@/mastra/skills/instructions'
import { createAgentSkillWorkspace } from '@/mastra/skills/workspace'
import { getHundunContextTools } from '@/mastra/tools/context'

export const hundunAgent = new Agent({
  id: 'hundun',
  name: '混沌',
  description: hundunDescription,
  model: getModelForRole('hundun'),
  workspace: createAgentSkillWorkspace('hundun'),
  instructions: withSkillUsageInstructions(hundunInstructions),
  tools: getHundunContextTools(),
})
