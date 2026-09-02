'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { UIMessage } from '@ai-sdk/react'
import { fetchConversationById, toInitialMessage } from '@/lib/conversation-store'
import type { ConversationMetadata } from '@/lib/db/conversations'
import { resolveIntentClarificationDialogState } from '@/lib/intent-clarification-dialog-state'
import { resumeAfterSqlApproval } from '@/lib/workflow-resume-client'
import { Button } from '@/components/ui/button'
import {
  EMPTY_SQL_CLARIFICATION,
  WorkflowSqlRejectDialog,
} from './WorkflowSqlRejectDialog'
import type { SqlClarification } from '@/lib/sql-clarification'

type ClarificationStage = 'intent-disambiguation' | 'sql-regeneration'

type IntentClarificationPayload = {
  approvalType?: string
  clarificationStage?: ClarificationStage
  reason?: string
  candidateTables?: string[]
  requiredFields?: string[]
  inferredTable?: string
}

function readIntentClarificationPayload(
  payload: unknown,
): IntentClarificationPayload | null {
  if (!payload || typeof payload !== 'object') return null
  const data = payload as IntentClarificationPayload
  if (data.approvalType !== 'intent-clarification') return null
  return data
}

interface WorkflowIntentClarificationDialogProps {
  conversationId: string | null
  mastraResourceId: string
  pendingApproval?: ConversationMetadata['pendingApproval']
  onResolved?: () => void
  onMessagesUpdate?: (conversationId: string, messages: UIMessage[]) => void
}

