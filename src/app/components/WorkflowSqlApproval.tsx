'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { parseClarificationError } from '@/lib/clarification-error'
import { extractPrimaryTableName } from '@/lib/sql-table-extract'
import type { WorkflowResumeContext } from '@/lib/workflow-progress'
import { SqlCodeBlock } from './SqlCodeBlock'
import {
  EMPTY_SQL_CLARIFICATION,
  WorkflowSqlRejectDialog,
} from './WorkflowSqlRejectDialog'
import type { SqlClarification } from '@/lib/sql-clarification'

interface WorkflowSqlApprovalProps {
  resumeContext: WorkflowResumeContext
  onResume: (
    approved: boolean,
    feedback?: string,
    clarification?: SqlClarification,
  ) => Promise<void>
}

export function WorkflowSqlApproval({
  resumeContext,
  onResume,
}: WorkflowSqlApprovalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
  const [rejectClarification, setRejectClarification] =
    useState<SqlClarification>(EMPTY_SQL_CLARIFICATION)
  const clarificationErrors = error ? parseClarificationError(error) : []
  const sqlTableName = extractPrimaryTableName(resumeContext.sql)

  const submitDecision = async (
    approved: boolean,
    feedback?: string,
    clarification?: SqlClarification,
  ) => {
    setLoading(true)
    setError(null)
    try {
      await onResume(approved, feedback, clarification)
      setRejectDialogOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="mt-3 rounded-md border border-warning/50 bg-warning/5 p-3">
        <p className="text-sm font-medium text-warning">待确认 SQL</p>
        {resumeContext.intentSummary && (
          <p className="mt-1 text-xs text-muted-foreground">
            {resumeContext.intentSummary}
          </p>
        )}
        {sqlTableName && (
          <p className="mt-1 text-xs text-muted-foreground">
            当前 SQL 表：<span className="font-mono text-foreground">{sqlTableName}</span>
          </p>
        )}
        <SqlCodeBlock sql={resumeContext.sql} />
        <div className="mt-3 flex flex-wrap gap-2">
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
