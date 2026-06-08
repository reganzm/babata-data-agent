import { logToolAudit } from '@/lib/audit-log'
import type { AnyToolHook, ToolHook } from './types'

export const auditToolHook: ToolHook = {
  id: 'audit-tool',
  beforeToolExecute: ({ agent, tool, input }) => {
    logToolAudit({
      agent,
      tool,
      phase: 'input',
      input,
    })
  },
  afterToolSuccess: ({ agent, tool, input, result }) => {
    logToolAudit({
      agent,
      tool,
      phase: 'result',
      input,
      result,
    })
  },
  afterToolError: ({ agent, tool, input, error }) => {
    logToolAudit({
      agent,
      tool,
      phase: 'error',
      input,
      error,
    })
  },
}

export const defaultToolHooks: AnyToolHook[] = [auditToolHook]

