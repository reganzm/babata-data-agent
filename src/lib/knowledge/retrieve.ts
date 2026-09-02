import { ensureSchema } from '@/lib/db/schema'
import { getDbClient } from '@/lib/db/client'

export type RetrievedParent = {
  headingPath: string
  content: string
  childHits: number
}

export function buildFtsQuery(raw: string): string {
  const normalized = raw.replace(/["']/g, ' ').trim()
  if (!normalized) return ''

  const tokens = normalized
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0)

  if (tokens.length > 1) {
    return tokens.map((token) => `"${token.replace(/"/g, '')}"`).join(' OR ')
  }

  const single = tokens[0] ?? normalized
  const chars = [...single].filter((char) => /\S/u.test(char))
  if (chars.length <= 1) {
    return `"${single.replace(/"/g, '')}"`
  }

  return chars.map((char) => `"${char.replace(/"/g, '')}"`).join(' OR ')
}

export function uniqueParentIds(hits: Array<{ parentId: string }>): string[] {
  const seen = new Set<string>()
  const ordered: string[] = []
  for (const hit of hits) {
    if (seen.has(hit.parentId)) continue
    seen.add(hit.parentId)
    ordered.push(hit.parentId)
  }
  return ordered
}

export async function retrieveLocalKnowledge(input: {
  knowledgeBaseIds: string[]
  query: string
  childLimit?: number
}): Promise<{ parents: RetrievedParent[] }> {
  const knowledgeBaseIds = input.knowledgeBaseIds.filter(Boolean)
  const ftsQuery = buildFtsQuery(input.query)
  if (knowledgeBaseIds.length === 0 || !ftsQuery) {
    return { parents: [] }
  }

  await ensureSchema()
  const db = getDbClient()
  const limit = Math.min(Math.max(input.childLimit ?? 12, 1), 40)
  const placeholders = knowledgeBaseIds.map(() => '?').join(', ')
  const result = await db.execute({
    sql: `SELECT f.parent_id AS parentId
          FROM babata_knowledge_child_fts f
          INNER JOIN babata_knowledge_parent_chunks p ON p.id = f.parent_id
          INNER JOIN babata_knowledge_documents d ON d.id = p.document_id
          WHERE d.knowledge_base_id IN (${placeholders})
            AND babata_knowledge_child_fts MATCH ?
          LIMIT ?`,
    args: [...knowledgeBaseIds, ftsQuery, limit],
  })
  const hits = result.rows as unknown as { parentId: string }[]
  const parentIds = uniqueParentIds(hits)
  if (parentIds.length === 0) return { parents: [] }

  const parentPlaceholders = parentIds.map(() => '?').join(', ')
  const parentRows = await db.execute({
    sql: `SELECT id, heading_path, content
          FROM babata_knowledge_parent_chunks
          WHERE id IN (${parentPlaceholders})`,
    args: parentIds,
  })
  const byId = new Map(
    (parentRows.rows as unknown as {
      id: string
      heading_path: string
      content: string
    }[]).map((row) => [row.id, row]),
  )
  const counts = new Map<string, number>()
  for (const hit of hits) {
    counts.set(hit.parentId, (counts.get(hit.parentId) ?? 0) + 1)
  }
  return {
    parents: parentIds.flatMap((id) => {
      const row = byId.get(id)
      if (!row) return []
      return [
        {
          headingPath: row.heading_path,
          content: row.content,
          childHits: counts.get(id) ?? 0,
        },
      ]
    }),
  }
}
