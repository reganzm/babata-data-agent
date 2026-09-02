'use client'

import { useState, useRef, useEffect } from 'react'
import { motion } from 'motion/react'
import { Download, Plus, X, MessageSquare, Pencil, Pin, PinOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { LayoutCollapseButton } from '@/app/components/LayoutCollapseButton'
import { SidebarDataSettings } from '@/app/components/SidebarDataSettings'
import { defaultTransition, staggerItem } from '@/lib/animations'
import { cn } from '@/lib/utils'
import type { StoredConversation } from '@/lib/conversation-store'

interface ConversationListProps {
  conversations: StoredConversation[]
  activeId: string | null
  onSelect: (id: string) => void
  onCreate: () => void
  onDelete: (id: string) => void
  onExport: (id: string) => void
  onRename: (id: string, title: string) => void
  onTogglePin: (id: string, pinned: boolean) => void
  collapsed?: boolean
  onToggleCollapse?: () => void
}

function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  return `${days} 天前`
}

export function ConversationList({
  conversations,
  activeId,
  onSelect,
  onCreate,
  onDelete,
  onExport,
  onRename,
  onTogglePin,
  collapsed = false,
  onToggleCollapse,
}: ConversationListProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const editInputRef = useRef<HTMLInputElement>(null)
  const activeConversation = conversations.find((item) => item.id === activeId)

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingId])

  useEffect(() => {
    if (collapsed) setEditingId(null)
  }, [collapsed])

  const startEdit = (conv: StoredConversation) => {
    setEditingId(conv.id)
    setEditTitle(conv.title || '新对话')
  }

  const commitEdit = () => {
    if (!editingId) return
    const trimmed = editTitle.trim()
    if (trimmed) {
      onRename(editingId, trimmed)
    }
    setEditingId(null)
  }

  const cancelEdit = () => {
    setEditingId(null)
  }

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 48 : 256 }}
      transition={defaultTransition}
      className="flex h-full shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar shadow-[inset_-1px_0_0_0_var(--border)]"
      aria-label="会话列表"
    >
      {collapsed ? (
        <>
          <div className="flex flex-col items-center gap-2 border-b border-sidebar-border px-2 py-3">
            {onToggleCollapse ? (
              <LayoutCollapseButton
                target="sidebar"
                collapsed={collapsed}
                onClick={onToggleCollapse}
              />
            ) : null}
            <Button
              type="button"
              size="icon-sm"
              onClick={onCreate}
              title="新对话"
              aria-label="新对话"
              className="bg-primary text-primary-foreground shadow-[0_0_12px_var(--neon-cyan-glow)] hover:bg-primary/90"
            >
              <Plus className="size-4" />
            </Button>
          </div>

          <div className="flex flex-1 flex-col items-center gap-2 py-3">
            {activeConversation ? (
              <button
                type="button"
                title={activeConversation.title || '新对话'}
                aria-label={`当前对话：${activeConversation.title || '新对话'}`}
                className="inline-flex size-8 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary"
              >
                <MessageSquare className="size-4" />
              </button>
            ) : null}
          </div>

          <SidebarDataSettings />
        </>
      ) : (
        <>
          <div className="flex items-center gap-2 border-b border-sidebar-border bg-sidebar p-3">
            <Button
              onClick={onCreate}
              className="min-w-0 flex-1 bg-primary text-primary-foreground shadow-[0_0_12px_var(--neon-cyan-glow)] hover:bg-primary/90"
            >
              <Plus className="mr-2 h-4 w-4" />
              新对话
            </Button>
            {onToggleCollapse ? (
              <LayoutCollapseButton
                target="sidebar"
                collapsed={collapsed}
                onClick={onToggleCollapse}
              />
            ) : null}
          </div>

          <ScrollArea className="flex-1">
            {conversations.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                暂无对话记录
              </div>
            ) : (
              conversations.map((conv) => {
                const isPinned = Boolean(conv.pinnedAt)
                const isEditing = editingId === conv.id

                return (
                  <motion.div
                    key={conv.id}
                    variants={staggerItem}
                    initial="hidden"
                    animate="visible"
                    onClick={() => {
                      if (!isEditing) onSelect(conv.id)
                    }}
                    className={cn(
                      'group flex cursor-pointer items-center justify-between border-b border-sidebar-border/60 px-3 py-3 transition-colors duration-200',
                      conv.id === activeId
                        ? 'border-l-2 border-l-primary bg-sidebar-accent shadow-[inset_0_1px_0_0_oklch(1_0_0_/_4%)]'
                        : 'hover:bg-sidebar-accent/60',
                      isPinned && conv.id !== activeId && 'bg-sidebar-accent/30',
                    )}
                  >
                    <div className="mr-2 shrink-0">
                      {isPinned ? (
                        <Pin className="h-4 w-4 text-primary" />
                      ) : (
                        <MessageSquare className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      {isEditing ? (
                        <Input
                          ref={editInputRef}
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitEdit()
                            if (e.key === 'Escape') cancelEdit()
                          }}
                          onBlur={commitEdit}
                          className="h-7 px-2 text-sm"
                        />
                      ) : (
                        <>
                          <div className="truncate text-sm font-medium text-foreground">
                            {conv.title || '新对话'}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatRelativeTime(conv.updatedAt)}
                          </div>
                        </>
                      )}
                    </div>
                    {!isEditing && (
                      <div className="ml-1 flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            startEdit(conv)
                          }}
                          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                          title="重命名"
                          aria-label="重命名"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            onTogglePin(conv.id, !isPinned)
                          }}
                          className={cn(
                            'rounded p-1 hover:bg-muted',
                            isPinned
                              ? 'text-primary hover:text-primary'
                              : 'text-muted-foreground hover:text-foreground',
                          )}
                          title={isPinned ? '取消置顶' : '置顶'}
                          aria-label={isPinned ? '取消置顶' : '置顶'}
                        >
                          {isPinned ? (
                            <PinOff className="h-3 w-3" />
                          ) : (
                            <Pin className="h-3 w-3" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            onDelete(conv.id)
                          }}
                          className="rounded p-1 text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
                          title="删除对话"
                          aria-label="删除对话"
                        >
                          <X className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            onExport(conv.id)
                          }}
                          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                          title="导出 PDF"
                          aria-label="导出 PDF"
                        >
                          <Download className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </motion.div>
                )
              })
            )}
          </ScrollArea>
          <SidebarDataSettings />
        </>
      )}
    </motion.aside>
  )
}
