import {
  buildVisualizationFromQuery,
  buildVisualizationFromStructuredJson,
} from './build-artifact'
import { parseAssistantMessage, extractAllArtifactsFromText, stripVisualizationBlocksFromMarkdown, hasVisualizationContent } from './parse-message'
import { artifactHasRenderableContent, MAX_MERGED_CHARTS } from './recommend-charts'
import type { AnalysisArtifact, ChartSpec, DataRow, QueryResultLike } from './types'

type MessagePart = {
  type?: string
  text?: string
  state?: string
  output?: unknown
  result?: unknown
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

const SQL_TOOL_NAME_RE = /executeReadonlySql|execute-readonly-sql/i
const BUILD_VIZ_TOOL_NAME_RE = /buildVisualization|build-visualization/i

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function parseToolPayload(value: unknown): Record<string, unknown> | null {
  if (isRecord(value)) return value
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const parsed = JSON.parse(value)
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

function isToolPartReady(part: MessagePart): boolean {
  if (!part.type?.startsWith('tool-')) return false
  return !part.state || part.state === 'output-available'
}

function toolTypeName(part: MessagePart): string {
  return part.type?.replace(/^tool-/, '') ?? ''
}

function queryResultFromPayload(payload: Record<string, unknown>): QueryResultLike | null {
  if (!Array.isArray(payload.rows) || payload.rows.length === 0) return null
  return {
    sql: typeof payload.sql === 'string' ? payload.sql : undefined,
    rowCount:
      typeof payload.rowCount === 'number' ? payload.rowCount : payload.rows.length,
    rows: payload.rows as DataRow[],
  }
}

function extractFromText(text: string): AnalysisArtifact | null {
  const artifacts = extractAllArtifactsFromText(text)
  if (artifacts.length > 0) {
    return mergeArtifacts(artifacts)
  }
  const artifact = parseAssistantMessage(text).artifact
  return artifact && artifactHasRenderableContent(artifact) ? artifact : null
}

function extractFromToolOutput(output: unknown): AnalysisArtifact | null {
  const payload = parseToolPayload(output)
  if (!payload) return null

  const directStructured = buildVisualizationFromStructuredJson(payload)
  if (directStructured) return directStructured

  if (typeof payload.vizBlock === 'string') {
    const artifact = extractFromText(payload.vizBlock)
    if (artifact) return artifact
  }

  if (isRecord(payload.result)) {
    const artifact = extractFromToolOutput(payload.result)
    if (artifact) return artifact
  }

  if (typeof payload.text === 'string') {
    const fromText = extractFromText(payload.text)
    if (fromText) return fromText
  }

  const nestedResults = payload.subAgentToolResults
  if (Array.isArray(nestedResults)) {
    const artifact = extractArtifactsFromSqlToolResults(nestedResults as SqlToolResult[])
    if (artifact) return artifact
  }

  const toolResults = payload.toolResults
  if (Array.isArray(toolResults)) {
    const artifact = extractArtifactsFromSqlToolResults(toolResults as SqlToolResult[])
    if (artifact) return artifact
  }

  const queryResult = queryResultFromPayload(payload)
  if (queryResult) {
    return buildVisualizationFromQuery(queryResult)
  }

  return null
}

function collectSqlQueryResultsFromPayload(
  payload: Record<string, unknown>,
  toolName?: string,
  results: QueryResultLike[] = [],
): QueryResultLike[] {
  if (toolName && SQL_TOOL_NAME_RE.test(toolName)) {
    const queryResult = queryResultFromPayload(payload)
    if (queryResult) results.push(queryResult)
  }

  if (isRecord(payload.result) && toolName && SQL_TOOL_NAME_RE.test(toolName)) {
    const queryResult = queryResultFromPayload(payload.result)
    if (queryResult) results.push(queryResult)
  }

  for (const key of [
    'subAgentToolResults',
    'toolResults',
    'staticToolResults',
    'dynamicToolResults',
  ] as const) {
    const entries = payload[key]
    if (!Array.isArray(entries)) continue
    for (const entry of entries) {
      if (!isRecord(entry)) continue
      const nestedToolName =
        typeof entry.toolName === 'string' ? entry.toolName : toolName
      if (isRecord(entry.result)) {
        collectSqlQueryResultsFromPayload(entry.result, nestedToolName, results)
      }
      const nestedPayload = parseToolPayload(entry.output ?? entry.result)
      if (nestedPayload) {
        collectSqlQueryResultsFromPayload(nestedPayload, nestedToolName, results)
      }
    }
  }

  if (!toolName || SQL_TOOL_NAME_RE.test(toolName)) {
    const queryResult = queryResultFromPayload(payload)
    if (queryResult) results.push(queryResult)
  }

  return results
}

function collectSqlQueryResultsFromParts(parts: MessagePart[]): QueryResultLike[] {
  const results: QueryResultLike[] = []

  for (const part of parts) {
    if (part.type?.startsWith('tool-')) {
      if (!isToolPartReady(part)) continue
      const payload = parseToolPayload(part.output ?? part.result)
      if (!payload) continue
      collectSqlQueryResultsFromPayload(payload, toolTypeName(part), results)
      continue
    }

    if (part.type !== 'data-tool-agent') continue
    const payload = parseToolPayload((part as { data?: unknown }).data)
    if (!payload) continue
    collectSqlQueryResultsFromPayload(payload, undefined, results)
  }

  const deduped: QueryResultLike[] = []
  const seen = new Set<string>()
  for (const item of results) {
    const key = `${item.sql ?? ''}:${item.rows.length}:${JSON.stringify(item.rows[0] ?? {})}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(item)
  }

  return deduped
}

function extractArtifactsFromSqlToolResults(
  toolResults: SqlToolResult[],
): AnalysisArtifact | null {
  const queryResults = toolResults
    .filter(
      (item) =>
        SQL_TOOL_NAME_RE.test(item.toolName ?? '') &&
        Array.isArray(item.result?.rows) &&
        (item.result?.rows?.length ?? 0) > 0,
    )
    .map((item) => ({
      sql: item.result?.sql,
      rowCount: item.result?.rowCount ?? item.result?.rows?.length ?? 0,
      rows: item.result?.rows ?? [],
    }))

  return mergeArtifactsFromQueryResults(queryResults)
}

function mergeChartSpecs(charts: ChartSpec[]): ChartSpec[] {
  const merged: ChartSpec[] = []
  const seen = new Set<string>()
  for (const chart of charts) {
    const key = `${chart.type}:${chart.title}:${chart.data.length}`
    if (seen.has(key)) continue
    seen.add(key)
    merged.push({
      ...chart,
      id: `chart-${merged.length + 1}`,
    })
  }
  return merged.slice(0, MAX_MERGED_CHARTS)
}

function mergeArtifacts(artifacts: AnalysisArtifact[]): AnalysisArtifact | null {
  const renderable = artifacts.filter(artifactHasRenderableContent)
  if (renderable.length === 0) return null
  if (renderable.length === 1) return renderable[0]

  const charts = mergeChartSpecs(renderable.flatMap((artifact) => artifact.charts))
  const metrics = renderable.find((artifact) => artifact.metrics?.length)?.metrics
  const table = renderable.find((artifact) => artifact.table)?.table
  const summary = renderable.find((artifact) => artifact.summary)?.summary

  const merged: AnalysisArtifact = {
    version: 1,
    charts,
    metrics,
    table,
    summary,
  }

  return artifactHasRenderableContent(merged) ? merged : null
}

function mergeArtifactsFromQueryResults(
  queryResults: QueryResultLike[],
): AnalysisArtifact | null {
  const artifacts = queryResults
    .map((queryResult) => buildVisualizationFromQuery(queryResult))
    .filter((artifact): artifact is AnalysisArtifact => Boolean(artifact))
  return mergeArtifacts(artifacts)
}

function collectVisualizationArtifactsFromParts(
  parts: MessagePart[],
): AnalysisArtifact[] {
  const artifacts: AnalysisArtifact[] = []

  for (const part of parts) {
    if (part.type === 'text' && typeof part.text === 'string') {
      const artifact = extractFromText(part.text)
      if (artifact) artifacts.push(artifact)
      continue
    }

    if (part.type?.startsWith('tool-')) {
      if (!isToolPartReady(part)) continue
      const toolName = toolTypeName(part)
      const payload = parseToolPayload(part.output ?? part.result)
      if (!payload) continue

      if (BUILD_VIZ_TOOL_NAME_RE.test(toolName) && typeof payload.vizBlock === 'string') {
        const artifact = extractFromText(payload.vizBlock)
        if (artifact) artifacts.push(artifact)
        continue
      }

      const artifact = extractFromToolOutput(payload)
      if (artifact) artifacts.push(artifact)
      continue
    }

    if (part.type !== 'data-tool-agent') continue
    const payload = parseToolPayload((part as { data?: unknown }).data)
    if (!payload) continue
    const artifact = extractFromToolOutput(payload)
    if (artifact) artifacts.push(artifact)
  }

  return artifacts
}

export function extractArtifactFromParts(
  parts: MessagePart[],
): AnalysisArtifact | null {
  const explicitArtifacts = collectVisualizationArtifactsFromParts(parts)
  const mergedExplicit = mergeArtifacts(explicitArtifacts)
  if (mergedExplicit) return mergedExplicit

  const queryResults = collectSqlQueryResultsFromParts(parts)
  return mergeArtifactsFromQueryResults(queryResults)
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function stripPlaceholderChartHeadings(
  markdown: string,
  artifact: AnalysisArtifact | null,
): string {
  if (!artifact?.charts.length || !markdown.trim()) return markdown

  let result = markdown
  for (const chart of artifact.charts) {
    const title = chart.title.trim()
    if (!title) continue
    result = result.replace(
      new RegExp(`^#{2,3}\\s+${escapeRegExp(title)}\\s*\\n+`, 'gm'),
      '',
    )
  }

  result = result.replace(/^#{2,3}\s+[^\n]+\n+(?=#{2,3}\s+|(?:\n|^)总结\s*$)/gm, '')

  return result.replace(/\n{3,}/g, '\n\n').trim()
}

export function resolveAssistantPresentation(
  parts: MessagePart[],
  options?: { isStreaming?: boolean },
): {
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
  const markdownSource = parsed.markdown || displayText
  const shouldStripVizBlocks =
    Boolean(artifact) ||
    Boolean(options?.isStreaming && hasVisualizationContent(displayText))

  let markdown = shouldStripVizBlocks
    ? stripVisualizationBlocksFromMarkdown(markdownSource, {
        isStreaming: options?.isStreaming,
        forceStripJson: Boolean(artifact),
      })
    : markdownSource

  if (artifact) {
    markdown = stripPlaceholderChartHeadings(markdown, artifact)
  }

  return {
    artifact: artifact ?? parsed.artifact,
    markdown,
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
    const toolPayload = parseToolPayload(part.output ?? part.result)
    if (part.type?.startsWith('tool-') && toolPayload && typeof toolPayload.text === 'string') {
      texts.push(toolPayload.text)
    }

    for (const text of texts) {
      const matches = [...text.matchAll(/```json\s*([\s\S]*?)```/gi)]
      for (const match of matches) {
        const raw = match[1]
        if (!raw) continue
        try {
          const payload = JSON.parse(raw) as Record<string, unknown>
          if (Array.isArray(payload.metrics)) {
            const metrics = (payload.metrics as { label: string; value: string }[]).slice(0, 4)
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
          }
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
  }

  return artifact
}
