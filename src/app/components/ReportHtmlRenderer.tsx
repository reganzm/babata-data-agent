'use client'

import { useMemo } from 'react'
import type { Components } from 'react-markdown'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  REPORT_REMARK_GFM_OPTIONS,
  normalizeReportMarkdown,
} from '@/lib/markdown/report-markdown'
import { limitEmojis } from '@/lib/text/emoji-limit'
import { cn } from '@/lib/utils'

const reportComponents: Components = {
  h1: ({ children }) => (
    <h1 className="mt-5 mb-3 text-xl font-semibold tracking-tight text-foreground first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-5 mb-2.5 border-b border-border/50 pb-1.5 text-lg font-semibold text-foreground">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-4 mb-2 text-base font-semibold text-foreground">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="mt-3 mb-1.5 text-sm font-semibold text-foreground">{children}</h4>
  ),
  p: ({ children }) => (
    <p className="mb-3 text-sm leading-7 text-foreground/90 last:mb-0">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="mb-3 ml-4 list-disc space-y-1.5 text-sm leading-7 text-foreground/90">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-3 ml-4 list-decimal space-y-1.5 text-sm leading-7 text-foreground/90">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="pl-0.5 marker:text-muted-foreground">{children}</li>,
  strong: ({ children }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  em: ({ children }) => <em className="text-foreground/85">{children}</em>,
  blockquote: ({ children }) => (
    <blockquote className="my-3 rounded-r-md border-l-2 border-primary/35 bg-muted/25 px-3 py-2 text-sm leading-6 text-muted-foreground">
      {children}
    </blockquote>
  ),
  code: ({ className, children, ...props }) => {
    const isBlock = Boolean(className?.includes('language-'))
    if (isBlock) {
      return (
        <code className={cn('font-mono text-[13px] text-neon-cyan', className)} {...props}>
          {children}
        </code>
      )
    }
    return (
      <code
        className="rounded-md border border-border/50 bg-secondary/80 px-1.5 py-0.5 font-mono text-[12px] text-neon-cyan"
        {...props}
      >
        {children}
      </code>
    )
  },
  pre: ({ children }) => (
    <pre className="my-3 overflow-x-auto rounded-lg border border-border/70 bg-secondary/70 p-3 text-[13px] leading-6 shadow-sm">
      {children}
    </pre>
  ),
  hr: () => <hr className="my-5 border-border/60" />,
  a: ({ href, children }) => (
    <a
      href={href}
      className="font-medium text-primary underline-offset-2 hover:underline"
      target="_blank"
      rel="noreferrer noopener"
    >
      {children}
    </a>
  ),
  table: () => null,
  thead: () => null,
  tbody: () => null,
  tr: () => null,
  th: () => null,
  td: () => null,
}

interface ReportHtmlRendererProps {
  content: string
  isStreaming?: boolean
  className?: string
}

/** 报告正文：Markdown → 语义化 HTML（非 Streamdown） */
export function ReportHtmlRenderer({
  content,
  isStreaming = false,
  className,
}: ReportHtmlRendererProps) {
  const displayContent = useMemo(
    () => normalizeReportMarkdown(limitEmojis(content)),
    [content],
  )

  if (!displayContent.trim()) return null

  return (
    <article className={cn('report-body max-w-none', className)}>
      <ReactMarkdown
        remarkPlugins={[[remarkGfm, REPORT_REMARK_GFM_OPTIONS]]}
        components={reportComponents}
      >
        {displayContent}
      </ReactMarkdown>
      {isStreaming && (
        <span
          className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-primary/70 align-middle"
          aria-hidden
        />
      )}
    </article>
  )
}

/** @deprecated 使用 ReportHtmlRenderer */
export const StreamdownRenderer = ReportHtmlRenderer
