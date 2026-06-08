import { createStep } from '@mastra/core/workflows'
import { createFewShotKnowledgeRecord } from '@/lib/db/few-shot-knowledge'
import {
  interpretOutputSchema,
  reportOutputSchema,
} from '../schemas'

export const fewShotApprovalStep = createStep({
  id: 'few-shot-approval',
  inputSchema: interpretOutputSchema,
  outputSchema: reportOutputSchema,
  execute: async ({ inputData }) => {
    await createFewShotKnowledgeRecord(inputData.fewShotDraft)
    return {
      report: inputData.report,
      structured: inputData.structured,
    }
  },
})
