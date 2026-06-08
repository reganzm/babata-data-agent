import { z } from 'zod'

export const columnKindSchema = z.enum([
  'temporal',
  'quantitative',
  'nominal',
  'ordinal',
])

export type ColumnKind = z.infer<typeof columnKindSchema>

export const rowSchema = z.record(
  z.union([z.string(), z.number(), z.null()]),
)

export type DataRow = z.infer<typeof rowSchema>

export const chartTypeSchema = z.enum([
  'line',
  'bar',
  'pie',
  'heatmap',
  'funnel',
  'graph',
  'table',
  'metric',
])

export type ChartType = z.infer<typeof chartTypeSchema>

export const fieldEncodingSchema = z.object({
  field: z.string(),
  type: columnKindSchema.optional(),
  label: z.string().optional(),
})

export const chartSpecSchema = z.object({
  id: z.string(),
  type: chartTypeSchema,
  title: z.string(),
  description: z.string().optional(),
  encoding: z.object({
    x: fieldEncodingSchema.optional(),
    y: z
      .union([
        fieldEncodingSchema,
        z.object({
          fields: z.array(fieldEncodingSchema),
        }),
      ])
      .optional(),
    series: fieldEncodingSchema.optional(),
    value: fieldEncodingSchema.optional(),
  }),
  data: z.array(rowSchema),
  options: z
    .object({
      horizontal: z.boolean().optional(),
      stack: z.boolean().optional(),
      showDataZoom: z.boolean().optional(),
      smooth: z.boolean().optional(),
      layout: z.enum(['primary', 'secondary']).optional(),
      graph: z
        .object({
          nodes: z.array(
            z.object({
              id: z.string(),
              label: z.string().optional(),
              matched: z.boolean().optional(),
            }),
          ),
          edges: z.array(
            z.object({
              id: z.string().optional(),
              source: z.string(),
              target: z.string(),
            }),
          ),
        })
        .optional(),
    })
    .optional(),
})

export type ChartSpec = z.infer<typeof chartSpecSchema>

export const metricCardSchema = z.object({
  label: z.string(),
  value: z.union([z.string(), z.number()]),
  hint: z.string().optional(),
})

export type MetricCard = z.infer<typeof metricCardSchema>

export const tableSpecSchema = z.object({
  columns: z.array(
    z.object({
      field: z.string(),
      label: z.string(),
      kind: columnKindSchema.optional(),
    }),
  ),
  rows: z.array(rowSchema),
  totalRows: z.number(),
  truncated: z.boolean(),
})

export type TableSpec = z.infer<typeof tableSpecSchema>

export const analysisArtifactSchema = z.object({
  version: z.literal(1),
  summary: z.string().optional(),
  metrics: z.array(metricCardSchema).optional(),
  charts: z.array(chartSpecSchema),
  table: tableSpecSchema.optional(),
})

export type AnalysisArtifact = z.infer<typeof analysisArtifactSchema>

export const queryResultSchema = z.object({
  sql: z.string().optional(),
  rowCount: z.number(),
  rows: z.array(rowSchema),
  truncated: z.boolean().optional(),
  note: z.string().optional(),
})

export type QueryResultLike = z.infer<typeof queryResultSchema>

export const VIZ_BLOCK_LANG = 'babata-viz'
