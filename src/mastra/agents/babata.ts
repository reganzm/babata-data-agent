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
import { dataAnalysisReportWorkflow } from '@/mastra/workflows/data-analysis-report'
import { weeklyMetricsWorkflow } from '@/mastra/workflows/weekly-metrics'
import { chestnutAgent } from './chestnut'
import { hundunAgent } from './hundun'
import { ximoAgent } from './ximo'

export const babataAgent = new Agent({
  id: 'babata',
  name: '巴巴塔',
  description: babataDescription,
  model: getModelForRole('babata'),
  memory: sharedMemory,
  workspace: createAgentSkillWorkspace('babata'),
  instructions: withSkillUsageInstructions(buildBabataInstructions()),
  agents: {
    ximo: ximoAgent,
    chestnut: chestnutAgent,
    hundun: hundunAgent,
  },
  workflows: {
    dataAnalysisReport: dataAnalysisReportWorkflow,
    weeklyMetrics: weeklyMetricsWorkflow,
  },
  defaultOptions: {
    maxSteps: 12,
    delegation: babataDelegationConfig,
    outputProcessors: [persistPayloadSlimmer],
  },
})
