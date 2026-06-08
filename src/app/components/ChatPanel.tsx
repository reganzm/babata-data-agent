'use client'

import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react'
import { useChat, type UIMessage } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { motion, AnimatePresence } from 'motion/react'
import { ChevronDown, Send, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { slideUp } from '@/lib/animations'
import { ToolStatusBadge } from './ToolStatusBadge'
import { WorkflowProgressPanel } from './WorkflowProgressPanel'
import { AssistantMessageContent } from './visualization/AssistantMessageContent'
import {
  applyPendingApprovalToProgress,
  bootstrapWorkflowProgress,
  detectWorkflowToolKey,
  extractWorkflowReportFromParts,
  extractWorkflowSuspendSyncContext,
  extractWorkflowRunIdFromParts,
  findLastAssistantWorkflowMessageId,
  isAwaitingSqlApproval,
  type WorkflowResumeContext,
  isWorkflowDataPartType,
  parseWorkflowProgressFromParts,
} from '@/lib/workflow-progress'
import { pollWorkflowRunProgress } from '@/lib/workflow-stream-merge'
import { shouldRenderWorkflowReport } from '@/lib/workflow-report-rendering'
import { formatToolErrorMessage } from '@/lib/tool-error-message'
import {
  messageHasVisualization,
} from '@/lib/visualization/extract-artifact-from-parts'
import {
  fetchConversationById,
  toInitialMessage,
  updateConversationRemote,
} from '@/lib/conversation-store'
import type { ConversationMetadata } from '@/lib/db/conversations'
import { resumeAfterSqlApproval } from '@/lib/workflow-resume-client'

const SCROLL_THRESHOLD = 80

const DELEGATION_LABELS: Record<string, string> = {
  'agent-ximo': '西莫 · 数据分析',
  'agent-chestnut': '小栗子 · 写作润色',
  'agent-hundun': '混沌 · 上下文支撑',
  'workflow-data-analysis-report': '标准分析流程',
  'workflow-weekly-metrics': '周报指标流水线',
  'workflow-dataAnalysisReport': '标准分析流程',
  'workflow-weeklyMetrics': '周报指标流水线',
  ximo: '西莫 · 数据分析',
  chestnut: '小栗子 · 写作润色',
  hundun: '混沌 · 上下文支撑',
  'data-analysis-report': '标准分析流程',
  'weekly-metrics': '周报指标流水线',
}

const LINEAGE_DRILLDOWN_EVENT = 'babata:lineage-drilldown'

interface ChatPanelProps {
  conversationId: string | null
  mastraResourceId: string
  /** 递增后从服务端重新拉取消息（如 Workflow 审批完成） */
  messagesVersion?: number
  workflowSuspended?: boolean
  pendingApproval?: ConversationMetadata['pendingApproval']
  onMessagesChange?: (messages: UIMessage[]) => void
  /** 流式结束或轮询时刷新会话（含 Workflow metadata） */
  onStreamSettled?: () => void
  /** SQL 审批完成（批准/拒绝）后刷新 */
  onWorkflowApprovalResolved?: () => void
  /** 当前可见消息快照，用于导出等不应等待持久化的操作 */
  onLiveMessagesChange?: (conversationId: string, messages: UIMessage[]) => void
}

export function ChatPanel({
  conversationId,
  mastraResourceId,
  messagesVersion = 0,
  workflowSuspended = false,
  pendingApproval,
  onMessagesChange,
  onStreamSettled,
  onWorkflowApprovalResolved,
  onLiveMessagesChange,
}: ChatPanelProps) {
  const [hydratedMessages, setHydratedMessages] = useState<UIMessage[] | null>(
    null,
  )

  useEffect(() => {
    if (!conversationId) {
      setHydratedMessages(null)
      return
    }

    let cancelled = false
    setHydratedMessages(null)

    ;(async () => {
      const conv = await fetchConversationById(conversationId)
      if (!cancelled) {
        setHydratedMessages(conv?.messages.map(toInitialMessage) ?? [])
      }
    })()

    return () => {
      cancelled = true
    }
  }, [conversationId, messagesVersion])

  if (!conversationId) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        选择或新建会话
      </div>
    )
  }

  if (hydratedMessages === null) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        加载对话…
      </div>
    )
  }

  return (
    <ChatPanelChat
      key={`${conversationId}-${messagesVersion}`}
      conversationId={conversationId}
      mastraResourceId={mastraResourceId}
      initialMessages={hydratedMessages}
      workflowSuspended={workflowSuspended}
      pendingApproval={pendingApproval}
      onMessagesChange={onMessagesChange}
      onStreamSettled={onStreamSettled}
      onWorkflowApprovalResolved={onWorkflowApprovalResolved}
      onLiveMessagesChange={onLiveMessagesChange}
    />
  )
}

