export type WorkflowStepUiStatus =
  | 'pending'
  | 'running'
  | 'success'
  | 'suspended'
  | 'failed'

export type WorkflowStepProgress = {
  id: string
  label: string
  status: WorkflowStepUiStatus
}

/** @deprecated 使用 WorkflowResumeContext */
export type WorkflowSqlApproval = WorkflowResumeContext

export type WorkflowResumeContext = {
  sql: string
  intentSummary?: string
  workflowId: string
  /** data-tool-workflow 的 runId */
  workflowRunId: string | null
  /** data-tool-call-suspended 的 runId（巴巴塔 agent，resume 必需） */
  agentRunId: string | null
  toolCallId?: string
  sqlRevisionCount?: number
}

export type WorkflowSuspendPayload = {
  sql?: string
  intentSummary?: string
  sqlRevisionCount?: number
}

export type WorkflowClarificationStage =
  | 'intent-disambiguation'
  | 'sql-regeneration'

export type WorkflowClarificationHint = {
  stage: WorkflowClarificationStage
  reason?: string
  requiredFields?: string[]
}

export type WorkflowSuspendSyncContext = {
  workflowId: string
  workflowRunId: string | null
  agentRunId: string | null
  payload: unknown
}

export type WorkflowProgressView = {
  workflowId: string
  workflowRunId?: string | null
  workflowTitle: string
  runStatus: string
  steps: WorkflowStepProgress[]
  currentStepId: string | null
  completedCount: number
  totalCount: number
  /** 待审批或已生成、尚未执行的 SQL */
  sqlPreview?: string
  resumeContext?: WorkflowResumeContext
  clarificationHint?: WorkflowClarificationHint
}

const TERMINAL_RUN_STATUSES = new Set([
  'success',
  'completed',
  'failed',
  'canceled',
  'cancelled',
])

/** 仅当 SQL 审批步处于挂起、且流程为 suspended 时展示审批区 */
export function isAwaitingSqlApproval(progress: WorkflowProgressView): boolean {
  if (progress.runStatus !== 'suspended') return false
  const approval = progress.steps.find((s) => s.id === 'human-approval')
  return approval?.status === 'suspended'
}

export function getCurrentRunningStepLabel(
  progress: WorkflowProgressView,
): string | null {
  const running = progress.steps.find((s) => s.status === 'running')
  return running?.label ?? null
}

const WORKFLOW_PART_TYPES = new Set([
  'data-workflow',
  'data-tool-workflow',
  'data-workflow-step',
  'data-tool-workflow-step',
])

type StepSnapshot = {
  status?: string
  output?: unknown
  input?: unknown
  suspendPayload?: unknown | null
}

type WorkflowPartData = {
  name?: string
  status?: string
  stepId?: string
  step?: StepSnapshot
  steps?: Record<string, StepSnapshot>
}

type WorkflowPart = {
  type?: string
  data?: WorkflowPartData
}

export const WORKFLOW_TITLES: Record<string, string> = {
  'data-analysis-report': '标准数据分析报告',
  'weekly-metrics': '周报指标流水线',
}

export const WORKFLOW_STEP_ORDER: Record<string, { id: string; label: string }[]> =
  {
    'data-analysis-report': [
      { id: 'parse-intent', label: '解析意图' },
      { id: 'fetch-schema', label: '获取表结构' },
      { id: 'generate-sql', label: '生成 SQL' },
      { id: 'human-approval', label: 'SQL 审批' },
      { id: 'execute-sql', label: '执行查询' },
      { id: 'interpret-results', label: '解读与出报告' },
      { id: 'few-shot-approval', label: 'Few-shot 自动入库' },
    ],
    'weekly-metrics': [
      { id: 'plan-metrics', label: '规划指标' },
      { id: 'execute-metrics', label: '批量查询' },
      { id: 'format-report', label: '生成周报' },
    ],
  }

const WORKFLOW_ID_ALIASES: Record<string, string> = {
  dataAnalysisReport: 'data-analysis-report',
  weeklyMetrics: 'weekly-metrics',
  'workflow-dataAnalysisReport': 'data-analysis-report',
  'workflow-weeklyMetrics': 'weekly-metrics',
}

export function normalizeWorkflowId(name: string): string {
  const trimmed = name.trim()
  return WORKFLOW_ID_ALIASES[trimmed] ?? trimmed.replace(/^workflow-/, '')
}

