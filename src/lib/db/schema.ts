import { getDbClient } from './client'

let schemaReady: Promise<void> | null = null

export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = runMigrations()
  }
  return schemaReady
}

async function runMigrations(): Promise<void> {
  const db = getDbClient()
  await db.batch([
    `CREATE TABLE IF NOT EXISTS babata_conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT 'chat',
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      pinned_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS babata_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      parts TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      created_at TEXT,
      FOREIGN KEY (conversation_id) REFERENCES babata_conversations(id) ON DELETE CASCADE
    )`,
    `CREATE INDEX IF NOT EXISTS idx_babata_messages_conversation
      ON babata_messages(conversation_id, sort_order)`,
    `CREATE TABLE IF NOT EXISTS babata_doris_metadata_cache (
      cache_key TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      fetched_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS babata_users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_babata_users_username
      ON babata_users(username)`,
    `CREATE TABLE IF NOT EXISTS babata_few_shot_knowledge (
      id TEXT PRIMARY KEY,
      original_question TEXT NOT NULL,
      final_intent_summary TEXT NOT NULL,
      clarification_record TEXT NOT NULL,
      generated_sql TEXT NOT NULL,
      report_markdown TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      manual_review_status TEXT NOT NULL DEFAULT 'pending',
      manual_review_notes TEXT,
      manual_reviewed_at TEXT,
      created_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_babata_few_shot_created_at
      ON babata_few_shot_knowledge(created_at DESC)`,
  ])

  const columns = await db.execute(`PRAGMA table_info(babata_conversations)`)
  const names = new Set(
    (columns.rows as unknown as { name: string }[]).map((c) => c.name),
  )
  if (!names.has('pinned_at')) {
    await db.execute(`ALTER TABLE babata_conversations ADD COLUMN pinned_at TEXT`)
  }
  if (!names.has('user_id')) {
    await db.execute(`ALTER TABLE babata_conversations ADD COLUMN user_id TEXT`)
    await db.execute(
      `CREATE INDEX IF NOT EXISTS idx_babata_conversations_user
       ON babata_conversations(user_id, updated_at DESC)`,
    )
  }

  const fewShotColumns = await db.execute(
    `PRAGMA table_info(babata_few_shot_knowledge)`,
  )
  const fewShotNames = new Set(
    (fewShotColumns.rows as unknown as { name: string }[]).map((c) => c.name),
  )
  if (!fewShotNames.has('manual_review_status')) {
    await db.execute(
      `ALTER TABLE babata_few_shot_knowledge ADD COLUMN manual_review_status TEXT NOT NULL DEFAULT 'pending'`,
    )
  }
  if (!fewShotNames.has('manual_review_notes')) {
    await db.execute(
      `ALTER TABLE babata_few_shot_knowledge ADD COLUMN manual_review_notes TEXT`,
    )
  }
  if (!fewShotNames.has('manual_reviewed_at')) {
    await db.execute(
      `ALTER TABLE babata_few_shot_knowledge ADD COLUMN manual_reviewed_at TEXT`,
    )
  }
}
