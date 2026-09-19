export type ChatErrorDetails = {
  statusCode?: number
  code?: string
  message: string
}

/**
 * /api/chat 出错时，返回体是 JSON.stringify({ statusCode, code, message })
 * （见 src/app/api/chat/route.ts 的 serializeErrorForClient）。useChat 会把
 * 这段文本原样塞进 Error.message，这里统一解析出可展示给用户的结构化信息；
 * 解析失败时退化为展示原始文本，保证任何后端错误都不会被静默吞掉。
 */
export function parseChatError(
  error: Error | undefined,
): ChatErrorDetails | null {
  if (!error) return null
  const raw = error.message?.trim()
  if (!raw) return { message: '请求失败，请稍后重试。' }

  try {
    const parsed = JSON.parse(raw) as Partial<ChatErrorDetails>
    if (parsed && typeof parsed === 'object' && parsed.message) {
      return {
        statusCode: parsed.statusCode,
        code: parsed.code,
        message: parsed.message,
      }
    }
  } catch {
    // 非 JSON（例如网络层错误），直接展示原始文本
  }
  return { message: raw }
}
