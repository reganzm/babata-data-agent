export const REPORT_REMARK_GFM_OPTIONS = {
  singleTilde: false,
} as const

export function normalizeReportMarkdown(content: string): string {
  return content.replace(/(\d)\s*~~\s*(\d)/g, '$1~$2')
}
