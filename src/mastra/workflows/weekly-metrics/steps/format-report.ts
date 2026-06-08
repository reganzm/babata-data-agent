import { createStep } from '@mastra/core/workflows'
import { generateText } from 'ai'
import {
  appendVisualizationToReport,
  buildVisualizationFromQuery,
} from '@/lib/visualization/build-artifact'
import { getModelForRole } from '@/lib/model'
import { logLlmDebug } from '@/lib/llm-debug-log'
import { afterExecuteSchema, weeklyOutputSchema } from '../schemas'

export const formatWeeklyReportStep = createStep({
  id: 'format-report',
  inputSchema: afterExecuteSchema,
  outputSchema: weeklyOutputSchema,
  execute: async ({ inputData }) => {
    const { text } = await generateText({
      model: getModelForRole('babata'),
      system: `你是周报撰写助手。根据固定指标查询结果生成中文 Markdown 周报。
周期标签：${inputData.weekLabel}
须含：概要、分项指标、数据表格、备注。`,
      prompt: JSON.stringify(
        {
          userQuery: inputData.userQuery,
          results: inputData.results,
        },
        null,
        2,
      ),
    })
    logLlmDebug({
      scene: 'weekly-metrics:format-report',
      userInput: {
        userQuery: inputData.userQuery,
        weekLabel: inputData.weekLabel,
        results: inputData.results,
      },
      llmOutput: text,
    })

    const primaryResult = inputData.results.reduce((best, current) =>
      current.rows.length > best.rows.length ? current : best,
    )
    const visualization = buildVisualizationFromQuery(
      {
        sql: primaryResult.sql,
        rowCount: primaryResult.rowCount,
        rows: primaryResult.rows,
      },
      { summary: `${inputData.weekLabel} 指标概览` },
    )

    return {
      report: appendVisualizationToReport(text, visualization),
      metrics: inputData.results,
    }
  },
})
