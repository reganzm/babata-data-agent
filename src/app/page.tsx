'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import type { UIMessage } from '@ai-sdk/react'
import { ChatPanel } from '@/app/components/ChatPanel'
import { ConversationList } from '@/app/components/ConversationList'
import { DataWorkspaceHeader } from '@/app/components/DataWorkspaceHeader'
import { useAuthSession } from '@/app/components/useAuthSession'
import { useLayoutCollapse } from '@/app/components/useLayoutCollapse'
import { QueryNormalizationDialog } from '@/app/components/QueryNormalizationDialog'
import { WorkflowIntentClarificationDialog } from '@/app/components/WorkflowIntentClarificationDialog'
import { BABATA_RESOURCE_ID } from '@/lib/db/constants'
import { fadeIn } from '@/lib/animations'
import {
  fetchAllConversations,
  fetchConversationById,
  createConversationRemote,
  updateConversationRemote,
  deleteConversationRemote,
  toStoredMessage,
  buildMessagesUpdatePayload,
  sortConversations,
  type StoredConversation,
} from '@/lib/conversation-store'
import {
  buildConversationPdfExportPayload,
  conversationPdfExportStorageKey,
  conversationPdfFilename,
} from '@/lib/conversation-pdf-export'
import { createLatestTaskQueue } from '@/lib/latest-task-queue'

