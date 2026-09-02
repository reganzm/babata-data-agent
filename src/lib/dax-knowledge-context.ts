import { listBoundKnowledgeBaseIds } from '@/lib/db/data-sources'
import {
  retrieveLocalKnowledge,
  type RetrievedParent,
} from '@/lib/knowledge/retrieve'
import {
  resolveKnowledgeBaseIdsForDax,
  type DaxRouteSelection,
} from '@/lib/dax-routing'

export async function resolveDaxKnowledgeBaseIds(
  selection: DaxRouteSelection,
  userId: string | null,
): Promise<string[]> {
  const dataSourceId = selection.selectedDataSourceId?.trim()
  const boundEnabledKnowledgeBaseIds = dataSourceId
    ? await listBoundKnowledgeBaseIds(dataSourceId, userId)
    : []
  return resolveKnowledgeBaseIdsForDax({
    selectedDataSourceId: selection.selectedDataSourceId,
    selectedKnowledgeBaseId: selection.selectedKnowledgeBaseId,
    boundEnabledKnowledgeBaseIds,
  })
}

export function formatRetrievedParentsForPrompt(
  parents: RetrievedParent[],
  options?: { maxChars?: number },
): string {
  const maxChars = options?.maxChars ?? 12_000
  const parts: string[] = []
  let used = 0

  for (const parent of parents) {
    const heading = parent.headingPath.trim() || '未命名章节'
    const block = `### ${heading}\n${parent.content.trim()}`
    if (used > 0 && used + block.length + 2 > maxChars) break
    parts.push(block)
    used += block.length + (used > 0 ? 2 : 0)
  }

  return parts.join('\n\n')
}

export async function prefetchDaxKnowledgeContext(input: {
  selection: DaxRouteSelection
  userId: string | null
  query: string | null
}): Promise<{
  knowledgeBaseIds: string[]
  prefetchedKnowledgeContext: string
  parentCount: number
}> {
  const knowledgeBaseIds = await resolveDaxKnowledgeBaseIds(
    input.selection,
    input.userId,
  )
  if (knowledgeBaseIds.length === 0) {
    return {
      knowledgeBaseIds: [],
      prefetchedKnowledgeContext: '',
      parentCount: 0,
    }
  }

  const query = input.query?.trim()
  if (!query) {
    return {
      knowledgeBaseIds,
      prefetchedKnowledgeContext: '',
      parentCount: 0,
    }
  }

  const { parents } = await retrieveLocalKnowledge({
    knowledgeBaseIds,
    query,
  })
  return {
    knowledgeBaseIds,
    prefetchedKnowledgeContext: formatRetrievedParentsForPrompt(parents),
    parentCount: parents.length,
  }
}

export function buildPrefetchedKnowledgeInstructionBlock(input: {
  knowledgeBaseIds: string[]
  prefetchedKnowledgeContext: string
}): string {
  if (input.knowledgeBaseIds.length === 0) return ''

  if (!input.prefetchedKnowledgeContext.trim()) {
    return [
      '## 预检索知识库（数据源绑定库）',
      `- 已绑定 ${input.knowledgeBaseIds.length} 个已启用知识库（ID：${input.knowledgeBaseIds.map((id) => `\`${id}\``).join('、')}）。`,
      '- 当前用户问题未自动命中父块。编写 SQL 或回答口径前，必须先调用 retrieve-local-knowledge，再查表或出数。',
    ].join('\n')
  }

  return [
    '## 预检索知识库（数据源绑定库，系统已自动召回）',
    `- 检索范围：${input.knowledgeBaseIds.length} 个绑定知识库。`,
    '- 以下内容来自本地 RAG 父块召回。编写 SQL、解释字段口径、选择目标表时必须先依据以下内容；不足时再调用 retrieve-local-knowledge 补充。',
    '',
    input.prefetchedKnowledgeContext.trim(),
  ].join('\n')
}
