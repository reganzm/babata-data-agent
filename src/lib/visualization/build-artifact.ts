import {
  analysisArtifactSchema,
  VIZ_BLOCK_LANG,
  type AnalysisArtifact,
  type QueryResultLike,
} from './types'
import {
  artifactHasRenderableContent,
  buildAnalysisArtifact,
  rowsFromNumbers,
} from './recommend-charts'

export function serializeVisualizationBlock(
  artifact: AnalysisArtifact,
): string {
  return ['```' + VIZ_BLOCK_LANG, JSON.stringify(artifact, null, 2), '```'].join(
    '\n',
  )
}

export function parseVisualizationBlock(raw: string): AnalysisArtifact | null {
  try {
    const parsed = JSON.parse(raw.trim())
    const result = analysisArtifactSchema.safeParse(parsed)
    return result.success ? result.data : null
  } catch {
    return null
  }
}

export function buildVisualizationFromQuery(
  queryResult: QueryResultLike,
  options?: {
    summary?: string
    numbers?: { label: string; value: string }[]
  },
): AnalysisArtifact | null {
  const artifact = buildAnalysisArtifact(queryResult, {
    summary: options?.summary,
    metrics: options?.numbers?.map((n) => ({
      label: n.label,
      value: n.value,
    })),
  })

  return artifactHasRenderableContent(artifact) ? artifact : null
}

export function buildVisualizationFromStructuredJson(
  payload: Record<string, unknown>,
): AnalysisArtifact | null {
  if (payload.visualization) {
    const parsed = analysisArtifactSchema.safeParse(payload.visualization)
    if (parsed.success && artifactHasRenderableContent(parsed.data)) {
      return parsed.data
    }
  }

  const chartsParsed = analysisArtifactSchema.safeParse({
    version: 1,
    charts: payload.charts ?? [],
    metrics: payload.metrics,
    table: payload.table,
    summary: typeof payload.summary === 'string' ? payload.summary : undefined,
  })
  if (chartsParsed.success && artifactHasRenderableContent(chartsParsed.data)) {
    return chartsParsed.data
  }

  const rows = Array.isArray(payload.rows)
    ? (payload.rows as QueryResultLike['rows'])
    : null

  if (rows && rows.length > 0) {
    return buildVisualizationFromQuery(
      {
        rowCount: rows.length,
        rows,
        sql: typeof payload.sql === 'string' ? payload.sql : undefined,
      },
      {
        summary: typeof payload.summary === 'string' ? payload.summary : undefined,
        numbers: Array.isArray(payload.numbers)
          ? (payload.numbers as { label: string; value: string }[])
          : undefined,
      },
    )
  }

  if (Array.isArray(payload.numbers)) {
    const derivedRows = rowsFromNumbers(
      payload.numbers as { label: string; value: string }[],
    )
    if (derivedRows) {
      return buildVisualizationFromQuery(
        { rowCount: derivedRows.length, rows: derivedRows },
        {
          summary:
            typeof payload.summary === 'string' ? payload.summary : undefined,
        },
      )
    }
  }

  return null
}

export function appendVisualizationToReport(
  report: string,
  artifact: AnalysisArtifact | null,
): string {
  if (!artifact) return report
  const block = serializeVisualizationBlock(artifact)
  if (report.includes('```' + VIZ_BLOCK_LANG)) return report
  return `${report.trim()}\n\n${block}`
}
