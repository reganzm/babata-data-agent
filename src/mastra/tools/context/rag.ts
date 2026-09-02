import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { defaultToolHooks, runToolWithHooks } from '@/mastra/tools/hooks'
import { getHundunHttpTimeoutMs } from './http-timeout'

const DEFAULT_KG_RAG_ENDPOINT = 'http://127.0.0.1:8080/v1/sql-context'

const ragResultSchema = z.object({
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
})

export type QueryRagKnowledgeInput = {
  query: string
  limit?: number
}

function resolveKgRagEndpoint(): string {
  return process.env.KG_RAG_ENDPOINT?.trim() || DEFAULT_KG_RAG_ENDPOINT
}

function messageFromUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

export async function queryRagKnowledgeOperation(input: QueryRagKnowledgeInput) {
  const endpoint = resolveKgRagEndpoint()
  const query = input.query.trim()
  if (!query) {
    return {
      configured: true,
      message: 'RAG 检索问题为空，无法查询。',
      results: [],
    }
  }

  let response: Response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(getHundunHttpTimeoutMs()),
    })
  } catch (error) {
    return {
      configured: true,
      message: `RAG 检索请求失败：${messageFromUnknownError(error)}`,
      results: [],
    }
  }

  if (!response.ok) {
    return {
      configured: true,
      message: `RAG 检索请求失败：HTTP ${response.status}`,
      results: [],
    }
  }

  let data: unknown
  try {
    data = await parseResponseBody(response)
  } catch (error) {
    return {
      configured: true,
      message: `RAG 检索响应读取失败：${messageFromUnknownError(error)}`,
      results: [],
    }
  }

  return {
    configured: true,
    message: 'RAG 检索成功。',
    data,
    results: [],
  }
}

export const queryRagKnowledgeTool = createTool({
  id: 'query-rag-knowledge',
  description:
    '查询知识图谱 RAG 检索服务（KG_RAG_ENDPOINT）；按用户问题 POST 检索并原样返回接口 JSON',
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
