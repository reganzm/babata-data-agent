/**
 * Chat API — 巴巴塔 Supervisor + Mastra Memory + Workflow suspend 同步
 */

import { handleChatStream } from '@mastra/ai-sdk'
import { type UIMessageChunk, createUIMessageStreamResponse } from 'ai'
import { resourceIdForUser } from '@/lib/auth/constants'
import { isSessionPayload, requireApiSession } from '@/lib/auth/server'
import { isClientAbortError } from '@/lib/client-abort-error'
import { getConversationById } from '@/lib/db/conversations'
import { shouldLogLlmDebug } from '@/lib/llm-debug-log'
import {
  clearWorkflowSuspendMetadata,
  isConversationWorkflowSuspended,
  wrapStreamWithWorkflowMetadataSync,
} from '@/lib/workflow-stream-metadata'
import { mastra } from '@/mastra'

export const maxDuration = 60

const WORKFLOW_KEYS: Record<string, 'dataAnalysisReport' | 'weeklyMetrics'> = {
  'data-analysis-report': 'dataAnalysisReport',
  dataAnalysisReport: 'dataAnalysisReport',
  'weekly-metrics': 'weeklyMetrics',
  weeklyMetrics: 'weeklyMetrics',
}

type ChatRequestBody = {
  id?: string
  memory?: { thread?: string; resource?: string }
  messages?: unknown
  trigger?: string
  resumeData?: unknown
  runId?: string
  requestContext?: unknown
  [key: string]: unknown
}

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
          console.warn('[POST /api/chat] client disconnected during stream')
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

function sanitizeMessages(messages: unknown): unknown[] {
  if (!Array.isArray(messages)) return []
  return messages.map((msg) => {
    if (!msg || typeof msg !== 'object') return msg
    const { createdAt: _createdAt, ...rest } = msg as Record<string, unknown>
    return rest
  })
}

function extractLastUserText(messages: unknown[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (!message || typeof message !== 'object') continue
    const role = (message as { role?: string }).role
    if (role !== 'user') continue
    const parts = (message as { parts?: unknown[] }).parts
    if (!Array.isArray(parts)) continue
    for (const part of parts) {
      if (!part || typeof part !== 'object') continue
      if ((part as { type?: string }).type !== 'text') continue
      const text = (part as { text?: string }).text
      if (typeof text === 'string' && text.trim()) return text
    }
  }
  return null
}

export async function POST(req: Request) {
  const session = await requireApiSession()
  if (!isSessionPayload(session)) return session
  try {
    const params = (await req.json()) as ChatRequestBody

    if (!Array.isArray(params.messages)) {
      return Response.json(
        {
          error: 'invalid_messages',
          message: '请求缺少有效的 messages 数组，请刷新页面后重试。',
        },
        { status: 400 },
      )
    }

    const conversationId =
      params.memory?.thread ?? params.id ?? crypto.randomUUID()

    if (params.memory?.thread ?? params.id) {
      const existing = await getConversationById(conversationId, session.userId)
      if (isConversationWorkflowSuspended(existing?.metadata)) {
        const runId = existing?.metadata?.activeWorkflowRunId
        const workflowId = existing?.metadata?.pendingApproval?.workflowId
        const workflowKey = WORKFLOW_KEYS[workflowId ?? 'data-analysis-report']
        const workflow = workflowKey ? mastra.getWorkflow(workflowKey) : null

        if (runId && workflow) {
          try {
            const state = await workflow.getWorkflowRunById(runId, {
              fields: ['steps', 'payload', 'result', 'error'],
            })
            const status = state?.status
            if (
              status &&
              status !== 'running' &&
              status !== 'suspended'
            ) {
              // 会话 metadata 残留了待审批锁，实际 run 已结束：自动自愈后放行聊天
              await clearWorkflowSuspendMetadata(conversationId, session.userId)
            } else {
              return Response.json(
                {
                  error: 'workflow_suspended',
                  message:
                    '当前会话有待审批的 SQL，请先批准或拒绝后再发送新消息。',
                  workflowRunId: existing?.metadata?.activeWorkflowRunId,
                },
                { status: 409 },
              )
            }
          } catch {
            return Response.json(
              {
                error: 'workflow_suspended',
                message:
                  '当前会话有待审批的 SQL，请先批准或拒绝后再发送新消息。',
                workflowRunId: existing?.metadata?.activeWorkflowRunId,
              },
              { status: 409 },
            )
          }
        } else {
        return Response.json(
          {
            error: 'workflow_suspended',
            message:
              '当前会话有待审批的 SQL，请先批准或拒绝后再发送新消息。',
            workflowRunId: existing?.metadata?.activeWorkflowRunId,
          },
          { status: 409 },
        )
        }
      }
    }

    const {
      id: _chatId,
      memory: _clientMemory,
      messages,
      trigger,
      resumeData,
      runId,
      requestContext,
    } = params

    const normalizedMessages = sanitizeMessages(messages)
    if (shouldLogLlmDebug()) {
      console.info('[llm-debug] api-chat:request', {
        conversationId,
        trigger,
        runId: runId ?? null,
        requestContext: requestContext ?? null,
        messageCount: normalizedMessages.length,
        lastUserText: extractLastUserText(normalizedMessages),
      })
    }

    const stream = await handleChatStream({
      mastra,
      agentId: 'babata',
      version: 'v6',
      params: {
        messages: normalizedMessages,
        trigger,
        resumeData,
        runId,
        requestContext,
        memory: {
          thread: conversationId,
          resource:
            params.memory?.resource ??
            (session.userId
              ? resourceIdForUser(session.userId)
              : process.env.BABATA_RESOURCE_ID?.trim() || 'babata-local-user'),
        },
      } as never,
    })

    if (shouldLogLlmDebug()) {
      console.info('[llm-debug] api-chat:stream-started', {
        conversationId,
        trigger,
      })
    }

    const synced =
      conversationId && (params.memory?.thread ?? params.id)
        ? wrapStreamWithWorkflowMetadataSync(
            stream as ReadableStream<UIMessageChunk>,
            conversationId,
            session.userId,
          )
        : (stream as ReadableStream<UIMessageChunk>)

    return createUIMessageStreamResponse({
      stream: toAbortSafeStream(synced),
    })
  } catch (error) {
    console.error('[POST /api/chat]', error)
    const message =
      error instanceof Error ? error.message : '处理对话请求时发生错误'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
