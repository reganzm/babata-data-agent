import { z } from 'zod'
import { slimStoredMessageParts } from '@/lib/message-persist-slim'
import { ensureSchema } from './schema'
import { getDbClient } from './client'
import type { InStatement } from '@libsql/client'
import { toPersistedMessageId } from './persist-message-id'

const storedMessageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant', 'system']),
  parts: z.array(z.unknown()),
  createdAt: z.string().optional(),
})

export const conversationMetadataSchema = z.object({
  activeWorkflowRunId: z.string().optional(),
  pendingApproval: z
    .object({
      workflowId: z.string(),
      payload: z.unknown(),
      /** 巴巴塔 agent runId，用于 POST /api/chat resume */
      agentRunId: z.string().optional(),
      /** workflow runId（data-tool-workflow 流里的 id） */
      workflowRunId: z.string().optional(),
    })
    .optional(),
  /** 用户手动改过标题后，不再被首条消息自动覆盖 */
  titleEdited: z.boolean().optional(),
  selectedDataSourceId: z.string().optional(),
  selectedKnowledgeBaseId: z.string().optional(),
  chatMode: z.enum(['agent', 'plan']).optional(),
})

export type ConversationMetadata = z.infer<typeof conversationMetadataSchema>

export const storedConversationSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: z.enum(['chat']).default('chat'),
  metadata: conversationMetadataSchema.optional(),
  pinnedAt: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  messages: z.array(storedMessageSchema),
})

export type StoredMessage = z.infer<typeof storedMessageSchema>
export type StoredConversation = z.infer<typeof storedConversationSchema>

type ConversationRow = {
  id: string
  title: string
  type: string
  metadata: string
  created_at: string
  updated_at: string
  pinned_at: string | null
}

type MessageRow = {
  id: string
  conversation_id: string
  role: string
  parts: string
  sort_order: number
  created_at: string | null
}

function parseMetadata(raw: string): ConversationMetadata | undefined {
  try {
    const parsed = JSON.parse(raw || '{}') as unknown
    const result = conversationMetadataSchema.safeParse(parsed)
    return result.success ? result.data : undefined
  } catch {
    return undefined
  }
}

function rowToConversation(
  row: ConversationRow,
  messages: StoredMessage[],
): StoredConversation {
  return {
    id: row.id,
    title: row.title,
    type: 'chat',
    metadata: parseMetadata(row.metadata),
    pinnedAt: row.pinned_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    messages,
  }
}

function parseMessages(rows: MessageRow[]): StoredMessage[] {
  return rows.map((row) => {
    const parts = JSON.parse(row.parts) as unknown[]
    return {
      id: row.id,
      role: row.role as StoredMessage['role'],
      parts,
      ...(row.created_at ? { createdAt: row.created_at } : {}),
    }
  })
}

async function loadMessages(conversationId: string): Promise<StoredMessage[]> {
  const db = getDbClient()
  const result = await db.execute({
    sql: `SELECT id, conversation_id, role, parts, sort_order, created_at
          FROM babata_messages
          WHERE conversation_id = ?
          ORDER BY sort_order ASC`,
    args: [conversationId],
  })
  return parseMessages(result.rows as unknown as MessageRow[])
}

export async function listConversations(
  userId: string | null,
): Promise<StoredConversation[]> {
  await ensureSchema()
  const db = getDbClient()
  const result = userId
    ? await db.execute({
        sql: `SELECT id, title, type, metadata, created_at, updated_at, pinned_at
     FROM babata_conversations
     WHERE user_id = ?
     ORDER BY (pinned_at IS NULL), pinned_at DESC, created_at DESC`,
        args: [userId],
      })
    : await db.execute(
        `SELECT id, title, type, metadata, created_at, updated_at, pinned_at
     FROM babata_conversations
     ORDER BY (pinned_at IS NULL), pinned_at DESC, created_at DESC`,
      )
  const rows = result.rows as unknown as ConversationRow[]
  const conversations: StoredConversation[] = []
  for (const row of rows) {
    const messages = await loadMessages(row.id)
    conversations.push(rowToConversation(row, messages))
  }
  return conversations
}