/** 嵌套 workflow 步骤 id 可能带前缀，如 data-analysis-prep.parse-intent */
export function normalizeWorkflowStepId(stepId: string): string {
  const dot = stepId.lastIndexOf('.')
  if (dot >= 0) return stepId.slice(dot + 1)
  const slash = stepId.lastIndexOf('/')
  if (slash >= 0) return stepId.slice(slash + 1)
  return stepId
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

export function isWorkflowStreamPart(part: unknown): part is WorkflowPart {
  if (!isRecord(part)) return false
  const type = part.type
  return typeof type === 'string' && WORKFLOW_PART_TYPES.has(type)
}

function normalizeStepStatus(raw?: string): WorkflowStepUiStatus {
  switch (raw) {
    case 'success':
    case 'completed':
      return 'success'
    case 'running':
    case 'executing':
      return 'running'
    case 'suspended':
      return 'suspended'
    case 'failed':
    case 'error':
      return 'failed'
    default:
      return 'pending'
  }
}

function parseRunId(partId?: string): string | null {
  if (!partId) return null
  return partId.includes(':') ? (partId.split(':')[0] ?? partId) : partId
}

function readSqlFromOutput(output: unknown): string | undefined {
  if (!isRecord(output)) return undefined
  if (typeof output.sql === 'string' && output.sql.trim()) {
    return output.sql.trim()
  }
  return undefined
}

function readReportFromOutput(output: unknown): string | undefined {
  if (!isRecord(output)) return undefined
  if (typeof output.report === 'string' && output.report.trim()) {
    return output.report.trim()
  }
  return undefined
}

function readSuspendPayload(payload: unknown): WorkflowSuspendPayload | null {
  if (!isRecord(payload)) return null
  const sql =
    typeof payload.sql === 'string' && payload.sql.trim()
      ? payload.sql.trim()
      : undefined
  const intentSummary =
    typeof payload.intentSummary === 'string'
      ? payload.intentSummary.trim()
      : undefined
  const sqlRevisionCount =
    typeof payload.sqlRevisionCount === 'number'
      ? payload.sqlRevisionCount
      : undefined
  if (!sql && !intentSummary && sqlRevisionCount == null) return null
  return { sql, intentSummary, sqlRevisionCount }
}

function scoreSuspendPayloadForSync(payload: unknown, status?: string): number {
  if (!isRecord(payload)) return -1
  let score = status === 'suspended' ? 10 : 0
  if (payload.approvalType === 'few-shot-save') score += 30
  if (payload.approvalType === 'query-normalization') score += 28
  if (payload.approvalType === 'intent-clarification') score += 26
  if (payload.approvalType === 'sql-approval') score += 12
  if (isRecord(payload.draft)) score += 6
  if (typeof payload.sql === 'string' && payload.sql.trim()) score += 3
  return score
}

function pickBestSuspendPayloadFromSteps(
  steps?: Record<string, StepSnapshot>,
): unknown | null {
  if (!steps) return null
  let bestScore = -1
  let bestPayload: unknown | null = null
  for (const step of Object.values(steps)) {
    const score = scoreSuspendPayloadForSync(step?.suspendPayload, step?.status)
    if (score > bestScore) {
      bestScore = score
      bestPayload = isRecord(step?.suspendPayload) ? step.suspendPayload : null
    }
  }
  return bestPayload
}

function pickBestSuspendCandidate(
  current:
    | {
        score: number
        partRecency: number
        stepIndex: number
        workflowId: string
        workflowRunId: string | null
        agentRunId: string | null
        payload: unknown
      }
    | null,
  params: {
    partRecency: number
    workflowId: string
    workflowRunId: string | null
    agentRunId: string | null
    payload: unknown
    status?: string
    stepId?: string
  },
) {
  const score = scoreSuspendPayloadForSync(params.payload, params.status)
  if (score < 0) return current
  const order = WORKFLOW_STEP_ORDER[params.workflowId] ?? []
  const normalizedStepId = params.stepId
    ? normalizeWorkflowStepId(params.stepId)
    : ''
  const stepIndex = normalizedStepId
    ? order.findIndex((step) => step.id === normalizedStepId)
    : -1
  const candidate = {
    score,
    partRecency: params.partRecency,
    stepIndex,
    workflowId: params.workflowId,
    workflowRunId: params.workflowRunId,
    agentRunId: params.agentRunId,
    payload: params.payload,
  }
  if (!current) {
    return candidate
  }
  if (candidate.partRecency > current.partRecency) {
    return candidate
  }
  if (candidate.partRecency < current.partRecency) {
    return current
  }
  if (candidate.stepIndex > current.stepIndex) {
    return candidate
  }
  if (candidate.stepIndex === current.stepIndex && candidate.score > current.score) {
    return {
      ...candidate,
    }
  }
  return current
}

function readReportFromFewShotSuspendPayload(payload: unknown): string | undefined {
  if (!isRecord(payload) || payload.approvalType !== 'few-shot-save') return undefined
  if (!isRecord(payload.draft)) return undefined
  const reportMarkdown = payload.draft.reportMarkdown
  if (typeof reportMarkdown !== 'string' || !reportMarkdown.trim()) return undefined
  return reportMarkdown.trim()
}

export function readPendingApprovalPayload(
  payload: unknown,
): WorkflowSuspendPayload | null {
  return readSuspendPayload(payload)
}

function readIntentClarificationHint(
  payload: unknown,
): WorkflowClarificationHint | null {
  if (!isRecord(payload) || payload.approvalType !== 'intent-clarification') {
    return null
  }
  const stageRaw = payload.clarificationStage
  const stage: WorkflowClarificationStage =
    stageRaw === 'sql-regeneration'
      ? 'sql-regeneration'
      : 'intent-disambiguation'
  const reason =
    typeof payload.reason === 'string' && payload.reason.trim()
      ? payload.reason.trim()
      : undefined
  const requiredFields = Array.isArray(payload.requiredFields)
    ? payload.requiredFields
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map((item) => item.trim())
    : undefined
  return { stage, reason, requiredFields }
}

/** 会话 metadata 中的 suspend 为服务端真值，覆盖流式 parts 滞后 */
export function applyPendingApprovalToProgress(
  progress: WorkflowProgressView,
  pending?: {
    workflowId?: string
    workflowRunId?: string
    agentRunId?: string
    payload?: unknown
  },
): WorkflowProgressView {
  if (TERMINAL_RUN_STATUSES.has(progress.runStatus)) return progress

  const pendingRunId = pending?.workflowRunId ?? pending?.agentRunId ?? null
  const progressRunId = progress.workflowRunId ?? null
  if (pendingRunId && progressRunId && pendingRunId !== progressRunId) {
    return progress
  }

  const clarificationHint = readIntentClarificationHint(pending?.payload)
  if (clarificationHint && progress.runStatus === 'suspended') {
    return {
      ...progress,
      clarificationHint,
    }
  }

  const p = readPendingApprovalPayload(pending?.payload)
  if (!p?.sql) return progress

  const resumeContext = progress.resumeContext
    ? {
        ...progress.resumeContext,
        sql: p.sql!,
        intentSummary: p.intentSummary ?? progress.resumeContext.intentSummary,
        sqlRevisionCount: p.sqlRevisionCount ?? progress.resumeContext.sqlRevisionCount,
        workflowId: pending?.workflowId ?? progress.resumeContext.workflowId,
      }
    : {
        sql: p.sql,
        intentSummary: p.intentSummary,
        workflowId: pending?.workflowId ?? progress.workflowId,
        workflowRunId: pending?.workflowRunId ?? null,
        agentRunId: pending?.agentRunId ?? null,
        sqlRevisionCount: p.sqlRevisionCount,
      }

  const steps = progress.steps.map((step) =>
    step.id === 'human-approval'
      ? { ...step, status: 'suspended' as const }
      : step,
  )

  return {
    ...progress,
    runStatus: 'suspended',
    steps,
    currentStepId: 'human-approval',
    sqlPreview: p.sql,
    resumeContext,
    clarificationHint: undefined,
  }
}

/** 将最新 suspend payload 写入助手消息 parts（便于持久化与解析一致） */
export function patchWorkflowPartsWithSuspendPayload(
  parts: unknown[],
  payload: WorkflowSuspendPayload,
  workflowRunId?: string | null,
): unknown[] {
  if (!payload.sql) return parts

  const next = [...parts]
  for (let i = next.length - 1; i >= 0; i--) {
    const part = next[i]
    if (!isWorkflowStreamPart(part) || !part.data) continue
    const data = part.data
    if (
      part.type === 'data-workflow-step' &&
      data.stepId === 'human-approval' &&
      data.step
    ) {
      next[i] = {
        ...part,
        data: {
          ...data,
          step: {
            ...data.step,
            status: 'suspended',
            suspendPayload: {
              ...(isRecord(data.step.suspendPayload) ? data.step.suspendPayload : {}),
              ...payload,
            },
          },
        },
      }
      return next
    }
    if (
      (part.type === 'data-workflow' || part.type === 'data-tool-workflow') &&
      data.steps?.['human-approval']
    ) {
      const ha = data.steps['human-approval']
      next[i] = {
        ...part,
        data: {
          ...data,
          status: 'suspended',
          steps: {
            ...data.steps,
            'human-approval': {
              ...ha,
              status: 'suspended',
              suspendPayload: {
                ...(isRecord(ha.suspendPayload) ? ha.suspendPayload : {}),
                ...payload,
              },
            },
          },
        },
      }
      return next
    }
  }

  if (workflowRunId) {
    next.push({
      type: 'data-workflow-step',
      id: `${workflowRunId}:human-approval`,
      data: {
        stepId: 'human-approval',
        step: {
          status: 'suspended',
          suspendPayload: payload,
        },
      },
    })
  }
  return next
}

function workflowIdFromToolName(toolName: string): string {
  if (toolName.includes('weeklyMetrics') || toolName.includes('weekly-metrics')) {
    return 'weekly-metrics'
  }
  return 'data-analysis-report'
}

/** 从 workflow 流式 part 的 id 提取 runId */
export function extractWorkflowRunIdFromParts(parts: unknown[]): string | null {
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i]
    if (!isWorkflowStreamPart(part)) continue
    const rid = parseRunId(
      typeof (part as { id?: string }).id === 'string'
        ? (part as { id: string }).id
        : undefined,
    )
    if (rid) return rid
  }
  return null
}

