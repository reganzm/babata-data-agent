import { generateText } from 'ai'
import { getModelForRole } from '@/lib/model'
import { logLlmDebug } from '@/lib/llm-debug-log'
import { assertReadonlySelect, normalizeGeneratedSql } from '@/mastra/tools/db/sql-guard'
import type { z } from 'zod'
import type { afterSqlSchema } from '../schemas'

type AfterSql = z.infer<typeof afterSqlSchema>

const DORIS_SQL_SYSTEM = `你是 SQL 生成器。目标库为 Apache Doris（MySQL 协议兼容）。
仅输出一条只读 SELECT，不要 markdown 包裹，不要解释。
禁止用分号拼接多条语句；禁止 INSERT/UPDATE/DELETE/DDL。无 LIMIT 时请加合理 LIMIT（如 LIMIT 1000）。
Doris 语法注意：
- 优先简单子查询；复杂多层 CTE、部分窗口/高级语法可能不支持，若用户指出不兼容须改写为 Doris 可执行写法
- 避免依赖 MySQL 8+ 独有而 Doris 未实现的特性`

export async function regenerateSqlAfterRejection(
  inputData: AfterSql,
  feedback: string,
): Promise<string> {
  const { text } = await generateText({
    model: getModelForRole('ximo'),
    system: `${DORIS_SQL_SYSTEM}
表：\`${inputData.primaryTable}\`
列：${inputData.columns.map((c) => `${c.name}(${c.type})`).join(', ')}`,
    prompt: `用户意图：${inputData.intentSummary}
原始问题：${inputData.userQuery}

被驳回的 SQL：
${inputData.sql}

驳回原因（必须据此修正）：
${feedback}

请输出修正后的单条 SELECT。`,
  })
  logLlmDebug({
    scene: 'regenerate-sql',
    userInput: {
      userQuery: inputData.userQuery,
      intentSummary: inputData.intentSummary,
      feedback,
      rejectedSql: inputData.sql,
      primaryTable: inputData.primaryTable,
    },
    llmOutput: text,
  })
  return assertReadonlySelect(normalizeGeneratedSql(text))
}
