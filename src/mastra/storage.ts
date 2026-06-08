import { LibSQLStore } from '@mastra/libsql'
import { BABATA_STORAGE_URL } from '@/lib/db/constants'

/** Mastra L2 与 Workflow 持久化（与 L1 同库文件） */
export const mastraStorage = new LibSQLStore({
  id: 'babata-storage',
  url: BABATA_STORAGE_URL,
})
