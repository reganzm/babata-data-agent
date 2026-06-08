import {
  getConversationById,
  updateConversation,
  type ConversationMetadata,
} from '@/lib/db/conversations'

type WorkflowSteps = Record<
  string,
  {
    suspendPayload?: unknown | null
    status?: string
  }
>

type WorkflowStreamPart = {
  type?: string
  id?: string
  data?: {
    name?: string
    status?: string
    stepId?: string
    step?: {
      suspendPayload?: unknown | null
      status?: string
    }
    steps?: WorkflowSteps
  }
}

const WORKFLOW_PART_TYPES = new Set([
  'data-workflow',
  'data-tool-workflow',
  'data-workflow-step',
  'data-tool-workflow-step',
])

const WORKFLOW_STEP_ORDER: Record<string, string[]> = {
  'data-analysis-report': [
    'parse-intent',
    'fetch-schema',
    'generate-sql',
    'human-approval',
    'execute-query',
    'analyze-report',
    'few-shot-approval',
  ],
}

function isWorkflowPart(chunk: unknown): chunk is WorkflowStreamPart {
  if (!chunk || typeof chunk !== 'object') return false
  const type = (chunk as WorkflowStreamPart).type
  return typeof type === 'string' && WORKFLOW_PART_TYPES.has(type)
}

function suspendPayloadScore(
  step: { suspendPayload?: unknown | null; status?: string },
): number {
  const payload = step.suspendPayload
  if (!payload || typeof payload !== 'object') return -1
  let score = 0
  if (step.status === 'suspended') score += 20
  const obj = payload as Record<string, unknown>
  if (obj.approvalType === 'few-shot-save') score += 10
  if (obj.approvalType === 'intent-clarification') score += 2
  if (obj.approvalType === 'sql-approval') score += 2
  if (obj.draft && typeof obj.draft === 'object') score += 4
  if (typeof obj.sql === 'string') score += 2
  return score
}

function normalizeStepId(stepId: string): string {
  const trimmed = stepId.trim()
  if (!trimmed) return stepId
  const noPrefix = trimmed.replace(/^.*[./]/, '')
  if (noPrefix.endsWith('-step')) return noPrefix.slice(0, -5)
  return noPrefix
}

function pickBestSuspendCandidate(params: {
  workflowId: string
  stepPayload: unknown
  stepStatus?: string
  stepId?: string
  steps?: WorkflowSteps
}): unknown | null {
  const candidates: Array<{
    payload: unknown
    status?: string
    stepId?: string
  }> = []
  if (
    params.stepStatus === 'suspended' &&
    params.stepPayload &&
    typeof params.stepPayload === 'object'
  ) {
    candidates.push({
      payload: params.stepPayload,
      status: params.stepStatus,
      stepId: params.stepId,
    })
  }

  if (params.steps) {
    for (const [stepId, step] of Object.entries(params.steps)) {
      if (step?.status !== 'suspended') continue
      if (!step?.suspendPayload || typeof step.suspendPayload !== 'object') continue
      candidates.push({
        payload: step.suspendPayload,
        status: step.status,
        stepId,
      })
    }
  }

  if (!candidates.length) return null

  const stepOrder = WORKFLOW_STEP_ORDER[params.workflowId] ?? []
  let best:
    | {
        payload: unknown
        score: number
        stepIndex: number
      }
    | null = null

  for (const candidate of candidates) {
    const score = suspendPayloadScore({
      suspendPayload: candidate.payload,
      status: candidate.status,
    })
    if (score < 0) continue
    const normalizedStepId = candidate.stepId
      ? normalizeStepId(candidate.stepId)
      : ''
    const stepIndex = normalizedStepId
      ? stepOrder.findIndex((id) => id === normalizedStepId)
      : -1
    if (
      !best ||
      stepIndex > best.stepIndex ||
      (stepIndex === best.stepIndex && score > best.score)
    ) {
      best = { payload: candidate.payload, score, stepIndex }
    }
  }

  return best?.payload ?? null
}

