import { clearPendingApprovalMetadata } from '@/lib/workflow-stream-metadata'
import { isSessionPayload, requireApiSession } from '@/lib/auth/server'

export async function POST(req: Request) {
  const session = await requireApiSession()
  if (!isSessionPayload(session)) return session

  try {
    const body = (await req.json()) as { conversationId?: string }
    if (!body.conversationId) {
      return Response.json({ error: '缺少 conversationId' }, { status: 400 })
    }
    await clearPendingApprovalMetadata(body.conversationId, session.userId)
    return Response.json({ ok: true })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '清除审批状态失败'
    return Response.json({ error: message }, { status: 500 })
  }
}
