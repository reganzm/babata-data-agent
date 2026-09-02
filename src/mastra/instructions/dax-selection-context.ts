export function buildDaxSelectionContextBlock(selection: {
  selectedDataSourceId?: string | null
  selectedKnowledgeBaseId?: string | null
  boundKnowledgeBaseIds?: string[]
}): string {
  const dataSourceId = selection.selectedDataSourceId?.trim()
  const knowledgeBaseId = selection.selectedKnowledgeBaseId?.trim()
  const boundKnowledgeBaseIds = (selection.boundKnowledgeBaseIds ?? []).filter(
    Boolean,
  )

  const lines = ['## 当前对话选择（界面已选定，勿重复向用户索取）']

  if (dataSourceId) {
    lines.push(
      `- 已选数据源 ID：\`${dataSourceId}\`。查数、list-source-tables、describe-source-table、execute-readonly-sql-on-source 均使用该数据源，无需再问用户数据源名称或 ID。`,
    )
  } else {
    lines.push(
      '- 未选数据源：用户仅要口径问答时可只检索知识库；若需 SQL 出数，再提示用户在界面选择数据源。',
    )
  }

  if (knowledgeBaseId) {
    lines.push(
      `- 已选知识库 ID：\`${knowledgeBaseId}\`。retrieve-local-knowledge 优先使用该库。`,
    )
  } else if (boundKnowledgeBaseIds.length > 0) {
    lines.push(
      `- 未单独选知识库，但数据源已绑定 ${boundKnowledgeBaseIds.length} 个已启用知识库（ID：${boundKnowledgeBaseIds.map((id) => `\`${id}\``).join('、')}）。系统会在下方注入预检索结果；若无命中，必须先调用 retrieve-local-knowledge 再查数。`,
    )
  } else if (dataSourceId) {
    lines.push(
      '- 未单独选知识库，且数据源未绑定已启用知识库：可直接查表结构或说明无本地口径文档。',
    )
  } else {
    lines.push(
      '- 未选知识库：仅在有选中或绑定的知识库时调用 retrieve-local-knowledge。',
    )
  }

  lines.push(
    '- 收到用户问题后应直接调用工具开始检索或查数，不要先让用户重复报数据源/知识库名称。',
  )

  return lines.join('\n')
}
