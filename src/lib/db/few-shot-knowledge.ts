import { ensureSchema } from './schema'
import { getDbClient } from './client'

export type FewShotKnowledgeRecord = {
  originalQuestion: string
  finalIntentSummary: string
  clarificationRecord: string
  generatedSql: string
  reportMarkdown: string
  generatedAt: string
}

export async function createFewShotKnowledgeRecord(
  record: FewShotKnowledgeRecord,
): Promise<void> {
  await ensureSchema()
  const db = getDbClient()
  const now = new Date().toISOString()

  await db.execute({
    sql: `INSERT INTO babata_few_shot_knowledge (
      id,
      original_question,
      final_intent_summary,
      clarification_record,
      generated_sql,
      report_markdown,
      generated_at,
      manual_review_status,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      crypto.randomUUID(),
      record.originalQuestion.trim(),
      record.finalIntentSummary.trim(),
      record.clarificationRecord.trim(),
      record.generatedSql.trim(),
      record.reportMarkdown.trim(),
      record.generatedAt.trim(),
      'pending',
      now,
    ],
  })
}
