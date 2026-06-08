import { createStep } from '@mastra/core/workflows'
import { generateText } from 'ai'
import { getModelForRole } from '@/lib/model'
import { logLlmDebug } from '@/lib/llm-debug-log'
import {
  buildSqlClarificationConstraints,
  resolveUserClarification,
} from '@/lib/sql-clarification'
import {
  afterParseSchema,
  parsePrepLoopInput,
  prepLoopInputSchema,
} from '../schemas'

export const parseIntentStep = createStep({
  id: 'parse-intent',
  inputSchema: prepLoopInputSchema,
  outputSchema: afterParseSchema,
  execute: async ({ inputData }) => {
    const data = parsePrepLoopInput(inputData)
    const userClarification = resolveUserClarification({
      rejectionFeedback: data.rejectionFeedback,
      userClarification: data.userClarification,
    })
    const constraintBlock = buildSqlClarificationConstraints(userClarification)
    const partitionHint = userClarification?.tableName
      ? ''
      : '表结构含 ds 时，意图摘要中的日期维度须写 ds（yyyyMMdd 分区），不要写 dt。'
    const rejectionNote = data.rejectionFeedback?.trim()
      ? `\n\n【上一轮 SQL 被驳回，必须根据澄清修改理解】\n用户澄清：${data.rejectionFeedback.trim()}${
          data.lastRejectedSql?.trim()
            ? `\n被驳回的 SQL（勿重复相同写法）：\n${data.lastRejectedSql.trim()}`
            : ''
        }\n请输出与澄清一致的新意图摘要，不要复述被驳回 SQL。`
      : ''

    if (process.env.NODE_ENV === 'development') {
      console.info('[parse-intent] input', {
        hasRejectionFeedback: Boolean(data.rejectionFeedback?.trim()),
        hasLastRejectedSql: Boolean(data.lastRejectedSql?.trim()),
        sqlRevisionCount: data.sqlRevisionCount ?? 0,
        hasClarification: Boolean(userClarification),
        clarification: userClarification
          ? {
              tableName: userClarification.tableName,
              dimensions: userClarification.dimensions,
              metrics: userClarification.metrics,
              timeStart: userClarification.timeStart,
              timeEnd: userClarification.timeEnd,
              analysisStrategyId: userClarification.analysisStrategyId,
            }
          : null,
      })
    }

    const { text } = await generateText({
      model: getModelForRole('ximo'),
      system:
        '你是数据分析意图解析器。用一两句话概括用户想查的表、指标、维度和时间范围。只输出摘要，不要 SQL。数仓表若有 ds 列，日期维度须表述为 ds（yyyyMMdd），勿写 dt。若存在「用户结构化澄清」块，必须逐条采纳，不得忽略。',
      prompt: `${data.userQuery}${rejectionNote}${
        constraintBlock ? `\n\n${constraintBlock}` : ''
      }${partitionHint ? `\n\n${partitionHint}` : ''}`,
    })

    logLlmDebug({
      scene: 'parse-intent',
      userInput: {
        userQuery: data.userQuery,
        rejectionFeedback: data.rejectionFeedback,
        userClarification,
      },
      llmOutput: text.trim(),
    })

    if (process.env.NODE_ENV === 'development') {
      console.info('[parse-intent] output', {
        intentSummary: text.trim().slice(0, 200),
      })
    }
    return {
      userQuery: data.userQuery,
      intentSummary: text.trim(),
      sqlRevisionCount: data.sqlRevisionCount,
      rejectionFeedback: data.rejectionFeedback,
      lastRejectedSql: data.lastRejectedSql,
      userClarification: userClarification
        ? {
            tableName: userClarification.tableName,
            dimensions: userClarification.dimensions,
            metrics: userClarification.metrics,
            timeStart: userClarification.timeStart,
            timeEnd: userClarification.timeEnd,
            analysisStrategyId: userClarification.analysisStrategyId,
            additionalNotes: userClarification.additionalNotes,
          }
        : undefined,
    }
  },
})