interface ChatPanelChatProps {
  conversationId: string
  mastraResourceId: string
  initialMessages: UIMessage[]
  workflowSuspended: boolean
  pendingApproval?: ConversationMetadata['pendingApproval']
  onMessagesChange?: (messages: UIMessage[]) => void
  onStreamSettled?: () => void
  onWorkflowApprovalResolved?: () => void
  onLiveMessagesChange?: (conversationId: string, messages: UIMessage[]) => void
}

function ChatPanelChat({
  conversationId,
  mastraResourceId,
  initialMessages,
  workflowSuspended,
  pendingApproval,
  onMessagesChange,
  onStreamSettled,
  onWorkflowApprovalResolved,
  onLiveMessagesChange,
}: ChatPanelChatProps) {
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/chat',
        prepareSendMessagesRequest: ({ body, messages }) => ({
          body: {
            ...body,
            messages: Array.isArray(body?.messages) ? body.messages : messages,
            id: conversationId,
            memory: {
              thread: conversationId,
              resource: mastraResourceId,
            },
          },
        }),
      }),
    [conversationId, mastraResourceId],
  )

  const [input, setInput] = useState('')
  const onStreamSettledRef = useRef(onStreamSettled)
  onStreamSettledRef.current = onStreamSettled
  const onWorkflowApprovalResolvedRef = useRef(onWorkflowApprovalResolved)
  onWorkflowApprovalResolvedRef.current = onWorkflowApprovalResolved

  const onMessagesChangeRef = useRef(onMessagesChange)
  onMessagesChangeRef.current = onMessagesChange
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const messagesSnapshotRef = useRef<UIMessage[]>(initialMessages)

  const flushPersist = useCallback((immediate: boolean) => {
    if (!onMessagesChangeRef.current || messagesSnapshotRef.current.length === 0) {
      return
    }
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current)
      persistTimerRef.current = null
    }
    const run = () => {
      void onMessagesChangeRef.current?.(messagesSnapshotRef.current)
    }
    if (immediate) {
      run()
    } else {
      persistTimerRef.current = setTimeout(run, 1500)
    }
  }, [])

  const { messages, sendMessage, status, stop, setMessages } = useChat({
    transport,
    id: conversationId,
    messages: initialMessages,
    onFinish: () => {
      flushPersist(true)
      onStreamSettledRef.current?.()
    },
  })

  messagesSnapshotRef.current = messages

  useEffect(() => {
    onLiveMessagesChange?.(conversationId, messages)
  }, [conversationId, messages, onLiveMessagesChange])

  useEffect(() => {
    const onLineageDrilldown = (event: Event) => {
      const table = (event as CustomEvent<{ table?: unknown }>).detail?.table
      if (typeof table !== 'string' || !table.trim()) return
      if (status !== 'ready') return
      void sendMessage({
        text: `查 ${table.trim()} 的数据血缘`,
      })
    }

    window.addEventListener(LINEAGE_DRILLDOWN_EVENT, onLineageDrilldown)
    return () => {
      window.removeEventListener(LINEAGE_DRILLDOWN_EVENT, onLineageDrilldown)
    }
  }, [sendMessage, status])

  const lastWorkflowMessageId = useMemo(
    () => findLastAssistantWorkflowMessageId(messages),
    [messages],
  )

  const pendingApprovalPayloadKey = useMemo(
    () => JSON.stringify(pendingApproval?.payload ?? null),
    [pendingApproval?.payload],
  )

  const pendingApprovalSyncKey = useMemo(() => {
    const p = pendingApproval?.payload
    if (!p || typeof p !== 'object') return ''
    const sql =
      'sql' in p && typeof (p as { sql?: string }).sql === 'string'
        ? (p as { sql: string }).sql.slice(0, 48)
        : ''
    const rev =
      'sqlRevisionCount' in p &&
      typeof (p as { sqlRevisionCount?: number }).sqlRevisionCount === 'number'
        ? (p as { sqlRevisionCount: number }).sqlRevisionCount
        : 0
    return `${rev}:${sql}`
  }, [pendingApprovalPayloadKey])

  const effectiveWorkflowSuspended = useMemo(() => {
    if (!workflowSuspended) return false
    if (!lastWorkflowMessageId) return workflowSuspended
    const msg = messages.find((m) => m.id === lastWorkflowMessageId)
    if (!msg) return workflowSuspended
    const progress = parseWorkflowProgressFromParts(msg.parts)
    if (!progress) return workflowSuspended
    const pendingRunId =
      pendingApproval?.workflowRunId ?? pendingApproval?.agentRunId ?? null
    const progressRunId = progress.workflowRunId ?? null
    const terminalStatuses = new Set([
      'success',
      'completed',
      'failed',
      'canceled',
      'cancelled',
    ])

    if (
      terminalStatuses.has(progress.runStatus) &&
      (!pendingRunId || !progressRunId || pendingRunId === progressRunId)
    ) {
      return false
    }

    if (pendingRunId && progressRunId && pendingRunId !== progressRunId) {
      return workflowSuspended
    }

    return (
      applyPendingApprovalToProgress(progress, pendingApproval).runStatus ===
      'suspended'
    )
  }, [workflowSuspended, lastWorkflowMessageId, messages, pendingApproval])

  const syncedSuspendRunIdRef = useRef<string | null>(null)
  const [workflowResumeBusy, setWorkflowResumeBusy] = useState(false)

  const enrichResumeContext = useCallback(
    (ctx: WorkflowResumeContext): WorkflowResumeContext => ({
      ...ctx,
      workflowRunId:
        ctx.workflowRunId ??
        pendingApproval?.workflowRunId ??
        null,
      agentRunId: ctx.agentRunId ?? pendingApproval?.agentRunId ?? null,
    }),
    [pendingApproval],
  )

  const handleWorkflowResume = useCallback(
    async (
      approved: boolean,
      ctx: WorkflowResumeContext,
      feedback?: string,
      clarification?: import('@/lib/sql-clarification').SqlClarification,
    ) => {
      const fullCtx = enrichResumeContext(ctx)
      setWorkflowResumeBusy(true)
      if (!approved) {
        void onWorkflowApprovalResolvedRef.current?.()
      }
      try {
        await resumeAfterSqlApproval({
          approved,
          feedback,
          clarification,
          conversationId,
          mastraResourceId,
          messages,
          context: fullCtx,
          onMessagesUpdate: (next) => {
            messagesSnapshotRef.current = next
            setMessages(next)
          },
        })
      } finally {
        setWorkflowResumeBusy(false)
      }
      syncedSuspendRunIdRef.current = null
      flushPersist(true)
      onStreamSettledRef.current?.()
      onWorkflowApprovalResolvedRef.current?.()
    },
    [
      conversationId,
      mastraResourceId,
      messages,
      setMessages,
      enrichResumeContext,
      flushPersist,
    ],
  )

  useEffect(() => {
    if (!lastWorkflowMessageId) return
    const msg = messages.find((m) => m.id === lastWorkflowMessageId)
    if (!msg) return
    const progress = parseWorkflowProgressFromParts(msg.parts)
    if (!progress || progress.runStatus !== 'suspended') return
    const suspendContext = extractWorkflowSuspendSyncContext(msg.parts)
    if (!suspendContext) return
    const payloadKey = JSON.stringify(suspendContext.payload)
    const syncKey = `${suspendContext.workflowRunId ?? suspendContext.agentRunId ?? ''}:${payloadKey}:${pendingApprovalSyncKey}`
    if (!syncKey || syncedSuspendRunIdRef.current === syncKey) return

    syncedSuspendRunIdRef.current = syncKey
    void fetch('/api/workflow/sync-suspend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationId,
        agentRunId: suspendContext.agentRunId ?? undefined,
        workflowRunId: suspendContext.workflowRunId ?? undefined,
        workflowId: suspendContext.workflowId,
        payload: suspendContext.payload,
      }),
    })
      .then(() => onStreamSettledRef.current?.())
      .catch((err) => console.error('[sync-suspend]', err))
  }, [
    messages,
    lastWorkflowMessageId,
    conversationId,
    pendingApprovalSyncKey,
  ])

  useEffect(() => {
    if (workflowResumeBusy || status === 'streaming') return
    if (!lastWorkflowMessageId) return
    const msg = messages.find((m) => m.id === lastWorkflowMessageId)
    if (!msg) return
    const progress = parseWorkflowProgressFromParts(msg.parts)
    if (!progress || progress.runStatus !== 'running') return

    const workflowRunId = extractWorkflowRunIdFromParts(msg.parts)
    if (!workflowRunId) return

    let cancelled = false
    void pollWorkflowRunProgress({
      workflowRunId,
      workflowId: progress.workflowId,
      conversationId,
      getParts: () =>
        messages.find((m) => m.id === lastWorkflowMessageId)?.parts ?? [],
      onPartsUpdate: (parts) => {
        if (cancelled) return
        const idx = messages.findIndex((m) => m.id === lastWorkflowMessageId)
        if (idx < 0) return
        const next = messages.map((m, i) =>
          i === idx ? ({ ...m, parts: parts as typeof m.parts }) : m,
        )
        messagesSnapshotRef.current = next
        setMessages(next)
      },
    }).then(() => {
      if (!cancelled) onStreamSettledRef.current?.()
    })

    return () => {
      cancelled = true
    }
  }, [
    messages,
    lastWorkflowMessageId,
    conversationId,
    workflowResumeBusy,
    status,
    pendingApproval?.workflowRunId,
    setMessages,
  ])

  useEffect(() => {
    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current)
    }
  }, [conversationId])

  const scrollRef = useRef<HTMLDivElement>(null)
  const [showScrollToBottom, setShowScrollToBottom] = useState(false)
  const isAtBottomRef = useRef(true)
  const isProgrammaticScrollRef = useRef(false)

  const updateScrollState = useCallback(() => {
    if (isProgrammaticScrollRef.current) return

    const el = scrollRef.current
    if (!el) return

    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    const atBottom = distanceFromBottom <= SCROLL_THRESHOLD
    isAtBottomRef.current = atBottom
    setShowScrollToBottom(!atBottom && messages.length > 0)
  }, [messages.length])

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const el = scrollRef.current
    if (!el) return

    isProgrammaticScrollRef.current = true
    el.scrollTo({ top: el.scrollHeight, behavior })
    isAtBottomRef.current = true
    queueMicrotask(() => {
      isProgrammaticScrollRef.current = false
    })
  }, [])

  const handleScrollToBottom = useCallback(() => {
    scrollToBottom('smooth')
    setShowScrollToBottom(false)
  }, [scrollToBottom])

  useEffect(() => {
    if (messages.length === 0) return
    const streaming = status === 'streaming' || status === 'submitted'
    flushPersist(!streaming)
  }, [messages, status, flushPersist])

  useLayoutEffect(() => {
    isAtBottomRef.current = true
    setShowScrollToBottom(false)
    scrollToBottom('auto')
  }, [conversationId, scrollToBottom])

  useLayoutEffect(() => {
    if (!isAtBottomRef.current) {
      updateScrollState()
      return
    }
    scrollToBottom('auto')
  }, [messages, scrollToBottom, updateScrollState])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    el.addEventListener('scroll', updateScrollState, { passive: true })
    return () => el.removeEventListener('scroll', updateScrollState)
  }, [updateScrollState, conversationId])

  const isLoading = status === 'streaming' || status === 'submitted'

  useEffect(() => {
    if (status !== 'streaming') return
    const timer = setInterval(() => {
      onStreamSettledRef.current?.()
    }, 5000)
    return () => clearInterval(timer)
  }, [status])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = input.trim()
    if (!trimmed || isLoading || effectiveWorkflowSuspended) return
    sendMessage({ text: trimmed })
    setInput('')
  }

  return (
    <div className="relative flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="space-y-4">
          {messages.length === 0 && (
            <div className="flex h-full min-h-[400px] items-center justify-center text-muted-foreground">
              <p>输入消息开始对话</p>
            </div>
          )}

          {messages.map((message) => {
            const wideAssistant =
              message.role === 'assistant' &&
              messageHasVisualization(message.parts as never)

            if (message.role === 'assistant') {
              const toolParts = message.parts.filter((part) =>
                part.type?.startsWith('tool-'),
              )
              const workflowProgress =
                parseWorkflowProgressFromParts(message.parts)
              const workflowToolKey = detectWorkflowToolKey(message.parts)
              const workflowToolActive = toolParts.some((part) => {
                if (!part.type?.startsWith('tool-workflow')) return false
                const state = (part as { state?: string }).state
                return (
                  state === 'input-streaming' ||
                  state === 'input-available'
                )
              })
              const isLastWorkflowMessage =
                message.id === lastWorkflowMessageId
              const rawWorkflowProgress =
                isLastWorkflowMessage &&
                (workflowProgress ??
                  (workflowToolActive && workflowToolKey
                    ? bootstrapWorkflowProgress(workflowToolKey)
                    : null))
              const showWorkflowProgress = rawWorkflowProgress
                ? applyPendingApprovalToProgress(
                    rawWorkflowProgress,
                    pendingApproval,
                  )
                : null
              const contentParts = message.parts.filter(
                (part) =>
                  part.type !== 'step-start' &&
                  part.type !== 'data-tool-agent' &&
                  part.type !== 'data-tool-call-suspended' &&
                  !isWorkflowDataPartType(part.type),
              )
              const hasTextPart = contentParts.some(
                (part) =>
                  part.type === 'text' &&
                  typeof (part as { text?: string }).text === 'string' &&
                  Boolean((part as { text?: string }).text?.trim()),
              )
              const workflowReportMarkdown = extractWorkflowReportFromParts(message.parts)
              const workflowReportRunStatus =
                workflowProgress?.runStatus ?? showWorkflowProgress?.runStatus
              const workflowInterpreting = Boolean(
                showWorkflowProgress &&
                  showWorkflowProgress.runStatus === 'running' &&
                  showWorkflowProgress.currentStepId === 'interpret-results' &&
                  !isAwaitingSqlApproval(showWorkflowProgress),
              )
              const shouldShowReportPendingText =
                !workflowReportMarkdown &&
                workflowInterpreting &&
                isLastWorkflowMessage

              const renderedContentParts =
                shouldRenderWorkflowReport({
                  reportMarkdown: workflowReportMarkdown,
                  runStatus: workflowReportRunStatus,
                  hasTextPart,
                })
                  ? [
                      ...contentParts.filter((part) => part.type !== 'text'),
                      { type: 'text', text: workflowReportMarkdown } as (typeof contentParts)[number],
                    ]
                  : shouldShowReportPendingText
                    ? [
                        ...contentParts.filter((part) => part.type !== 'text'),
                        {
                          type: 'text',
                          text: '正在生成解读报告，请稍候…',
                        } as (typeof contentParts)[number],
                      ]
                    : contentParts
              const presentationParts = [
                ...renderedContentParts,
                ...message.parts.filter((part) => part.type === 'data-tool-agent'),
              ]

              return (
                <motion.div
                  key={message.id}
                  variants={slideUp}
                  initial="hidden"
                  animate="visible"
                  className="flex justify-start"
                >
                  <div
                    className={cn(
                      'w-full max-w-[980px] rounded-lg px-4 py-3 transition-colors',
                      'border border-border/80 bg-card text-card-foreground shadow-sm dark:shadow-[0_1px_0_0_oklch(1_0_0_/_5%),0_8px_24px_-8px_oklch(0_0_0_/_45%)]',
                    )}
                  >
                    {showWorkflowProgress && (
                      <WorkflowProgressPanel
                        progress={showWorkflowProgress}
                        onResume={
                          showWorkflowProgress.resumeContext
                            ? (approved, feedback, clarification) =>
                                handleWorkflowResume(
                                  approved,
                                  showWorkflowProgress.resumeContext!,
                                  feedback,
                                  clarification,
                                )
                            : undefined
                        }
                        isLive={
                          status === 'streaming' &&
                          showWorkflowProgress.runStatus === 'running'
                        }
                        resumeBusy={workflowResumeBusy}
                      />
                    )}

                    {toolParts.map((part, index) => {
                      if (!part.type?.startsWith('tool-')) return null
                      if (part.type.startsWith('tool-workflow') && showWorkflowProgress) {
                        return null
                      }
                      const rawName = part.type.replace('tool-', '')
                      const toolName = DELEGATION_LABELS[rawName] ?? rawName
                      const toolPart = part as {
                        type: string
                        toolCallId: string
                        state:
                          | 'input-streaming'
                          | 'input-available'
                          | 'output-available'
                          | 'output-error'
                        errorText?: string
                      }
                      return (
                        <div key={toolPart.toolCallId ?? index} className="my-2">
                          <ToolStatusBadge
                            toolName={toolName}
                            state={toolPart.state}
                          />
                          {toolPart.state === 'output-error' &&
                            toolPart.errorText && (
                              <div className="mt-1 rounded border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                                {formatToolErrorMessage({
                                  toolName,
                                  errorText: toolPart.errorText,
                                })}
                              </div>
                            )}
                        </div>
                      )
                    })}

                    <AssistantMessageContent
                      parts={presentationParts as never}
                      isStreaming={status === 'streaming'}
                    />
                  </div>
                </motion.div>
              )
            }

            return (
            <motion.div
              key={message.id}
              variants={slideUp}
              initial="hidden"
              animate="visible"
              className={cn(
                'flex',
                message.role === 'user' ? 'justify-end' : 'justify-start',
              )}
            >
              <div
                className={cn(
                  'rounded-lg px-4 py-3 transition-colors',
                  wideAssistant ? 'w-full max-w-[980px]' : 'max-w-[80%]',
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground shadow-[0_0_12px_var(--neon-cyan-glow)]'
                    : 'border border-border/80 bg-card text-card-foreground shadow-sm dark:shadow-[0_1px_0_0_oklch(1_0_0_/_5%),0_8px_24px_-8px_oklch(0_0_0_/_45%)]',
                )}
              >
                {message.parts.map((part, index) => {
                  if (part.type === 'text') {
                    return (
                      <div key={index} className="whitespace-pre-wrap">
                        {part.text}
                      </div>
                    )
                  }

                  return null
                })}
              </div>
            </motion.div>
            )
          })}
        </div>
      </div>

      <AnimatePresence>
        {showScrollToBottom && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2 }}
            className="pointer-events-none absolute right-6 bottom-24 z-10"
          >
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="滚动到底部"
              onClick={handleScrollToBottom}
              className="pointer-events-auto h-9 w-9 rounded-full border-border bg-card/95 shadow-md backdrop-blur-sm hover:bg-accent"
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      <form
        onSubmit={handleSubmit}
        className="border-t border-border bg-card p-4 shadow-[0_-4px_24px_-8px_oklch(0_0_0_/_20%)] dark:shadow-[0_-1px_0_0_var(--sidebar-border),0_-8px_32px_-8px_oklch(0_0_0_/_40%)]"
      >
        <div className="flex gap-2">
          <Input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              effectiveWorkflowSuspended
                ? '有待审批的 SQL，请先在上方处理…'
                : '输入消息...'
            }
            className="flex-1 border-border bg-input focus-visible:ring-primary"
            disabled={isLoading || effectiveWorkflowSuspended}
          />
          {isLoading ? (
            <Button
              type="button"
              onClick={stop}
              variant="destructive"
              size="icon"
              className="shrink-0"
            >
              <Square className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              type="submit"
              disabled={!input.trim() || effectiveWorkflowSuspended}
              className="shrink-0 bg-primary text-primary-foreground shadow-[0_0_8px_var(--neon-cyan-glow)] hover:bg-primary/90"
              size="icon"
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
      </form>
    </div>
  )
}
