export function shouldRenderWorkflowReport(params: {
  reportMarkdown?: string
  runStatus?: string | null
  hasTextPart: boolean
}): boolean {
  if (!params.reportMarkdown?.trim()) return false
  if (!params.hasTextPart) return true
  return (
    params.runStatus === 'success' ||
    params.runStatus === 'completed'
  )
}