export function WorkflowIntentClarificationDialog({
  conversationId,
  mastraResourceId,
  pendingApproval,
  onResolved,
  onMessagesUpdate,
}: WorkflowIntentClarificationDialogProps) {
  const payloadFromPending = useMemo(
    () => readIntentClarificationPayload(pendingApproval?.payload),
    [pendingApproval?.payload],
  )
  const [loading, setLoading] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(true)
  const [submitErrorByStage, setSubmitErrorByStage] = useState<
    Partial<Record<ClarificationStage, string>>
  >({})
  const [latchedPendingApproval, setLatchedPendingApproval] =
    useState<ConversationMetadata['pendingApproval']>()
  const [latchedPayload, setLatchedPayload] =
    useState<IntentClarificationPayload | null>(null)
  const [clarificationByStage, setClarificationByStage] = useState<
    Record<ClarificationStage, SqlClarification>
  >({
    'intent-disambiguation': {
      ...EMPTY_SQL_CLARIFICATION,
      tableName: payloadFromPending?.inferredTable ?? '',
    },
    'sql-regeneration': {
      ...EMPTY_SQL_CLARIFICATION,
      tableName: payloadFromPending?.inferredTable ?? '',
    },
  })
  const initializedRunKeyRef = useRef<string | null>(null)
  const activeConversationIdRef = useRef<string | null>(conversationId)

  useEffect(() => {
    if (activeConversationIdRef.current === conversationId) return
    activeConversationIdRef.current = conversationId
    initializedRunKeyRef.current = null
    setLatchedPendingApproval(undefined)
    setLatchedPayload(null)
    setDialogOpen(true)
    setSubmitErrorByStage({})
    setClarificationByStage({
      'intent-disambiguation': { ...EMPTY_SQL_CLARIFICATION },
      'sql-regeneration': { ...EMPTY_SQL_CLARIFICATION },
    })
  }, [conversationId])

  useEffect(() => {
    if (!pendingApproval || !payloadFromPending) return
    setLatchedPendingApproval(pendingApproval)
    setLatchedPayload(payloadFromPending)
  }, [pendingApproval, payloadFromPending])

  const { effectivePendingApproval, payload } =
    resolveIntentClarificationDialogState({
      pendingApproval,
      payloadFromPending,
      latchedPendingApproval,
      latchedPayload,
      loading,
    })
  const stage: ClarificationStage =
    payload?.clarificationStage === 'sql-regeneration'
      ? 'sql-regeneration'
      : 'intent-disambiguation'

  const runKey = useMemo(
    () =>
      effectivePendingApproval
        ? `${effectivePendingApproval.workflowRunId ?? ''}:${effectivePendingApproval.agentRunId ?? ''}:${effectivePendingApproval.workflowId ?? ''}:${stage}`
        : null,
    [effectivePendingApproval, stage],
  )
  const payloadFingerprint = useMemo(
    () => (payload ? JSON.stringify(payload) : null),
    [payload],
  )

  useEffect(() => {
    const initKey =
      runKey && payloadFingerprint ? `${runKey}:${payloadFingerprint}` : null
    if (payload && initKey && initializedRunKeyRef.current !== initKey) {
      console.info('[intent-clarification] open', {
        workflowRunId: effectivePendingApproval?.workflowRunId ?? null,
        stage,
        requiredFields: payload.requiredFields ?? [],
        inferredTable: payload.inferredTable ?? null,
      })
      initializedRunKeyRef.current = initKey
      setDialogOpen(true)
      setSubmitErrorByStage((prev) => ({ ...prev, [stage]: '' }))
      setClarificationByStage((prev) => ({
        ...prev,
        [stage]: {
          ...prev[stage],
          tableName: payload?.inferredTable ?? prev[stage].tableName ?? '',
        },
      }))
    }
  }, [
    payload?.inferredTable,
    payload?.requiredFields,
    effectivePendingApproval?.workflowRunId,
    runKey,
    payload,
    payloadFingerprint,
    effectivePendingApproval,
    stage,
  ])

  const open = Boolean(conversationId && effectivePendingApproval && payload)
  if (!open || !conversationId || !effectivePendingApproval || !payload) return null

  const clarification = clarificationByStage[stage] ?? { ...EMPTY_SQL_CLARIFICATION }
  const submitError = submitErrorByStage[stage] ?? null
  const requiredFields = payload.requiredFields ?? []
  const title =
    stage === 'sql-regeneration'
      ? '澄清 SQL 重写需求并重新生成 SQL'
      : '澄清分析需求并重新生成 SQL'
  const subtitle =
    stage === 'sql-regeneration'
      ? '当前为 SQL 重写澄清阶段，补充本轮缺失约束后提交（最多 3 轮）'
      : '当前为意图澄清阶段，确认表、维度、时间与分析方式（最多 3 轮）'
  const isConfirmValid = (value: SqlClarification): boolean => {
    if (!value.tableName.trim()) return false
    if (requiredFields.length === 0) return true
    const fieldSet = new Set<string>([
      ...value.dimensions,
      ...value.metrics,
    ])
    return requiredFields.every((field) => {
      if (field === 'dimensions') return value.dimensions.length > 0
      if (field === 'metrics') return value.metrics.length > 0
      if (field === 'timeStart') return Boolean(value.timeStart)
      if (field === 'timeEnd') return Boolean(value.timeEnd)
      if (field === 'analysisStrategyId') return Boolean(value.analysisStrategyId)
      return (
        fieldSet.has(field) ||
        value.additionalNotes.toLowerCase().includes(field.toLowerCase())
      )
    })
  }
  const invalidHint = requiredFields.length
    ? `请至少补充以下字段后提交：${requiredFields.join('、')}`
    : '请先确认目标表后提交'

  const handleConfirm = async (args: {
    feedback: string
    clarification: SqlClarification
  }) => {
    // 交互优化：点击提交后立即关闭弹窗，避免长时间等待造成“卡住”感。
    setDialogOpen(false)
    setLoading(true)
    setSubmitErrorByStage((prev) => ({ ...prev, [stage]: '' }))
    console.info('[intent-clarification] submit start', {
      workflowRunId: effectivePendingApproval.workflowRunId ?? null,
      stage,
      tableName: args.clarification.tableName,
      dimensions: args.clarification.dimensions,
      metrics: args.clarification.metrics,
    })
    try {
      const conversation = await fetchConversationById(conversationId)
      const messages = (conversation?.messages ?? []).map(toInitialMessage) as UIMessage[]
      await resumeAfterSqlApproval({
        approved: false,
        feedback: args.feedback,
        clarification: args.clarification,
        conversationId,
        mastraResourceId,
        messages,
        context: {
          workflowId: effectivePendingApproval.workflowId,
          workflowRunId: effectivePendingApproval.workflowRunId ?? null,
          agentRunId: effectivePendingApproval.agentRunId ?? null,
          sql: '',
        },
        onMessagesUpdate: (next) => onMessagesUpdate?.(conversationId, next),
      })
      console.info('[intent-clarification] submit success', {
        workflowRunId: effectivePendingApproval.workflowRunId ?? null,
        stage,
      })
      setDialogOpen(false)
      setLatchedPendingApproval(undefined)
      setLatchedPayload(null)
      onResolved?.()
    } catch (error) {
      const message = error instanceof Error ? error.message : '提交澄清失败'
      console.error('[intent-clarification] submit failed', {
        workflowRunId: effectivePendingApproval.workflowRunId ?? null,
        stage,
        message,
      })
      setDialogOpen(true)
      setSubmitErrorByStage((prev) => ({ ...prev, [stage]: message }))
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {!dialogOpen && !loading && (
        <div className="fixed right-6 bottom-24 z-[105]">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              console.info('[intent-clarification] reopen dialog', {
                workflowRunId: effectivePendingApproval.workflowRunId ?? null,
                stage,
              })
              setDialogOpen(true)
            }}
          >
            打开澄清弹窗
          </Button>
        </div>
      )}
      {dialogOpen && (
        <div className="fixed inset-0 z-[99] bg-black/40">
          <WorkflowSqlRejectDialog
            open={true}
            loading={loading}
            title={title}
            subtitle={subtitle}
            clarification={clarification}
            onClarificationChange={(value) =>
              setClarificationByStage((prev) => ({ ...prev, [stage]: value }))
            }
            onCancel={() => {
              console.info('[intent-clarification] cancel dialog', {
                workflowRunId: effectivePendingApproval.workflowRunId ?? null,
                stage,
              })
              setDialogOpen(false)
            }}
            isConfirmValid={isConfirmValid}
            invalidHint={invalidHint}
            onConfirm={handleConfirm}
          />
          <div className="pointer-events-none fixed top-20 left-1/2 z-[101] w-[min(900px,90vw)] -translate-x-1/2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
            {submitError ?? payload.reason ?? '请先补充澄清信息后继续执行分析。'}
          </div>
        </div>
      )}
    </>
  )
}
