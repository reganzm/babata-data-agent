import { Memory } from '@mastra/memory'
import { mastraStorage } from '@/mastra/storage'

/** 巴巴塔与子 Agent 共享存储域（L2） */
export const sharedMemory = new Memory({
  storage: mastraStorage,
  options: {
    lastMessages: 40,
    generateTitle: false,
  },
})