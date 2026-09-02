import {
  parseJsonEventStream,
  uiMessageChunkSchema,
  type UIMessageChunk,
} from 'ai'

/**
 * 将 HTTP SSE 响应体解析为 AI SDK UIMessageChunk 流。
 * readUIMessageStream / useChat 都要求已解析的 chunk，不能直接吃原始字节。
 */
export function createUiMessageChunkStream(
  body: ReadableStream<Uint8Array>,
): ReadableStream<UIMessageChunk> {
  return parseJsonEventStream({
    stream: body,
    schema: uiMessageChunkSchema,
  }).pipeThrough(
    new TransformStream<
      { success: true; value: UIMessageChunk } | { success: false; error: Error },
      UIMessageChunk
    >({
      transform(chunk, controller) {
        if (!chunk.success) {
          throw chunk.error
        }
        if ((chunk.value as { type?: string }).type === 'data-heartbeat') {
          return
        }
        controller.enqueue(chunk.value)
      },
    }),
  )
}
