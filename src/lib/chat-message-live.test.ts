import test from 'node:test'
import assert from 'node:assert/strict'
import {
  assistantDisplaySignature,
  findLastAssistantMessageId,
  getAssistantMotionInitial,
  isAssistantMessageBlank,
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

test('只有 step-start/心跳/空文本的助手消息视为空白，不渲染空气泡', () => {
  assert.equal(isAssistantMessageBlank([]), true)
  assert.equal(
    isAssistantMessageBlank([
      { type: 'step-start' },
      { type: 'data-heartbeat' },
      { type: 'text', text: '  \n' },
    ]),
    true,
  )
})

test('含文本、工具调用或未知类型 part 的助手消息不算空白', () => {
  assert.equal(isAssistantMessageBlank([{ type: 'text', text: '你好' }]), false)
  assert.equal(
    isAssistantMessageBlank([{ type: 'step-start' }, { type: 'tool-listSourceTables' }]),
    false,
  )
  assert.equal(isAssistantMessageBlank([{ type: 'data-workflow-progress' }]), false)
})
