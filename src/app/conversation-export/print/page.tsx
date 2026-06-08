'use client'

import { useEffect, useMemo, useState } from 'react'
import type { StoredMessage } from '@/lib/conversation-store'
import {
  CONVERSATION_PDF_EXPORT_STORAGE_PREFIX,
  type ConversationPdfExportPayload,
} from '@/lib/conversation-pdf-export'
import { AssistantMessageContent } from '@/app/components/visualization/AssistantMessageContent'
import { cn } from '@/lib/utils'

type ExportState =
  | { status: 'loading' }
  | { status: 'ready'; payload: ConversationPdfExportPayload }
  | { status: 'error'; message: string }

function roleLabel(role: StoredMessage['role']): string {
  if (role === 'user') return '用户'
  if (role === 'assistant') return '巴巴塔'
  return '系统'
}

function formatMessageTime(message: StoredMessage, index: number): string {
  if (!message.createdAt) return `#${index + 1}`
  return new Date(message.createdAt).toLocaleString('zh-CN')
}

function textFromMessage(message: StoredMessage): string {
  return message.parts
    .map((part) => {
      if (
        part != null &&
        typeof part === 'object' &&
        'type' in part &&
        part.type === 'text' &&
        'text' in part &&
        typeof part.text === 'string'
      ) {
        return part.text
      }
      return ''
    })
    .filter(Boolean)
    .join('\n\n')
}

function assistantPresentationParts(message: StoredMessage): StoredMessage['parts'] {
  return message.parts.filter((part) => {
    if (part == null || typeof part !== 'object' || !('type' in part)) return true
    const type = part.type
    return (
      type !== 'step-start' &&
      type !== 'data-tool-call-suspended' &&
      typeof type === 'string'
    )
  })
}

function ExportMessage({
  message,
  index,
}: {
  message: StoredMessage
  index: number
}) {
  const isUser = message.role === 'user'
  const isAssistant = message.role === 'assistant'

  return (
    <section
      className={cn(
        'break-inside-avoid-page flex',
        isUser ? 'justify-end' : 'justify-start',
      )}
    >
      <div
        className={cn(
          'max-w-[980px] rounded-lg px-4 py-3 shadow-sm',
          isUser
            ? 'max-w-[80%] bg-primary text-primary-foreground shadow-[0_0_12px_var(--neon-cyan-glow)]'
            : 'w-full border border-border/80 bg-card text-card-foreground',
        )}
      >
        <div
          className={cn(
            'mb-2 flex items-center justify-between gap-3 text-xs',
            isUser ? 'text-primary-foreground/80' : 'text-muted-foreground',
          )}
        >
          <span>{roleLabel(message.role)}</span>
          <time>{formatMessageTime(message, index)}</time>
        </div>
        {isAssistant ? (
          <AssistantMessageContent
            parts={assistantPresentationParts(message) as never}
            isStreaming={false}
          />
        ) : (
          <div className="whitespace-pre-wrap">{textFromMessage(message)}</div>
        )}
      </div>
    </section>
  )
}

export default function ConversationPrintPage() {
  const [state, setState] = useState<ExportState>({ status: 'loading' })

  useEffect(() => {
    const key = new URLSearchParams(window.location.search).get('key')
    if (!key) {
      setState({ status: 'error', message: '缺少导出数据标识。' })
      return
    }
    if (!key.startsWith(CONVERSATION_PDF_EXPORT_STORAGE_PREFIX)) {
      setState({ status: 'error', message: '导出数据标识不合法。' })
      return
    }

    const raw = window.localStorage.getItem(key)
    window.localStorage.removeItem(key)
    if (!raw) {
      setState({ status: 'error', message: '导出数据已失效，请重新点击导出。' })
      return
    }

    try {
      const payload = JSON.parse(raw) as ConversationPdfExportPayload
      if (payload.version !== 1 || !payload.conversation) {
        setState({ status: 'error', message: '导出数据格式不正确。' })
        return
      }
      document.title = payload.filename.replace(/\.pdf$/i, '')
      setState({ status: 'ready', payload })
    } catch {
      setState({ status: 'error', message: '导出数据解析失败。' })
    }
  }, [])

  useEffect(() => {
    if (state.status !== 'ready') return
    const timer = window.setTimeout(() => window.print(), 1500)
    return () => window.clearTimeout(timer)
  }, [state.status])

  const title = useMemo(() => {
    if (state.status !== 'ready') return '会话导出'
    return state.payload.conversation.title || '新对话'
  }, [state])

  if (state.status === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        正在准备导出…
      </main>
    )
  }

  if (state.status === 'error') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background text-destructive">
        {state.message}
      </main>
    )
  }

  const { payload } = state

  return (
    <main className="min-h-screen bg-background px-6 py-8 text-foreground print:bg-white print:px-0 print:py-0">
      <style>{`
        @page { margin: 14mm; }
        @media print {
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .echarts-for-react, canvas { max-width: 100% !important; }
        }
      `}</style>
      <div className="mx-auto max-w-[1040px] print:max-w-none">
        <header className="mb-6 border-b border-border pb-4">
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Babata 会话导出 ·{' '}
            {new Date(payload.exportedAt).toLocaleString('zh-CN')} ·{' '}
            {payload.conversation.messages.length} 条消息
          </p>
        </header>
        <div className="space-y-4">
          {payload.conversation.messages.length > 0 ? (
            payload.conversation.messages.map((message, index) => (
              <ExportMessage key={message.id} message={message} index={index} />
            ))
          ) : (
            <p className="text-muted-foreground">暂无消息</p>
          )}
        </div>
      </div>
    </main>
  )
}
