import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { serializeVisualizationBlock } from '@/lib/visualization/build-artifact'
import {
  analysisArtifactSchema,
  type AnalysisArtifact,
} from '@/lib/visualization/types'
import { defaultToolHooks, runToolWithHooks } from '@/mastra/tools/hooks'

const lineageGraphNodeSchema = z.object({
  id: z.string(),
  label: z.string().optional(),
  matched: z.boolean().optional(),
})

const lineageGraphEdgeSchema = z.object({
  id: z.string().optional(),
  source: z.string(),
  target: z.string(),
})

const lineageResultSchema = z.object({
  configured: z.boolean(),
  message: z.string(),
  results: z.array(
    z.object({
      table: z.string().optional(),
      column: z.string().optional(),
      direction: z.enum(['upstream', 'downstream']).optional(),
      source: z.string().optional(),
      detail: z.string(),
    }),
  ),
  graph: z.object({
    nodes: z.array(lineageGraphNodeSchema),
    edges: z.array(lineageGraphEdgeSchema),
  }),
  visualization: analysisArtifactSchema.optional(),
  vizBlock: z.string().optional(),
})

export type QueryDataLineageInput = {
  table: string
  column?: string
  direction?: 'upstream' | 'downstream' | 'both'
}

type LineageEdge = z.infer<typeof lineageGraphEdgeSchema>
type LineageNode = z.infer<typeof lineageGraphNodeSchema>

function emptyLineageResult(message: string, configured = false) {
  return {
    configured,
    message,
    results: [],
    graph: {
      nodes: [],
      edges: [],
    },
  }
}

function decodeHtmlEntities(value: string): string {
  const namedEntities: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
  }

  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    const lower = entity.toLowerCase()
    if (lower.startsWith('#x')) {
      return String.fromCharCode(Number.parseInt(lower.slice(2), 16))
    }
    if (lower.startsWith('#')) {
      return String.fromCharCode(Number.parseInt(lower.slice(1), 10))
    }
    return namedEntities[lower] ?? match
  })
}

function textFromHtmlCell(cellHtml: string): string {
  return decodeHtmlEntities(
    cellHtml
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim(),
  )
}

