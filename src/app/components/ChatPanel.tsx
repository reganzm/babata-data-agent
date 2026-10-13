'use client'

import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  useMemo,
  type MutableRefObject,
} from 'react'
import { useChat, type UIMessage } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { motion, AnimatePresence } from 'motion/react'
import { ChevronDown, X } from 'lucide-react'
import { parseChatError } from '@/lib/chat-error'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { slideUp } from '@/lib/animations'
import { ToolCallsPanel } from './ToolCallsPanel'
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
import { shouldApplyConversationUpdate } from '@/lib/conversation-persist-target'
import { isHeartbeatUserMessage } from '@/lib/chat-heartbeat'
import {
  findLastAssistantMessageId,
  getAssistantMotionInitial,
  isAssistantMessageBlank,
  isLiveAssistantMessage,
  messagesDisplaySignature,
} from '@/lib/chat-message-live'
import { useChatHeartbeat } from './useChatHeartbeat'
import {
  DEFAULT_CHAT_COMPOSER_STATE,
  normalizeChatComposerState,
  type ChatComposerState,
} from '@/lib/chat-composer-state'
import { ChatComposer } from './ChatComposer'

// 流式 chunk 很密，节流后再触发整个消息列表重渲染
const STREAM_RENDER_THROTTLE_MS = 80

const SCROLL_THRESHOLD = 80

const DELEGATION_LABELS: Record<string, string> = {
  'agent-ximo': '西莫 · 数据分析',
  'agent-chestnut': '小栗子 · 写作润色',
  'agent-hundun': '混沌 · 上下文支撑',
  'agent-dax': '达克斯 · 本地问数',
  'workflow-data-analysis-report': '标准分析流程',
  'workflow-weekly-metrics': '周报指标流水线',
  'workflow-dataAnalysisReport': '标准分析流程',
  'workflow-weeklyMetrics': '周报指标流水线',
  ximo: '西莫 · 数据分析',
  chestnut: '小栗子 · 写作润色',
  hundun: '混沌 · 上下文支撑',
  dax: '达克斯 · 本地问数',
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
  onMessagesChange?: (conversationId: string, messages: UIMessage[]) => void
  /** 流式结束或轮询时刷新会话（含 Workflow metadata） */
  onStreamSettled?: () => void
  /** SQL 审批完成（批准/拒绝）后刷新 */
  onWorkflowApprovalResolved?: () => void
  /** 当前可见消息快照，用于导出等不应等待持久化的操作 */
  onLiveMessagesChange?: (conversationId: string, messages: UIMessage[]) => void
  /**
   * 外部 resume（如查询规范化确认）写入实时消息的回调槽。
   * ChatPanel 挂载后会注入 setMessages，卸载时清空。
   */
  liveMessagesUpdaterRef?: MutableRefObject<
    ((conversationId: string, messages: UIMessage[]) => void) | null
  >
  /** 外部 resume 结束后强制立刻落库 */
  persistFlushRef?: MutableRefObject<(() => void) | null>
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
  liveMessagesUpdaterRef,
  persistFlushRef,
}: ChatPanelProps) {
  const [hydratedMessages, setHydratedMessages] = useState<UIMessage[] | null>(
    null,
  )
  const [hydratedSelection, setHydratedSelection] = useState<ChatComposerState>(
    DEFAULT_CHAT_COMPOSER_STATE,
  )
  const [hydratedMetadata, setHydratedMetadata] = useState<ConversationMetadata>({})

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
        setHydratedMetadata(conv?.metadata ?? {})
        setHydratedSelection(
          normalizeChatComposerState({
            selectedDataSourceId: conv?.metadata?.selectedDataSourceId,
            selectedKnowledgeBaseId: conv?.metadata?.selectedKnowledgeBaseId,
            chatMode: conv?.metadata?.chatMode,
          }),
        )
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
      initialSelection={hydratedSelection}
      initialMetadata={hydratedMetadata}
      workflowSuspended={workflowSuspended}
      pendingApproval={pendingApproval}
      onMessagesChange={onMessagesChange}
      onStreamSettled={onStreamSettled}
      onWorkflowApprovalResolved={onWorkflowApprovalResolved}
      onLiveMessagesChange={onLiveMessagesChange}
      liveMessagesUpdaterRef={liveMessagesUpdaterRef}
      persistFlushRef={persistFlushRef}
    />
  )
}