/**
 * 提取当前挂起步骤的 payload（SQL 审批 / few-shot 审批通用），
 * 用于同步会话 metadata，避免仅依赖流式时序导致弹窗不出现。
 */
export function extractWorkflowSuspendSyncContext(
  parts: unknown[],
): WorkflowSuspendSyncContext | null {
  let fallbackAgentRunId: string | null = null
  let fallbackWorkflowId = 'data-analysis-report'
  let fallbackPayload: unknown = null
  let bestCandidate:
    | {
        score: number
        partRecency: number
        stepIndex: number
        workflowId: string
        workflowRunId: string | null
        agentRunId: string | null
        payload: unknown
      }
    | null = null

  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i]
    if (!isRecord(part)) continue

    if (part.type === 'data-tool-call-suspended' && isRecord(part.data)) {
      const d = part.data
      if (!fallbackAgentRunId && typeof d.runId === 'string') {
        fallbackAgentRunId = d.runId
      }
      if (typeof d.toolName === 'string') {
        fallbackWorkflowId = workflowIdFromToolName(d.toolName)
      }
      if (!fallbackPayload && isRecord(d.suspendPayload)) {
        fallbackPayload = d.suspendPayload
      }
    }

    if (!isWorkflowStreamPart(part) || !part.data) continue
    const data = part.data
    const workflowId = normalizeWorkflowId(data.name ?? fallbackWorkflowId)
    const workflowRunId = parseRunId(
      typeof (part as { id?: string }).id === 'string'
        ? (part as { id: string }).id
        : undefined,
    )

    if (isRecord(data.step?.suspendPayload)) {
      bestCandidate = pickBestSuspendCandidate(bestCandidate, {
        partRecency: i,
        workflowId,
        workflowRunId,
        agentRunId: fallbackAgentRunId,
        payload: data.step.suspendPayload,
        status: data.step?.status,
        stepId: data.stepId,
      })
    }

    if (data.steps) {
      for (const [stepId, step] of Object.entries(data.steps)) {
        if (!isRecord(step?.suspendPayload)) continue
        bestCandidate = pickBestSuspendCandidate(bestCandidate, {
          partRecency: i,
          workflowId,
          workflowRunId,
          agentRunId: fallbackAgentRunId,
          payload: step.suspendPayload,
          status: step?.status,
          stepId,
        })
      }
    }
  }

  if (bestCandidate) {
    return {
      workflowId: bestCandidate.workflowId,
      workflowRunId: bestCandidate.workflowRunId,
      agentRunId: bestCandidate.agentRunId,
      payload: bestCandidate.payload,
    }
  }

  if (fallbackPayload && isRecord(fallbackPayload)) {
    return {
      workflowId: fallbackWorkflowId,
      workflowRunId: null,
      agentRunId: fallbackAgentRunId,
      payload: fallbackPayload,
    }
  }

  return null
}

