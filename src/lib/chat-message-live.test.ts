import test from 'node:test'
import assert from 'node:assert/strict'
import {
  assistantDisplaySignature,
  findLastAssistantMessageId,
  getAssistantMotionInitial,
  isLiveAssistantMessage,
  messagesDisplaySignature,
} from './chat-message-live'

test('findLastAssistantMessageId 返回最后一条助手消息', () => {
  assert.equal(
    findLastAssistantMessageId([
      { id: 'u1', role: 'user' },
      { id: 'a1', role: 'assistant' },
      { id: 'a2', role: 'assistant' },
      { id: 'u2', role: 'user' },
    ]),
    'a2',
  )
})

test('只有正在流式输出的最后一条助手消息才算 live', () => {
  assert.equal(isLiveAssistantMessage('streaming', 'a2', 'a2'), true)
  assert.equal(isLiveAssistantMessage('streaming', 'a1', 'a2'), false)
  assert.equal(isLiveAssistantMessage('ready', 'a2', 'a2'), false)
  assert.equal(isLiveAssistantMessage('streaming', 'a2', undefined), false)
})

test('助手气泡不因 live 状态重播入场动画', () => {
  assert.equal(getAssistantMotionInitial(true), false)
  assert.equal(getAssistantMotionInitial(false), false)
})

test('展示签名忽略心跳 part，避免无内容变化也触发重绘', () => {
  const base = [
    { type: 'text', text: '已确认查询' },
    { type: 'tool-agent-hundun', state: 'input-available', toolCallId: 'h1' },
  ]
  const withHeartbeat = [
    ...base,
    { type: 'data-heartbeat', data: { ts: 1 } },
  ]
  assert.equal(
    assistantDisplaySignature(base),
    assistantDisplaySignature(withHeartbeat),
  )
  assert.equal(
    messagesDisplaySignature([{ id: 'a1', role: 'assistant', parts: base }]),
    messagesDisplaySignature([
      { id: 'a1', role: 'assistant', parts: withHeartbeat },
    ]),
  )
})