export default function Home() {
  const auth = useAuthSession()
  const layout = useLayoutCollapse()
  const mastraResourceId = auth.resourceId ?? BABATA_RESOURCE_ID
  const [conversations, setConversations] = useState<StoredConversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [messagesVersion, setMessagesVersion] = useState(0)
  // 流式期间只保存引用；仅导出 PDF 时才做 toStoredMessage，避免每个 chunk 深拷贝全部消息
  const liveConversationMessagesRef = useRef<{
    conversationId: string
    messages: Parameters<typeof toStoredMessage>[0][]
  } | null>(null)
  const liveMessagesUpdaterRef = useRef<
    ((conversationId: string, messages: UIMessage[]) => void) | null
  >(null)
  const persistFlushRef = useRef<(() => void) | null>(null)

  const activeConversation = conversations.find((c) => c.id === activeId)
  const workflowSuspended = Boolean(
    activeConversation?.metadata?.pendingApproval &&
      activeConversation?.metadata?.activeWorkflowRunId &&
      (
        (activeConversation?.metadata?.pendingApproval?.payload as { approvalType?: string } | undefined)
          ?.approvalType !== 'few-shot-save'
      ),
  )

  const refreshConversations = useCallback(async () => {
    try {
      const all = await fetchAllConversations()
      setConversations(sortConversations(all))
    } catch (e) {
      console.error('刷新会话列表失败', e)
    }
  }, [])

  const refreshActiveConversation = useCallback(async () => {
    if (!activeId) return
    try {
      const conv = await fetchConversationById(activeId)
      if (conv) {
        setConversations((prev) =>
          sortConversations(
            prev.map((c) => (c.id === conv.id ? conv : c)),
          ),
        )
      }
    } catch (e) {
      console.error('刷新当前会话失败', e)
    }
  }, [activeId])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        let all = await fetchAllConversations()
        if (all.length === 0) {
          const created = await createConversationRemote()
          all = [created]
        }
        if (!cancelled) {
          const sorted = sortConversations(all)
          setConversations(sorted)
          setActiveId(sorted[0]?.id ?? null)
        }
      } catch (e) {
        console.error('加载会话失败', e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const handleCreate = useCallback(async () => {
    const newConv = await createConversationRemote()
    setConversations((prev) => sortConversations([newConv, ...prev]))
    setActiveId(newConv.id)
  }, [])

  const handleSelect = useCallback((id: string) => {
    setActiveId(id)
  }, [])

  const applyConversationUpdate = useCallback(
    (updated: StoredConversation) => {
      setConversations((prev) =>
        sortConversations(
          prev.map((c) => (c.id === updated.id ? updated : c)),
        ),
      )
    },
    [],
  )

  const handleRename = useCallback(
    async (id: string, title: string) => {
      const existing = conversations.find((c) => c.id === id)
      try {
        const updated = await updateConversationRemote(id, {
          title,
          metadata: {
            ...existing?.metadata,
            titleEdited: true,
          },
        })
        if (updated) applyConversationUpdate(updated)
      } catch (e) {
        console.error('重命名失败', e)
      }
    },
    [applyConversationUpdate, conversations],
  )

  const handleTogglePin = useCallback(
    async (id: string, pinned: boolean) => {
      try {
        const updated = await updateConversationRemote(id, { pinned })
        if (updated) applyConversationUpdate(updated)
      } catch (e) {
        console.error('置顶操作失败', e)
      }
    },
    [applyConversationUpdate],
  )

  const handleExportConversation = useCallback(async (id: string) => {
    const printWindow = window.open('', '_blank')
    if (!printWindow) return
    try {
      const conversation =
        (await fetchConversationById(id)) ??
        conversations.find((item) => item.id === id)
      if (!conversation) {
        printWindow.close()
        return
      }
      const messages =
        liveConversationMessagesRef.current?.conversationId === id
          ? liveConversationMessagesRef.current.messages.map(toStoredMessage)
          : conversation.messages

      const exportConversation = {
        ...conversation,
        messages,
      }
      const key = conversationPdfExportStorageKey(id)
      const payload = buildConversationPdfExportPayload(exportConversation)
      window.localStorage.setItem(key, JSON.stringify(payload))
      printWindow.location.href = `/conversation-export/print?key=${encodeURIComponent(
        key,
      )}`
      printWindow.document.title = conversationPdfFilename(exportConversation).replace(
        /\.pdf$/i,
        '',
      )
    } catch (error) {
      printWindow.document.open()
      printWindow.document.write('<p>导出会话失败，请稍后重试。</p>')
      printWindow.document.close()
      console.error('导出会话失败', error)
    }
  }, [conversations])

  const handleLiveMessagesChange = useCallback(
    (conversationId: string, msgs: Parameters<typeof toStoredMessage>[0][]) => {
      liveConversationMessagesRef.current = {
        conversationId,
        messages: msgs,
      }
    },
    [],
  )
  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await deleteConversationRemote(id)
        const remaining = conversations.filter((c) => c.id !== id)
        if (remaining.length === 0) {
          const newConv = await createConversationRemote()
          setConversations([newConv])
          setActiveId(newConv.id)
          return
        }
        if (id === activeId) {
          setActiveId(remaining[0].id)
        }
        setConversations(sortConversations(remaining))
      } catch (e) {
        console.error('删除会话失败', e)
      }
    },
    [activeId, conversations],
  )

  const handleMessagesChange = useCallback(
    async (conversationId: string, messages: UIMessage[]) => {
      if (!conversationId) return
      try {
        const storedMessages = messages.map(toStoredMessage)
        const sourceConv = conversations.find((c) => c.id === conversationId)
        const updates = buildMessagesUpdatePayload(storedMessages, sourceConv)
        const updated = await updateConversationRemote(conversationId, {
          ...updates,
        })
        if (updated) {
          applyConversationUpdate(updated)
        }
      } catch (e) {
        console.error('保存消息失败', e)
      }
    },
    [applyConversationUpdate, conversations],
  )

  const handleMessagesChangeRef = useRef(handleMessagesChange)
  useEffect(() => {
    handleMessagesChangeRef.current = handleMessagesChange
  }, [handleMessagesChange])

  const clarificationMessageSaveQueue = useMemo(
    () =>
      createLatestTaskQueue<{
        conversationId: string
        messages: UIMessage[]
      }>((payload) =>
        handleMessagesChangeRef.current(
          payload.conversationId,
          payload.messages,
        ),
      ),
    [],
  )

  return (
    <main className="flex h-screen flex-col bg-background">
      <DataWorkspaceHeader
        username={auth.username}
        subtitle="智囊团 · 巴巴塔 / 西莫 / 混沌 / 小栗子 / 达克斯"
        collapsed={layout.headerCollapsed}
        onToggleCollapse={layout.toggleHeader}
      />

      <div className="flex flex-1 overflow-hidden">
        <ConversationList
          conversations={conversations}
          activeId={activeId}
          onSelect={handleSelect}
          onCreate={() => void handleCreate()}
          onDelete={(id) => void handleDelete(id)}
          onExport={(id) => void handleExportConversation(id)}
          onRename={(id, title) => void handleRename(id, title)}
          onTogglePin={(id, pinned) => void handleTogglePin(id, pinned)}
          collapsed={layout.sidebarCollapsed}
          onToggleCollapse={layout.toggleSidebar}
        />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-muted/30 dark:bg-muted/40">
          {loading ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              加载会话…
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={activeId}
                variants={fadeIn}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="h-full"
              >
              <div className="flex h-full flex-col">
                <div className="min-h-0 flex-1">
                  <ChatPanel
                    key={activeId}
                    conversationId={activeId}
                    mastraResourceId={mastraResourceId}
                    messagesVersion={messagesVersion}
                    workflowSuspended={workflowSuspended}
                    pendingApproval={activeConversation?.metadata?.pendingApproval}
                    liveMessagesUpdaterRef={liveMessagesUpdaterRef}
                    persistFlushRef={persistFlushRef}
                    onStreamSettled={() => {
                      void refreshActiveConversation()
                      void refreshConversations()
                    }}
                    onWorkflowApprovalResolved={() => {
                      void refreshActiveConversation()
                    }}
                    onMessagesChange={(conversationId, msgs) =>
                      void handleMessagesChange(conversationId, msgs)
                    }
                    onLiveMessagesChange={handleLiveMessagesChange}
                  />
                </div>
                <QueryNormalizationDialog
                  conversationId={activeId}
                  mastraResourceId={mastraResourceId}
                  pendingApproval={activeConversation?.metadata?.pendingApproval}
                  onResolved={() => {
                    persistFlushRef.current?.()
                    void clarificationMessageSaveQueue.flush().then(() => {
                      setMessagesVersion((v) => v + 1)
                      void refreshActiveConversation()
                      void refreshConversations()
                    })
                  }}
                  onMessagesUpdate={(conversationId, msgs) => {
                    // 流式过程只更新 UI；落库交给 ChatPanel 防抖，避免每个 chunk PATCH
                    liveMessagesUpdaterRef.current?.(conversationId, msgs)
                  }}
                />
                <WorkflowIntentClarificationDialog
                  conversationId={activeId}
                  mastraResourceId={mastraResourceId}
                  pendingApproval={activeConversation?.metadata?.pendingApproval}
                  onResolved={() => {
                    persistFlushRef.current?.()
                    void clarificationMessageSaveQueue.flush().then(() => {
                      setMessagesVersion((v) => v + 1)
                      void refreshActiveConversation()
                      void refreshConversations()
                    })
                  }}
                  onMessagesUpdate={(conversationId, msgs) => {
                    liveMessagesUpdaterRef.current?.(conversationId, msgs)
                  }}
                />
              </div>
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </div>
    </main>
  )
}
