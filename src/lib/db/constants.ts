/** 与 Mastra LibSQLStore 使用同一数据库文件 */
export const BABATA_STORAGE_URL =
  process.env.BABATA_STORAGE_URL?.trim() || 'file:./storage.db'

export const BABATA_RESOURCE_ID =
  process.env.BABATA_RESOURCE_ID?.trim() || 'babata-local-user'
