import { Agent } from '@mastra/core/agent'
import { getModelForRole } from '@/lib/model'
import { daxDescription, daxInstructions } from '@/mastra/instructions/dax'
import { buildChatInteractionModeBlock } from '@/mastra/instructions/chat-interaction-mode'
import { buildDaxSelectionContextBlock } from '@/mastra/instructions/dax-selection-context'
import { persistPayloadSlimmer } from '@/mastra/processors/persist-payload-slimmer'
import { withSkillUsageInstructions } from '@/mastra/skills/instructions'
import { createAgentSkillWorkspace } from '@/mastra/skills/workspace'
import { getDaxTools } from '@/mastra/tools/dax'

export const daxAgent = new Agent({
  id: 'dax',
  name: '达克斯',
  description: daxDescription,
  model: getModelForRole('dax'),
  workspace: createAgentSkillWorkspace('dax'),
  instructions: async ({ requestContext }) => {
    const prefetchedKnowledgeContext =
      (requestContext.get('prefetchedKnowledgeContext') as string | undefined) ??
      ''
    const boundKnowledgeBaseIds =
      (requestContext.get('boundKnowledgeBaseIds') as string[] | undefined) ??
      []

    const blocks = [
      daxInstructions,
      buildChatInteractionModeBlock(
        requestContext.get('chatMode') as string | undefined,
      ),
      buildDaxSelectionContextBlock({
        selectedDataSourceId: requestContext.get('selectedDataSourceId') as
          | string
          | undefined,
        selectedKnowledgeBaseId: requestContext.get('selectedKnowledgeBaseId') as
          | string
          | undefined,
        boundKnowledgeBaseIds,
      }),
      prefetchedKnowledgeContext.trim(),
    ].filter(Boolean)

    return withSkillUsageInstructions(blocks.join('\n\n'))
  },
  tools: () => getDaxTools(),
  defaultOptions: {
    outputProcessors: [persistPayloadSlimmer],
  },
})