type ToolCallSuspendedPart = {
  type?: string
  data?: {
    runId?: string
    toolCallId?: string
    toolName?: string
    suspendPayload?: unknown
  }
}

type PendingApprovalLike = {
  workflowId?: string
  workflowRunId?: string
  agentRunId?: string
  payload?: unknown
}

function approvalStageRank(payload: unknown): number {
  if (!payload || typeof payload !== 'object') return 0
  const data = payload as { approvalType?: string; clarificationStage?: string }
  if (
    data.approvalType === 'intent-clarification' &&
    data.clarificationStage === 'sql-regeneration'
  ) {
    return 3
  }
  const approvalType = data.approvalType
  if (approvalType === 'intent-clarification') return 1
  if (approvalType === 'sql-approval') return 2
  if (approvalType === 'few-shot-save') return 4
  return 0
}

export function shouldReplacePendingApproval(params: {
  existing?: PendingApprovalLike
  incoming: PendingApprovalLike
}): boolean {
  const existing = params.existing
  if (!existing) return true

  const existingRunId = existing.workflowRunId ?? existing.agentRunId ?? null
  const incomingRunId =
    params.incoming.workflowRunId ?? params.incoming.agentRunId ?? null
  if (!existingRunId || !incomingRunId || existingRunId !== incomingRunId) {
    return true
  }

  return approvalStageRank(params.incoming.payload) >= approvalStageRank(existing.payload)
}

function isToolCallSuspendedPart(
  chunk: unknown,
): chunk is ToolCallSuspendedPart {
  if (!chunk || typeof chunk !== 'object') return false
  return (chunk as ToolCallSuspendedPart).type === 'data-tool-call-suspended'
}

function normalizeStreamChunk(chunk: unknown): unknown[] {
  if (!chunk || typeof chunk !== 'object') return []
  const c = chunk as WorkflowStreamPart
  if (isWorkflowPart(c)) return [c]
  if (isToolCallSuspendedPart(chunk)) return [chunk]
  return []
}

/** 从 AI SDK 流 chunk 解析 Workflow suspend */
export function extractWorkflowSuspendFromChunk(chunk: unknown): {
  runId: string
  workflowId: string
  payload: unknown
  agentRunId?: string
  workflowRunId?: string
} | null {
  for (const item of normalizeStreamChunk(chunk)) {
    if (isToolCallSuspendedPart(item) && item.data) {
      const payload = item.data.suspendPayload
      if (!payload || typeof payload !== 'object') continue
      const agentRunId = item.data.runId
      if (!agentRunId) continue
      const toolName = item.data.toolName ?? ''
      const workflowId = toolName.includes('weeklyMetrics')
        ? 'weekly-metrics'
        : 'data-analysis-report'
      return {
        runId: agentRunId,
        agentRunId,
        workflowId,
        payload,
      }
    }

    if (!isWorkflowPart(item)) continue
    const data = item.data
    if (!data) continue

    const payload = pickBestSuspendCandidate({
      workflowId: data.name ?? 'data-analysis-report',
      stepPayload: data.step?.suspendPayload,
      stepStatus: data.step?.status,
      stepId: data.stepId,
      steps: data.steps,
    })
    if (!payload || typeof payload !== 'object') continue

    const stepSuspended =
      data.step?.status === 'suspended' ||
      data.status === 'suspended' ||
      Boolean(data.step?.suspendPayload)

    if (!stepSuspended) continue

    let workflowRunId = item.id
    if (!workflowRunId) continue
    if (workflowRunId.includes(':')) {
      workflowRunId = workflowRunId.split(':')[0] ?? workflowRunId
    }

    const workflowId = data.name ?? 'data-analysis-report'
    return {
      runId: workflowRunId,
      workflowRunId,
      workflowId,
      payload,
    }
  }
  return null
}

const TERMINAL_STATUSES = new Set([
  'success',
  'completed',
  'failed',
  'canceled',
  'cancelled',
])

