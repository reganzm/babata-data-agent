import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CONVERSATION_PDF_EXPORT_STORAGE_PREFIX,
  buildConversationPdfExportPayload,
  conversationPdfExportStorageKey,
  conversationPdfFilename,
} from './conversation-pdf-export'
import type { StoredConversation, StoredMessage } from './db/conversations'

const messages: StoredMessage[] = [
  {
    id: 'user-1',
    role: 'user',
    createdAt: '2026-06-05T08:00:00.000Z',
    parts: [{ type: 'text', text: '查 <script>alert(1)</script> 血缘' }],
  },
  {
    id: 'assistant-1',
    role: 'assistant',
    createdAt: '2026-06-05T08:01:00.000Z',
    parts: [
      {
        type: 'text',
        text: '```babata-viz\n{"version":1,"charts":[]}\n```',
      },
    ],
  },
]

const conversation: StoredConversation = {
  id: 'conv-1',
  title: '血缘/查询: guild?',
  type: 'chat',
  createdAt: '2026-06-05T08:00:00.000Z',
  updatedAt: '2026-06-05T08:01:00.000Z',
  messages,
}

test('conversationPdfExportStorageKey creates unique namespaced keys', () => {
  const key = conversationPdfExportStorageKey(
    'conv-1',
    new Date('2026-06-05T08:09:10.000Z'),
  )

  assert.equal(
    key,
    `${CONVERSATION_PDF_EXPORT_STORAGE_PREFIX}conv-1-20260605-160910`,
  )
})

test('conversationPdfFilename creates a safe pdf filename', () => {
  const filename = conversationPdfFilename(
    conversation,
    new Date('2026-06-05T08:09:10.000Z'),
  )

  assert.equal(filename, 'babata-血缘-查询-guild-20260605-160910.pdf')
})

test('buildConversationPdfExportPayload keeps structured conversation data', () => {
  const payload = buildConversationPdfExportPayload(
    conversation,
    new Date('2026-06-05T08:09:10.000Z'),
  )

  assert.equal(payload.version, 1)
  assert.equal(payload.filename, 'babata-血缘-查询-guild-20260605-160910.pdf')
  assert.equal(payload.conversation.title, conversation.title)
  assert.deepEqual(payload.conversation.messages, messages)
})
