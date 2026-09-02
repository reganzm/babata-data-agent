/**
 * Mastra 实例配置
 *
 * 注册智囊团 Agent、Workflow，并使用 LibSQL 做本地持久化。
 */

import { Mastra } from '@mastra/core'
import { babataAgent } from './agents/babata'
import { chestnutAgent } from './agents/chestnut'
import { daxAgent } from './agents/dax'
import { hundunAgent } from './agents/hundun'
import { jujuAgent } from './agents/juju'
import { ximoAgent } from './agents/ximo'
import { mastraStorage } from './storage'
import { dataAnalysisPrepWorkflow } from './workflows/data-analysis-prep'
import { dataAnalysisReportWorkflow } from './workflows/data-analysis-report'
import { weeklyMetricsWorkflow } from './workflows/weekly-metrics'

export const mastra = new Mastra({
  storage: mastraStorage,
  agents: {
    babata: babataAgent,
    ximo: ximoAgent,
    chestnut: chestnutAgent,
    hundun: hundunAgent,
    juju: jujuAgent,
    dax: daxAgent,
  },
  workflows: {
    dataAnalysisPrep: dataAnalysisPrepWorkflow,
    dataAnalysisReport: dataAnalysisReportWorkflow,
    weeklyMetrics: weeklyMetricsWorkflow,
  },
})
