'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import type { UIMessage } from '@ai-sdk/react'
import { ChatPanel } from '@/app/components/ChatPanel'
import { ConversationList } from '@/app/components/ConversationList'
import { ThemeToggle } from '@/app/components/ThemeToggle'
import { AuthHeaderActions } from '@/app/components/AuthHeaderActions'
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
  type StoredMessage,
} from '@/lib/conversation-store'
import {
  buildConversationPdfExportPayload,
  conversationPdfExportStorageKey,
  conversationPdfFilename,
} from '@/lib/conversation-pdf-export'
import { createLatestTaskQueue } from '@/lib/latest-task-queue'

export default function Home() {
  const [conversations, setConversations] = useState<StoredConversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [messagesVersion, setMessagesVersion] = useState(0)
  const liveConversationMessagesRef = useRef<{
    conversationId: string
    messages: StoredMessage[]
  } | null>(null)
  const [authUser, setAuthUser] = useState<{
    username: string
    resourceId: string
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/auth/session')
        const data = (await res.json()) as {
          authenticated?: boolean
          authDisabled?: boolean
          user?: { username: string; resourceId: string } | null
        }
        if (cancelled) return
        if (data.authDisabled) {
          setAuthUser({
            username: '开发模式',
            resourceId: BABATA_RESOURCE_ID,
          })
          return
        }
        if (data.authenticated && data.user) {
          setAuthUser({
            username: data.user.username,
            resourceId: data.user.resourceId,
          })
        }
      } catch {
        /* middleware 会处理未登录 */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

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
          ? liveConversationMessagesRef.current.messages
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
        messages: msgs.map(toStoredMessage),
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
    async (messages: UIMessage[]) => {
      if (!activeId) return
      try {
        const storedMessages = messages.map(toStoredMessage)
        const activeConv = conversations.find((c) => c.id === activeId)
        const updates = buildMessagesUpdatePayload(storedMessages, activeConv)
        const updated = await updateConversationRemote(activeId, {
          ...updates,
        })
        if (updated) {
          applyConversationUpdate(updated)
        }
      } catch (e) {
        console.error('保存消息失败', e)
      }
    },
    [activeId, applyConversationUpdate, conversations],
  )

  const handleMessagesChangeRef = useRef(handleMessagesChange)
  useEffect(() => {
    handleMessagesChangeRef.current = handleMessagesChange
  }, [handleMessagesChange])

  const clarificationMessageSaveQueue = useMemo(
    () =>
      createLatestTaskQueue<UIMessage[]>((messages) =>
        handleMessagesChangeRef.current(messages),
      ),
    [],
  )

  return (
    <main className="flex h-screen flex-col bg-background">
      <header className="z-10 border-b border-border bg-card px-6 py-4 shadow-sm dark:shadow-[0_1px_0_0_var(--sidebar-border),0_4px_24px_-4px_oklch(0_0_0_/_35%)]">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="bg-gradient-to-r from-neon-cyan to-neon-green bg-clip-text text-xl font-bold text-transparent">
              Babata
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              智囊团 · 巴巴塔 / 西莫 / 混沌 / 小栗子
            </p>
          </div>
          <div className="flex items-center gap-3">
            {authUser && <AuthHeaderActions username={authUser.username} />}
            <ThemeToggle />
          </div>
        </div>
      </header>

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
                    mastraResourceId={
                      authUser?.resourceId ?? BABATA_RESOURCE_ID
                    }
                    messagesVersion={messagesVersion}
                    workflowSuspended={workflowSuspended}
                    pendingApproval={activeConversation?.metadata?.pendingApproval}
                    onStreamSettled={() => {
                      void refreshActiveConversation()
                      void refreshConversations()
                    }}
                    onWorkflowApprovalResolved={() => {
                      void refreshActiveConversation()
                    }}
                    onMessagesChange={(msgs) => void handleMessagesChange(msgs)}
                    onLiveMessagesChange={handleLiveMessagesChange}
                  />
                </div>
                <WorkflowIntentClarificationDialog
                  conversationId={activeId}
                  mastraResourceId={authUser?.resourceId ?? BABATA_RESOURCE_ID}
                  pendingApproval={activeConversation?.metadata?.pendingApproval}
                  onResolved={() => {
                    void clarificationMessageSaveQueue.flush().then(() => {
                      setMessagesVersion((v) => v + 1)
                      void refreshActiveConversation()
                      void refreshConversations()
                    })
                  }}
                  onMessagesUpdate={(msgs) => {
                    clarificationMessageSaveQueue.push(msgs)
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
