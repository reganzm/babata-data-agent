'use client'

import { useEffect, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { useTheme } from 'next-themes'
import { codeToHtml } from 'shiki'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type SqlCodeBlockProps = {
  sql: string
  className?: string
  maxHeightClassName?: string
}

export function SqlCodeBlock({
  sql,
  className,
  maxHeightClassName = 'max-h-48',
}: SqlCodeBlockProps) {
  const { resolvedTheme } = useTheme()
  const [html, setHtml] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    const theme = resolvedTheme === 'dark' ? 'github-dark' : 'github-light'

    void codeToHtml(sql, {
      lang: 'sql',
      theme,
    }).then((highlighted) => {
      if (!cancelled) setHtml(highlighted)
    })

    return () => {
      cancelled = true
    }
  }, [sql, resolvedTheme])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(sql)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard denied */
    }
  }

  return (
    <div
      className={cn(
        'relative mt-2 overflow-hidden rounded-md border border-border bg-card',
        className,
      )}
    >
      <div className="flex items-center justify-end gap-1 border-b border-border/80 bg-muted/40 px-2 py-1">
        <span className="mr-auto text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          SQL
        </span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 gap-1 px-2 text-xs"
          onClick={() => void handleCopy()}
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-neon-green" />
              已复制
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              复制
            </>
          )}
        </Button>
      </div>
      {html ? (
        <div
          className={cn(
            'sql-code-block overflow-auto p-3 text-xs leading-relaxed [&_pre]:m-0 [&_pre]:bg-transparent!',
            maxHeightClassName,
          )}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <pre
          className={cn(
            'overflow-auto p-3 font-mono text-xs leading-relaxed text-foreground',
            maxHeightClassName,
          )}
        >
          {sql}
        </pre>
      )}
    </div>
  )
}
