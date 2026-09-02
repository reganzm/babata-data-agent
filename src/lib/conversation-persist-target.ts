/** 流式/落库更新必须写回源会话，禁止跟到当前选中的另一个会话 */
export function shouldApplyConversationUpdate(
  sourceConversationId: string,
  targetConversationId: string | null | undefined,
): boolean {
  return (
    Boolean(sourceConversationId) &&
    Boolean(targetConversationId) &&
    sourceConversationId === targetConversationId
  )
}
