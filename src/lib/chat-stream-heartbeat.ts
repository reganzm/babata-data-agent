import type { UIMessageChunk } from 'ai'

export const STREAM_HEARTBEAT_INTERVAL_MS = 15_000

function isHeartbeatChunk(chunk: UIMessageChunk): boolean {
  return (chunk as { type?: string }).type === 'data-heartbeat'
}

export function createHeartbeatChunk(ts = Date.now()): UIMessageChunk {
  return {
    type: 'data-heartbeat',
    data: { ts },
    transient: true,
  } as UIMessageChunk
}

const SSE_COMMENT_HEARTBEAT = ': heartbeat\n\n'

/** 在 SSE 字节流上写注释心跳，不进入 useChat 消息，避免气泡重绘 */
export function wrapSseBodyWithHeartbeat(
  body: ReadableStream<Uint8Array>,
  intervalMs = STREAM_HEARTBEAT_INTERVAL_MS,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = body.getReader()
      const timer = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(SSE_COMMENT_HEARTBEAT))
        } catch {
          clearInterval(timer)
        }
      }, intervalMs)
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (value !== undefined) controller.enqueue(value)
        }
        controller.close()
      } catch (error) {
        controller.error(error)
      } finally {
        clearInterval(timer)
        reader.releaseLock()
      }
    },
    async cancel(reason) {
      await body.cancel(reason).catch(() => {})
    },
  })
}

/** 在源流通期间定期写入心跳 chunk，避免代理/浏览器把长工具调用当成断流 */
export function wrapStreamWithHeartbeat(
  stream: ReadableStream<UIMessageChunk>,
  intervalMs = STREAM_HEARTBEAT_INTERVAL_MS,
): ReadableStream<UIMessageChunk> {
  return new ReadableStream<UIMessageChunk>({
    async start(controller) {
      const reader = stream.getReader()
      const timer = setInterval(() => {
        try {
          controller.enqueue(createHeartbeatChunk())
        } catch {
          clearInterval(timer)
        }
      }, intervalMs)
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (value !== undefined && !isHeartbeatChunk(value)) {
            controller.enqueue(value)
          }
        }
        controller.close()
      } catch (error) {
        controller.error(error)
      } finally {
        clearInterval(timer)
        reader.releaseLock()
      }
    },
    async cancel(reason) {
      await stream.cancel(reason).catch(() => {})
    },
  })
}
