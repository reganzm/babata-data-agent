'use client'

import { Streamdown } from 'streamdown'
import { code } from '@streamdown/code'
import { cjk } from '@streamdown/cjk'

const plugins = { code, cjk }

interface StreamdownRendererProps {
  content: string
  isStreaming: boolean
}

export function StreamdownRenderer({ content, isStreaming }: StreamdownRendererProps) {
  return (
    <div className="max-w-none dark:prose-invert [&_[data-streamdown=code-block-body]_pre]:whitespace-pre [&_[data-streamdown=code-block-body]_code]:font-mono [&_code]:text-neon-cyan [&_pre]:border [&_pre]:border-border [&_pre]:bg-secondary">
      <Streamdown plugins={plugins} isAnimating={isStreaming}>
        {content}
      </Streamdown>
    </div>
  )
}
