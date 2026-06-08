'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { parseClarificationError } from '@/lib/clarification-error'
import type { ConversationMetadata } from '@/lib/db/conversations'
import { extractPrimaryTableName } from '@/lib/sql-table-extract'
import {
  fetchConversationById,
  toInitialMessage,
} from '@/lib/conversation-store'
import type { WorkflowResumeContext } from '@/lib/workflow-progress'
import { clearPendingApprovalOnClient } from '@/lib/workflow-pending-approval-client'
import { resumeAfterSqlApproval } from '@/lib/workflow-resume-client'
import { SqlCodeBlock } from './SqlCodeBlock'
import {
  EMPTY_SQL_CLARIFICATION,
  WorkflowSqlRejectDialog,
} from './WorkflowSqlRejectDialog'
import type { SqlClarification } from '@/lib/sql-clarification'

interface WorkflowApprovalBannerProps {
  conversationId: string
  mastraResourceId: string
  metadata?: ConversationMetadata
  onResolved?: () => void
}

export function WorkflowApprovalBanner({
  conversationId,
  mastraResourceId,
  metadata,
  onResolved,
}: WorkflowApprovalBannerProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
  const [rejectClarification, setRejectClarification] =
    useState<SqlClarification>(EMPTY_SQL_CLARIFICATION)
  const clarificationErrors = error ? parseClarificationError(error) : []

  const pending = metadata?.pendingApproval
  const runId = metadata?.activeWorkflowRunId
  if (!pending || !runId || loading) return null

  const payload = pending.payload as { sql?: string; intentSummary?: string }
  const sql = payload?.sql ?? '(无 SQL)'
  const sqlTableName = extractPrimaryTableName(sql)

  const submitDecision = async (
    approved: boolean,
    feedback?: string,
    clarification?: SqlClarification,
  ) => {
    setLoading(true)
    setError(null)
    try {
      if (!approved) {
        await clearPendingApprovalOnClient(conversationId)
        onResolved?.()
      }
      const conv = await fetchConversationById(conversationId)
      const messages = conv?.messages.map(toInitialMessage) ?? []
      if (messages.length === 0) {
        throw new Error('会话消息为空，请刷新页面后重试')
      }

      const context: WorkflowResumeContext = {
        sql: payload?.sql ?? '',
        intentSummary: payload?.intentSummary,
        workflowId: pending.workflowId,
        workflowRunId: pending.workflowRunId ?? runId,
        agentRunId: pending.agentRunId ?? null,
      }

      if (!context.sql) {
        throw new Error('缺少待审批 SQL')
      }

      await resumeAfterSqlApproval({
        approved,
        feedback,
        clarification,
        conversationId,
        mastraResourceId,
        messages,
        context,
        onMessagesUpdate: () => {},
      })
      setRejectDialogOpen(false)
      onResolved?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="sticky top-0 z-20 shrink-0 border-b border-warning/40 bg-warning/10 px-4 py-3 text-sm shadow-sm">
        <p className="font-medium text-warning">
          {pending.workflowId === 'weekly-metrics'
            ? '周报流程'
            : '标准分析流程'}{' '}
          — 待确认 SQL
        </p>
        {payload?.intentSummary && (
          <p className="mt-1 text-muted-foreground">{payload.intentSummary}</p>
        )}
        {sqlTableName && (
          <p className="mt-1 text-xs text-muted-foreground">
            当前 SQL 表：<span className="font-mono text-foreground">{sqlTableName}</span>
          </p>
        )}
        <SqlCodeBlock sql={sql} maxHeightClassName="max-h-32" />
        <div className="mt-3 flex gap-2">
          <Button
            type="button"
            size="sm"
            disabled={loading}
            onClick={() => void submitDecision(true)}
          >
            批准执行
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={loading}
            onClick={() => {
              setError(null)
              setRejectDialogOpen(true)
            }}
          >
            拒绝…
          </Button>
        </div>
        {error && clarificationErrors.length === 0 && (
          <p className="mt-2 text-xs text-destructive">{error}</p>
        )}
        {clarificationErrors.length > 0 && (
          <div className="mt-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
            <p className="font-medium">澄清约束未满足，请重试：</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {clarificationErrors.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <WorkflowSqlRejectDialog
        open={rejectDialogOpen}
        loading={loading}
        clarification={rejectClarification}
        onClarificationChange={setRejectClarification}
        onCancel={() => {
          if (!loading) setRejectDialogOpen(false)
        }}
        onConfirm={({ feedback, clarification }) =>
          void submitDecision(false, feedback, clarification)
        }
      />
    </>
  )
}
