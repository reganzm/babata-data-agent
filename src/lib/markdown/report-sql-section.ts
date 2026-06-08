export type ReportSqlSectionSplit = {
  body: string
  sql?: string
}

const EXECUTION_SQL_SECTION_PATTERN =
  /(?:^|\n)##\s*执行\s*SQL\s*\n+\s*```sql\s*\n([\s\S]*?)\n```\s*$/i

export function splitReportSqlSection(markdown: string): ReportSqlSectionSplit {
  const match = markdown.match(EXECUTION_SQL_SECTION_PATTERN)
  if (!match) {
    return { body: markdown }
  }

  const sectionStart = match.index ?? markdown.length
  const body = markdown.slice(0, sectionStart).trim()
  const sql = match[1]?.trim()

  return sql ? { body, sql } : { body: markdown }
}
