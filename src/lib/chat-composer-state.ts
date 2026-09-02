export type ChatInteractionMode = 'agent' | 'plan'

export type ChatComposerState = {
  selectedDataSourceId: string
  selectedKnowledgeBaseId: string
  chatMode: ChatInteractionMode
}

export type ChatDataSourceOption = {
  id: string
  name: string
  type: string
  enabled: boolean
  knowledgeBaseIds: string[]
}

export type ChatKnowledgeBaseOption = {
  id: string
  name: string
  enabled: boolean
}

export const DEFAULT_CHAT_COMPOSER_STATE: ChatComposerState = {
  selectedDataSourceId: '',
  selectedKnowledgeBaseId: '',
  chatMode: 'agent',
}

export function resolveDefaultKnowledgeBaseId(input: {
  dataSourceId: string
  dataSources: ChatDataSourceOption[]
  knowledgeBases: ChatKnowledgeBaseOption[]
  currentKnowledgeBaseId?: string
}): string {
  const dataSourceId = input.dataSourceId.trim()
  if (!dataSourceId) return input.currentKnowledgeBaseId?.trim() ?? ''

  const dataSource = input.dataSources.find((item) => item.id === dataSourceId)
  if (!dataSource?.knowledgeBaseIds.length) return ''

  const enabledBoundIds = dataSource.knowledgeBaseIds.filter((id) =>
    input.knowledgeBases.some((kb) => kb.id === id && kb.enabled),
  )
  if (enabledBoundIds.length === 0) return ''

  const current = input.currentKnowledgeBaseId?.trim()
  if (current && enabledBoundIds.includes(current)) return current

  return enabledBoundIds[0]
}

export function applyDataSourceSelection(input: {
  state: ChatComposerState
  dataSourceId: string
  dataSources: ChatDataSourceOption[]
  knowledgeBases: ChatKnowledgeBaseOption[]
}): ChatComposerState {
  const dataSourceId = input.dataSourceId.trim()
  if (!dataSourceId) {
    return {
      ...input.state,
      selectedDataSourceId: '',
    }
  }

  return {
    ...input.state,
    selectedDataSourceId: dataSourceId,
    selectedKnowledgeBaseId: resolveDefaultKnowledgeBaseId({
      dataSourceId,
      dataSources: input.dataSources,
      knowledgeBases: input.knowledgeBases,
      currentKnowledgeBaseId: input.state.selectedKnowledgeBaseId,
    }),
  }
}

export function normalizeChatComposerState(
  value: Partial<ChatComposerState> | null | undefined,
): ChatComposerState {
  return {
    selectedDataSourceId: value?.selectedDataSourceId?.trim() ?? '',
    selectedKnowledgeBaseId: value?.selectedKnowledgeBaseId?.trim() ?? '',
    chatMode: value?.chatMode === 'plan' ? 'plan' : 'agent',
  }
}

export function extractChatMode(input: unknown): ChatInteractionMode {
  if (!input || typeof input !== 'object') return 'agent'
  const record = input as Record<string, unknown>
  const nested =
    record.requestContext && typeof record.requestContext === 'object'
      ? (record.requestContext as Record<string, unknown>)
      : {}
  const raw =
    record.chatMode ??
    nested.chatMode ??
    record.chatInteractionMode ??
    nested.chatInteractionMode
  return raw === 'plan' ? 'plan' : 'agent'
}
