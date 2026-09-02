'use client'

import { useEffect, useRef } from 'react'
import type { UIMessage } from '@ai-sdk/react'
import {
  HEARTBEAT_CONTINUE_TEXT,
  HEARTBEAT_MAX_ATTEMPTS,
  HEARTBEAT_TOOL_ERROR,
  countRecentHeartbeatAttempts,
  finalizeIncompleteToolParts,
  fingerprintMessages,
  hasIncompleteToolCall,
  isHeartbeatUserMessage,
  lastAssistantMessage,
  looksInterruptedAssistant,
  shouldStartHeartbeat,
  type HeartbeatChatStatus,
} from '@/lib/chat-heartbeat'

type UseChatHeartbeatParams = {
  messages: UIMessage[]
  status: HeartbeatChatStatus
  workflowSuspended: boolean
  sendMessage: (message: { text: string }) => void | Promise<void>
  stop: () => void
  setMessages: (messages: UIMessage[]) => void
}

export function useChatHeartbeat({
  messages,
  status,
  workflowSuspended,
  sendMessage,
  stop,
  setMessages,
}: UseChatHeartbeatParams) {
  const fingerprint = fingerprintMessages(messages)
  const lastChangeAtRef = useRef(Date.now())
  const lastFingerprintRef = useRef(fingerprint)
  const mountFingerprintRef = useRef(fingerprint)
  const sessionTouchedRef = useRef(false)
  const sendingRef = useRef(false)

  if (fingerprint !== lastFingerprintRef.current) {
    lastFingerprintRef.current = fingerprint
    lastChangeAtRef.current = Date.now()
    if (fingerprint !== mountFingerprintRef.current) {
      sessionTouchedRef.current = true
    }
  }

  useEffect(() => {
    if (status === 'submitted' || status === 'streaming') {
      sessionTouchedRef.current = true
    }
  }, [status])

  useEffect(() => {
    if (messages.length < 2) return
    const last = messages[messages.length - 1]
    const previous = messages[messages.length - 2]
    if (
      last?.role === 'assistant' &&
      previous?.role === 'user' &&
      !isHeartbeatUserMessage(previous)
    ) {
      sessionTouchedRef.current = true
    }
  }, [messages])

  useEffect(() => {
    const timer = setInterval(() => {
      const last = lastAssistantMessage(messages)
      const decision = shouldStartHeartbeat({
        status,
        hasIncompleteTools: last ? hasIncompleteToolCall(last) : false,
        looksInterrupted: last ? looksInterruptedAssistant(last) : false,
        idleMs: Date.now() - lastChangeAtRef.current,
        attempts: countRecentHeartbeatAttempts(messages),
        maxAttempts: HEARTBEAT_MAX_ATTEMPTS,
        workflowSuspended,
        sessionTouched: sessionTouchedRef.current,
        sending: sendingRef.current,
      })
      if (decision !== 'now') return

      sendingRef.current = true
      if (status === 'streaming') stop()
      setMessages(finalizeIncompleteToolParts(messages, HEARTBEAT_TOOL_ERROR))
      window.setTimeout(() => {
        void Promise.resolve(
          sendMessage({ text: HEARTBEAT_CONTINUE_TEXT }),
        ).finally(() => {
          sendingRef.current = false
        })
      }, 50)
    }, 500)

    return () => clearInterval(timer)
  }, [messages, sendMessage, setMessages, status, stop, workflowSuspended])
}
