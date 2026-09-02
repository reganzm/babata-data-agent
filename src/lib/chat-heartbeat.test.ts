import test from 'node:test'
import assert from 'node:assert/strict'
import type { UIMessage } from '@ai-sdk/react'
import {
  HEARTBEAT_CONTINUE_TEXT,
  HEARTBEAT_MAX_ATTEMPTS,
  HEARTBEAT_TOOL_ERROR,
  countRecentHeartbeatAttempts,
  finalizeIncompleteToolParts,
  fingerprintMessages,
  hasIncompleteToolCall,
  isHeartbeatUserMessage,
  looksInterruptedAssistant,
  shouldStartHeartbeat,
} from './chat-heartbeat'

function message(
  role: UIMessage['role'],
  parts: UIMessage['parts'],
  id = crypto.randomUUID(),
): UIMessage {
  return { id, role, parts }
}

test('isHeartbeatUserMessage 识别心跳续跑文案', () => {
  assert.equal(
    isHeartbeatUserMessage(
      message('user', [{ type: 'text', text: HEARTBEAT_CONTINUE_TEXT }]),
    ),
    true,
  )
  assert.equal(
    isHeartbeatUserMessage(message('user', [{ type: 'text', text: '继续' }])),
    false,
  )
})

test('hasIncompleteToolCall 只认未终态的工具 part', () => {
  assert.equal(
    hasIncompleteToolCall(
      message('assistant', [
        {
          type: 'tool-agent-hundun',
          toolCallId: '1',
          state: 'input-available',
        } as unknown as UIMessage['parts'][number],
      ]),
    ),
    true,
  )
  assert.equal(
    hasIncompleteToolCall(
      message('assistant', [
        {
          type: 'tool-agent-hundun',
          toolCallId: '1',
          state: 'output-available',
        } as unknown as UIMessage['parts'][number],
      ]),
    ),
    false,
  )
})

test('looksInterruptedAssistant 识别只说了要委派却没有完成工具的短回复', () => {
  assert.equal(
    looksInterruptedAssistant(
      message('assistant', [
        { type: 'text', text: '好的，我先收集上下文信息，了解表结构和字段含义。' },
      ]),
    ),
    true,
  )
  assert.equal(
    looksInterruptedAssistant(
      message('assistant', [
        { type: 'text', text: '充值流水如下：本月合计 12 笔。' },
      ]),
    ),
    false,
  )
})

test('looksInterruptedAssistant 识别工具已完成但末尾承诺继续推进的短回复', () => {
  assert.equal(
    looksInterruptedAssistant(
      message('assistant', [
        {
          type: 'tool-describeSourceTable',
          toolCallId: '1',
          state: 'output-available',
        } as unknown as UIMessage['parts'][number],
        { type: 'text', text: '让我进一步查看这两个核心表的字段结构' },
      ]),
    ),
    true,
  )
  assert.equal(
    looksInterruptedAssistant(
      message('assistant', [
        {
          type: 'tool-describeSourceTable',
          toolCallId: '1',
          state: 'output-available',
        } as unknown as UIMessage['parts'][number],
        { type: 'text', text: '字段结构如下，供参考。' },
      ]),
    ),
    false,
  )
})

test('looksInterruptedAssistant 识别工具前导语后无结论的停滞', () => {
  assert.equal(
    looksInterruptedAssistant(
      message('assistant', [
        {
          type: 'text',
          text: '让我先加载相关技能，同时检索知识库和查看数据源中的表。',
        },
        {
          type: 'tool-skill',
          toolCallId: '1',
          state: 'output-available',
        } as unknown as UIMessage['parts'][number],
        {
          type: 'tool-retrieveLocalKnowledge',
          toolCallId: '2',
          state: 'output-available',
        } as unknown as UIMessage['parts'][number],
      ]),
    ),
    true,
  )
  assert.equal(
    looksInterruptedAssistant(
      message('assistant', [
        {
          type: 'tool-describeSourceTable',
          toolCallId: '1',
          state: 'output-available',
        } as unknown as UIMessage['parts'][number],
      ]),
    ),
    true,
  )
})

test('countRecentHeartbeatAttempts 只统计最近一次真实用户消息之后的心跳', () => {
  const messages = [
    message('user', [{ type: 'text', text: '查充值流水' }]),
    message('assistant', [{ type: 'text', text: '开始' }]),
    message('user', [{ type: 'text', text: HEARTBEAT_CONTINUE_TEXT }]),
    message('assistant', [{ type: 'text', text: '继续中' }]),
    message('user', [{ type: 'text', text: HEARTBEAT_CONTINUE_TEXT }]),
  ]
  assert.equal(countRecentHeartbeatAttempts(messages), 2)
})

