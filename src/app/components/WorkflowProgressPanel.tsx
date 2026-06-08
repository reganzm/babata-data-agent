'use client'

import { useEffect, useState } from 'react'
import { Check, ChevronDown, Circle, Loader2, Pause, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SqlCodeBlock } from './SqlCodeBlock'
import { WorkflowSqlApproval } from './WorkflowSqlApproval'
import {
  getCurrentRunningStepLabel,
  isAwaitingSqlApproval,
  type WorkflowClarificationStage,
  type WorkflowProgressView,
  type WorkflowStepProgress,
  type WorkflowStepUiStatus,
} from '@/lib/workflow-progress'

interface WorkflowProgressPanelProps {
  progress: WorkflowProgressView
  isLive?: boolean
  /** 审批 resume 请求进行中（驳回后重写 SQL 等） */
  resumeBusy?: boolean
  onResume?: (
    approved: boolean,
    feedback?: string,
    clarification?: import('@/lib/sql-clarification').SqlClarification,
  ) => Promise<void>
}

const stepStatusConfig: Record<
  WorkflowStepUiStatus,
  { icon: typeof Circle; className: string; pulse?: boolean }
> = {
  pending: {
    icon: Circle,
    className: 'text-muted-foreground/50',
  },
  running: {
    icon: Loader2,
    className: 'text-neon-cyan',
    pulse: true,
  },
  success: {
    icon: Check,
    className: 'text-neon-green',
  },
  suspended: {
    icon: Pause,
    className: 'text-warning',
  },
  failed: {
    icon: X,
    className: 'text-destructive',
  },
}

function runStatusLabel(runStatus: string): string {
  switch (runStatus) {
    case 'running':
      return '执行中'
    case 'suspended':
      return '等待审批'
    case 'success':
    case 'completed':
      return '已完成'
    case 'failed':
      return '失败'
    case 'canceled':
    case 'cancelled':
      return '已取消'
    default:
      return runStatus
  }
}

function clarificationStageLabel(stage: WorkflowClarificationStage): string {
  return stage === 'sql-regeneration' ? 'SQL 重写澄清' : '意图澄清'
}

function StepRow({
  step,
  isCurrent,
}: {
  step: WorkflowStepProgress
  isCurrent: boolean
}) {
  const config = stepStatusConfig[step.status]
  const Icon = config.icon
  return (
    <li
      className={cn(
        'flex items-start gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors',
        isCurrent && 'bg-neon-cyan/8',
      )}
    >
      <Icon
        className={cn(
          'mt-0.5 h-4 w-4 shrink-0',
          config.className,
          config.pulse && 'animate-spin',
        )}
      />
      <div className="min-w-0 flex-1">
        <span
          className={cn(
            'font-medium',
            step.status === 'pending' && 'text-muted-foreground',
            isCurrent && step.status === 'running' && 'text-foreground',
          )}
        >
          {step.label}
        </span>
      </div>
    </li>
  )
}

