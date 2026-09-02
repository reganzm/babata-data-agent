const CONVERSATION_ID_PREFIX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:/i

export function toLocalMessageId(messageId: string): string {
  return messageId.replace(CONVERSATION_ID_PREFIX, '')
}

/** 消息表 id 是全局主键；按会话加前缀，避免新会话保存时撞到旧会话并覆盖 */
export function toPersistedMessageId(
  conversationId: string,
  messageId: string,
): string {
  return `${conversationId}:${toLocalMessageId(messageId)}`
}