export async function getConversationById(
  id: string,
  userId: string | null,
): Promise<StoredConversation | null> {
  await ensureSchema()
  const db = getDbClient()
  const result = userId
    ? await db.execute({
        sql: `SELECT id, title, type, metadata, created_at, updated_at, pinned_at
          FROM babata_conversations WHERE id = ? AND user_id = ?`,
        args: [id, userId],
      })
    : await db.execute({
        sql: `SELECT id, title, type, metadata, created_at, updated_at, pinned_at
          FROM babata_conversations WHERE id = ?`,
        args: [id],
      })
  const row = result.rows[0] as unknown as ConversationRow | undefined
  if (!row) return null
  const messages = await loadMessages(id)
  return rowToConversation(row, messages)
}

export async function createConversation(
  userId: string | null,
): Promise<StoredConversation> {
  await ensureSchema()
  const now = new Date().toISOString()
  const conversation: StoredConversation = {
    id: crypto.randomUUID(),
    title: '',
    type: 'chat',
    createdAt: now,
    updatedAt: now,
    messages: [],
  }
  const db = getDbClient()
  await db.execute({
    sql: `INSERT INTO babata_conversations (id, title, type, metadata, created_at, updated_at, pinned_at, user_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      conversation.id,
      conversation.title,
      conversation.type,
      '{}',
      conversation.createdAt,
      conversation.updatedAt,
      null,
      userId,
    ],
  })
  return conversation
}

export async function updateConversation(
  id: string,
  userId: string | null,
  updates: {
    title?: string
    messages?: StoredMessage[]
    metadata?: ConversationMetadata
    pinned?: boolean
  },
): Promise<StoredConversation | null> {
  await ensureSchema()
  const existing = await getConversationById(id, userId)
  if (!existing) return null

  const title = updates.title ?? existing.title
  const messages = updates.messages ?? existing.messages
  const metadata = updates.metadata ?? existing.metadata ?? {}
  const updatedAt = new Date().toISOString()
  let pinnedAt = existing.pinnedAt ?? null
  if (updates.pinned === true) {
    pinnedAt = updatedAt
  } else if (updates.pinned === false) {
    pinnedAt = null
  }

  const persistedMessages = updates.messages
    ? updates.messages.map((msg) => ({
        ...msg,
        id: toPersistedMessageId(id, msg.id),
      }))
    : messages

  const db = getDbClient()
  const statements: InStatement[] = [
    {
      sql: `UPDATE babata_conversations SET title = ?, metadata = ?, updated_at = ?, pinned_at = ? WHERE id = ?`,
      args: [title, JSON.stringify(metadata), updatedAt, pinnedAt, id],
    },
  ]

  if (updates.messages) {
    statements.push({
      sql: `DELETE FROM babata_messages WHERE conversation_id = ?`,
      args: [id],
    })
    for (let i = 0; i < persistedMessages.length; i++) {
      const msg = persistedMessages[i]
      statements.push({
        sql: `INSERT INTO babata_messages (id, conversation_id, role, parts, sort_order, created_at)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [
          msg.id,
          id,
          msg.role,
          JSON.stringify(slimStoredMessageParts(msg.parts)),
          i,
          msg.createdAt ?? updatedAt,
        ],
      })
    }
  }

  await db.batch(statements, 'write')

  return {
    ...existing,
    title,
    messages: persistedMessages,
    metadata,
    pinnedAt: pinnedAt ?? undefined,
    updatedAt,
  }
}

export async function deleteConversation(
  id: string,
  userId: string | null,
): Promise<boolean> {
  await ensureSchema()
  const db = getDbClient()
  await db.execute({
    sql: `DELETE FROM babata_messages WHERE conversation_id = ?`,
    args: [id],
  })
  const result = userId
    ? await db.execute({
        sql: `DELETE FROM babata_conversations WHERE id = ? AND user_id = ?`,
        args: [id, userId],
      })
    : await db.execute({
        sql: `DELETE FROM babata_conversations WHERE id = ?`,
        args: [id],
      })
  return (result.rowsAffected ?? 0) > 0
}

export function generateTitle(messages: StoredMessage[]): string {
  const firstUserMsg = messages.find((m) => m.role === 'user')
  if (!firstUserMsg) return '新对话'
  const textPart = firstUserMsg.parts.find(
    (p): p is { type: string; text: string } =>
      typeof p === 'object' &&
      p !== null &&
      'type' in p &&
      (p as { type: string }).type === 'text',
  )
  if (!textPart?.text) return '新对话'
  return textPart.text.slice(0, 20) + (textPart.text.length > 20 ? '...' : '')
}
