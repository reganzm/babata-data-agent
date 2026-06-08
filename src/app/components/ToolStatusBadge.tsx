'use client'

import { Wrench } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type ToolState =
  | 'input-streaming'
  | 'input-available'
  | 'output-available'
  | 'output-error'

interface ToolStatusBadgeProps {
  toolName: string
  state: ToolState
}

const stateConfig: Record<ToolState, { label: string; className: string }> = {
  'input-streaming': {
    label: '准备中...',
    className: 'border-neon-cyan/40 bg-neon-cyan/10 text-neon-cyan shadow-[0_0_8px_var(--neon-cyan-glow)]',
  },
  'input-available': {
    label: '调用中...',
    className: 'border-warning/40 bg-warning/10 text-warning shadow-[0_0_8px_oklch(0.80_0.16_85/30%)]',
  },
  'output-available': {
    label: '已完成',
    className: 'border-neon-green/40 bg-neon-green/10 text-neon-green shadow-[0_0_8px_var(--neon-green-glow)]',
  },
  'output-error': {
    label: '出错',
    className: 'border-destructive/40 bg-destructive/10 text-destructive shadow-[0_0_8px_oklch(0.65_0.2_25/30%)]',
  },
}

export function ToolStatusBadge({ toolName, state }: ToolStatusBadgeProps) {
  const config = stateConfig[state]
  const isDelegation =
    toolName.includes('西莫') ||
    toolName.includes('小栗子') ||
    toolName.startsWith('agent-')

  return (
    <Badge
      variant="outline"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all duration-300',
        config.className,
      )}
    >
      <Wrench className="h-3 w-3" />
      <span>{isDelegation ? `巴巴塔 → ${toolName}` : toolName}</span>
      <span>{config.label}</span>
    </Badge>
  )
}