interface ChatPanelChatProps {
  conversationId: string
  mastraResourceId: string
  initialMessages: UIMessage[]
  initialSelection: ChatComposerState
  initialMetadata: ConversationMetadata
  workflowSuspended: boolean
  pendingApproval?: ConversationMetadata['pendingApproval']
  onMessagesChange?: (conversationId: string, messages: UIMessage[]) => void
  onStreamSettled?: () => void
  onWorkflowApprovalResolved?: () => void
  onLiveMessagesChange?: (conversationId: string, messages: UIMessage[]) => void
  liveMessagesUpdaterRef?: MutableRefObject<
    ((conversationId: string, messages: UIMessage[]) => void) | null
  >
  persistFlushRef?: MutableRefObject<(() => void) | null>
}

function ChatPanelChat({
  conversationId,
  mastraResourceId,
  initialMessages,
  initialSelection,
  initialMetadata,
  workflowSuspended,
  pendingApproval,
  onMessagesChange,
  onStreamSettled,
  onWorkflowApprovalResolved,
  onLiveMessagesChange,
  liveMessagesUpdaterRef,
  persistFlushRef,
}: ChatPanelChatProps) {
  const [localSelection, setLocalSelection] = useState(() =>
    normalizeChatComposerState(initialSelection),
  )
  const localSelectionRef = useRef(normalizeChatComposerState(initialSelection))
  localSelectionRef.current = localSelection
  const metadataRef = useRef(initialMetadata)
  metadataRef.current = {
    ...initialMetadata,
    selectedDataSourceId: localSelection.selectedDataSourceId || undefined,
    selectedKnowledgeBaseId: localSelection.selectedKnowledgeBaseId || undefined,
    chatMode: localSelection.chatMode,
  }

  const persistSelection = useCallback(
    (next: ChatComposerState) => {
      const normalized = normalizeChatComposerState(next)
      localSelectionRef.current = normalized
      setLocalSelection(normalized)
      void fetchConversationById(conversationId).then((conversation) =>
        updateConversationRemote(conversationId, {
          metadata: {
            ...(conversation?.metadata ?? metadataRef.current),
            selectedDataSourceId: normalized.selectedDataSourceId || undefined,
            selectedKnowledgeBaseId: normalized.selectedKnowledgeBaseId || undefined,
            chatMode: normalized.chatMode,
          },
        }),
      )
    },
    [conversationId],
  )

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/chat',
        prepareSendMessagesRequest: ({ body, messages }) => ({
          body: {
            ...body,
            messages: Array.isArray(body?.messages) ? body.messages : messages,
            id: conversationId,
            selectedDataSourceId:
              localSelectionRef.current.selectedDataSourceId || undefined,
            selectedKnowledgeBaseId:
              localSelectionRef.current.selectedKnowledgeBaseId || undefined,
            chatMode: localSelectionRef.current.chatMode,
            requestContext: {
              selectedDataSourceId:
                localSelectionRef.current.selectedDataSourceId || undefined,
              selectedKnowledgeBaseId:
                localSelectionRef.current.selectedKnowledgeBaseId || undefined,
              chatMode: localSelectionRef.current.chatMode,
            },
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
  const lastPersistedDisplayRef = useRef(
    messagesDisplaySignature(initialMessages),
  )
  const conversationIdRef = useRef(conversationId)
  conversationIdRef.current = conversationId

  const flushPersist = useCallback((immediate: boolean) => {
    if (!onMessagesChangeRef.current || messagesSnapshotRef.current.length === 0) {
      return
    }
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current)
      persistTimerRef.current = null
    }
    const persistConversationId = conversationIdRef.current
    const run = () => {
      const snapshot = messagesSnapshotRef.current
      const displaySignature = messagesDisplaySignature(snapshot)
      if (displaySignature === lastPersistedDisplayRef.current) {
        return
      }
      lastPersistedDisplayRef.current = displaySignature
      void onMessagesChangeRef.current?.(
        persistConversationId,
        snapshot,
      )
    }
    if (immediate) {
      run()
    } else {
      persistTimerRef.current = setTimeout(run, 1500)
    }
  }, [])

  const { messages, sendMessage, status, stop, setMessages, error, clearError } =
    useChat({
      transport,
      id: conversationId,
      messages: initialMessages,
      experimental_throttle: STREAM_RENDER_THROTTLE_MS,
      onFinish: () => {
        flushPersist(true)
        onStreamSettledRef.current?.()
      },
      onError: (err) => {
        console.error('[ChatPanel] chat request failed', err)
      },
    })

  const chatError = useMemo(() => parseChatError(error), [error])

  messagesSnapshotRef.current = messages
  const stopRef = useRef(stop)
  stopRef.current = stop

  useEffect(() => {
    if (!liveMessagesUpdaterRef) return
    liveMessagesUpdaterRef.current = (sourceConversationId, next) => {
      if (
        !shouldApplyConversationUpdate(
          sourceConversationId,
          conversationIdRef.current,
        )
      ) {
        return
      }
      messagesSnapshotRef.current = next
      setMessages(next)
    }
    return () => {
      liveMessagesUpdaterRef.current = null
    }
  }, [liveMessagesUpdaterRef, setMessages])

  useEffect(() => {
    return () => {
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current)
        persistTimerRef.current = null
      }
      if (messagesSnapshotRef.current.length > 0) {
        onMessagesChangeRef.current?.(
          conversationIdRef.current,
          messagesSnapshotRef.current,
        )
      }
      stopRef.current()
    }
  }, [])

  useEffect(() => {
    if (!persistFlushRef) return
    persistFlushRef.current = () => flushPersist(true)
    return () => {
      persistFlushRef.current = null
    }
  }, [persistFlushRef, flushPersist])

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

  useChatHeartbeat({
    messages,
    status,
    workflowSuspended: effectiveWorkflowSuspended || Boolean(pendingApproval),
    sendMessage,
    stop,
    setMessages,
  })

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

  // 出错提示在对话流末尾，出现时强制滚到底部，确保用户一定能看到
  useEffect(() => {
    if (!chatError) return
    isAtBottomRef.current = true
    scrollToBottom('smooth')
  }, [chatError, scrollToBottom])

  useEffect(() => {
    if (messages.length === 0) return
    // 消息变更一律防抖落库。agent resume 走 setMessages 时 status 仍是 ready，
    // 若这里 immediate 会把每个流式 chunk 打成一次 PATCH。
    flushPersist(false)
  }, [messages, flushPersist])

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
  const lastAssistantId = useMemo(
    () => findLastAssistantMessageId(messages),
    [messages],
  )

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
                  part.type !== 'data-heartbeat' &&
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

              const isLiveAssistant = isLiveAssistantMessage(
                status,
                message.id,
                lastAssistantId,
              )

              // 流式请求中途出错时助手消息可能没有任何内容，不渲染空白气泡；
              // 错误信息由下方的 ChatErrorNotice 展示
              if (
                !isLiveAssistant &&
                !showWorkflowProgress &&
                isAssistantMessageBlank(message.parts as never)
              ) {
                return null
              }

              return (
                <motion.div
                  key={message.id}
                  variants={slideUp}
                  initial={getAssistantMotionInitial(isLiveAssistant)}
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

                    <ToolCallsPanel
                      toolParts={toolParts as never}
                      delegationLabels={DELEGATION_LABELS}
                      showWorkflowProgress={Boolean(showWorkflowProgress)}
                      isLive={isLiveAssistant}
                    />

                    <AssistantMessageContent
                      parts={presentationParts as never}
                      isStreaming={isLiveAssistant}
                    />
                  </div>
                </motion.div>
              )
            }

            if (isHeartbeatUserMessage(message)) {
              return (
                <motion.div
                  key={message.id}
                  variants={slideUp}
                  initial={false}
                  animate="visible"
                  className="flex justify-center"
                >
                  <div className="inline-flex items-center gap-2 rounded-full border border-neon-green/35 bg-neon-green/10 px-3 py-1 text-[11px] font-medium tracking-[0.14em] text-neon-green uppercase">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-neon-green/70" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-neon-green" />
                    </span>
                    心跳续跑 · 自动推进
                  </div>
                </motion.div>
              )
            }

            return (
            <motion.div
              key={message.id}
              variants={slideUp}
              initial={messages.at(-1)?.id === message.id ? 'hidden' : false}
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

          {chatError && (
            <div
              role="alert"
              className="flex w-full max-w-[980px] items-start justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              <div>
                <p className="font-medium">
                  请求失败
                  {chatError.statusCode ? `（状态码 ${chatError.statusCode}）` : ''}
                  {chatError.code ? ` · ${chatError.code}` : ''}
                </p>
                <p className="mt-1 break-words text-destructive/90">
                  {chatError.message}
                </p>
              </div>
              <button
                type="button"
                onClick={() => clearError()}
                aria-label="关闭错误提示"
                className="shrink-0 rounded p-1 text-destructive/70 hover:bg-destructive/20 hover:text-destructive"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
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

      <ChatComposer
        value={localSelection}
        disabled={isLoading || effectiveWorkflowSuspended}
        isLoading={isLoading}
        input={input}
        placeholder={
          effectiveWorkflowSuspended
            ? '有待审批的 SQL，请先在上方处理…'
            : '请输入您的问题…'
        }
        onInputChange={setInput}
        onChange={persistSelection}
        onSubmit={handleSubmit}
        onStop={stop}
      />
    </div>
  )
}
