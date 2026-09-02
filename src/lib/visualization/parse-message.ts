import {
  buildVisualizationFromQuery,
  buildVisualizationFromStructuredJson,
  parseVisualizationBlock,
} from './build-artifact'
import { artifactHasRenderableContent } from './recommend-charts'
import {
  hasMarkdownDataTable,
  queryResultFromMarkdown,
  stripMarkdownTables,
} from './parse-markdown-table'
import {
  analysisArtifactSchema,
  VIZ_BLOCK_LANG,
  type AnalysisArtifact,
} from './types'

const VIZ_BLOCK_RE = new RegExp(
  '```' + VIZ_BLOCK_LANG + '\\s*([\\s\\S]*?)```',
  'gi',
)
const JSON_BLOCK_RE = /```json\s*([\s\S]*?)```/gi
const OPEN_VIZ_FENCE_RE = /```(?:babata-viz|json)\b[^\n]*\n[\s\S]*$/i

export interface ParsedAssistantContent {
  markdown: string
  artifact: AnalysisArtifact | null
}

export function looksLikeVisualizationJson(content: string): boolean {
  const trimmed = content.trim()
  if (!trimmed.startsWith('{')) return false
  return (
    /"version"\s*:\s*1/i.test(trimmed) ||
    /"charts"\s*:\s*\[/i.test(trimmed) ||
    /"metrics"\s*:\s*\[/i.test(trimmed) ||
    /"rows"\s*:\s*\[/i.test(trimmed) ||
    /"visualization"\s*:/i.test(trimmed) ||
    /"numbers"\s*:\s*\[/i.test(trimmed)
  )
}

function stripBlocks(text: string, pattern: RegExp): string {
  return text.replace(pattern, '').trim()
}

export function stripVisualizationBlocksFromMarkdown(
  text: string,
  options?: { isStreaming?: boolean; forceStripJson?: boolean },
): string {
  let markdown = stripBlocks(text, VIZ_BLOCK_RE)

  markdown = markdown.replace(JSON_BLOCK_RE, (match, body) => {
    const raw = typeof body === 'string' ? body : ''
    if (options?.forceStripJson || looksLikeVisualizationJson(raw)) {
      return ''
    }
    return match
  })

  if (options?.isStreaming) {
    markdown = markdown.replace(OPEN_VIZ_FENCE_RE, '')
  }

  return markdown.replace(/\n{3,}/g, '\n\n').trim()
}

function parseJsonBlocks(text: string): AnalysisArtifact | null {
  const matches = [...text.matchAll(JSON_BLOCK_RE)]
  for (let i = matches.length - 1; i >= 0; i -= 1) {
    const raw = matches[i][1]
    if (!raw) continue
    try {
      const payload = JSON.parse(raw.trim()) as Record<string, unknown>
      const artifact = buildVisualizationFromStructuredJson(payload)
      if (artifact) return artifact
    } catch {
      /* try earlier block */
    }
  }
  return null
}

function artifactFromMarkdownTables(text: string): AnalysisArtifact | null {
  const queryResult = queryResultFromMarkdown(text)
  if (!queryResult) return null
  return buildVisualizationFromQuery(queryResult)
}

export function extractAllArtifactsFromText(text: string): AnalysisArtifact[] {
  const artifacts: AnalysisArtifact[] = []

  for (const match of text.matchAll(VIZ_BLOCK_RE)) {
    const artifact = parseVisualizationBlock(match[1] ?? '')
    if (
      artifact &&
      analysisArtifactSchema.safeParse(artifact).success &&
      artifactHasRenderableContent(artifact)
    ) {
      artifacts.push(artifact)
    }
  }

  for (const match of text.matchAll(JSON_BLOCK_RE)) {
    const raw = match[1]
    if (!raw) continue
    try {
      const payload = JSON.parse(raw.trim()) as Record<string, unknown>
      const artifact = buildVisualizationFromStructuredJson(payload)
      if (
        artifact &&
        analysisArtifactSchema.safeParse(artifact).success &&
        artifactHasRenderableContent(artifact)
      ) {
        artifacts.push(artifact)
      }
    } catch {
      /* try next block */
    }
  }

  if (artifacts.length > 0) return artifacts

  const tableArtifact = artifactFromMarkdownTables(text)
  return tableArtifact ? [tableArtifact] : []
}

export function parseAssistantMessage(text: string): ParsedAssistantContent {
  let artifact: AnalysisArtifact | null = null
  let markdownSource = text

  const vizMatches = [...text.matchAll(VIZ_BLOCK_RE)]
  if (vizMatches.length > 0) {
    const last = vizMatches.at(-1)?.[1]
    if (last) artifact = parseVisualizationBlock(last)
  }

  if (!artifact) {
    artifact = parseJsonBlocks(text)
  }

  if (!artifact) {
    artifact = artifactFromMarkdownTables(text)
    if (artifact) {
      markdownSource = stripMarkdownTables(text)
    }
  }

  let markdown = stripVisualizationBlocksFromMarkdown(markdownSource, {
    forceStripJson: Boolean(artifact),
  })

  return {
    markdown: markdown.replace(/\n{3,}/g, '\n\n').trim(),
    artifact:
      artifact &&
      analysisArtifactSchema.safeParse(artifact).success &&
      artifactHasRenderableContent(artifact)
        ? artifact
        : null,
  }
}

export function hasVisualizationContent(text: string): boolean {
  if (/```(?:babata-viz|json)\b/i.test(text)) return true
  if (/```babata-viz/i.test(text)) return true
  if (/"charts"\s*:\s*\[/i.test(text)) return true
  if (/\"metrics\"\s*:\s*\[/i.test(text)) return true
  if (/\"version\"\s*:\s*1/i.test(text)) return true
  if (/"rows"\s*:\s*\[/i.test(text)) return true
  if (/"visualization"\s*:/i.test(text)) return true
  return hasMarkdownDataTable(text)
}
