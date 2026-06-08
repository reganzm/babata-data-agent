import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildMessagesUpdatePayload,
  sortConversations,
  type StoredConversation,
  type StoredMessage,
} from './conversation-store'

const messages: StoredMessage[] = [
  {
    id: 'user-1',
    role: 'user',
    parts: [{ type: 'text', text: '标准分析报告：帮我分析语音房日维度数据' }],
  },
]

test('message persistence payload omits stale workflow metadata', () => {
  const payload = buildMessagesUpdatePayload(messages, {
    title: '旧标题',
    metadata: {
      activeWorkflowRunId: 'workflow-run-1',
      pendingApproval: {
        workflowId: 'data-analysis-report',
        workflowRunId: 'workflow-run-1',
        payload: {
          approvalType: 'intent-clarification',
        },
      },
    },
  })

  assert.deepEqual(payload, {
    messages,
    title: '标准分析报告：帮我分析语音房日维度数据',
  })
  assert.equal('metadata' in payload, false)
})

function conversation(
  id: string,
  params: {
    createdAt: string
    updatedAt?: string
    pinnedAt?: string
  },
): StoredConversation {
  return {
    id,
    title: id,
    type: 'chat',
    createdAt: params.createdAt,
    updatedAt: params.updatedAt ?? params.createdAt,
    pinnedAt: params.pinnedAt,
    messages: [],
  }
}

test('sortConversations orders pinned by pin time then others by create time', () => {
  const sorted = sortConversations([
    conversation('old-updated-recently', {
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-04T00:00:00.000Z',
    }),
    conversation('newer-created', {
      createdAt: '2026-06-03T00:00:00.000Z',
      updatedAt: '2026-06-03T00:00:00.000Z',
    }),
    conversation('pinned-old', {
      createdAt: '2026-06-01T00:00:00.000Z',
      pinnedAt: '2026-06-02T00:00:00.000Z',
    }),
    conversation('pinned-new', {
      createdAt: '2026-06-02T00:00:00.000Z',
      pinnedAt: '2026-06-04T00:00:00.000Z',
    }),
  ])

  assert.deepEqual(
    sorted.map((item) => item.id),
    ['pinned-new', 'pinned-old', 'newer-created', 'old-updated-recently'],
  )
})
