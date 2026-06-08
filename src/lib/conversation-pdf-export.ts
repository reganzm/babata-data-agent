import type { StoredConversation } from '@/lib/db/conversations'

export const CONVERSATION_PDF_EXPORT_STORAGE_PREFIX =
  'babata:conversation-pdf-export:'

export type ConversationPdfExportPayload = {
  version: 1
  filename: string
  exportedAt: string
  conversation: StoredConversation
}

function sanitizeFilenamePart(value: string): string {
  const normalized = value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return normalized.slice(0, 80) || 'untitled'
}

function formatTimestampForFilename(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('')
}

export function conversationPdfFilename(
  conversation: Pick<StoredConversation, 'title' | 'createdAt'>,
  date = new Date(),
): string {
  const title = sanitizeFilenamePart(conversation.title || '新对话')
  return `babata-${title}-${formatTimestampForFilename(date)}.pdf`
}

export function conversationPdfExportStorageKey(
  conversationId: string,
  date = new Date(),
): string {
  return `${CONVERSATION_PDF_EXPORT_STORAGE_PREFIX}${sanitizeFilenamePart(
    conversationId,
  )}-${formatTimestampForFilename(date)}`
}

export function buildConversationPdfExportPayload(
  conversation: StoredConversation,
  date = new Date(),
): ConversationPdfExportPayload {
  return {
    version: 1,
    filename: conversationPdfFilename(conversation, date),
    exportedAt: date.toISOString(),
    conversation,
  }
}