/** 从消息 parts 提取 SQL 审批与 resume 上下文（不依赖会话 metadata） */
export function extractWorkflowResumeContext(
  parts: unknown[],
): WorkflowResumeContext | null {
  let agentRunId: string | null = null
  let fallbackAgentRunId: string | null = null
  let workflowRunId: string | null = null
  let workflowId = ''
  let toolCallId: string | undefined
  let fallbackToolCallId: string | undefined
  let approvalSql: string | undefined
  let approvalIntent: string | undefined
  let sqlRevisionCount: number | undefined
  let fallbackSql: string | undefined
  let fallbackSuspend: WorkflowSuspendPayload | null = null

  const applySuspend = (
    payload: WorkflowSuspendPayload | null,
    fromApprovalStep: boolean,
  ) => {
    if (!payload) return
    if (payload.sqlRevisionCount != null) {
      sqlRevisionCount = payload.sqlRevisionCount
    }
    if (fromApprovalStep) {
      if (payload.sql) approvalSql = payload.sql
      if (payload.intentSummary) approvalIntent = payload.intentSummary
    } else if (payload.sql && !approvalSql) {
      fallbackSql = payload.sql
    }
  }

  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i]
    if (!isRecord(part)) continue

    if (part.type === 'data-tool-call-suspended' && isRecord(part.data)) {
      const d = part.data
      if (!fallbackAgentRunId && typeof d.runId === 'string') {
        fallbackAgentRunId = d.runId
      }
      if (!fallbackToolCallId && typeof d.toolCallId === 'string') {
        fallbackToolCallId = d.toolCallId
      }
      if (!workflowId && typeof d.toolName === 'string') {
        workflowId = workflowIdFromToolName(d.toolName)
      }
      if (!fallbackSuspend) {
        fallbackSuspend = readSuspendPayload(d.suspendPayload)
      }
    }

    if (!isWorkflowStreamPart(part) || !part.data) continue
    const data = part.data

    if (!workflowId && data.name) {
      workflowId = normalizeWorkflowId(data.name)
    }
    const rid = parseRunId(
      typeof (part as { id?: string }).id === 'string'
        ? (part as { id: string }).id
        : undefined,
    )
    if (rid && !workflowRunId) workflowRunId = rid

    const stepId = data.stepId
    const fromApprovalStep =
      stepId === 'human-approval' ||
      (data.steps && 'human-approval' in data.steps)

    if (stepId && data.step) {
      applySuspend(readSuspendPayload(data.step.suspendPayload), stepId === 'human-approval')
      if (stepId === 'human-approval' && data.step.status) {
        /* 审批步的最新快照优先 */
      }
    }

    if (data.steps) {
      const ha = data.steps['human-approval']
      if (ha) {
        applySuspend(readSuspendPayload(ha.suspendPayload), true)
      }
      if (!fromApprovalStep) {
        for (const [id, step] of Object.entries(data.steps)) {
          if (id === 'human-approval') continue
          applySuspend(readSuspendPayload(step?.suspendPayload), false)
        }
      }
    }
  }

  // workflow parts 优先；仅在缺失时回退到 data-tool-call-suspended
  if (!agentRunId && fallbackAgentRunId) {
    agentRunId = fallbackAgentRunId
  }
  if (!toolCallId && fallbackToolCallId) {
    toolCallId = fallbackToolCallId
  }
  if (!approvalSql && fallbackSuspend?.sql) {
    approvalSql = fallbackSuspend.sql
  }
  if (!approvalIntent && fallbackSuspend?.intentSummary) {
    approvalIntent = fallbackSuspend.intentSummary
  }
  if (sqlRevisionCount == null && fallbackSuspend?.sqlRevisionCount != null) {
    sqlRevisionCount = fallbackSuspend.sqlRevisionCount
  }

  if (!approvalSql) return null

  return {
    sql: approvalSql,
    intentSummary: approvalIntent,
    workflowId: workflowId || 'data-analysis-report',
    workflowRunId,
    agentRunId,
    toolCallId,
    sqlRevisionCount,
  }
}

