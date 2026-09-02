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
  // 每次 run 解析 tools，确保 ragQuery 计数器按单次委派重置
  tools: () => getXimoDbTools(),
  defaultOptions: {
    outputProcessors: [persistPayloadSlimmer],
  },
})
