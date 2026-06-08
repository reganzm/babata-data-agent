import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { defaultToolHooks, runToolWithHooks } from '@/mastra/tools/hooks'

const ragResultSchema = z.object({
  configured: z.boolean(),
  message: z.string(),
  results: z.array(
    z.object({
      title: z.string().optional(),
      content: z.string(),
      source: z.string().optional(),
      score: z.number().optional(),
    }),
  ),
})

export type QueryRagKnowledgeInput = {
  query: string
  limit?: number
}

export async function queryRagKnowledgeOperation(input: QueryRagKnowledgeInput) {
  const endpoint = process.env.HUNDUN_RAG_ENDPOINT?.trim()
  const result = endpoint
    ? {
        configured: false,
        message: 'RAG 知识库接口已配置，但当前版本尚未接入 HTTP 查询，无法查询。',
        results: [],
      }
    : {
        configured: false,
        message: 'RAG 知识库未配置，无法查询。',
        results: [],
      }
  return result
}

export const queryRagKnowledgeTool = createTool({
  id: 'query-rag-knowledge',
  description: '查询混沌可用的 RAG 知识库；未配置时明确返回不可用',
  inputSchema: z.object({
    query: z.string().describe('检索问题或关键词'),
    limit: z.number().int().positive().max(20).optional(),
  }),
  outputSchema: ragResultSchema,
  execute: async (input) =>
    runToolWithHooks({
      agent: 'hundun',
      tool: 'query-rag-knowledge',
      input,
      hooks: defaultToolHooks,
      execute: queryRagKnowledgeOperation,
    }),
})
