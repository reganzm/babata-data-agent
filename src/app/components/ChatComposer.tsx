'use client'

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  BookOpen,
  Check,
  ChevronDown,
  Database,
  Infinity,
  ListTodo,
  Send,
  Square,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import {
  applyDataSourceSelection,
  normalizeChatComposerState,
  resolveDefaultKnowledgeBaseId,
  type ChatComposerState,
  type ChatDataSourceOption,
  type ChatInteractionMode,
  type ChatKnowledgeBaseOption,
} from '@/lib/chat-composer-state'

export type { ChatComposerState, ChatInteractionMode } from '@/lib/chat-composer-state'

type Props = {
  value: ChatComposerState
  disabled?: boolean
  isLoading?: boolean
  input: string
  placeholder?: string
  onInputChange: (value: string) => void
  onChange: (next: ChatComposerState) => void
  onSubmit: (event: FormEvent) => void
  onStop?: () => void
}

function ToolbarSelect({
  label,
  icon: Icon,
  currentLabel,
  disabled,
  children,
}: {
  label: string
  icon: React.ComponentType<{ className?: string }>
  currentLabel: string
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="sr-only">{label}</span>
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={disabled}
          className={cn(
            'inline-flex h-7 max-w-[180px] min-w-[112px] items-center justify-between gap-2 rounded-md border border-border/70 bg-background/80 px-2 text-xs',
            'hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          <span className="truncate">{currentLabel}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-64 min-w-[200px] overflow-y-auto">
          {children}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export function ChatComposer({
  value,
  disabled,
  isLoading,
  input,
  placeholder = '请输入您的问题…',
  onInputChange,
  onChange,
  onSubmit,
  onStop,
}: Props) {
  const state = normalizeChatComposerState(value)
  const [dataSources, setDataSources] = useState<ChatDataSourceOption[]>([])
  const [knowledgeBases, setKnowledgeBases] = useState<ChatKnowledgeBaseOption[]>([])
  const autoBoundDataSourceRef = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void Promise.all([
      fetch('/api/data-sources').then((res) => res.json()),
      fetch('/api/knowledge-bases').then((res) => res.json()),
    ]).then(([dataSourceBody, knowledgeBody]) => {
      if (cancelled) return
      setDataSources(
        (
          (dataSourceBody as { dataSources?: ChatDataSourceOption[] }).dataSources ??
          []
        ).filter((item) => item.enabled),
      )
      setKnowledgeBases(
        (
          (knowledgeBody as { knowledgeBases?: ChatKnowledgeBaseOption[] })
            .knowledgeBases ?? []
        ).filter((item) => item.enabled),
      )
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!state.selectedDataSourceId || state.selectedKnowledgeBaseId) return
    if (dataSources.length === 0 || knowledgeBases.length === 0) return
    if (autoBoundDataSourceRef.current === state.selectedDataSourceId) return

    const defaultKnowledgeBaseId = resolveDefaultKnowledgeBaseId({
      dataSourceId: state.selectedDataSourceId,
      dataSources,
      knowledgeBases,
    })
    if (!defaultKnowledgeBaseId) return

    autoBoundDataSourceRef.current = state.selectedDataSourceId
    onChange({
      ...state,
      selectedKnowledgeBaseId: defaultKnowledgeBaseId,
    })
  }, [
    dataSources,
    knowledgeBases,
    onChange,
    state,
    state.selectedDataSourceId,
    state.selectedKnowledgeBaseId,
  ])

  const handleDataSourcePick = (dataSourceId: string) => {
    autoBoundDataSourceRef.current = dataSourceId.trim() || null
    onChange(
      applyDataSourceSelection({
        state,
        dataSourceId,
        dataSources,
        knowledgeBases,
      }),
    )
  }

  const currentDataSourceLabel = useMemo(() => {
    if (!state.selectedDataSourceId) return '数据源'
    const item = dataSources.find((source) => source.id === state.selectedDataSourceId)
    return item ? `${item.name} · ${item.type}` : '数据源'
  }, [dataSources, state.selectedDataSourceId])

  const currentKnowledgeBaseLabel = useMemo(() => {
    if (!state.selectedKnowledgeBaseId) return '知识库'
    const item = knowledgeBases.find((kb) => kb.id === state.selectedKnowledgeBaseId)
    return item?.name ?? '知识库'
  }, [knowledgeBases, state.selectedKnowledgeBaseId])

  const modeLabel = state.chatMode === 'plan' ? '规划' : '智能体'

  const handleKnowledgeBasePick = (knowledgeBaseId: string) => {
    if (!knowledgeBaseId.trim() && state.selectedDataSourceId) {
      autoBoundDataSourceRef.current = state.selectedDataSourceId
    }
    onChange({
      ...state,
      selectedKnowledgeBaseId: knowledgeBaseId,
    })
  }

  const handleModePick = (chatMode: ChatInteractionMode) => {
    onChange({ ...state, chatMode })
  }

  const submitDisabled = disabled || !input.trim()

  return (
    <form onSubmit={onSubmit} className="border-t border-border bg-card p-4">
      <div className="overflow-hidden rounded-2xl border border-border/80 bg-background/90 shadow-[0_8px_30px_-12px_oklch(0_0_0_/_28%)]">
        <textarea
          value={input}
          onChange={(event) => onInputChange(event.target.value)}
          placeholder={placeholder}
          rows={3}
          disabled={disabled}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              if (!submitDisabled) {
                event.currentTarget.form?.requestSubmit()
              }
            }
          }}
          className={cn(
            'min-h-[88px] w-full resize-none border-0 bg-transparent px-4 py-3 text-sm leading-6',
            'placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed disabled:opacity-60',
          )}
        />

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 px-3 py-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <ToolbarSelect
              label="数据源"
              icon={Database}
              currentLabel={currentDataSourceLabel}
              disabled={disabled}
            >
              <DropdownMenuItem
                className="justify-between gap-2 text-xs"
                onClick={() => handleDataSourcePick('')}
              >
                <span>不使用数据源</span>
                {!state.selectedDataSourceId ? <Check className="h-3.5 w-3.5" /> : null}
              </DropdownMenuItem>
              {dataSources.map((item) => (
                <DropdownMenuItem
                  key={item.id}
                  className="justify-between gap-2 text-xs"
                  onClick={() => handleDataSourcePick(item.id)}
                >
                  <span className="truncate">
                    {item.name} · {item.type}
                  </span>
                  {item.id === state.selectedDataSourceId ? (
                    <Check className="h-3.5 w-3.5 shrink-0" />
                  ) : null}
                </DropdownMenuItem>
              ))}
            </ToolbarSelect>

            <ToolbarSelect
              label="知识库"
              icon={BookOpen}
              currentLabel={currentKnowledgeBaseLabel}
              disabled={disabled}
            >
              <DropdownMenuItem
                className="justify-between gap-2 text-xs"
                onClick={() => handleKnowledgeBasePick('')}
              >
                <span>不使用知识库</span>
                {!state.selectedKnowledgeBaseId ? <Check className="h-3.5 w-3.5" /> : null}
              </DropdownMenuItem>
              {knowledgeBases.map((item) => (
                <DropdownMenuItem
                  key={item.id}
                  className="justify-between gap-2 text-xs"
                  onClick={() => handleKnowledgeBasePick(item.id)}
                >
                  <span className="truncate">{item.name}</span>
                  {item.id === state.selectedKnowledgeBaseId ? (
                    <Check className="h-3.5 w-3.5 shrink-0" />
                  ) : null}
                </DropdownMenuItem>
              ))}
            </ToolbarSelect>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger
                disabled={disabled}
                className={cn(
                  'inline-flex h-8 items-center gap-1.5 rounded-md border border-border/70 bg-background/80 px-2.5 text-xs',
                  'hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-50',
                )}
              >
                {state.chatMode === 'plan' ? (
                  <ListTodo className="h-3.5 w-3.5" />
                ) : (
                  <Infinity className="h-3.5 w-3.5" />
                )}
                <span>{modeLabel}</span>
                <ChevronDown className="h-3.5 w-3.5 opacity-60" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[140px]">
                <DropdownMenuItem
                  className="justify-between gap-2 text-xs"
                  onClick={() => handleModePick('agent')}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Infinity className="h-3.5 w-3.5" />
                    智能体
                  </span>
                  {state.chatMode === 'agent' ? <Check className="h-3.5 w-3.5" /> : null}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="justify-between gap-2 text-xs"
                  onClick={() => handleModePick('plan')}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <ListTodo className="h-3.5 w-3.5" />
                    规划
                  </span>
                  {state.chatMode === 'plan' ? <Check className="h-3.5 w-3.5" /> : null}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {isLoading ? (
              <Button
                type="button"
                onClick={onStop}
                variant="destructive"
                size="icon"
                className="h-8 w-8 shrink-0 rounded-lg"
              >
                <Square className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button
                type="submit"
                disabled={submitDisabled}
                size="icon"
                className="h-8 w-8 shrink-0 rounded-lg bg-primary text-primary-foreground shadow-[0_0_8px_var(--neon-cyan-glow)] hover:bg-primary/90"
              >
                <Send className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </form>
  )
}
