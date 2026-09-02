import type { UIMessage } from '@ai-sdk/react'

export const HEARTBEAT_CONTINUE_PREFIX = '【心跳续跑】'
export const HEARTBEAT_CONTINUE_TEXT =
  '【心跳续跑】上一轮回复在工具执行后中断，未给出完整结论。请基于已有工具结果继续推进：若仍需查表或检索知识库则继续调用工具；若信息已足够则整理输出完整回答。禁止询问用户是否继续。'
export const HEARTBEAT_TOOL_ERROR = '执行超时，已由心跳续跑自动推进'
export const HEARTBEAT_ENDED_STALL_MS = 1500
export const HEARTBEAT_STREAM_STALL_MS = 20_000
export const HEARTBEAT_MAX_ATTEMPTS = 2

export type HeartbeatChatStatus = 'ready' | 'submitted' | 'streaming' | 'error'
export type HeartbeatDecision = 'now' | 'wait' | 'no'

type ToolLikePart = {
  type?: string
  text?: string
  state?: string
  errorText?: string
}

function getParts(message: UIMessage): ToolLikePart[] {
  return Array.isArray(message.parts) ? (message.parts as ToolLikePart[]) : []
}

function messageText(message: UIMessage): string {
  return getParts(message)
    .filter((part) => part.type === 'text')
    .map((part) => part.text ?? '')
    .join('\n')
}

export function isHeartbeatUserMessage(message: UIMessage): boolean {
  if (message.role !== 'user') return false
  return messageText(message).includes(HEARTBEAT_CONTINUE_PREFIX)
}

export function hasIncompleteToolCall(message: UIMessage): boolean {
  return getParts(message).some((part) => {
    if (!part.type?.startsWith('tool-')) return false
    return part.state === 'input-streaming' || part.state === 'input-available'
  })
}

function textAfterLastTool(parts: ToolLikePart[]): string {
  let lastToolIndex = -1
  for (let i = parts.length - 1; i >= 0; i--) {
    if (parts[i]?.type?.startsWith('tool-')) {
      lastToolIndex = i
      break
    }
  }
  if (lastToolIndex < 0) return ''
  return parts
    .slice(lastToolIndex + 1)
    .filter((part) => part.type === 'text')
    .map((part) => part.text ?? '')
    .join('\n')
    .trim()
}

function isConcludingAnswer(text: string): boolean {
  const trimmed = text.trim()
  if (trimmed.length > 150) return true
  return /(?:如下|以上|总结|合计|结论|结果显示|包含以下|字段如下|供参考|已完成|共\s*\d)/.test(
    trimmed,
  )
}

function isIncompleteIntent(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed || trimmed.length > 100) return false
  if (isConcludingAnswer(trimmed)) return false
  return /(?:让我|接下来|继续|进一步|再去|还需要|现在去|先加载|先检索|先查看|同时|正在)/.test(
    trimmed,
  )
}

function looksStalledAfterCompletedTools(message: UIMessage): boolean {
  const parts = getParts(message)
  const tools = parts.filter((part) => part.type?.startsWith('tool-'))
  if (tools.length === 0) return false
  if (
    tools.some(
      (part) =>
        part.state === 'input-streaming' || part.state === 'input-available',
    )
  ) {
    return false
  }
  const finishedTools = tools.filter((part) => part.state === 'output-available')
  if (finishedTools.length === 0) return false

  const trailing = textAfterLastTool(parts)
  if (trailing) {
    if (isConcludingAnswer(trailing)) return false
    if (isIncompleteIntent(trailing)) return true
    return trailing.length <= 40
  }

  const allText = messageText(message).trim()
  if (!allText) return true
  if (isConcludingAnswer(allText)) return false
  return isIncompleteIntent(allText) || allText.length <= 100
}

function endsWithContinuationPromiseAfterTools(message: UIMessage): boolean {
  const parts = getParts(message)
  if (parts.length === 0) return false
  const lastPart = parts[parts.length - 1]
  if (lastPart?.type !== 'text') return false

  const hasFinishedTool = parts.some(
    (part) => part.type?.startsWith('tool-') && part.state === 'output-available',
  )
  if (!hasFinishedTool) return false

  const text = (lastPart.text ?? '').trim()
  if (!text || text.length > 80) return false

  return isIncompleteIntent(text)
}

export function looksInterruptedAssistant(message: UIMessage): boolean {
  if (message.role !== 'assistant') return false
  if (hasIncompleteToolCall(message)) return true
  if (looksStalledAfterCompletedTools(message)) return true
  if (endsWithContinuationPromiseAfterTools(message)) return true

  const text = messageText(message).trim()
  if (!text || text.length > 80) return false
  const promised = /委派|收集上下文|先去|先收集|正在/.test(text)
  const hasFinishedTool = getParts(message).some(
    (part) => part.type?.startsWith('tool-') && part.state === 'output-available',
  )
  return promised && !hasFinishedTool
}

export function countRecentHeartbeatAttempts(messages: UIMessage[]): number {
  let count = 0
  for (let i = messages.length - 1; i >= 0; i--) {
    const current = messages[i]
    if (!current) continue
    if (current.role === 'user' && !isHeartbeatUserMessage(current)) break
    if (isHeartbeatUserMessage(current)) count += 1
  }
  return count
}

export function fingerprintMessages(messages: UIMessage[]): string {
  return messages
    .map((message) => {
      const parts = getParts(message)
        .filter((part) => part.type !== 'data-heartbeat')
        .map((part) => `${part.type}:${part.state ?? ''}:${part.text ?? ''}`)
        .join('|')
      return `${message.id}:${message.role}:${parts}`
    })
    .join('//')
}

export function lastAssistantMessage(
  messages: UIMessage[],
): UIMessage | undefined {
  return [...messages].reverse().find((message) => message.role === 'assistant')
}

export function shouldStartHeartbeat(input: {
  status: HeartbeatChatStatus
  hasIncompleteTools: boolean
  looksInterrupted: boolean
  idleMs: number
  attempts: number
  maxAttempts: number
  workflowSuspended: boolean
  sessionTouched: boolean
  sending: boolean
}): HeartbeatDecision {
  if (
    input.workflowSuspended ||
    input.sending ||
    !input.sessionTouched ||
    input.attempts >= input.maxAttempts
  ) {
    return 'no'
  }

  const needsAdvance = input.hasIncompleteTools || input.looksInterrupted
  if (!needsAdvance) return 'no'
  if (input.status === 'submitted') return 'wait'

  const stallMs =
    input.status === 'streaming' && input.hasIncompleteTools
      ? HEARTBEAT_STREAM_STALL_MS
      : HEARTBEAT_ENDED_STALL_MS

  return input.idleMs >= stallMs ? 'now' : 'wait'
}

export function finalizeIncompleteToolParts(
  messages: UIMessage[],
  errorText: string,
): UIMessage[] {
  return messages.map((message) => {
    if (message.role !== 'assistant') return message
    let changed = false
    const parts = getParts(message).map((part) => {
      if (
        !part.type?.startsWith('tool-') ||
        (part.state !== 'input-streaming' && part.state !== 'input-available')
      ) {
        return part
      }
      changed = true
      return {
        ...part,
        state: 'output-error',
        errorText,
      }
    })
    if (!changed) return message
    return {
      ...message,
      parts: parts as UIMessage['parts'],
    }
  })
}
