import type { MastraDBMessage } from '@mastra/core/agent'
import { BaseProcessor } from '@mastra/core/processors'
import { slimMessagePart } from '@/lib/message-persist-slim'

/** 写入 Mastra Memory 前压缩 tool/agent 快照，避免 storage.db 膨胀 */
export class PersistPayloadSlimmer extends BaseProcessor<'persist-payload-slimmer'> {
  readonly id = 'persist-payload-slimmer'

  processOutputResult({
    messages,
  }: {
    messages: MastraDBMessage[]
  }): MastraDBMessage[] {
    return messages.map((message) => {
      if (!message.content || message.content.format !== 2) {
        return message
      }

      return {
        ...message,
        content: {
          ...message.content,
          parts: message.content.parts.map((part) =>
            slimMessagePart(part),
          ) as typeof message.content.parts,
        },
      }
    })
  }
}

export const persistPayloadSlimmer = new PersistPayloadSlimmer()