function parseHtmlTableRows(html: string): string[][] {
  const rows: string[][] = []
  const rowMatches = html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)
  for (const rowMatch of rowMatches) {
    const cells = [...rowMatch[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map((cellMatch) => textFromHtmlCell(cellMatch[1]))
      .filter((cell) => cell.length > 0)
    if (cells.length > 0) rows.push(cells)
  }
  return rows
}

function findColumnIndex(headers: string[], candidates: string[], fallback: number) {
  const index = headers.findIndex((header) =>
    candidates.some((candidate) => header.toLowerCase() === candidate.toLowerCase()),
  )
  return index >= 0 ? index : fallback
}

export function parseLineageHtmlTable(html: string): LineageEdge[] {
  const rows = parseHtmlTableRows(html)
  if (rows.length === 0) return []

  const [firstRow, ...bodyRows] = rows
  const hasHeader =
    firstRow.some((cell) => /^id$/i.test(cell)) &&
    firstRow.some((cell) => cell === '目标表') &&
    firstRow.some((cell) => cell === '源表')
  const headers = hasHeader ? firstRow : ['ID', '目标表', '源表']
  const dataRows = hasHeader ? bodyRows : rows
  const idIndex = findColumnIndex(headers, ['ID'], 0)
  const targetIndex = findColumnIndex(headers, ['目标表', 'target', 'target_table'], 1)
  const sourceIndex = findColumnIndex(headers, ['源表', 'source', 'source_table'], 2)

  const edges: LineageEdge[] = []
  dataRows.forEach((row, index) => {
    const source = row[sourceIndex]?.trim()
    const target = row[targetIndex]?.trim()
    if (!source || !target) return
    edges.push({
      id: row[idIndex]?.trim() || `lineage-${index + 1}`,
      source,
      target,
    })
  })
  return edges
}

function buildLineageUrl(endpoint: string, table: string): string {
  const query = table.trim().replaceAll('*', '')
  if (endpoint.includes('{table}')) {
    return endpoint.replaceAll('{table}', encodeURIComponent(query))
  }

  const url = new URL(endpoint)
  url.searchParams.set('p', query)
  return url.toString()
}

function buildLineageGraph(edges: LineageEdge[], query: string): {
  nodes: LineageNode[]
  edges: LineageEdge[]
} {
  const normalizedQuery = query.trim().replaceAll('*', '').toLowerCase()
  const nodes = new Map<string, LineageNode>()

  for (const edge of edges) {
    for (const table of [edge.source, edge.target]) {
      if (!nodes.has(table)) {
        nodes.set(table, {
          id: table,
          label: table,
          matched:
            normalizedQuery.length > 0 &&
            table.toLowerCase().includes(normalizedQuery),
        })
      }
    }
  }

  return {
    nodes: [...nodes.values()],
    edges,
  }
}

function buildLineageVisualization(
  table: string,
  graph: { nodes: LineageNode[]; edges: LineageEdge[] },
): AnalysisArtifact {
  return {
    version: 1,
    charts: [
      {
        id: `lineage-graph-${table.trim().replaceAll('.', '-').replaceAll('_', '-')}`,
        type: 'graph',
        title: '数据血缘关系图',
        encoding: {},
        data: graph.edges.map((edge) => ({
          source: edge.source,
          target: edge.target,
        })),
        options: {
          layout: 'primary',
          graph,
        },
      },
    ],
    table: {
      columns: [
        { field: 'sourceTable', label: '源表', kind: 'nominal' },
        { field: 'targetTable', label: '目标表', kind: 'nominal' },
      ],
      rows: graph.edges.map((edge) => ({
        sourceTable: edge.source,
        targetTable: edge.target,
      })),
      totalRows: graph.edges.length,
      truncated: false,
    },
  }
}

function lineageDirectionForEdge(
  edge: LineageEdge,
  query: string,
): 'upstream' | 'downstream' | undefined {
  const normalizedQuery = query.trim().replaceAll('*', '').toLowerCase()
  const sourceMatches = edge.source.toLowerCase().includes(normalizedQuery)
  const targetMatches = edge.target.toLowerCase().includes(normalizedQuery)

  if (sourceMatches && !targetMatches) return 'downstream'
  if (targetMatches && !sourceMatches) return 'upstream'
  return undefined
}

function messageFromUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function queryDataLineageOperation(input: QueryDataLineageInput) {
  const endpoint = process.env.HUNDUN_LINEAGE_ENDPOINT?.trim()
  if (!endpoint) {
    return emptyLineageResult('数据血缘接口未配置，无法查询。')
  }

  const queryTable = input.table.trim()
  if (!queryTable.replaceAll('*', '')) {
    return emptyLineageResult('数据血缘查询表名为空，无法查询。', true)
  }

  let response: Response
  try {
    response = await fetch(buildLineageUrl(endpoint, queryTable))
  } catch (error) {
    return emptyLineageResult(
      `数据血缘接口请求失败：${messageFromUnknownError(error)}`,
      true,
    )
  }

  if (!response.ok) {
    return emptyLineageResult(
      `数据血缘接口请求失败：HTTP ${response.status}`,
      true,
    )
  }

  let html: string
  try {
    html = await response.text()
  } catch (error) {
    return emptyLineageResult(
      `数据血缘接口响应读取失败：${messageFromUnknownError(error)}`,
      true,
    )
  }

  const edges = parseLineageHtmlTable(html)
  const graph = buildLineageGraph(edges, queryTable)
  if (edges.length === 0) {
    return {
      configured: true,
      message: `未找到 ${queryTable} 的数据血缘关系。`,
      results: [],
      graph,
    }
  }

  const visualization = buildLineageVisualization(queryTable, graph)
  return {
    configured: true,
    message: `查询到 ${edges.length} 条血缘关系。`,
    results: edges.map((edge) => {
      const direction = lineageDirectionForEdge(edge, queryTable)
      return {
        table: direction === 'upstream' ? edge.source : edge.target,
        direction,
        source: 'lineage:http',
        detail: `${edge.source} -> ${edge.target}`,
      }
    }),
    graph,
    visualization,
    vizBlock: serializeVisualizationBlock(visualization),
  }
}

export const queryDataLineageTool = createTool({
  id: 'query-data-lineage',
  description: '查询混沌可用的数据血缘接口，并返回源表到目标表的 graph 结构',
  inputSchema: z.object({
    table: z.string().describe('表名'),
    column: z.string().optional().describe('字段名'),
    direction: z.enum(['upstream', 'downstream', 'both']).optional(),
  }),
  outputSchema: lineageResultSchema,
  execute: async (input) =>
    runToolWithHooks({
      agent: 'hundun',
      tool: 'query-data-lineage',
      input,
      hooks: defaultToolHooks,
      execute: queryDataLineageOperation,
    }),
})
