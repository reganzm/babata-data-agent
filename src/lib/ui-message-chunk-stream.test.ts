import test from 'node:test'
import assert from 'node:assert/strict'
import { readUIMessageStream } from 'ai'
import { createUiMessageChunkStream } from './ui-message-chunk-stream'

function sseBody(chunks: unknown[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const payload = chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('')
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(payload))
      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      controller.close()
    },
  })
}

test('createUiMessageChunkStream drops data-heartbeat so resume 不会反复重绘', async () => {
  const body = sseBody([
    { type: 'start', messageId: 'msg-1' },
    { type: 'text-start', id: 'text-1' },
    { type: 'text-delta', id: 'text-1', delta: '查询完成' },
    { type: 'data-heartbeat', data: { ts: 1 }, transient: true },
    { type: 'text-end', id: 'text-1' },
    { type: 'finish' },
  ])

  const types: string[] = []
  const reader = createUiMessageChunkStream(body).getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    types.push((value as { type?: string }).type ?? '')
  }

  assert.equal(types.includes('data-heartbeat'), false)
  assert.ok(types.includes('text-delta'))
})

test('createUiMessageChunkStream lets readUIMessageStream apply text deltas', async () => {
  const body = sseBody([
    { type: 'start', messageId: 'msg-1' },
    { type: 'text-start', id: 'text-1' },
    { type: 'text-delta', id: 'text-1', delta: '查询完成' },
    { type: 'text-end', id: 'text-1' },
    { type: 'finish' },
  ])

  const chunkStream = createUiMessageChunkStream(body)
  let lastText = ''
  for await (const message of readUIMessageStream({
    stream: chunkStream,
    message: {
      id: 'msg-1',
      role: 'assistant',
      parts: [],
    },
  })) {
    const textPart = message.parts.find(
      (part) => (part as { type?: string }).type === 'text',
    ) as { type: 'text'; text?: string } | undefined
    if (textPart?.text) lastText = textPart.text
  }

  assert.equal(lastText, '查询完成')
})

test('raw response body without SSE parse does not yield readable text', async () => {
  const body = sseBody([
    { type: 'start', messageId: 'msg-2' },
    { type: 'text-start', id: 'text-2' },
    { type: 'text-delta', id: 'text-2', delta: '不应出现' },
    { type: 'text-end', id: 'text-2' },
    { type: 'finish' },
  ])

  let lastText = ''
  let threw = false
  try {
    for await (const message of readUIMessageStream({
      // 错误用法：直接把 Uint8Array SSE 当作 UIMessageChunk 流
      stream: body as unknown as ReadableStream<never>,
      message: {
        id: 'msg-2',
        role: 'assistant',
        parts: [],
      },
    })) {
      const textPart = message.parts.find(
        (part) => (part as { type?: string }).type === 'text',
      ) as { type: 'text'; text?: string } | undefined
      if (textPart?.text) lastText = textPart.text
    }
  } catch {
    threw = true
  }

  assert.equal(lastText, '')
  // 有的版本会静默失败，有的会抛错；两者都说明原始 body 不可直接消费
  assert.ok(threw || lastText === '')
})
