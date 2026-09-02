'use client'

import { ChevronDown, ChevronUp, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { cn } from '@/lib/utils'

type CollapseTarget = 'header' | 'sidebar'

type Props = {
  target: CollapseTarget
  collapsed: boolean
  onClick: () => void
  className?: string
}

const LABELS: Record<CollapseTarget, { collapse: string; expand: string }> = {
  header: { collapse: '收起顶栏', expand: '展开顶栏' },
  sidebar: { collapse: '收起会话列表', expand: '展开会话列表' },
}

export function LayoutCollapseButton({
  target,
  collapsed,
  onClick,
  className,
}: Props) {
  const label = collapsed ? LABELS[target].expand : LABELS[target].collapse
  const Icon =
    target === 'header'
      ? collapsed
        ? ChevronDown
        : ChevronUp
      : collapsed
        ? PanelLeftOpen
        : PanelLeftClose

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-expanded={!collapsed}
      title={label}
      className={cn(
        'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
        'border border-border/60 bg-background/70 text-muted-foreground',
        'transition-colors hover:border-primary/30 hover:bg-muted hover:text-foreground',
        className,
      )}
    >
      <Icon className="size-4" />
    </button>
  )
}
