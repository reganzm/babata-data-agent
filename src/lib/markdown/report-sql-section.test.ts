import test from 'node:test'
import assert from 'node:assert/strict'
import { splitReportSqlSection } from './report-sql-section'

test('splits trailing execution sql section from report markdown', () => {
  const result = splitReportSqlSection(`# 报告

正文内容

## 执行 SQL

\`\`\`sql
SELECT *
FROM orders
WHERE ds >= '20260601'
\`\`\``)

  assert.equal(result.body, '# 报告\n\n正文内容')
  assert.equal(result.sql, "SELECT *\nFROM orders\nWHERE ds >= '20260601'")
})

test('keeps normal markdown unchanged when execution sql section is absent', () => {
  const result = splitReportSqlSection('## 小结\n\n没有 SQL 区块')

  assert.equal(result.body, '## 小结\n\n没有 SQL 区块')
  assert.equal(result.sql, undefined)
})

test('does not split ordinary sql code block without execution heading', () => {
  const markdown = `## 查询示例

\`\`\`sql
SELECT 1
\`\`\``
  const result = splitReportSqlSection(markdown)

  assert.equal(result.body, markdown)
  assert.equal(result.sql, undefined)
})

test('preserves table markdown in body while splitting trailing execution sql', () => {
  const result = splitReportSqlSection(`| 日期 | GMV |
| --- | ---: |
| 20260601 | 100 |

## 执行 SQL

\`\`\`sql
SELECT ds, SUM(gmv)
FROM orders
GROUP BY ds
\`\`\``)

  assert.match(result.body, /\| 日期 \| GMV \|/)
  assert.equal(result.sql, 'SELECT ds, SUM(gmv)\nFROM orders\nGROUP BY ds')
})
