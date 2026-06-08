/** 驳回/重跑开始时清除顶栏「待确认 SQL」metadata */
export async function clearPendingApprovalOnClient(
  conversationId: string,
): Promise<void> {
  await fetch('/api/workflow/clear-pending', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversationId }),
  })
}