/** @deprecated 使用 extractWorkflowResumeContext */
export function extractSqlApprovalFromParts(
  parts: unknown[],
): WorkflowResumeContext | null {
  return extractWorkflowResumeContext(parts)
}

function extractSqlFromToolWorkflowOutput(parts: unknown[]): string | undefined {
  for (const part of parts) {
    if (!isRecord(part) || typeof part.type !== 'string') continue
    if (!part.type.startsWith('tool-workflow')) continue
    const output = part.output
    if (!isRecord(output)) continue
    const direct = readSqlFromOutput(output)
    if (direct) return direct
    if (isRecord(output.steps)) {
      for (const step of Object.values(output.steps)) {
        const fromSuspend = readSuspendPayload(
          isRecord(step) ? step.suspendPayload : null,
        )
        if (fromSuspend?.sql) return fromSuspend.sql
        const fromOut = readSqlFromOutput(isRecord(step) ? step.output : null)
        if (fromOut) return fromOut
      }
    }
  }
  return undefined
}

/** 从 generate-sql 等步骤 output 提取 SQL（审批前预览） */
export function extractGeneratedSqlFromParts(parts: unknown[]): string | undefined {
  let sql: string | undefined

  for (const part of parts) {
    if (!isWorkflowStreamPart(part) || !part.data?.steps) continue
    const steps = part.data.steps
    for (const key of ['generate-sql', 'human-approval'] as const) {
      const fromOutput = readSqlFromOutput(steps[key]?.output)
      if (fromOutput) sql = fromOutput
    }
    for (const step of Object.values(steps)) {
      const fromOutput = readSqlFromOutput(step?.output)
      if (fromOutput) sql = fromOutput
      const fromInput = readSqlFromOutput(step?.input)
      if (fromInput) sql = fromInput
    }
  }

  return sql ?? extractSqlFromToolWorkflowOutput(parts)
}

