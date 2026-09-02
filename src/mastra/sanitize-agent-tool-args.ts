/** 无效的 suspendedToolRunId（LLM 常在新委派时误传 null/"null"） */
export function isInvalidSuspendedToolRunId(value: unknown): boolean {
  if (value == null) return true
  if (typeof value !== 'string') return true
  const trimmed = value.trim()
  return trimmed.length === 0 || trimmed === 'null' || trimmed === 'undefined'
}

/**
 * 清理子 Agent 工具入参：无有效 suspendedToolRunId 时去掉 resume 字段，
 * 避免 Mastra 走 resumeStream(null) 导致「could not find a suspended run」。
 */
export function sanitizeAgentToolArgs<T extends Record<string, unknown>>(
  args: T,
): T {
  if (!('suspendedToolRunId' in args) && !('resumeData' in args)) {
    return args
  }

  if (!isInvalidSuspendedToolRunId(args.suspendedToolRunId)) {
    return args
  }

  const next = { ...args }
  delete next.suspendedToolRunId
  delete next.resumeData
  return next
}

function isAgentToolName(name: string): boolean {
  return (
    name.startsWith('agent-') ||
    /(^|[^a-z])(ximo|chestnut|hundun|dax)([^a-z]|$)/i.test(name)
  )
}

type ExecutableTool = {
  execute?: (input: unknown, context?: unknown) => unknown | Promise<unknown>
  [key: string]: unknown
}

/** 包装 tools.execute，在子 Agent 工具调用前清洗无效 resume 参数 */
export function wrapToolsToSanitizeAgentResumeArgs(
  tools: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!tools) return tools

  const next: Record<string, unknown> = {}
  for (const [name, tool] of Object.entries(tools)) {
    if (!isAgentToolName(name) || !tool || typeof tool !== 'object') {
      next[name] = tool
      continue
    }

    const executable = tool as ExecutableTool
    if (typeof executable.execute !== 'function') {
      next[name] = tool
      continue
    }

    const originalExecute = executable.execute.bind(executable)
    next[name] = {
      ...executable,
      execute: async (input: unknown, context?: unknown) => {
        const sanitized =
          input && typeof input === 'object' && !Array.isArray(input)
            ? sanitizeAgentToolArgs(input as Record<string, unknown>)
            : input
        return originalExecute(sanitized, context)
      },
    }
  }
  return next
}
