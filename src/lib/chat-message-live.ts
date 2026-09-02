export function findLastAssistantMessageId(
  messages: Array<{ id: string; role: string }>,
): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message?.role === 'assistant') return message.id
  }
  return undefined
}

export function isLiveAssistantMessage(
  status: string,
  messageId: string,
  lastAssistantId: string | undefined,
): boolean {
  return status === 'streaming' && Boolean(lastAssistantId) && messageId === lastAssistantId
}

/** 流式/心跳更新会反复 render，入场动画只能播一次，否则同一气泡会闪跳 */
export function getAssistantMotionInitial(_isLive: boolean): false {
  return false
}

type DisplayPart = {
  type?: string
  text?: string
  state?: string
  toolCallId?: string
  output?: unknown
  result?: unknown
}

const HIDDEN_DISPLAY_PART_TYPES = new Set([
  'data-heartbeat',
  'step-start',
  'data-tool-agent',
  'data-tool-call-suspended',
])

function isHiddenDisplayPart(part: DisplayPart): boolean {
  const type = part.type ?? ''
  return (
    HIDDEN_DISPLAY_PART_TYPES.has(type) ||
    type.startsWith('data-workflow')
  )
}

function summarizePartOutput(output: unknown): string {
  if (output == null) return ''
  if (typeof output === 'string') return output.slice(0, 400)
  try {
    return JSON.stringify(output).slice(0, 400)
  } catch {
    return String(output)
  }
}

export function assistantDisplaySignature(parts: DisplayPart[]): string {
  return parts
    .filter((part) => !isHiddenDisplayPart(part))
    .map(
      (part) =>
        `${part.type ?? ''}:${part.toolCallId ?? ''}:${part.state ?? ''}:${part.text ?? ''}:${summarizePartOutput(part.output ?? part.result)}`,
    )
    .join('|')
}

export function messagesDisplaySignature(
  messages: Array<{ id: string; role: string; parts?: DisplayPart[] }>,
): string {
  return messages
    .map(
      (message) =>
        `${message.id}:${message.role}:${assistantDisplaySignature(message.parts ?? [])}`,
    )
    .join('//')
}
