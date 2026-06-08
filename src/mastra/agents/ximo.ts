import { Agent } from '@mastra/core/agent'
import { getModelForRole } from '@/lib/model'
import { ximoDescription, ximoInstructions } from '@/mastra/instructions'
import { persistPayloadSlimmer } from '@/mastra/processors/persist-payload-slimmer'
import { withSkillUsageInstructions } from '@/mastra/skills/instructions'
import { createAgentSkillWorkspace } from '@/mastra/skills/workspace'
import { getXimoDbTools } from '@/mastra/tools/db'

export const ximoAgent = new Agent({
  id: 'ximo',
  name: '西莫',
  description: ximoDescription,
  model: getModelForRole('ximo'),
  workspace: createAgentSkillWorkspace('ximo'),
  instructions: withSkillUsageInstructions(ximoInstructions),
  tools: getXimoDbTools(),
  defaultOptions: {
    outputProcessors: [persistPayloadSlimmer],
  },
})
