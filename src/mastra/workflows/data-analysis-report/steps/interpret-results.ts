import { createStep } from '@mastra/core/workflows'
import { generateText } from 'ai'
import {
  appendVisualizationToReport,
  buildVisualizationFromQuery,
} from '@/lib/visualization/build-artifact'
import { getModelForRole } from '@/lib/model'
import { logLlmDebug } from '@/lib/llm-debug-log'
import { formatSqlForDisplay } from '@/mastra/tools/db/sql-guard'
import { afterExecuteSchema, interpretOutputSchema } from '../schemas'

export const interpretResultsStep = createStep({
  id: 'interpret-results',
  inputSchema: afterExecuteSchema,
  outputSchema: interpretOutputSchema,
  execute: async ({ inputData }) => {
    const { text } = await generateText({
      model: getModelForRole('babata'),
      system:
        '你是数据分析报告撰写者。根据查询结果写 Markdown 报告，并在文末输出 JSON 代码块：{"sql","summary","numbers":[{"label","value"}],"caveats"}。图表由系统自动生成，无需输出 charts 字段。',
      prompt: JSON.stringify(
        {
          intent: inputData.intentSummary,
          userQuery: inputData.userQuery,
          queryResult: inputData.queryResult,
        },
        null,
        2,
      ),
    })
    logLlmDebug({
      scene: 'interpret-results',
      userInput: {
        userQuery: inputData.userQuery,
        intentSummary: inputData.intentSummary,
        queryResult: inputData.queryResult,
      },
      llmOutput: text,
    })

    let mergedStructured: unknown = {
      sql: inputData.queryResult.sql,
      summary: inputData.intentSummary,
      numbers: inputData.queryResult.rows.slice(0, 5).map((row, i) => ({
        label: `row_${i + 1}`,
        value: JSON.stringify(row),
      })),
      caveats: [inputData.queryResult.note],
    }

    const jsonMatch = text.match(/```json\s*([\s\S]*?)```/i)
    if (jsonMatch) {
      try {
        mergedStructured = { ...(mergedStructured as object), ...JSON.parse(jsonMatch[1]) }
      } catch {
        /* keep default */
      }
    }

    const structuredObj =
      mergedStructured && typeof mergedStructured === 'object'
        ? (mergedStructured as Record<string, unknown>)
        : {}

    const normalizedSummary =
      typeof structuredObj.summary === 'string' && structuredObj.summary.trim()
        ? structuredObj.summary.trim()
        : inputData.intentSummary

    const normalizedNumbers = Array.isArray(structuredObj.numbers)
      ? structuredObj.numbers
          .map((item) => {
            if (!item || typeof item !== 'object') return null
            const row = item as { label?: unknown; value?: unknown }
            if (typeof row.label !== 'string' || row.value == null) return null
            if (typeof row.value !== 'string' && typeof row.value !== 'number') {
              return null
            }
            return {
              label: row.label.trim(),
              value: row.value,
            }
          })
          .filter((item): item is { label: string; value: string | number } => Boolean(item))
      : inputData.queryResult.rows.slice(0, 5).map((row, i) => ({
          label: `row_${i + 1}`,
          value: JSON.stringify(row),
        }))

    const normalizedCaveats = Array.isArray(structuredObj.caveats)
      ? structuredObj.caveats
          .map((item) => (typeof item === 'string' ? item.trim() : ''))
          .filter(Boolean)
      : typeof structuredObj.caveats === 'string' && structuredObj.caveats.trim()
        ? [structuredObj.caveats.trim()]
        : []

    const finalCaveats =
      normalizedCaveats.length > 0 ? normalizedCaveats : [inputData.queryResult.note]

    const visualization =
      buildVisualizationFromQuery(inputData.queryResult, {
        summary: normalizedSummary,
        numbers: normalizedNumbers.map((item) => ({
          label: item.label,
          value: String(item.value),
        })),
      }) ?? undefined

    const reportWithoutSql = appendVisualizationToReport(text, visualization ?? null)
    const formattedSql = formatSqlForDisplay(inputData.queryResult.sql)
    const report = /```sql/i.test(reportWithoutSql)
      ? reportWithoutSql
      : `${reportWithoutSql}\n\n## 执行 SQL\n\n\`\`\`sql\n${formattedSql}\n\`\`\``
    const clarificationRecord = inputData.rejectionFeedback?.trim()
      ? inputData.rejectionFeedback.trim()
      : inputData.userClarification
        ? JSON.stringify(inputData.userClarification, null, 2)
        : '无'

    return {
      report,
      structured: {
        sql: typeof structuredObj.sql === 'string' ? structuredObj.sql : inputData.queryResult.sql,
        summary: normalizedSummary,
        numbers: normalizedNumbers,
        caveats: finalCaveats,
        visualization,
      },
      fewShotDraft: {
        originalQuestion: inputData.userQuery,
        finalIntentSummary: inputData.intentSummary,
        clarificationRecord,
        generatedSql: formattedSql,
        reportMarkdown: report,
        generatedAt: new Date().toISOString(),
      },
    }
  },
})
