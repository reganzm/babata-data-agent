'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { SqlCodeBlock } from './SqlCodeBlock'

type ReportSqlSectionProps = {
  sql: string
}

export function ReportSqlSection({ sql }: ReportSqlSectionProps) {
  const [open, setOpen] = useState(false)

  return (
    <section className="mt-5 rounded-lg border border-border/80 bg-card/70 shadow-sm">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-foreground transition-colors hover:bg-muted/40"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        <span>执行 SQL</span>
        <span className="ml-auto text-xs font-normal text-muted-foreground">
          {open ? '点击收起' : '点击展开'}
        </span>
      </button>
      {open && (
        <div className="border-t border-border/70 px-3 pb-3">
          <SqlCodeBlock sql={sql} maxHeightClassName="max-h-72" />
        </div>
      )}
    </section>
  )
}