/** 从 interpret-results 等步骤 output 提取最终 Markdown 报告 */
export function extractWorkflowReportFromParts(parts: unknown[]): string | undefined {
  let report: string | undefined

  for (const part of parts) {
    if (!isWorkflowStreamPart(part) || !part.data?.steps) continue
    const steps = part.data.steps

    const interpretReport = readReportFromOutput(steps['interpret-results']?.output)
    if (interpretReport) report = interpretReport

    for (const step of Object.values(steps)) {
      const fromOutput = readReportFromOutput(step?.output)
      if (fromOutput) report = fromOutput
    }
  }

  if (report) return report

  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i]
    if (!isWorkflowStreamPart(part) || !part.data) continue
    const data = part.data
    const fromStep = readReportFromFewShotSuspendPayload(data.step?.suspendPayload)
    if (fromStep) return fromStep
    if (!data.steps) continue
    for (const step of Object.values(data.steps)) {
      const fromSteps = readReportFromFewShotSuspendPayload(step?.suspendPayload)
      if (fromSteps) return fromSteps
    }
  }

  return report
}

function mergeStepStatuses(
  target: Record<string, WorkflowStepUiStatus>,
  steps?: Record<string, StepSnapshot>,
): void {
  if (!steps) return
  const rank: Record<WorkflowStepUiStatus, number> = {
    pending: 0,
    running: 1,
    suspended: 2,
    success: 3,
    failed: 4,
  }
  for (const [id, step] of Object.entries(steps)) {
    if (!step?.status) continue
    const normalizedId = normalizeWorkflowStepId(id)
    const next = normalizeStepStatus(step.status)
    const prev = target[normalizedId]
    if (!prev || rank[next] >= rank[prev]) {
      target[normalizedId] = next
    }
  }
}

function orderedStepDefs(
  workflowId: string,
  statusById: Record<string, WorkflowStepUiStatus>,
): { id: string; label: string }[] {
  const known = WORKFLOW_STEP_ORDER[workflowId]
  if (known) return known

  const seen = new Set<string>()
  const ordered: { id: string; label: string }[] = []
  for (const id of Object.keys(statusById)) {
    if (seen.has(id)) continue
    seen.add(id)
    ordered.push({ id, label: id })
  }
  return ordered
}

/** 驳回后 dountil 重跑时，当前 running 步之后的步骤应显示为 pending */
function resetStepsAfterRerun(
  workflowId: string,
  statusById: Record<string, WorkflowStepUiStatus>,
): void {
  const order = WORKFLOW_STEP_ORDER[workflowId]
  if (!order?.length) return
  const runningIdx = order.findIndex((s) => statusById[s.id] === 'running')
  if (runningIdx < 0) return
  for (let i = runningIdx + 1; i < order.length; i++) {
    const id = order[i].id
    const st = statusById[id]
    if (st === 'success' || st === 'suspended' || st === 'failed') {
      statusById[id] = 'pending'
    }
  }
}