export function WorkflowProgressPanel({
  progress,
  isLive = false,
  resumeBusy = false,
  onResume,
}: WorkflowProgressPanelProps) {
  const awaitingApproval = isAwaitingSqlApproval(progress)
  const clarificationHint = progress.clarificationHint
  const showInlineApproval = Boolean(
    awaitingApproval && progress.resumeContext && onResume && !resumeBusy,
  )
  const runningLabel = getCurrentRunningStepLabel(progress)
  const isRunning = progress.runStatus === 'running' || resumeBusy
  const isTerminal =
    progress.runStatus === 'success' ||
    progress.runStatus === 'completed' ||
    progress.runStatus === 'failed' ||
    progress.runStatus === 'canceled' ||
    progress.runStatus === 'cancelled'
  const [expanded, setExpanded] = useState(!isTerminal)

  const [elapsedSec, setElapsedSec] = useState(0)
  useEffect(() => {
    if (!isRunning) {
      setElapsedSec(0)
      return
    }
    const start = Date.now()
    const id = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - start) / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [isRunning, progress.currentStepId])

  useEffect(() => {
    if (isRunning || progress.runStatus === 'suspended') {
      setExpanded(true)
      return
    }
    if (isTerminal) {
      setExpanded(false)
    }
  }, [isRunning, isTerminal, progress.runStatus])
  const showSqlPreview =
    !showInlineApproval &&
    !isRunning &&
    awaitingApproval &&
    progress.sqlPreview &&
    progress.steps.some(
      (s) =>
        s.id === 'generate-sql' &&
        (s.status === 'success' || s.status === 'running'),
    )
  const percent =
    progress.totalCount > 0
      ? Math.round((progress.completedCount / progress.totalCount) * 100)
      : 0

  const currentIndex = progress.currentStepId
    ? progress.steps.findIndex((s) => s.id === progress.currentStepId)
    : -1

  return (
    <div
      className={cn(
        'my-3 rounded-lg border border-border/80 bg-muted/30 px-3 py-3',
        isLive && 'border-neon-cyan/25 shadow-[0_0_12px_var(--neon-cyan-glow)]',
      )}
    >
      <button
        type="button"
        className="mb-2 flex w-full flex-wrap items-center justify-between gap-2 text-left"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <ChevronDown
            className={cn(
              'h-4 w-4 transition-transform',
              expanded ? 'rotate-0' : '-rotate-90',
            )}
          />
          {progress.workflowTitle}
        </span>
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-xs font-medium',
            progress.runStatus === 'suspended' &&
              'bg-warning/15 text-warning',
            progress.runStatus === 'running' &&
              'bg-neon-cyan/15 text-neon-cyan',
            (progress.runStatus === 'success' ||
              progress.runStatus === 'completed') &&
              'bg-neon-green/15 text-neon-green',
            progress.runStatus === 'failed' &&
              'bg-destructive/15 text-destructive',
          )}
        >
          {resumeBusy
            ? '重新分析中'
            : clarificationHint
              ? `等待${clarificationStageLabel(clarificationHint.stage)}`
              : runStatusLabel(progress.runStatus)}
          {isRunning && (
            <span className="ml-1 opacity-80">
              · {progress.completedCount}/{progress.totalCount}
              {elapsedSec > 0 && ` · ${elapsedSec}s`}
            </span>
          )}
        </span>
      </button>

      {expanded ? (
        <>
          <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500',
                progress.runStatus === 'failed'
                  ? 'bg-destructive'
                  : 'bg-neon-cyan',
              )}
              style={{ width: `${percent}%` }}
            />
          </div>

          <ol className="space-y-0.5" aria-label="Workflow 步骤进度">
            {progress.steps.map((step, index) => (
              <StepRow
                key={step.id}
                step={step}
                isCurrent={index === currentIndex}
              />
            ))}
          </ol>

          {showSqlPreview && (
            <div className="mt-3 rounded-md border border-border bg-card/80 p-3">
              <p className="text-xs font-medium text-muted-foreground">
                已生成 SQL（审批通过后将执行）
              </p>
              {progress.sqlPreview && (
                <SqlCodeBlock sql={progress.sqlPreview} maxHeightClassName="max-h-40" />
              )}
            </div>
          )}

          {clarificationHint && progress.runStatus === 'suspended' && (
            <div className="mt-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2">
              <p className="text-xs font-medium text-warning">
                当前阶段：{clarificationStageLabel(clarificationHint.stage)}
              </p>
              {clarificationHint.reason && (
                <p className="mt-1 text-xs text-warning/90">{clarificationHint.reason}</p>
              )}
              {clarificationHint.requiredFields &&
                clarificationHint.requiredFields.length > 0 && (
                  <p className="mt-1 text-xs text-warning/90">
                    需补充：{clarificationHint.requiredFields.join('、')}
                  </p>
                )}
            </div>
          )}

          {isRunning && !awaitingApproval && (
            <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-neon-cyan" />
              {resumeBusy
                ? '已收到驳回意见，正在从「解析意图」重新分析并生成 SQL…'
                : runningLabel
                  ? `正在执行：${runningLabel}（约每 2 秒同步服务端状态，请稍候）`
                  : 'Workflow 执行中（约每 2 秒同步服务端状态）'}
            </p>
          )}

          {showInlineApproval && progress.resumeContext && onResume && (
            <WorkflowSqlApproval
              resumeContext={progress.resumeContext}
              onResume={onResume}
            />
          )}
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          已收起 · 进度 {progress.completedCount}/{progress.totalCount}
        </p>
      )}
    </div>
  )
}
