import type { UIMessage } from '@ai-sdk/react'
import { readUIMessageStream, type UIMessageChunk } from 'ai'
import { clearPendingApprovalOnClient } from '@/lib/workflow-pending-approval-client'
import { consumeWorkflowResumeStream } from '@/lib/workflow-stream-merge'
import type { WorkflowResumeContext } from '@/lib/workflow-progress'
import type { UserClarificationPayload } from '@/lib/sql-clarification'

export type ResumeSqlApprovalParams = {
  approved: boolean
  feedback?: string
  clarification?: UserClarificationPayload
  extraResumeData?: Record<string, unknown>
  conversationId: string
  mastraResourceId: string
  messages: UIMessage[]
  context: WorkflowResumeContext
  onMessagesUpdate: (messages: UIMessage[]) => void
}

function buildResumeData(approved: boolean, feedback?: string) {
  return {
    approved,
    ...(feedback?.trim() ? { feedback: feedback.trim() } : {}),
  }
}

async function consumeAgentResumeStream(
  response: Response,
  messages: UIMessage[],
  onMessagesUpdate: (messages: UIMessage[]) => void,
): Promise<void> {
  if (!response.body) {
    throw new Error('恢复流为空')
  }

  const lastAssistantIndex = messages.findLastIndex((m) => m.role === 'assistant')
  const baseMessage =
    lastAssistantIndex >= 0 ? messages[lastAssistantIndex] : undefined

  const stream = response.body as unknown as ReadableStream<UIMessageChunk>

  for await (const updated of readUIMessageStream({
    message: baseMessage,
    stream,
  })) {
    onMessagesUpdate(
      messages.map((m, i) =>
        i === lastAssistantIndex ? (updated as UIMessage) : m,
      ),
    )
    messages = messages.map((m, i) =>
      i === lastAssistantIndex ? (updated as UIMessage) : m,
    )
  }
}

/**
 * 标准分析 workflow 的 SQL 审批挂起在 workflow 步骤上；
 * 须用 workflowRunId resume（agent run 在流结束后往往已无 suspend 快照）。
 */
async function resumeViaWorkflowEndpoint(
  params: ResumeSqlApprovalParams,
): Promise<void> {
  const workflowRunId = params.context.workflowRunId
  if (!workflowRunId) {
    throw new Error('缺少 workflow runId')
  }

  if (!params.approved) {
    await clearPendingApprovalOnClient(params.conversationId).catch((err) => {
      console.error('[clear-pending]', err)
    })
  }

  const response = await fetch('/api/workflow/resume', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      workflowRunId,
      approved: params.approved,
      feedback: params.feedback?.trim() || undefined,
      clarification: params.clarification,
      ...(params.extraResumeData ?? {}),
      conversationId: params.conversationId,
      workflowId: params.context.workflowId,
    }),
  })

  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(data.error ?? `恢复 Workflow 失败 (${response.status})`)
  }

  await consumeWorkflowResumeStream(
    response,
    params.messages,
    params.onMessagesUpdate,
    {
      approved: params.approved,
      conversationId: params.conversationId,
      workflowRunId,
      workflowId: params.context.workflowId,
      resumeContext: params.context,
    },
  )
}

/** 仅当无 workflowRunId 时尝试 agent resume（少见） */
async function resumeViaAgentChat(params: ResumeSqlApprovalParams): Promise<void> {
  const { agentRunId } = params.context
  if (!agentRunId) {
    throw new Error('缺少 agent runId，无法恢复对话')
  }

  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: params.messages,
      runId: agentRunId,
      resumeData: buildResumeData(params.approved, params.feedback),
      memory: {
        thread: params.conversationId,
        resource: params.mastraResourceId,
      },
    }),
  })

  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(data.error ?? `恢复对话失败 (${response.status})`)
  }

  await consumeAgentResumeStream(response, params.messages, params.onMessagesUpdate)
}

export async function resumeAfterSqlApproval(
  params: ResumeSqlApprovalParams,
): Promise<void> {
  if (params.context.workflowRunId) {
    await resumeViaWorkflowEndpoint(params)
    return
  }
  if (params.context.agentRunId) {
    await resumeViaAgentChat(params)
    return
  }
  throw new Error('缺少 workflowRunId，无法恢复审批流程')
}
