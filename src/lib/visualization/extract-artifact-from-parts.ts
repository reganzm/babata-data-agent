import {
  buildVisualizationFromQuery,
  buildVisualizationFromStructuredJson,
} from './build-artifact'
import { parseAssistantMessage } from './parse-message'
import type { AnalysisArtifact, DataRow } from './types'

type MessagePart = {
  type?: string
  text?: string
  state?: string
  output?: unknown
  data?: unknown
}

type SqlToolResult = {
  toolName?: string
  result?: {
    sql?: string
    rowCount?: number
    rows?: DataRow[]
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function extractFromText(text: string): AnalysisArtifact | null {
  return parseAssistantMessage(text).artifact
}

function extractFromToolOutput(output: unknown): AnalysisArtifact | null {
  if (!isRecord(output)) return null

  const directStructured = buildVisualizationFromStructuredJson(output)
  if (directStructured) return directStructured

  if (typeof output.vizBlock === 'string') {
    const artifact = extractFromText(output.vizBlock)
    if (artifact) return artifact
  }

  if (isRecord(output.result)) {
    const artifact = extractFromToolOutput(output.result)
    if (artifact) return artifact
  }

  if (typeof output.text === 'string') {
    const fromText = extractFromText(output.text)
    if (fromText) return fromText
  }

  const nestedResults = output.subAgentToolResults
  if (Array.isArray(nestedResults)) {
    const artifact = extractFromSqlToolResults(nestedResults as SqlToolResult[])
    if (artifact) return artifact
  }

  const toolResults = output.toolResults
  if (Array.isArray(toolResults)) {
    const artifact = extractFromSqlToolResults(toolResults as SqlToolResult[])
    if (artifact) return artifact
  }

  if (Array.isArray(output.rows)) {
    return buildVisualizationFromQuery({
      rowCount: output.rows.length,
      rows: output.rows as DataRow[],
      sql: typeof output.sql === 'string' ? output.sql : undefined,
    })
  }

  return null
}

function extractFromSqlToolResults(
  results: SqlToolResult[],
): AnalysisArtifact | null {
  const candidates = results
    .filter(
      (item) =>
        /executeReadonlySql|execute-readonly-sql/i.test(item.toolName ?? '') &&
        Array.isArray(item.result?.rows) &&
        (item.result?.rows?.length ?? 0) > 0,
    )
    .sort(
      (a, b) =>
        (b.result?.rowCount ?? b.result?.rows?.length ?? 0) -
        (a.result?.rowCount ?? a.result?.rows?.length ?? 0),
    )

  const best = candidates[0]
  if (!best?.result?.rows) return null

  return buildVisualizationFromQuery({
    sql: best.result.sql,
    rowCount: best.result.rowCount ?? best.result.rows.length,
    rows: best.result.rows,
  })
}

export function extractArtifactFromParts(
  parts: MessagePart[],
): AnalysisArtifact | null {
  for (const part of parts) {
    if (part.type === 'text' && typeof part.text === 'string') {
      const artifact = extractFromText(part.text)
      if (artifact) return artifact
    }
  }

  for (const part of parts) {
    if (!part.type?.startsWith('tool-')) continue
    if (part.state && part.state !== 'output-available') continue
    const artifact = extractFromToolOutput(part.output)
    if (artifact) return artifact
  }

  for (const part of parts) {
    if (part.type !== 'data-tool-agent') continue
    const data = (part as { data?: unknown }).data
    if (!isRecord(data)) continue
    const artifact = extractFromToolOutput(data)
    if (artifact) return artifact
  }

  return null
}

export function collectAssistantText(parts: MessagePart[]): string {
  return parts
    .filter(
      (part): part is MessagePart & { text: string } =>
        part.type === 'text' && typeof part.text === 'string' && part.text.trim().length > 0,
    )
    .map((part) => part.text)
    .join('\n\n')
}

export function resolveAssistantPresentation(parts: MessagePart[]): {
  artifact: AnalysisArtifact | null
  markdown: string
} {
  const artifact = extractArtifactFromParts(parts)
  const textParts = parts
    .filter((part) => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text as string)
  const displayText =
    textParts.length > 0 ? textParts[textParts.length - 1] : collectAssistantText(parts)
  const parsed = parseAssistantMessage(displayText)

  if (artifact) {
    return {
      artifact,
      markdown: parsed.markdown || displayText,
    }
  }

  return {
    artifact: parsed.artifact,
    markdown: parsed.markdown,
  }
}

export function messageHasVisualization(parts: MessagePart[]): boolean {
  if (extractArtifactFromParts(parts)) return true
  return parts.some(
    (part) => part.type === 'text' && typeof part.text === 'string' && hasTextVizHint(part.text),
  )
}

function hasTextVizHint(text: string): boolean {
  return (
    /```babata-viz/i.test(text) ||
    /"rows"\s*:\s*\[/i.test(text) ||
    /^\|.+\|\s*\n\|[-:\s|]+\|\s*\n\|.+\|/m.test(text)
  )
}

export function mergeStructuredMetrics(
  artifact: AnalysisArtifact,
  parts: MessagePart[],
): AnalysisArtifact {
  for (const part of parts) {
    const texts: string[] = []
    if (part.type === 'text' && part.text) texts.push(part.text)
    if (part.type?.startsWith('tool-') && isRecord(part.output) && typeof part.output.text === 'string') {
      texts.push(part.output.text)
    }

    for (const text of texts) {
      const match = text.match(/```json\s*([\s\S]*?)```/i)
      if (!match) continue
      try {
        const payload = JSON.parse(match[1]) as Record<string, unknown>
        if (!Array.isArray(payload.numbers)) continue
        const metrics = (payload.numbers as { label: string; value: string }[]).slice(0, 4)
        if (metrics.length > 0) {
          return {
            ...artifact,
            summary:
              typeof payload.summary === 'string'
                ? payload.summary
                : artifact.summary,
            metrics: metrics.map((item) => ({
              label: item.label,
              value: item.value,
            })),
          }
        }
      } catch {
        /* ignore */
      }
    }
  }

  return artifact
}