test('shouldStartHeartbeat：流已结束且工具未完成，空闲超过阈值则立即续跑', () => {
  assert.equal(
    shouldStartHeartbeat({
      status: 'ready',
      hasIncompleteTools: true,
      looksInterrupted: false,
      idleMs: 2000,
      attempts: 0,
      maxAttempts: HEARTBEAT_MAX_ATTEMPTS,
      workflowSuspended: false,
      sessionTouched: true,
      sending: false,
    }),
    'now',
  )
})

test('shouldStartHeartbeat：流式中途无更新超过阈值则续跑', () => {
  assert.equal(
    shouldStartHeartbeat({
      status: 'streaming',
      hasIncompleteTools: true,
      looksInterrupted: false,
      idleMs: 21_000,
      attempts: 0,
      maxAttempts: HEARTBEAT_MAX_ATTEMPTS,
      workflowSuspended: false,
      sessionTouched: true,
      sending: false,
    }),
    'now',
  )
})

test('shouldStartHeartbeat：工具已完成但流未结束，1.5s 即可续跑', () => {
  assert.equal(
    shouldStartHeartbeat({
      status: 'streaming',
      hasIncompleteTools: false,
      looksInterrupted: true,
      idleMs: 1600,
      attempts: 0,
      maxAttempts: HEARTBEAT_MAX_ATTEMPTS,
      workflowSuspended: false,
      sessionTouched: true,
      sending: false,
    }),
    'now',
  )
  assert.equal(
    shouldStartHeartbeat({
      status: 'streaming',
      hasIncompleteTools: false,
      looksInterrupted: true,
      idleMs: 800,
      attempts: 0,
      maxAttempts: HEARTBEAT_MAX_ATTEMPTS,
      workflowSuspended: false,
      sessionTouched: true,
      sending: false,
    }),
    'wait',
  )
})

test('shouldStartHeartbeat：审批挂起、未触达本轮、或次数用尽时不续跑', () => {
  const base = {
    status: 'ready' as const,
    hasIncompleteTools: true,
    looksInterrupted: false,
    idleMs: 5000,
    attempts: 0,
    maxAttempts: HEARTBEAT_MAX_ATTEMPTS,
    workflowSuspended: false,
    sessionTouched: true,
    sending: false,
  }
  assert.equal(shouldStartHeartbeat({ ...base, workflowSuspended: true }), 'no')
  assert.equal(shouldStartHeartbeat({ ...base, sessionTouched: false }), 'no')
  assert.equal(shouldStartHeartbeat({ ...base, attempts: 2 }), 'no')
  assert.equal(shouldStartHeartbeat({ ...base, sending: true }), 'no')
  assert.equal(shouldStartHeartbeat({ ...base, idleMs: 200 }), 'wait')
})

test('finalizeIncompleteToolParts 把调用中的工具标为失败并保留心跳说明', () => {
  const messages = [
    message('assistant', [
      { type: 'text', text: '先收集上下文' },
      {
        type: 'tool-agent-hundun',
        toolCallId: 'h1',
        state: 'input-available',
      } as unknown as UIMessage['parts'][number],
    ]),
  ]
  const next = finalizeIncompleteToolParts(messages, HEARTBEAT_TOOL_ERROR)
  const tool = next[0]?.parts.find((part) => part.type === 'tool-agent-hundun') as {
    state?: string
    errorText?: string
  }
  assert.equal(tool.state, 'output-error')
  assert.equal(tool.errorText, HEARTBEAT_TOOL_ERROR)
})

test('fingerprintMessages 忽略心跳 part，避免空闲计时被心跳重置', () => {
  const withoutHeartbeat = [
    message('assistant', [{ type: 'text', text: '先收集上下文' }], 'a'),
  ]
  const withHeartbeat = [
    message(
      'assistant',
      [
        { type: 'text', text: '先收集上下文' },
        { type: 'data-heartbeat' } as unknown as UIMessage['parts'][number],
      ],
      'a',
    ),
  ]
  assert.equal(fingerprintMessages(withoutHeartbeat), fingerprintMessages(withHeartbeat))
})

test('fingerprintMessages 在工具状态变化时改变', () => {
  const a = [
    message(
      'assistant',
      [
        {
          type: 'tool-agent-hundun',
          toolCallId: 'h1',
          state: 'input-available',
        } as unknown as UIMessage['parts'][number],
      ],
      'a',
    ),
  ]
  const b = [
    message(
      'assistant',
      [
        {
          type: 'tool-agent-hundun',
          toolCallId: 'h1',
          state: 'output-available',
        } as unknown as UIMessage['parts'][number],
      ],
      'a',
    ),
  ]
  assert.notEqual(fingerprintMessages(a), fingerprintMessages(b))
})
