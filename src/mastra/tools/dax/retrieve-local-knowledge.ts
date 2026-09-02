import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { listBoundKnowledgeBaseIds } from '@/lib/db/data-sources'
import { getDaxRuntime } from '@/lib/dax-runtime-context'
import { resolveKnowledgeBaseIdsForDax } from '@/lib/dax-routing'
import { retrieveLocalKnowledge } from '@/lib/knowledge/retrieve'
import { defaultToolHooks, runToolWithHooks } from '@/mastra/tools/hooks'

const parentSchema = z.object({
  headingPath: z.string(),
  content: z.string(),
  childHits: z.number(),
})

export async function retrieveLocalKnowledgeOperation(input: {
  knowledgeBaseIds?: string[]
  query: string
  childLimit?: number
}) {
  const runtime = getDaxRuntime()
  const boundFromRuntime = runtime?.boundKnowledgeBaseIds?.filter(Boolean) ?? []
  const boundEnabledKnowledgeBaseIds =
    boundFromRuntime.length > 0
      ? boundFromRuntime
      : runtime?.selectedDataSourceId
        ? await listBoundKnowledgeBaseIds(
            runtime.selectedDataSourceId,
            runtime.userId ?? null,
          )
        : []
  const knowledgeBaseIds = resolveKnowledgeBaseIdsForDax({
    selectedDataSourceId: runtime?.selectedDataSourceId,
    selectedKnowledgeBaseId: runtime?.selectedKnowledgeBaseId,
    boundEnabledKnowledgeBaseIds,
  })
  const explicit = (input.knowledgeBaseIds ?? []).filter(Boolean)
  const ids = explicit.length > 0 ? explicit : knowledgeBaseIds
  if (ids.length === 0) {
    return {
      parents: [],
      message: '当前没有可检索的知识库。请先选择知识库，或为数据源绑定已启用的知识库。',
    }
  }
  const result = await retrieveLocalKnowledge({
    knowledgeBaseIds: ids,
    query: input.query,
    childLimit: input.childLimit,
  })
  return {
    ...result,
    message:
      result.parents.length === 0
        ? '本地知识库未检索到相关父块，请换关键词或确认文档已解析成功。'
        : `已召回 ${result.parents.length} 个父块。`,
  }
}

export const retrieveLocalKnowledgeTool = createTool({
  id: 'retrieve-local-knowledge',
  description:
    '从本地知识库做父子块文本检索：先命中子块，再返回父块全文。只检索当前对话选中或数据源已绑定的知识库。',
  inputSchema: z.object({
    query: z.string().describe('检索问题或关键词'),
    knowledgeBaseIds: z.array(z.string()).optional(),
    childLimit: z.number().int().positive().max(40).optional(),
  }),
  outputSchema: z.object({
    parents: z.array(parentSchema),
    message: z.string(),
  }),
  execute: async (input) =>
    runToolWithHooks({
      agent: 'dax',
      tool: 'retrieve-local-knowledge',
      input,
      hooks: defaultToolHooks,
      execute: retrieveLocalKnowledgeOperation,
    }),
})
