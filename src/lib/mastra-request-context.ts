import { RequestContext } from '@mastra/core/di'

function collectEntries(source: unknown): [string, unknown][] {
  if (source instanceof RequestContext) {
    return Array.from(source.entries())
  }
  if (!source || typeof source !== 'object') return []
  return Object.entries(source as Record<string, unknown>).filter(
    ([, value]) => value !== undefined,
  )
}

export function buildMastraRequestContext(
  source: unknown,
  extra?: Record<string, unknown>,
): RequestContext {
  const entries = new Map<string, unknown>()

  for (const [key, value] of collectEntries(source)) {
    entries.set(key, value)
  }

  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (value !== undefined) entries.set(key, value)
    }
  }

  return new RequestContext(Array.from(entries.entries()))
}

export function requestContextForLog(context: RequestContext): Record<string, unknown> {
  return context.all
}
