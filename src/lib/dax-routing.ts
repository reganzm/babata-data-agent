export type DaxRouteSelection = {
  selectedDataSourceId?: string | null
  selectedKnowledgeBaseId?: string | null
}

export function shouldRouteToDax(selection: DaxRouteSelection): boolean {
  return Boolean(
    selection.selectedDataSourceId?.trim() ||
      selection.selectedKnowledgeBaseId?.trim(),
  )
}

export function resolveChatAgentId(selection: DaxRouteSelection): 'dax' | 'babata' {
  return shouldRouteToDax(selection) ? 'dax' : 'babata'
}

export function extractDaxSelection(input: unknown): DaxRouteSelection {
  if (!input || typeof input !== 'object') return {}
  const record = input as Record<string, unknown>
  const nested =
    record.requestContext && typeof record.requestContext === 'object'
      ? (record.requestContext as Record<string, unknown>)
      : {}
  const selectedDataSourceId =
    (typeof record.selectedDataSourceId === 'string'
      ? record.selectedDataSourceId
      : undefined) ??
    (typeof nested.selectedDataSourceId === 'string'
      ? nested.selectedDataSourceId
      : undefined)
  const selectedKnowledgeBaseId =
    (typeof record.selectedKnowledgeBaseId === 'string'
      ? record.selectedKnowledgeBaseId
      : undefined) ??
    (typeof nested.selectedKnowledgeBaseId === 'string'
      ? nested.selectedKnowledgeBaseId
      : undefined)
  return { selectedDataSourceId, selectedKnowledgeBaseId }
}

export function resolveKnowledgeBaseIdsForDax(input: {
  selectedDataSourceId?: string | null
  selectedKnowledgeBaseId?: string | null
  boundEnabledKnowledgeBaseIds?: string[]
}): string[] {
  const selected = input.selectedKnowledgeBaseId?.trim()
  if (selected) return [selected]
  if (input.selectedDataSourceId?.trim()) {
    return input.boundEnabledKnowledgeBaseIds ?? []
  }
  return []
}
