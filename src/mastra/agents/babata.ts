import { Agent } from '@mastra/core/agent'
import { getModelForRole } from '@/lib/model'
import { babataDelegationConfig } from '@/mastra/delegation'
import { persistPayloadSlimmer } from '@/mastra/processors/persist-payload-slimmer'
import { babataDescription } from '@/mastra/instructions'
import { buildBabataInstructions } from '@/mastra/registry'
import { sharedMemory } from '@/mastra/memory'
import {
  createAgentSkillWorkspace,
} from '@/mastra/skills/workspace'
import { withSkillUsageInstructions } from '@/mastra/skills/instructions'
import { wrapToolsToSanitizeAgentResumeArgs } from '@/mastra/sanitize-agent-tool-args'
import { confirmNormalizedQueryTool } from '@/mastra/tools/query/confirm-normalized-query'
import { dataAnalysisReportWorkflow } from '@/mastra/workflows/data-analysis-report'
import { weeklyMetricsWorkflow } from '@/mastra/workflows/weekly-metrics'
import { chestnutAgent } from './chestnut'
import { daxAgent } from './dax'
import { hundunAgent } from './hundun'
import { jujuAgent } from './juju'
import { ximoAgent } from './ximo'

export const babataAgent = new Agent({
  id: 'babata',
  name: '巴巴塔',
  description: babataDescription,
  model: getModelForRole('babata'),
  memory: sharedMemory,
  workspace: createAgentSkillWorkspace('babata'),
  instructions: withSkillUsageInstructions(buildBabataInstructions()),
  tools: {
    confirmNormalizedQuery: confirmNormalizedQueryTool,
  },
  agents: {
    ximo: ximoAgent,
    chestnut: chestnutAgent,
    hundun: hundunAgent,
    juju: jujuAgent,
    dax: daxAgent,
  },
  workflows: {
    dataAnalysisReport: dataAnalysisReportWorkflow,
    weeklyMetrics: weeklyMetricsWorkflow,
  },
  defaultOptions: {
    maxSteps: 12,
    delegation: babataDelegationConfig,
    outputProcessors: [persistPayloadSlimmer],
    prepareStep: async ({ tools }) => {
      const wrapped = wrapToolsToSanitizeAgentResumeArgs(
        tools as Record<string, unknown> | undefined,
      )
      return wrapped ? { tools: wrapped } : undefined
    },
  },
})
