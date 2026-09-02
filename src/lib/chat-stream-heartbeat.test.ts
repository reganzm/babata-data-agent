import test from 'node:test'
import assert from 'node:assert/strict'
import type { UIMessageChunk } from 'ai'
import {
  createHeartbeatChunk,
  wrapSseBodyWithHeartbeat,
  wrapStreamWithHeartbeat,
} from './chat-stream-heartbeat'

test('createHeartbeatChunk 使用 data-heartbeat 类型', () => {
  const chunk = createHeartbeatChunk(123)
  assert.equal((chunk as { type?: string }).type, 'data-heartbeat')
})

test('心跳 chunk 必须是 transient，避免写入消息 parts 导致气泡重绘', () => {
  const chunk = createHeartbeatChunk(123) as {
    type?: string
    transient?: boolean
  }
  assert.equal(chunk.transient, true)
})

test('wrapStreamWithHeartbeat 在源流尚未结束时会发出心跳', async () => {
  const stream = new ReadableStream<UIMessageChunk>({
    start(controller) {
      setTimeout(() => {
        controller.enqueue({ type: 'text-delta', id: 't', delta: 'ok' } as UIMessageChunk)
        controller.close()
      }, 45)
    },
  })

  const wrapped = wrapStreamWithHeartbeat(stream, 15)
  const types: string[] = []
  const reader = wrapped.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    types.push((value as { type?: string }).type ?? '')
  }

  assert.ok(types.includes('data-heartbeat'))
  assert.ok(types.includes('text-delta'))
})

test('wrapSseBodyWithHeartbeat 在源流未结束时写入 SSE 注释而不是 data 事件', async () => {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      setTimeout(() => {
        controller.enqueue(encoder.encode('data: {"type":"text-delta"}\n\n'))
        controller.close()
      }, 45)
    },
  })

  const wrapped = wrapSseBodyWithHeartbeat(stream, 15)
  const decoder = new TextDecoder()
  let text = ''
  const reader = wrapped.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    text += decoder.decode(value, { stream: true })
  }

  assert.ok(text.includes(': heartbeat'))
  assert.ok(text.includes('text-delta'))
  assert.equal(text.includes('data-heartbeat'), false)
})
