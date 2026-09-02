'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { UIMessage } from '@ai-sdk/react'
import { Button } from '@/components/ui/button'
import { fetchConversationById, toInitialMessage } from '@/lib/conversation-store'
import type { ConversationMetadata } from '@/lib/db/conversations'
import { resolveIntentClarificationDialogState } from '@/lib/intent-clarification-dialog-state'
import { resumeAfterSqlApproval } from '@/lib/workflow-resume-client'

type QueryNormalizationPayload = {
  approvalType?: string
  originalQuery?: string
  normalizedQuery?: string
}

function readQueryNormalizationPayload(
  payload: unknown,
): QueryNormalizationPayload | null {
  if (!payload || typeof payload !== 'object') return null
  const data = payload as QueryNormalizationPayload
  if (data.approvalType !== 'query-normalization') return null
  if (typeof data.normalizedQuery !== 'string') return null
  return data
}

interface QueryNormalizationDialogProps {
  conversationId: string | null
  mastraResourceId: string
  pendingApproval?: ConversationMetadata['pendingApproval']
  onResolved?: () => void
  onMessagesUpdate?: (conversationId: string, messages: UIMessage[]) => void
}

export function QueryNormalizationDialog({
  conversationId,
  mastraResourceId,
  pendingApproval,
  onResolved,
  onMessagesUpdate,
}: QueryNormalizationDialogProps) {
  const payloadFromPending = useMemo(
    () => readQueryNormalizationPayload(pendingApproval?.payload),
    [pendingApproval?.payload],
  )
  const [loading, setLoading] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(true)
  const [submitError, setSubmitError] = useState('')
  const [showOriginal, setShowOriginal] = useState(false)
  const [confirmedQuery, setConfirmedQuery] = useState(
    payloadFromPending?.normalizedQuery ?? '',
  )
  const [latchedPendingApproval, setLatchedPendingApproval] =
    useState<ConversationMetadata['pendingApproval']>()
  const [latchedPayload, setLatchedPayload] =
    useState<QueryNormalizationPayload | null>(null)
  const initializedRunKeyRef = useRef<string | null>(null)
  const activeConversationIdRef = useRef<string | null>(conversationId)

  useEffect(() => {
    if (activeConversationIdRef.current === conversationId) return
    activeConversationIdRef.current = conversationId
    initializedRunKeyRef.current = null
    setLatchedPendingApproval(undefined)
    setLatchedPayload(null)
    setDialogOpen(true)
    setSubmitError('')
    setShowOriginal(false)
    setConfirmedQuery('')
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

  const runKey = useMemo(
    () =>
      effectivePendingApproval
        ? `${effectivePendingApproval.workflowRunId ?? ''}:${effectivePendingApproval.agentRunId ?? ''}:${effectivePendingApproval.workflowId ?? ''}`
        : null,
    [effectivePendingApproval],
  )

  useEffect(() => {
    if (!runKey || !payload) return
    if (initializedRunKeyRef.current === runKey) return
    initializedRunKeyRef.current = runKey
    setConfirmedQuery(payload.normalizedQuery ?? '')
    setDialogOpen(true)
    setSubmitError('')
  }, [runKey, payload])

  if (!conversationId || !effectivePendingApproval || !payload) return null

  const canConfirm = Boolean(confirmedQuery.trim())

  const handleResume = async (approved: boolean) => {
    if (approved && !canConfirm) {
      setSubmitError('规范文本不能为空')
      return
    }
    setDialogOpen(false)
    setLoading(true)
    setSubmitError('')
    try {
      const conversation = await fetchConversationById(conversationId)
      const messages = (conversation?.messages ?? []).map(
        toInitialMessage,
      ) as UIMessage[]
      await resumeAfterSqlApproval({
        approved,
        conversationId,
        mastraResourceId,
        messages,
        context: {
          workflowId: 'query-normalization',
          // 工具挂起不是真实 Workflow；即使 metadata 误写了 workflowRunId 也强制走 agent resume
          workflowRunId: null,
          agentRunId:
            effectivePendingApproval.agentRunId ??
            effectivePendingApproval.workflowRunId ??
            null,
          sql: '',
        },
        extraResumeData: approved
          ? { confirmedQuery: confirmedQuery.trim() }
          : undefined,
        onMessagesUpdate: (next) => onMessagesUpdate?.(conversationId, next),
      })
      setLatchedPendingApproval(undefined)
      setLatchedPayload(null)
      onResolved?.()
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '提交规范化确认失败'
      setDialogOpen(true)
      setSubmitError(message)
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
            onClick={() => setDialogOpen(true)}
          >
            打开查询确认
          </Button>
        </div>
      )}
      {dialogOpen && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/55 p-3 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="query-normalization-title"
        >
          <div className="flex w-full max-w-xl flex-col overflow-hidden rounded-lg border border-border bg-card shadow-2xl">
            <div className="shrink-0 border-b border-border px-4 py-3">
              <h3
                id="query-normalization-title"
                className="text-base font-semibold"
              >
                请确认查询理解
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                可编辑规范文本后确认继续；确认后下游将按此文本查数。
              </p>
            </div>

            <div className="grid gap-3 px-4 py-3">
              <section>
                <label className="text-xs font-medium text-foreground">
                  规范文本
                </label>
                <textarea
                  className="mt-1 w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                  rows={4}
                  value={confirmedQuery}
                  disabled={loading}
                  onChange={(e) => setConfirmedQuery(e.target.value)}
                />
              </section>

              <section>
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                  onClick={() => setShowOriginal((v) => !v)}
                >
                  {showOriginal ? '收起原话' : '查看原话'}
                </button>
                {showOriginal && (
                  <p className="mt-1 rounded-md border border-border/70 bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground whitespace-pre-wrap">
                    {payload.originalQuery?.trim() || '（无原话）'}
                  </p>
                )}
              </section>

              {submitError ? (
                <p className="rounded-md border border-warning/40 bg-warning/10 px-2 py-1.5 text-xs text-warning">
                  {submitError}
                </p>
              ) : null}
            </div>

            <div className="flex shrink-0 justify-end gap-2 border-t border-border px-4 py-3">
              <Button
                type="button"
                variant="outline"
                disabled={loading}
                onClick={() => void handleResume(false)}
              >
                取消
              </Button>
              <Button
                type="button"
                disabled={loading || !canConfirm}
                onClick={() => void handleResume(true)}
              >
                {loading ? '提交中…' : '确认并继续'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
