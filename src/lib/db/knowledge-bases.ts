import { mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { ensureSchema } from './schema'
import { getDbClient } from './client'
import type { InValue } from '@libsql/client'
import { chunkMarkdownDocument } from '@/lib/knowledge/chunk-markdown'

export type BoundDataSourceSummary = {
  id: string
  name: string
  enabled: boolean
  type: string
}

export type KnowledgeBaseRecord = {
  id: string
  userId: string | null
  name: string
  description: string
  enabled: boolean
  sourceType: string
  createdAt: string
  updatedAt: string
  documents: KnowledgeDocumentRecord[]
  boundDataSources: BoundDataSourceSummary[]
}

export type KnowledgeDocumentRecord = {
  id: string
  knowledgeBaseId: string
  filename: string
  storagePath: string
  parseStatus: string
  parseError: string | null
  createdAt: string
}

type KnowledgeBaseRow = {
  id: string
  user_id: string | null
  name: string
  description: string
  enabled: number
  source_type: string
  created_at: string
  updated_at: string
}

type DocumentRow = {
  id: string
  knowledge_base_id: string
  filename: string
  storage_path: string
  parse_status: string
  parse_error: string | null
  created_at: string
}

function userFilter(userId: string | null): { sql: string; args: InValue[] } {
  if (userId) return { sql: 'user_id = ?', args: [userId] }
  return { sql: 'user_id IS NULL', args: [] }
}

function rowToBase(row: KnowledgeBaseRow): Omit<KnowledgeBaseRecord, 'documents' | 'boundDataSources'> {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    description: row.description,
    enabled: Boolean(row.enabled),
    sourceType: row.source_type,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function rowToDocument(row: DocumentRow): KnowledgeDocumentRecord {
  return {
    id: row.id,
    knowledgeBaseId: row.knowledge_base_id,
    filename: row.filename,
    storagePath: row.storage_path,
    parseStatus: row.parse_status,
    parseError: row.parse_error,
    createdAt: row.created_at,
  }
}

export function getKnowledgeUploadMaxBytes(): number {
  const megabytes = Number(process.env.BABATA_KNOWLEDGE_UPLOAD_MAX_MB ?? '5')
  return Math.max(1, megabytes) * 1024 * 1024
}

export async function listKnowledgeBases(
  userId: string | null,
): Promise<KnowledgeBaseRecord[]> {
  await ensureSchema()
  const db = getDbClient()
  const filter = userFilter(userId)
  const result = await db.execute({
    sql: `SELECT id, user_id, name, description, enabled, source_type, created_at, updated_at
          FROM babata_knowledge_bases
          WHERE ${filter.sql}
          ORDER BY updated_at DESC`,
    args: filter.args,
  })
  const bases = (result.rows as unknown as KnowledgeBaseRow[]).map(rowToBase)
  const documents = await listDocumentsForUser(userId)
  const boundDataSources = await listBoundDataSourceSummariesForUser(userId)
  return bases.map((base) => ({
    ...base,
    documents: documents.get(base.id) ?? [],
    boundDataSources: boundDataSources.get(base.id) ?? [],
  }))
}

export async function getKnowledgeBaseById(
  id: string,
  userId: string | null,
): Promise<KnowledgeBaseRecord | null> {
  await ensureSchema()
  const db = getDbClient()
  const filter = userFilter(userId)
  const result = await db.execute({
    sql: `SELECT id, user_id, name, description, enabled, source_type, created_at, updated_at
          FROM babata_knowledge_bases
          WHERE id = ? AND ${filter.sql}`,
    args: [id, ...filter.args],
  })
  const row = result.rows[0] as unknown as KnowledgeBaseRow | undefined
  if (!row) return null
  const documents = await listDocuments(id)
  const boundDataSources = await listBoundDataSourceSummaries(id, userId)
  return { ...rowToBase(row), documents, boundDataSources }
}

export async function createKnowledgeBase(
  userId: string | null,
  input: { name: string; description?: string; enabled?: boolean },
): Promise<KnowledgeBaseRecord> {
  await ensureSchema()
  const now = new Date().toISOString()
  const record: KnowledgeBaseRecord = {
    id: crypto.randomUUID(),
    userId,
    name: input.name.trim(),
    description: input.description?.trim() ?? '',
    enabled: input.enabled ?? true,
    sourceType: 'markdown',
    createdAt: now,
    updatedAt: now,
    documents: [],
    boundDataSources: [],
  }
  const db = getDbClient()
  await db.execute({
    sql: `INSERT INTO babata_knowledge_bases
          (id, user_id, name, description, enabled, source_type, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      record.id,
      userId,
      record.name,
      record.description,
      record.enabled ? 1 : 0,
      record.sourceType,
      record.createdAt,
      record.updatedAt,
    ],
  })
  return record
}

export async function updateKnowledgeBase(
  id: string,
  userId: string | null,
  input: { name?: string; description?: string; enabled?: boolean },
): Promise<KnowledgeBaseRecord | null> {
  const existing = await getKnowledgeBaseById(id, userId)
  if (!existing) return null
  const next = {
    ...existing,
    name: input.name?.trim() ?? existing.name,
    description: input.description?.trim() ?? existing.description,
    enabled: input.enabled ?? existing.enabled,
    updatedAt: new Date().toISOString(),
  }
  const db = getDbClient()
  await db.execute({
    sql: `UPDATE babata_knowledge_bases
          SET name = ?, description = ?, enabled = ?, updated_at = ?
          WHERE id = ?`,
    args: [next.name, next.description, next.enabled ? 1 : 0, next.updatedAt, id],
  })
  return next
}

export async function deleteKnowledgeBase(
  id: string,
  userId: string | null,
): Promise<boolean> {
  const existing = await getKnowledgeBaseById(id, userId)
  if (!existing) return false
  for (const document of existing.documents) {
    await deleteDocumentArtifacts(document.id, document.storagePath)
  }
  const db = getDbClient()
  await db.execute({
    sql: `DELETE FROM babata_data_source_knowledge_bindings WHERE knowledge_base_id = ?`,
    args: [id],
  })
  await db.execute({
    sql: `DELETE FROM babata_knowledge_bases WHERE id = ?`,
    args: [id],
  })
  await rm(path.join('data', 'knowledge', userId ?? 'anonymous', id), {
    recursive: true,
    force: true,
  })
  return true
}

export async function addMarkdownDocument(
  knowledgeBaseId: string,
  userId: string | null,
  input: { filename: string; content: string },
): Promise<KnowledgeDocumentRecord> {
  const base = await getKnowledgeBaseById(knowledgeBaseId, userId)
  if (!base) throw new Error('知识库不存在')
  if (!input.filename.toLowerCase().endsWith('.md')) {
    throw new Error('一期只支持 Markdown 文件')
  }
  const bytes = Buffer.byteLength(input.content, 'utf8')
  if (bytes > getKnowledgeUploadMaxBytes()) {
    throw new Error('文件超过上传大小上限')
  }

  const documentId = crypto.randomUUID()
  const storagePath = path.join(
    'data',
    'knowledge',
    userId ?? 'anonymous',
    knowledgeBaseId,
    `${documentId}.md`,
  )
  await mkdir(path.dirname(storagePath), { recursive: true })
  await writeFile(storagePath, input.content, 'utf8')
  const createdAt = new Date().toISOString()
  const db = getDbClient()
  await db.execute({
    sql: `INSERT INTO babata_knowledge_documents
          (id, knowledge_base_id, filename, storage_path, parse_status, parse_error, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      documentId,
      knowledgeBaseId,
      input.filename,
      storagePath,
      'pending',
      null,
      createdAt,
    ],
  })
  try {
    await parseAndIndexDocument(documentId, input.content)
    return {
      id: documentId,
      knowledgeBaseId,
      filename: input.filename,
      storagePath,
      parseStatus: 'ready',
      parseError: null,
      createdAt,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '解析失败'
    await db.execute({
      sql: `UPDATE babata_knowledge_documents
            SET parse_status = ?, parse_error = ?
            WHERE id = ?`,
      args: ['failed', message, documentId],
    })
    return {
      id: documentId,
      knowledgeBaseId,
      filename: input.filename,
      storagePath,
      parseStatus: 'failed',
      parseError: message,
      createdAt,
    }
  }
}

export async function reparseDocument(
  knowledgeBaseId: string,
  documentId: string,
  userId: string | null,
): Promise<KnowledgeDocumentRecord> {
  const base = await getKnowledgeBaseById(knowledgeBaseId, userId)
  const document = base?.documents.find((item) => item.id === documentId)
  if (!document) throw new Error('文档不存在')
  const { readFile } = await import('node:fs/promises')
  const content = await readFile(document.storagePath, 'utf8')
  await parseAndIndexDocument(documentId, content)
  return { ...document, parseStatus: 'ready', parseError: null }
}

export async function deleteKnowledgeDocument(
  knowledgeBaseId: string,
  documentId: string,
  userId: string | null,
): Promise<boolean> {
  const base = await getKnowledgeBaseById(knowledgeBaseId, userId)
  const document = base?.documents.find((item) => item.id === documentId)
  if (!document) return false
  await deleteDocumentArtifacts(document.id, document.storagePath)
  return true
}

export async function readKnowledgeDocumentContent(
  knowledgeBaseId: string,
  documentId: string,
  userId: string | null,
): Promise<{ filename: string; content: string } | null> {
  const base = await getKnowledgeBaseById(knowledgeBaseId, userId)
  const document = base?.documents.find((item) => item.id === documentId)
  if (!document) return null
  const content = await readFile(document.storagePath, 'utf8')
  return { filename: document.filename, content }
}

async function listDocuments(knowledgeBaseId: string): Promise<KnowledgeDocumentRecord[]> {
  const db = getDbClient()
  const result = await db.execute({
    sql: `SELECT id, knowledge_base_id, filename, storage_path, parse_status, parse_error, created_at
          FROM babata_knowledge_documents
          WHERE knowledge_base_id = ?
          ORDER BY created_at DESC`,
    args: [knowledgeBaseId],
  })
  return (result.rows as unknown as DocumentRow[]).map(rowToDocument)
}

async function listDocumentsForUser(
  userId: string | null,
): Promise<Map<string, KnowledgeDocumentRecord[]>> {
  const db = getDbClient()
  const filter = userFilter(userId)
  const result = await db.execute({
    sql: `SELECT d.id, d.knowledge_base_id, d.filename, d.storage_path, d.parse_status, d.parse_error, d.created_at
          FROM babata_knowledge_documents d
          INNER JOIN babata_knowledge_bases k ON k.id = d.knowledge_base_id
          WHERE ${filter.sql.replace('user_id', 'k.user_id')}`,
    args: filter.args,
  })
  const map = new Map<string, KnowledgeDocumentRecord[]>()
  for (const row of result.rows as unknown as DocumentRow[]) {
    const document = rowToDocument(row)
    const list = map.get(document.knowledgeBaseId) ?? []
    list.push(document)
    map.set(document.knowledgeBaseId, list)
  }
  return map
}

export function mapDataSourceBindingSummaryRows(
  rows: {
    knowledge_base_id: string
    id: string
    name: string | null
    enabled: number | null
    type: string | null
  }[],
): Map<string, BoundDataSourceSummary[]> {
  const map = new Map<string, BoundDataSourceSummary[]>()
  for (const row of rows) {
    const list = map.get(row.knowledge_base_id) ?? []
    list.push({
      id: row.id,
      name: row.name?.trim() || '未知数据源',
      enabled: Boolean(row.enabled),
      type: row.type?.trim() || 'unknown',
    })
    map.set(row.knowledge_base_id, list)
  }
  return map
}

export async function listBoundDataSourceSummaries(
  knowledgeBaseId: string,
  userId: string | null,
): Promise<BoundDataSourceSummary[]> {
  await ensureSchema()
  const db = getDbClient()
  const filter = userFilter(userId)
  const result = await db.execute({
    sql: `SELECT b.knowledge_base_id, b.data_source_id AS id, d.name, d.enabled, d.type
          FROM babata_data_source_knowledge_bindings b
          LEFT JOIN babata_data_sources d ON d.id = b.data_source_id
          WHERE b.knowledge_base_id = ? AND b.${filter.sql}
          ORDER BY d.name ASC`,
    args: [knowledgeBaseId, ...filter.args],
  })
  return (
    mapDataSourceBindingSummaryRows(
      result.rows as unknown as {
        knowledge_base_id: string
        id: string
        name: string | null
        enabled: number | null
        type: string | null
      }[],
    ).get(knowledgeBaseId) ?? []
  )
}

async function listBoundDataSourceSummariesForUser(
  userId: string | null,
): Promise<Map<string, BoundDataSourceSummary[]>> {
  const db = getDbClient()
  const filter = userFilter(userId)
  const result = await db.execute({
    sql: `SELECT b.knowledge_base_id, b.data_source_id AS id, d.name, d.enabled, d.type
          FROM babata_data_source_knowledge_bindings b
          LEFT JOIN babata_data_sources d ON d.id = b.data_source_id
          WHERE b.${filter.sql}
          ORDER BY d.name ASC`,
    args: filter.args,
  })
  return mapDataSourceBindingSummaryRows(
    result.rows as unknown as {
      knowledge_base_id: string
      id: string
      name: string | null
      enabled: number | null
      type: string | null
    }[],
  )
}

async function parseAndIndexDocument(documentId: string, markdown: string): Promise<void> {
  const db = getDbClient()
  await deleteDocumentChunks(documentId)
  const { parents, children } = chunkMarkdownDocument(markdown)
  const parentIds: string[] = []
  for (const [index, parent] of parents.entries()) {
    const parentId = crypto.randomUUID()
    parentIds.push(parentId)
    await db.execute({
      sql: `INSERT INTO babata_knowledge_parent_chunks
            (id, document_id, heading_path, content, sort_order)
            VALUES (?, ?, ?, ?, ?)`,
      args: [parentId, documentId, parent.headingPath, parent.content, index],
    })
  }
  for (const [index, child] of children.entries()) {
    const parentId = parentIds[child.parentIndex]
    if (!parentId) continue
    const childId = crypto.randomUUID()
    await db.execute({
      sql: `INSERT INTO babata_knowledge_child_chunks (id, parent_id, content, sort_order)
            VALUES (?, ?, ?, ?)`,
      args: [childId, parentId, child.content, index],
    })
    await db.execute({
      sql: `INSERT INTO babata_knowledge_child_fts (content, child_id, parent_id)
            VALUES (?, ?, ?)`,
      args: [child.content, childId, parentId],
    })
  }
  await db.execute({
    sql: `UPDATE babata_knowledge_documents
          SET parse_status = ?, parse_error = NULL
          WHERE id = ?`,
    args: ['ready', documentId],
  })
}

async function deleteDocumentArtifacts(
  documentId: string,
  storagePath: string,
): Promise<void> {
  await deleteDocumentChunks(documentId)
  const db = getDbClient()
  await db.execute({
    sql: `DELETE FROM babata_knowledge_documents WHERE id = ?`,
    args: [documentId],
  })
  await rm(storagePath, { force: true })
}

async function deleteDocumentChunks(documentId: string): Promise<void> {
  const db = getDbClient()
  const parents = await db.execute({
    sql: `SELECT id FROM babata_knowledge_parent_chunks WHERE document_id = ?`,
    args: [documentId],
  })
  for (const row of parents.rows as unknown as { id: string }[]) {
    await db.execute({
      sql: `DELETE FROM babata_knowledge_child_fts WHERE parent_id = ?`,
      args: [row.id],
    })
    await db.execute({
      sql: `DELETE FROM babata_knowledge_child_chunks WHERE parent_id = ?`,
      args: [row.id],
    })
  }
  await db.execute({
    sql: `DELETE FROM babata_knowledge_parent_chunks WHERE document_id = ?`,
    args: [documentId],
  })
}
