'use client'

import { useMemo } from 'react'
import { parsedMarkdownTableToTableSpec } from '@/lib/markdown/markdown-table-spec'
import type { ParsedMarkdownTable } from '@/lib/visualization/parse-markdown-table'
import { cn } from '@/lib/utils'
import { EChartsTablePanel } from './visualization/EChartsTablePanel'

interface MarkdownInlineTableProps {
  table: ParsedMarkdownTable
  className?: string
}

export function MarkdownInlineTable({ table, className }: MarkdownInlineTableProps) {
  const tableSpec = useMemo(
    () => parsedMarkdownTableToTableSpec(table),
    [table],
  )

  return (
    <EChartsTablePanel
      table={tableSpec}
      compact
      className={cn('my-3 bg-card/80 shadow-sm', className)}
    />
  )
}
