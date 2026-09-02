import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import {
  normalizeUserQuery,
  type NormalizeUserQueryResult,
} from '@/lib/query-normalization'

const inputSchema = z.object({
  originalQuery: z.string().describe('用户原始口语查询'),
  ragHints: z.string().optional().describe('可选的术语/字段线索摘要'),
})

const outputSchema = z.object({
  confirmedQuery: z.string(),
  cancelled: z.boolean(),
  normalizedQuery: z.string(),
})

const suspendSchema = z.object({
  approvalType: z.literal('query-normalization'),
  originalQuery: z.string(),
  normalizedQuery: z.string(),
})

const resumeSchema = z.object({
  approved: z.boolean(),
  confirmedQuery: z.string().optional(),
})

export type ConfirmNormalizedQueryNormalize = (input: {
  originalQuery: string
  today: string
  ragHints?: string
}) => Promise<NormalizeUserQueryResult>

const skipHitl = () =>
  process.env.BABATA_SKIP_QUERY_NORMALIZATION_HITL === 'true'

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}

export function createConfirmNormalizedQueryTool(options?: {
  normalize?: ConfirmNormalizedQueryNormalize
}) {
  const normalize = options?.normalize ?? normalizeUserQuery

  return createTool({
    id: 'confirm-normalized-query',
    description:
      '将用户口语规范化为可读规范文本并请用户确认。问数或标准分析流程前必须先调用；确认后的 confirmedQuery 作为下游唯一查询串。',
    inputSchema,
    outputSchema,
    suspendSchema,
    resumeSchema,
    execute: async (input, context) => {
      const originalQuery = input.originalQuery.trim() || input.originalQuery
      const normalized = await normalize({
        originalQuery,
        today: todayIsoDate(),
        ragHints: input.ragHints,
      })
      const normalizedQuery = normalized.normalizedQuery.trim() || originalQuery

      if (skipHitl()) {
        return {
          confirmedQuery: normalizedQuery,
          cancelled: false,
          normalizedQuery,
        }
      }

      const agent = context?.agent
      const resumeData = agent?.resumeData as
        | z.infer<typeof resumeSchema>
        | undefined

      if (resumeData === undefined) {
        await agent?.suspend?.({
          approvalType: 'query-normalization' as const,
          originalQuery,
          normalizedQuery,
        })
        return {
          confirmedQuery: '',
          cancelled: false,
          normalizedQuery,
        }
      }

      if (resumeData.approved === false) {
        return {
          confirmedQuery: '',
          cancelled: true,
          normalizedQuery,
        }
      }

      const confirmed =
        resumeData.confirmedQuery?.trim() || normalizedQuery
      return {
        confirmedQuery: confirmed,
        cancelled: false,
        normalizedQuery,
      }
    },
  })
}

export const confirmNormalizedQueryTool = createConfirmNormalizedQueryTool()
