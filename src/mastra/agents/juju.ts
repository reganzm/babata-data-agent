import { Agent } from '@mastra/core/agent'
import { getModelForRole } from '@/lib/model'
import { jujuDescription, jujuInstructions } from '@/mastra/instructions'
import { persistPayloadSlimmer } from '@/mastra/processors/persist-payload-slimmer'
import { withSkillUsageInstructions } from '@/mastra/skills/instructions'
import { createAgentSkillWorkspace } from '@/mastra/skills/workspace'
import { getJujuDbTools } from '@/mastra/tools/db'

export const jujuAgent = new Agent({
  id: 'juju',
  name: '巨斧',
  description: jujuDescription,
  model: getModelForRole('juju'),
  workspace: createAgentSkillWorkspace('juju'),
  instructions: withSkillUsageInstructions(jujuInstructions),
  tools: () => getJujuDbTools(),
  defaultOptions: {
    outputProcessors: [persistPayloadSlimmer],
  },
})
