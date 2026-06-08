'use client'

import { useMemo } from 'react'
import {
  markdownHasTables,
  splitMarkdownByTables,
} from '@/lib/markdown/split-markdown-content'
import { splitReportSqlSection } from '@/lib/markdown/report-sql-section'
import { MarkdownInlineTable } from './MarkdownInlineTable'
import { ReportHtmlRenderer } from './ReportHtmlRenderer'
import { ReportSqlSection } from './ReportSqlSection'

interface RichMarkdownRendererProps {
  content: string
  isStreaming: boolean
}

/** 报告混排：正文 HTML + 表格 ECharts */
export function RichMarkdownRenderer({
  content,
  isStreaming,
}: RichMarkdownRendererProps) {
  const reportSql = useMemo(() => splitReportSqlSection(content), [content])
  const segments = useMemo(() => {
    if (!reportSql.body || !markdownHasTables(reportSql.body)) return null
    return splitMarkdownByTables(reportSql.body)
  }, [reportSql.body])

  if (!segments) {
    return (
      <div className="space-y-2">
        <ReportHtmlRenderer content={reportSql.body} isStreaming={isStreaming} />
        {reportSql.sql && <ReportSqlSection sql={reportSql.sql} />}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {segments.map((segment, index) => {
        if (segment.type === 'table') {
          return (
            <MarkdownInlineTable
              key={`table-${segment.table.startIndex}-${index}`}
              table={segment.table}
            />
          )
        }

        if (!segment.content.trim()) return null

        return (
          <ReportHtmlRenderer
            key={`text-${index}`}
            content={segment.content}
            isStreaming={isStreaming && index === segments.length - 1}
          />
        )
      })}
      {reportSql.sql && <ReportSqlSection sql={reportSql.sql} />}
    </div>
  )
}