/**
 * 某些流片段不会回传完整历史步骤，导致前置步骤误显示为 pending。
 * 依据当前最靠后的非 pending 步骤，补齐其之前步骤为 success。
 */
function fillImplicitCompletedSteps(
  workflowId: string,
  statusById: Record<string, WorkflowStepUiStatus>,
): void {
  const order = WORKFLOW_STEP_ORDER[workflowId]
  if (!order?.length) return

  let furthestIdx = -1
  for (let i = 0; i < order.length; i++) {
    const st = statusById[order[i].id]
    if (st && st !== 'pending') {
      furthestIdx = i
    }
  }
  if (furthestIdx <= 0) return

  for (let i = 0; i < furthestIdx; i++) {
    const id = order[i].id
    const st = statusById[id]
    if (st !== 'failed') {
      statusById[id] = 'success'
    }
  }
}

function pickCurrentStepId(
  steps: WorkflowStepProgress[],
): string | null {
  const suspended = [...steps].reverse().find((s) => s.status === 'suspended')
  if (suspended) return suspended.id

  const running = steps.find((s) => s.status === 'running')
  if (running) return running.id

  const failed = steps.find((s) => s.status === 'failed')
  if (failed) return failed.id

  const firstPending = steps.find((s) => s.status === 'pending')
  if (firstPending) return firstPending.id

  return steps.at(-1)?.id ?? null
}

export function parseWorkflowProgressFromParts(
  parts: unknown[],
): WorkflowProgressView | null {
  let workflowId = ''
  let runStatus = 'running'
  const statusById: Record<string, WorkflowStepUiStatus> = {}

  const observedWorkflowIds: string[] = []
  for (const part of parts) {
    if (!isWorkflowStreamPart(part) || !part.data?.name) continue
    observedWorkflowIds.push(normalizeWorkflowId(part.data.name))
  }

  const preferredWorkflowId =
    observedWorkflowIds.find((id) => id === 'data-analysis-report') ??
    observedWorkflowIds.find((id) => id === 'weekly-metrics') ??
    observedWorkflowIds[observedWorkflowIds.length - 1] ??
    ''

  for (const part of parts) {
    if (!isWorkflowStreamPart(part) || !part.data) continue
    const data = part.data
    const partWorkflowId = data.name ? normalizeWorkflowId(data.name) : preferredWorkflowId

    if (data.name) {
      // 主流程优先：避免被 data-analysis-prep 子流程覆盖为 3 步进度
      if (!workflowId) workflowId = preferredWorkflowId || partWorkflowId
    }
    if (data.status && (!preferredWorkflowId || partWorkflowId === preferredWorkflowId)) {
      runStatus = data.status
    }

    if (!preferredWorkflowId || partWorkflowId === preferredWorkflowId) {
      mergeStepStatuses(statusById, data.steps)
    }

    if (
      data.stepId &&
      data.step?.status &&
      (!preferredWorkflowId || partWorkflowId === preferredWorkflowId)
    ) {
      const id = normalizeWorkflowStepId(data.stepId)
      const next = normalizeStepStatus(data.step.status)
      const prev = statusById[id]
      const rank: Record<WorkflowStepUiStatus, number> = {
        pending: 0,
        running: 1,
        suspended: 2,
        success: 3,
        failed: 4,
      }
      if (!prev || rank[next] >= rank[prev]) {
        statusById[id] = next
      }
    }
  }

  if (!workflowId && Object.keys(statusById).length === 0) {
    return null
  }

  if (!workflowId) {
    workflowId = 'workflow'
  }

  resetStepsAfterRerun(workflowId, statusById)
  fillImplicitCompletedSteps(workflowId, statusById)

  const defs = orderedStepDefs(workflowId, statusById)
  const steps: WorkflowStepProgress[] = defs.map((def) => ({
    id: def.id,
    label: def.label,
    status: statusById[def.id] ?? 'pending',
  }))

  // 已知 workflow 不追加未知步骤，避免 data-analysis-prep 被混入主流程进度条
  if (!WORKFLOW_STEP_ORDER[workflowId]) {
    for (const [id, status] of Object.entries(statusById)) {
      if (steps.some((s) => s.id === id)) continue
      steps.push({ id, label: id, status })
    }
  }

  if (statusById['human-approval'] === 'suspended') {
    runStatus = 'suspended'
  }

  if (runStatus === 'suspended') {
    const approvalIdx = steps.findIndex((s) => s.id === 'human-approval')
    if (approvalIdx >= 0 && steps[approvalIdx].status === 'pending') {
      steps[approvalIdx] = { ...steps[approvalIdx], status: 'suspended' }
    }
  }

  const completedCount = steps.filter((s) => s.status === 'success').length
  const resumeContext = extractWorkflowResumeContext(parts)
  const sqlPreview =
    resumeContext?.sql ?? extractGeneratedSqlFromParts(parts)

  const view: WorkflowProgressView = {
    workflowId,
    workflowRunId: extractWorkflowRunIdFromParts(parts),
    workflowTitle: WORKFLOW_TITLES[workflowId] ?? workflowId,
    runStatus,
    steps,
    currentStepId: pickCurrentStepId(steps),
    completedCount,
    totalCount: steps.length,
    sqlPreview,
    resumeContext: resumeContext ?? undefined,
  }

  if (!isAwaitingSqlApproval(view)) {
    view.resumeContext = undefined
  }

  return view
}

