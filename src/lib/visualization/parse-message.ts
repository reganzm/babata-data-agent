import {
  buildVisualizationFromQuery,
  buildVisualizationFromStructuredJson,
  parseVisualizationBlock,
} from './build-artifact'
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

export interface ParsedAssistantContent {
  markdown: string
  artifact: AnalysisArtifact | null
}

function stripBlocks(text: string, pattern: RegExp): string {
  return text.replace(pattern, '').trim()
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

  let markdown = stripBlocks(markdownSource, VIZ_BLOCK_RE)
  if (artifact) {
    markdown = stripBlocks(markdown, JSON_BLOCK_RE)
  }

  return {
    markdown: markdown.replace(/\n{3,}/g, '\n\n').trim(),
    artifact: artifact && analysisArtifactSchema.safeParse(artifact).success
      ? artifact
      : null,
  }
}

export function hasVisualizationContent(text: string): boolean {
  if (/```babata-viz/i.test(text)) return true
  if (/"charts"\s*:\s*\[/i.test(text)) return true
  if (/"rows"\s*:\s*\[/i.test(text)) return true
  if (/"visualization"\s*:/i.test(text)) return true
  return hasMarkdownDataTable(text)
}
