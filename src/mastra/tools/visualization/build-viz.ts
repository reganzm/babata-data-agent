import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import {
  appendVisualizationToReport,
  buildVisualizationFromQuery,
} from '@/lib/visualization/build-artifact'
import { assertDaxAgentInteractionMode, getDaxRuntime } from '@/lib/dax-runtime-context'
import { queryResultSchema } from '@/lib/visualization/types'
import { defaultToolHooks, runToolWithHooks } from '@/mastra/tools/hooks'

export const buildVisualizationTool = createTool({
  id: 'build-visualization',
  description:
    '根据 execute-readonly-sql 的查询结果生成 babata-viz 可视化块（图表+指标+表格）。在成功执行 SQL 后调用，将返回的 vizBlock 原文附在回复末尾。',
  inputSchema: z.object({
    queryResult: queryResultSchema,
    summary: z.string().optional(),
  }),
  outputSchema: z.object({
    vizBlock: z.string(),
    chartCount: z.number(),
  }),
  execute: async (input) =>
    runToolWithHooks({
      tool: 'build-visualization',
      input,
      hooks: defaultToolHooks,
      execute: async ({ queryResult, summary }) => {
        if (getDaxRuntime()?.chatMode === 'plan') {
          assertDaxAgentInteractionMode('生成可视化')
        }
    const artifact = buildVisualizationFromQuery(queryResult, { summary })
    if (!artifact) {
      return { vizBlock: '', chartCount: 0 }
    }
    const vizBlock = appendVisualizationToReport('', artifact).trim()
        return {
          vizBlock,
          chartCount: artifact.charts.length,
        }
      },
    }),
})
