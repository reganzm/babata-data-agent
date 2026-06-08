/** 分析库固定走 Doris 数仓（DORIS_DSN / DORIS_URL / DATABASE_URL） */

export function getAnalyticsDbUrl(): string {
  return (
    process.env.DORIS_DSN?.trim() ||
    process.env.DORIS_URL?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    ''
  )
}

export function assertAnalyticsConfigured(): void {
  const url = getAnalyticsDbUrl()
  if (url.startsWith('mysql://') || url.startsWith('mysql2://')) return
  if (process.env.DORIS_HOST?.trim() && process.env.DORIS_DATABASE?.trim()) return
  throw new Error(
    'Doris 未配置：请设置 DORIS_DSN（mysql://…）或 DORIS_HOST + DORIS_DATABASE + DORIS_USER',
  )
}
