'use client'

import { memo, useMemo } from 'react'
import { assistantDisplaySignature } from '@/lib/chat-message-live'
import {
  mergeStructuredMetrics,
  resolveAssistantPresentation,
} from '@/lib/visualization/extract-artifact-from-parts'
import { stripMarkdownTables } from '@/lib/visualization/parse-markdown-table'
import { RichMarkdownRenderer } from '../RichMarkdownRenderer'
import { AnalysisVizPanel } from './AnalysisVizPanel'

type MessagePart = {
  type?: string
  text?: string
  state?: string
  output?: unknown
  data?: unknown
}

interface AssistantMessageContentProps {
  parts: MessagePart[]
  isStreaming: boolean
}

function AssistantMessageContentInner({
  parts,
  isStreaming,
}: AssistantMessageContentProps) {
  const presentation = useMemo(() => {
    const resolved = resolveAssistantPresentation(parts, { isStreaming })
    if (!resolved.artifact) return resolved
    return {
      ...resolved,
      artifact: mergeStructuredMetrics(resolved.artifact, parts),
    }
  }, [parts, isStreaming])

  const canShowViz = Boolean(presentation.artifact)

  const markdownToRender = useMemo(() => {
    if (!presentation.markdown) return ''
    if (presentation.artifact?.table) {
      return stripMarkdownTables(presentation.markdown)
    }
    return presentation.markdown
  }, [presentation.artifact?.table, presentation.markdown])

  return (
    <div className={canShowViz ? 'space-y-4' : undefined}>
      {canShowViz && presentation.artifact && (
        <AnalysisVizPanel artifact={presentation.artifact} />
      )}
      {markdownToRender && (
        <RichMarkdownRenderer
          content={markdownToRender}
          isStreaming={isStreaming}
        />
      )}
      {!markdownToRender && !canShowViz && isStreaming && (
        <div className="text-sm text-muted-foreground">正在生成…</div>
      )}
    </div>
  )
}

export const AssistantMessageContent = memo(
  AssistantMessageContentInner,
  (prev, next) =>
    prev.isStreaming === next.isStreaming &&
    assistantDisplaySignature(prev.parts) === assistantDisplaySignature(next.parts),
)
