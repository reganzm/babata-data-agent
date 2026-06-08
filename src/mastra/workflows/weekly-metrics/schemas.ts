import { z } from 'zod'
import {
  workflowUserQueryInputSchema,
  workflowUserQueryObjectSchema,
} from '@/mastra/workflows/normalize-workflow-input'

export const weeklyInputSchema = workflowUserQueryInputSchema

export const weeklyOutputSchema = z.object({
  report: z.string(),
  metrics: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      sql: z.string(),
      rowCount: z.number(),
      rows: z.array(z.record(z.union([z.string(), z.number(), z.null()]))),
    }),
  ),
})

export const afterPlanSchema = workflowUserQueryObjectSchema.extend({
  weekLabel: z.string(),
  templates: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      sql: z.string(),
    }),
  ),
})

export const afterExecuteSchema = afterPlanSchema.extend({
  results: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      sql: z.string(),
      rowCount: z.number(),
      rows: z.array(z.record(z.union([z.string(), z.number(), z.null()]))),
    }),
  ),
})
