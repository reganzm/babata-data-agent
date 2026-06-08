type ToolErrorMessageParams = {
  toolName: string
  errorText?: string
}

export function formatToolErrorMessage({
  toolName,
  errorText,
}: ToolErrorMessageParams): string {
  if (toolName.includes('西莫') || /ximo/i.test(errorText ?? '')) {
    return '西莫执行失败，请稍后重试；如果仍失败，请调整问题或改用标准分析流程。'
  }

  if (toolName.includes('小栗子') || /chestnut/i.test(errorText ?? '')) {
    return '小栗子执行失败，请稍后重试。'
  }

  return '工具执行失败，请稍后重试。'
}
