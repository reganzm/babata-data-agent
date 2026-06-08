import type { UIMessage } from '@ai-sdk/react'
import {
  generateTitle as dbGenerateTitle,
  type ConversationMetadata,
  type StoredConversation,
  type StoredMessage,
} from '@/lib/db/conversations'
import { slimStoredMessageParts } from '@/lib/message-persist-slim'

export type { ConversationMetadata, StoredConversation, StoredMessage }

export { generateTitle } from '@/lib/db/conversations'

async function parseJson<T>(res: Response): Promise<T> {
  const data = (await res.json()) as T & { error?: string }
  if (!res.ok) {
    throw new Error(
      typeof data === 'object' && data && 'error' in data && data.error
        ? String(data.error)
        : `请求失败 (${res.status})`,
    )
  }
  return data
}

export async function fetchAllConversations(): Promise<StoredConversation[]> {
  const data = await parseJson<{ conversations: StoredConversation[] }>(
    await fetch('/api/conversations'),
  )
  return data.conversations
}

export async function fetchConversationById(
  id: string,
): Promise<StoredConversation | null> {
  try {
    const data = await parseJson<{ conversation: StoredConversation }>(
      await fetch(`/api/conversations/${id}`),
    )
    return data.conversation
  } catch {
    return null
  }
}

export async function createConversationRemote(): Promise<StoredConversation> {
  const data = await parseJson<{ conversation: StoredConversation }>(
    await fetch('/api/conversations', { method: 'POST' }),
  )
  return data.conversation
}

export async function updateConversationRemote(
  id: string,
  updates: {
    title?: string
    messages?: StoredMessage[]
    metadata?: ConversationMetadata
    pinned?: boolean
  },
): Promise<StoredConversation | null> {
  try {
    const data = await parseJson<{ conversation: StoredConversation }>(
      await fetch(`/api/conversations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      }),
    )
    return data.conversation
  } catch {
    return null
  }
}

export function buildMessagesUpdatePayload(
  messages: StoredMessage[],
  existing?: Pick<StoredConversation, 'title' | 'metadata'> | null,
): {
  title: string
  messages: StoredMessage[]
} {
  const autoTitle = buildTitleFromMessages(messages)
  const title = existing?.metadata?.titleEdited
    ? (existing.title || autoTitle)
    : autoTitle
  return { messages, title }
}

export async function deleteConversationRemote(id: string): Promise<void> {
  const res = await fetch(`/api/conversations/${id}`, { method: 'DELETE' })
  // 幂等删除：已不存在(404)视为删除成功，避免前端未捕获异常
  if (!res.ok && res.status !== 204 && res.status !== 404) {
    await parseJson(res)
  }
}

export function toStoredMessage(message: UIMessage): StoredMessage {
  return {
    id: message.id,
    role: message.role as StoredMessage['role'],
    parts: slimStoredMessageParts(message.parts) as StoredMessage['parts'],
  }
}

export function toInitialMessage(stored: StoredMessage): UIMessage {
  return {
    id: stored.id,
    role: stored.role,
    parts: stored.parts as UIMessage['parts'],
  }
}

export function buildTitleFromMessages(messages: StoredMessage[]): string {
  return dbGenerateTitle(messages)
}

/** 置顶优先；置顶按置顶时间倒序，其它按创建时间倒序 */
export function sortConversations(
  conversations: StoredConversation[],
): StoredConversation[] {
  return [...conversations].sort((a, b) => {
    const aPinned = a.pinnedAt ? new Date(a.pinnedAt).getTime() : 0
    const bPinned = b.pinnedAt ? new Date(b.pinnedAt).getTime() : 0
    if (aPinned !== bPinned) return bPinned - aPinned
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })
}