/** Workflow 已结束，应清除会话挂起状态 */
export function extractWorkflowTerminalFromChunk(chunk: unknown): {
  runId: string
  status: string
} | null {
  if (!isWorkflowPart(chunk)) return null
  const data = chunk.data
  if (!data?.status || data.status === 'suspended' || data.status === 'running') {
    return null
  }
  if (!TERMINAL_STATUSES.has(data.status)) return null
  const runId = chunk.id
  if (!runId) return null
  return { runId, status: data.status }
}

export async function applyWorkflowSuspendMetadata(
  conversationId: string,
  userId: string | null,
  info: {
    runId: string
    workflowId: string
    payload: unknown
    agentRunId?: string
    workflowRunId?: string
  },
): Promise<void> {
  const workflowRunId = info.workflowRunId ?? info.runId
  const existing = await getConversationById(conversationId, userId)
  const incoming = {
    workflowId: info.workflowId,
    payload: info.payload,
    agentRunId: info.agentRunId,
    workflowRunId,
  }
  if (
    !shouldReplacePendingApproval({
      existing: existing?.metadata?.pendingApproval,
      incoming,
    })
  ) {
    return
  }
  const metadata: ConversationMetadata = {
    ...existing?.metadata,
    activeWorkflowRunId: workflowRunId,
    pendingApproval: incoming,
  }
  await updateConversation(conversationId, userId, { metadata })
}

export async function clearWorkflowSuspendMetadata(
  conversationId: string,
  userId: string | null,
): Promise<void> {
  const existing = await getConversationById(conversationId, userId)
  if (!existing?.metadata?.pendingApproval && !existing?.metadata?.activeWorkflowRunId) {
    return
  }
  await updateConversation(conversationId, userId, {
    metadata: {
      ...existing.metadata,
      activeWorkflowRunId: undefined,
      pendingApproval: undefined,
    },
  })
}

/** 流程进入 running（如驳回后重跑）时去掉顶栏审批，保留 activeWorkflowRunId */
export async function clearPendingApprovalMetadata(
  conversationId: string,
  userId: string | null,
): Promise<void> {
  const existing = await getConversationById(conversationId, userId)
  if (!existing?.metadata?.pendingApproval) return
  await updateConversation(conversationId, userId, {
    metadata: {
      ...existing.metadata,
      pendingApproval: undefined,
    },
  })
}

/** Workflow 从 suspended 进入 running 时清除 pendingApproval */
export function extractWorkflowRunningFromChunk(chunk: unknown): {
  runId: string
} | null {
  if (!isWorkflowPart(chunk)) return null
  const data = chunk.data
  if (data?.status !== 'running') return null
  const runId = chunk.id
  if (!runId) return null
  const bare = runId.includes(':') ? (runId.split(':')[0] ?? runId) : runId
  return { runId: bare }
}

export function isConversationWorkflowSuspended(
  metadata?: ConversationMetadata,
): boolean {
  if (!metadata?.pendingApproval || !metadata?.activeWorkflowRunId) return false
  const payload = metadata.pendingApproval.payload
  if (
    payload &&
    typeof payload === 'object' &&
    (payload as { approvalType?: string }).approvalType === 'few-shot-save'
  ) {
    return false
  }
  return true
}

/** 旁路监听流式 chunk，将 suspend / 终态同步到 L1 metadata */
export function wrapStreamWithWorkflowMetadataSync<T>(
  stream: ReadableStream<T>,
  conversationId: string,
  userId: string | null,
): ReadableStream<T> {
  return stream.pipeThrough(
    new TransformStream<T, T>({
      transform(chunk, controller) {
        controller.enqueue(chunk)
        void syncChunkToMetadata(conversationId, userId, chunk).catch((err) => {
          console.error('[workflow-metadata-sync]', err)
        })
      },
    }),
  )
}

async function syncChunkToMetadata(
  conversationId: string,
  userId: string | null,
  chunk: unknown,
): Promise<void> {
  const suspended = extractWorkflowSuspendFromChunk(chunk)
  if (suspended) {
    await applyWorkflowSuspendMetadata(conversationId, userId, suspended)
    return
  }

  const terminal = extractWorkflowTerminalFromChunk(chunk)
  if (terminal) {
    await clearWorkflowSuspendMetadata(conversationId, userId)
  }
}
