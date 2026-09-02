import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import {
  queryRagKnowledgeOperation,
  type QueryRagKnowledgeInput,
} from '@/mastra/tools/context/rag'
import { defaultToolHooks, runToolWithHooks } from '@/mastra/tools/hooks'

export const MAX_XIMO_RAG_QUERY_CALLS = 10

const ragQueryResultSchema = z.object({
  configured: z.boolean(),
  message: z.string(),
  data: z.unknown().optional(),
  results: z
    .array(
      z.object({
        title: z.string().optional(),
        content: z.string(),
        source: z.string().optional(),
        score: z.number().optional(),
      }),
    )
    .default([]),
  callsUsed: z.number().int().nonnegative(),
  maxCalls: z.number().int().positive(),
  limited: z.boolean(),
})

export type CreateRagQueryToolOptions = {
  maxCalls?: number
}

export function createRagQueryTool(options: CreateRagQueryToolOptions = {}) {
  const maxCalls = options.maxCalls ?? MAX_XIMO_RAG_QUERY_CALLS
  let callsUsed = 0

  return createTool({
    id: 'rag-query',
    description:
      '当上下文不清或需要补充证据时，按问题查询 RAG（KG_RAG_ENDPOINT）。单次西莫运行最多调用 10 次；达上限后应澄清或基于已有证据继续，勿再调用。',
    inputSchema: z.object({
      query: z.string().describe('检索问题或关键词'),
      limit: z.number().int().positive().max(20).optional(),
    }),
    outputSchema: ragQueryResultSchema,
    execute: async (input: QueryRagKnowledgeInput) =>
      runToolWithHooks({
        agent: 'ximo',
        tool: 'rag-query',
        input,
        hooks: defaultToolHooks,
        execute: async (queryInput) => {
          if (callsUsed >= maxCalls) {
            return {
              configured: true,
              message: `本轮 rag-query 已达上限（${maxCalls} 次），请基于已有证据澄清或继续查数，勿再调用。`,
              results: [],
              callsUsed,
              maxCalls,
              limited: true,
            }
          }

          callsUsed += 1
          const result = await queryRagKnowledgeOperation(queryInput)
          return {
            ...result,
            results: result.results ?? [],
            callsUsed,
            maxCalls,
            limited: false,
          }
        },
      }),
  })
}
