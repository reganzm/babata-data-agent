'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatToolErrorMessage } from '@/lib/tool-error-message'
import { ToolStatusBadge } from './ToolStatusBadge'

type ToolState =
  | 'input-streaming'
  | 'input-available'
  | 'output-available'
  | 'output-error'

type ToolPart = {
  type: string
  toolCallId?: string
  state: ToolState
  errorText?: string
}

export function ToolCallsPanel(props: {
  toolParts: ToolPart[]
  delegationLabels: Record<string, string>
  showWorkflowProgress?: boolean
  isLive?: boolean
}) {
  const visibleParts = useMemo(() => {
    return props.toolParts.filter((part) => {
      if (!part.type?.startsWith('tool-')) return false
      if (part.type.startsWith('tool-workflow') && props.showWorkflowProgress) {
        return false
      }
      return true
    })
  }, [props.toolParts, props.showWorkflowProgress])

  const hasInProgress = visibleParts.some(
    (part) =>
      part.state === 'input-streaming' || part.state === 'input-available',
  )
  const errorCount = visibleParts.filter((part) => part.state === 'output-error').length

  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (props.isLive && hasInProgress) {
      setExpanded(true)
    }
  }, [props.isLive, hasInProgress])

  if (visibleParts.length === 0) return null

  return (
    <div className="my-2">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className="inline-flex items-center gap-1.5 rounded-md px-1 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        aria-expanded={expanded}
      >
        <ChevronRight
          className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-90')}
        />
        <span>
          工具调用 {visibleParts.length} 次
          {hasInProgress ? ' · 进行中' : ' · 已全部完成'}
          {errorCount > 0 ? ` · ${errorCount} 失败` : ''}
        </span>
      </button>
      {expanded ? (
        <div className="mt-1 space-y-2 border-l border-border/60 pl-3">
          {visibleParts.map((part, index) => {
            const rawName = part.type.replace('tool-', '')
            const toolName = props.delegationLabels[rawName] ?? rawName
            return (
              <div key={part.toolCallId ?? index}>
                <ToolStatusBadge toolName={toolName} state={part.state} />
                {part.state === 'output-error' && part.errorText ? (
                  <div className="mt-1 rounded border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    {formatToolErrorMessage({
                      toolName,
                      errorText: part.errorText,
                    })}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
