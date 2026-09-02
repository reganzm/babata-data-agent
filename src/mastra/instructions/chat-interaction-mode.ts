export function buildChatInteractionModeBlock(
  chatMode: string | null | undefined,
): string {
  if (chatMode !== 'plan') return ''

  return [
    '## 交互模式：规划',
    '- 当前为规划模式：只做需求理解、口径梳理、表字段确认与分析计划。',
    '- 可调用 retrieve-local-knowledge、list-source-tables、describe-source-table 收集信息。',
    '- 禁止调用 execute-readonly-sql-on-source、build-visualization，不要执行 SQL 或输出可视化块。',
    '- 输出结构化的分步计划、候选 SQL 草案（Markdown 代码块，不执行）与风险说明。',
    '- 结尾提示用户切换到智能体模式后再执行查数。',
  ].join('\n')
}
