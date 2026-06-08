import { isSessionPayload, requireApiSession } from '@/lib/auth/server'
import { applyWorkflowSuspendMetadata } from '@/lib/workflow-stream-metadata'

/** 客户端从流式 parts 发现 suspend 时，补写会话 metadata（供顶栏横幅等） */
export async function POST(req: Request) {
  const session = await requireApiSession()
  if (!isSessionPayload(session)) return session

  try {
    const body = (await req.json()) as {
      conversationId?: string
      workflowRunId?: string
      agentRunId?: string
      workflowId?: string
      payload?: unknown
    }

    if (!body.conversationId || !body.payload) {
      return Response.json({ error: '参数不完整' }, { status: 400 })
    }
    if (!body.workflowRunId && !body.agentRunId) {
      return Response.json({ error: '缺少 runId' }, { status: 400 })
    }

    await applyWorkflowSuspendMetadata(
      body.conversationId,
      session.userId,
      {
        runId: body.agentRunId ?? body.workflowRunId!,
        agentRunId: body.agentRunId,
        workflowRunId: body.workflowRunId,
        workflowId: body.workflowId ?? 'data-analysis-report',
        payload: body.payload,
      },
    )

    return Response.json({ ok: true })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '同步审批状态失败'
    return Response.json({ error: message }, { status: 500 })
  }
}
