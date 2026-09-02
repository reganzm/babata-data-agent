import { AsyncLocalStorage } from 'node:async_hooks'

export type DaxRuntimeContext = {
  userId: string | null
  conversationId?: string | null
  selectedDataSourceId?: string | null
  selectedKnowledgeBaseId?: string | null
  boundKnowledgeBaseIds?: string[]
  prefetchedKnowledgeContext?: string
  chatMode?: 'agent' | 'plan'
}

const storage = new AsyncLocalStorage<DaxRuntimeContext>()
const byConversation = new Map<string, DaxRuntimeContext>()

export function bindDaxRuntime(context: DaxRuntimeContext): void {
  const conversationId = context.conversationId?.trim()
  if (conversationId) {
    byConversation.set(conversationId, context)
  }
}

export function runWithDaxRuntime<T>(
  context: DaxRuntimeContext,
  run: () => Promise<T>,
): Promise<T> {
  bindDaxRuntime(context)
  return storage.run(context, run)
}

export function getDaxRuntime(conversationId?: string | null): DaxRuntimeContext | undefined {
  const fromStorage = storage.getStore()
  if (fromStorage) return fromStorage
  const id = conversationId?.trim()
  if (id) return byConversation.get(id)
  if (byConversation.size === 1) {
    return byConversation.values().next().value
  }
  return undefined
}

export function assertDaxAgentInteractionMode(action: string): void {
  const mode = getDaxRuntime()?.chatMode ?? 'agent'
  if (mode === 'plan') {
    throw new Error(`当前为规划模式，不能${action}。请切换到智能体模式后再试。`)
  }
}

export function requireDaxUserId(): string | null {
  return getDaxRuntime()?.userId ?? null
}

export function resolveRuntimeDataSourceId(
  explicit?: string | null,
): string | undefined {
  const id = explicit?.trim() || getDaxRuntime()?.selectedDataSourceId?.trim()
  return id || undefined
}