type WorkflowStatusApiStep = {
  status?: string
  suspendPayload?: unknown
  output?: unknown
}

/** 将 GET /api/workflow/status 转为 data-workflow part */
export function buildWorkflowPartFromStatusApi(data: {
  runId: string
  workflowName: string
  status: string
  steps: Record<string, WorkflowStatusApiStep | WorkflowStatusApiStep[]>
}): WorkflowPart {
  const flatSteps: Record<string, StepSnapshot> = {}

  const ingest = (rawId: string, raw: WorkflowStatusApiStep | WorkflowStatusApiStep[]) => {
    const step = Array.isArray(raw) ? raw[raw.length - 1] : raw
    if (!step?.status) return
    const id = normalizeWorkflowStepId(rawId)
    if (WORKFLOW_STEP_ORDER['data-analysis-report']?.some((d) => d.id === id)) {
      flatSteps[id] = {
        status: step.status,
        suspendPayload: step.suspendPayload ?? null,
        output: step.output,
      }
    }
  }

  for (const [rawId, raw] of Object.entries(data.steps)) {
    ingest(rawId, raw)
    const step = Array.isArray(raw) ? raw[raw.length - 1] : raw
    const nested = step && isRecord(step.output) ? step.output : null
    if (nested && isRecord((nested as { steps?: unknown }).steps)) {
      for (const [innerId, inner] of Object.entries(
        (nested as { steps: Record<string, WorkflowStatusApiStep> }).steps,
      )) {
        ingest(innerId, inner)
      }
    }
  }

  return {
    type: 'data-workflow',
    id: data.runId,
    data: {
      name: normalizeWorkflowId(data.workflowName),
      status: data.status,
      steps: flatSteps,
    },
  } as WorkflowPart & { id: string }
}

/** 仅最后一条含 workflow 的助手消息应展示进度条 */
export function findLastAssistantWorkflowMessageId(
  messages: { id: string; role: string; parts: unknown[] }[],
): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role !== 'assistant') continue
    if (
      parseWorkflowProgressFromParts(m.parts) ||
      detectWorkflowToolKey(m.parts)
    ) {
      return m.id
    }
  }
  return null
}

/** 仅有 tool-workflow-* 尚无 data-workflow 时，展示占位进度 */
export function bootstrapWorkflowProgress(
  toolWorkflowKey: string,
): WorkflowProgressView {
  const workflowId = normalizeWorkflowId(toolWorkflowKey)
  const defs =
    WORKFLOW_STEP_ORDER[workflowId] ?? [{ id: 'start', label: '启动流程' }]
  const steps: WorkflowStepProgress[] = defs.map((def, index) => ({
    id: def.id,
    label: def.label,
    status: index === 0 ? 'running' : 'pending',
  }))

  return {
    workflowId,
    workflowTitle: WORKFLOW_TITLES[workflowId] ?? workflowId,
    runStatus: 'running',
    steps,
    currentStepId: steps[0]?.id ?? null,
    completedCount: 0,
    totalCount: steps.length,
  }
}

export function detectWorkflowToolKey(parts: unknown[]): string | null {
  for (const part of parts) {
    if (!isRecord(part) || typeof part.type !== 'string') continue
    if (part.type.startsWith('tool-workflow-')) {
      return part.type.replace('tool-workflow-', '')
    }
    if (part.type === 'tool-workflow') {
      const name = part.toolName
      if (typeof name === 'string') return name
    }
  }
  return null
}

export function isWorkflowDataPartType(type: string | undefined): boolean {
  return typeof type === 'string' && WORKFLOW_PART_TYPES.has(type)
}
