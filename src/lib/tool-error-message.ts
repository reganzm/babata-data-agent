type ToolErrorMessageParams = {
  toolName: string
  errorText?: string
}

export function formatToolErrorMessage({
  toolName,
  errorText,
}: ToolErrorMessageParams): string {
  if (errorText?.includes('心跳续跑')) {
    return errorText
  }

  if (toolName.includes('西莫') || /ximo/i.test(errorText ?? '')) {
    return '西莫执行失败，请稍后重试；如果仍失败，请调整问题或改用标准分析流程。'
  }

  if (toolName.includes('小栗子') || /chestnut/i.test(errorText ?? '')) {
    return '小栗子执行失败，请稍后重试。'
  }

  if (
    toolName.includes('混沌') ||
    /hundun/i.test(errorText ?? '') ||
    /could not find a suspended run/i.test(errorText ?? '')
  ) {
    return '混沌执行失败（可能误用了无效的恢复参数），请重试当前问题。'
  }

  return '工具执行失败，请稍后重试。'
}
