import { handleWorkflowStream } from '@mastra/ai-sdk'
import { type UIMessageChunk, createUIMessageStreamResponse } from 'ai'
import { isClientAbortError } from '@/lib/client-abort-error'
import { getConversationById } from '@/lib/db/conversations'
import { shouldLogLlmDebug } from '@/lib/llm-debug-log'
import {
  clearPendingApprovalMetadata,
  wrapStreamWithWorkflowMetadataSync,
} from '@/lib/workflow-stream-metadata'
import { isSessionPayload, requireApiSession } from '@/lib/auth/server'
import { mastra } from '@/mastra'

export const maxDuration = 120

function toAbortSafeStream(
  stream: ReadableStream<UIMessageChunk>,
): ReadableStream<UIMessageChunk> {
  return new ReadableStream<UIMessageChunk>({
    async start(controller) {
      const reader = stream.getReader()
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (value !== undefined) controller.enqueue(value)
        }
        controller.close()
      } catch (error) {
        if (isClientAbortError(error)) {
          console.warn('[POST /api/workflow/resume] client disconnected during stream')
          controller.close()
          return
        }
        controller.error(error)
      } finally {
        reader.releaseLock()
      }
    },
    async cancel(reason) {
      await stream.cancel(reason).catch(() => {})
    },
  })
}

export async function POST(req: Request) {
  const session = await requireApiSession()
  if (!isSessionPayload(session)) return session
  try {
    const body = (await req.json()) as {
      workflowRunId: string
      approved: boolean
      feedback?: string
      clarification?: {
        tableName?: string
        dimensions?: string[]
        metrics?: string[]
        timeStart?: string
        timeEnd?: string
        analysisStrategyId?: string
        additionalNotes?: string
      }
      editedDraft?: {
        originalQuestion: string
        finalIntentSummary: string
        clarificationRecord: string
        generatedSql: string
        reportMarkdown: string
        generatedAt: string
      }
      conversationId?: string
      workflowId?: string
    }

    if (!body.workflowRunId) {
      return Response.json({ error: '缺少 workflowRunId' }, { status: 400 })
    }

    const workflowId =
      body.workflowId ??
      (body.conversationId
        ? (
            await getConversationById(
              body.conversationId,
              session.userId,
            )
          )?.metadata?.pendingApproval?.workflowId
        : undefined) ??
      'data-analysis-report'

    const resumeData = {
      approved: body.approved,
      ...(body.feedback?.trim() ? { feedback: body.feedback.trim() } : {}),
      ...(body.clarification ? { clarification: body.clarification } : {}),
      ...(body.editedDraft ? { editedDraft: body.editedDraft } : {}),
    }
    if (shouldLogLlmDebug()) {
      console.info('[llm-debug] workflow-resume:request', {
        workflowRunId: body.workflowRunId,
        workflowId,
        approved: body.approved,
        feedback: body.feedback ?? null,
        clarification: body.clarification ?? null,
        hasEditedDraft: Boolean(body.editedDraft),
        conversationId: body.conversationId ?? null,
      })
    }

    // 用户已做出审批决策后，立即移除待审批标记，避免前端输入框持续被锁定。
    if (body.conversationId) {
      await clearPendingApprovalMetadata(body.conversationId, session.userId)
    }

    const stream = await handleWorkflowStream({
      mastra,
      workflowId,
      version: 'v6',
      params: {
        runId: body.workflowRunId,
        resumeData,
      } as never,
    })

    if (shouldLogLlmDebug()) {
      console.info('[llm-debug] workflow-resume:stream-started', {
        workflowRunId: body.workflowRunId,
        workflowId,
      })
    }

    const wrapped =
      body.conversationId
        ? wrapStreamWithWorkflowMetadataSync(
            stream as ReadableStream<UIMessageChunk>,
            body.conversationId,
            session.userId,
          )
        : (stream as ReadableStream<UIMessageChunk>)

    return createUIMessageStreamResponse({
      stream: toAbortSafeStream(wrapped),
    })
  } catch (error) {
    console.error('[POST /api/workflow/resume]', error)
    const message =
      error instanceof Error ? error.message : '恢复 Workflow 失败'
    return Response.json({ error: message }, { status: 500 })
  }
}
