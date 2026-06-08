import {
  buildWorkflowPartFromStatusApi,
  isWorkflowStreamPart,
  WORKFLOW_STEP_ORDER,
  type WorkflowResumeContext,
} from '@/lib/workflow-progress'

const TERMINAL_RUN_STATUSES = new Set([
  'success',
  'completed',
  'failed',
  'canceled',
  'cancelled',
])

const POLL_INTERVAL_MS = 2000
const POLL_MAX_ATTEMPTS = 45

const WORKFLOW_CHUNK_TYPES = new Set([
  'data-workflow',
  'data-tool-workflow',
  'data-workflow-step',
  'data-tool-workflow-step',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

export function isWorkflowUiChunk(chunk: unknown): boolean {
  if (!isRecord(chunk)) return false
  const type = chunk.type
  return typeof type === 'string' && WORKFLOW_CHUNK_TYPES.has(type)
}

/** 将 resume 流里的 workflow chunk 合并进助手消息 parts（与 AI SDK 按 id+type 更新一致） */
export function stripWorkflowStreamParts(parts: unknown[]): unknown[] {
  return parts.filter((p) => {
    if (isWorkflowStreamPart(p)) return false
    if (
      isRecord(p) &&
      p.type === 'data-tool-call-suspended'
    ) {
      // 旧一轮 SQL 审批挂起快照会污染下一轮 resumeContext（显示旧 SQL）
      return false
    }
    return true
  })
}

export function mergeWorkflowUiChunkIntoParts(
  parts: unknown[],
  chunk: unknown,
): unknown[] {
  if (!isWorkflowUiChunk(chunk)) return parts
  const c = chunk as { type: string; id?: string }
  if (typeof c.id !== 'string') {
    return [...parts, chunk]
  }
  const idx = parts.findIndex(
    (p) =>
      isRecord(p) &&
      p.type === c.type &&
      (p as { id?: string }).id === c.id,
  )
  if (idx >= 0) {
    const next = [...parts]
    next[idx] = chunk
    return next
  }
  return [...parts, chunk]
}

async function* iterateSseJson(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<unknown> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const payload = trimmed.replace(/^data:\s*/, '')
        if (!payload || payload === '[DONE]') continue
        try {
          yield JSON.parse(payload) as unknown
        } catch {
          /* 忽略非 JSON 行 */
        }
      }
    }
    const tail = buffer.trim()
    if (tail.startsWith('data:')) {
      const payload = tail.replace(/^data:\s*/, '')
      if (payload && payload !== '[DONE]') {
        try {
          yield JSON.parse(payload) as unknown
        } catch {
          /* ignore */
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

/**
 * resume 流若未下发 chunk，用乐观快照让进度条立即反映驳回重跑 / 批准执行。
 */
export function applyResumeOptimisticPartsPatch(
  parts: unknown[],
  options: {
    approved: boolean
    workflowRunId?: string | null
    workflowId?: string
  },
): unknown[] {
  const workflowId = options.workflowId ?? 'data-analysis-report'
  const defs = WORKFLOW_STEP_ORDER[workflowId] ?? WORKFLOW_STEP_ORDER['data-analysis-report']!
  const runId = options.workflowRunId ?? 'workflow-resume'

  const steps: Record<string, { status: string; suspendPayload?: null }> = {}
  for (const def of defs) {
    steps[def.id] = { status: 'pending' }
  }

  let runStatus = 'running'

  if (options.approved) {
    for (const id of ['parse-intent', 'fetch-schema', 'generate-sql', 'human-approval']) {
      if (steps[id]) steps[id] = { status: 'success' }
    }
    if (steps['execute-sql']) steps['execute-sql'] = { status: 'running' }
  } else {
    if (steps['parse-intent']) steps['parse-intent'] = { status: 'running' }
    runStatus = 'running'
  }

  const snapshot = {
    type: 'data-workflow' as const,
    id: runId,
    data: {
      name: workflowId,
      status: runStatus,
      steps,
    },
  }

  let next = mergeWorkflowUiChunkIntoParts(parts, snapshot)

  if (!options.approved && steps['parse-intent']) {
    next = mergeWorkflowUiChunkIntoParts(next, {
      type: 'data-workflow-step',
      id: `${runId}:parse-intent`,
      data: {
        name: workflowId,
        status: runStatus,
        stepId: 'parse-intent',
        step: { status: 'running', suspendPayload: null },
      },
    })
  }

  return next
}

export type ConsumeWorkflowResumeStreamOptions = {
  conversationId?: string
  workflowRunId?: string | null
  workflowId?: string
  approved: boolean
  resumeContext?: WorkflowResumeContext
}

export async function consumeWorkflowResumeStream(
  response: Response,
  messages: import('@ai-sdk/react').UIMessage[],
  onMessagesUpdate: (messages: import('@ai-sdk/react').UIMessage[]) => void,
  options: ConsumeWorkflowResumeStreamOptions,
): Promise<void> {
  if (!response.body) {
    throw new Error('恢复流为空')
  }

  const lastAssistantIndex = messages.findLastIndex((m) => m.role === 'assistant')
  if (lastAssistantIndex < 0) return

  const baseMessage = messages[lastAssistantIndex]
  let parts = stripWorkflowStreamParts(baseMessage.parts)

  parts = applyResumeOptimisticPartsPatch(parts, {
    approved: options.approved,
    workflowRunId: options.workflowRunId,
    workflowId: options.workflowId ?? options.resumeContext?.workflowId,
  })

  const pushUpdate = () => {
    const updated = { ...baseMessage, parts } as import('@ai-sdk/react').UIMessage
    const nextMessages = messages.map((m, i) =>
      i === lastAssistantIndex ? updated : m,
    )
    onMessagesUpdate(nextMessages)
    messages = nextMessages
  }

  pushUpdate()

  for await (const chunk of iterateSseJson(response.body)) {
    if (isWorkflowUiChunk(chunk)) {
      parts = mergeWorkflowUiChunkIntoParts(parts, chunk)
      pushUpdate()
    }
  }

  if (options.workflowRunId) {
    await pollWorkflowRunProgress({
      workflowRunId: options.workflowRunId,
      workflowId: options.workflowId ?? options.resumeContext?.workflowId,
      conversationId: options.conversationId,
      getParts: () => parts,
      onPartsUpdate: (nextParts) => {
        parts = nextParts
        pushUpdate()
      },
    })
  }
}

async function fetchWorkflowStatus(
  workflowRunId: string,
  workflowId: string,
): Promise<{
  runId: string
  workflowName: string
  status: string
  steps: Record<string, unknown>
} | null> {
  const params = new URLSearchParams({
    runId: workflowRunId,
    workflowId,
  })
  const res = await fetch(`/api/workflow/status?${params}`)
  if (!res.ok) return null
  return (await res.json()) as {
    runId: string
    workflowName: string
    status: string
    steps: Record<string, unknown>
  }
}

/**
 * Resume 流结束后轮询服务端 run 状态，避免 UI 停在乐观「解析意图」转圈。
 */
export async function pollWorkflowRunProgress(options: {
  workflowRunId: string
  workflowId?: string
  conversationId?: string
  onPartsUpdate: (parts: unknown[]) => void
  getParts?: () => unknown[]
}): Promise<void> {
  const workflowId = options.workflowId ?? 'data-analysis-report'
  let parts = options.getParts?.() ?? []

  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
    }

    const status = await fetchWorkflowStatus(options.workflowRunId, workflowId)
    if (status) {
      const part = buildWorkflowPartFromStatusApi({
        runId: status.runId,
        workflowName: status.workflowName,
        status: status.status,
        steps: status.steps as Parameters<typeof buildWorkflowPartFromStatusApi>[0]['steps'],
      })
      const nonWorkflow = stripWorkflowStreamParts(parts)
      parts = mergeWorkflowUiChunkIntoParts(nonWorkflow, {
        ...part,
        id: status.runId,
      })
      options.onPartsUpdate(parts)

      if (
        status.status === 'suspended' ||
        TERMINAL_RUN_STATUSES.has(status.status)
      ) {
        break
      }
    }

    if (options.conversationId) {
      const { fetchConversationById } = await import('@/lib/conversation-store')
      const {
        patchWorkflowPartsWithSuspendPayload,
        readPendingApprovalPayload,
      } = await import('@/lib/workflow-progress')
      const conv = await fetchConversationById(options.conversationId)
      const pending = conv?.metadata?.pendingApproval
      const payload = readPendingApprovalPayload(pending?.payload)
      if (payload?.sql) {
        parts = patchWorkflowPartsWithSuspendPayload(
          parts,
          payload,
          options.workflowRunId ?? pending?.workflowRunId ?? null,
        )
        options.onPartsUpdate(parts)
        if (pending) break
      }
    }
  }
}
