import { generateText as defaultGenerateText } from 'ai'
import { getModelForRole } from '@/lib/model'

export type NormalizeUserQueryInput = {
  originalQuery: string
  today: string
  ragHints?: string
}

export type NormalizeUserQueryResult = {
  normalizedQuery: string
  notes?: string
}

export type NormalizeGenerateText = (args: {
  system: string
  prompt: string
}) => Promise<string>

const SYSTEM_PROMPT = `你是数据分析查询规范化器。把用户口语改写成「一看就懂」的规范文本（空格分隔短语），供用户确认，也供下游查数使用。

规则：
1. 去掉口语废话（嗯、帮我看看、我想等），只保留核心查询意图。
2. 比较词标准化：低于/不到→小于；超过/高于→大于；等于/是→是。
3. 模糊时间以 today 为锚；能落到明确区间则写清；「上月/去年」可保留相对表达。
4. 业务黑话优先按 ragHints 译成字段条件；不确定则保留原表述，不臆造字段。
5. 否定/存在性：「没开单」→「没有 订单」，禁止写成「订单金额是 0」。
6. 「有多少」等度量意图写成「订单数」等可读度量词。
7. 「华北区」→「区域 华北」这类维度映射。
8. 不得添加原文没有的表名/字段/过滤条件。
9. 不要输出 SQL、Markdown 解释或长文。

只输出一个 JSON 对象，格式严格为：
{"normalizedQuery":"...","notes":"可选短说明"}`

export function buildNormalizeUserQueryPrompt(input: NormalizeUserQueryInput): {
  system: string
  prompt: string
} {
  const hints = input.ragHints?.trim()
  const prompt = [
    `today: ${input.today}`,
    `originalQuery: ${input.originalQuery}`,
    hints ? `ragHints:\n${hints}` : 'ragHints: （无）',
  ].join('\n')
  return { system: SYSTEM_PROMPT, prompt }
}

function stripMarkdownFence(text: string): string {
  const trimmed = text.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return fenced?.[1]?.trim() ?? trimmed
}

export function parseNormalizeModelOutput(
  text: string,
  fallbackQuery: string,
): NormalizeUserQueryResult {
  const fallback = fallbackQuery.trim() || fallbackQuery
  try {
    const raw = stripMarkdownFence(text)
    const parsed = JSON.parse(raw) as {
      normalizedQuery?: unknown
      notes?: unknown
    }
    const normalized =
      typeof parsed.normalizedQuery === 'string'
        ? parsed.normalizedQuery.trim()
        : ''
    if (!normalized) {
      return { normalizedQuery: fallback }
    }
    const notes =
      typeof parsed.notes === 'string' && parsed.notes.trim()
        ? parsed.notes.trim()
        : undefined
    return notes ? { normalizedQuery: normalized, notes } : { normalizedQuery: normalized }
  } catch {
    return { normalizedQuery: fallback }
  }
}

export async function normalizeUserQuery(
  input: NormalizeUserQueryInput,
  options?: { generateText?: NormalizeGenerateText },
): Promise<NormalizeUserQueryResult> {
  const original = input.originalQuery.trim() || input.originalQuery
  const { system, prompt } = buildNormalizeUserQueryPrompt({
    ...input,
    originalQuery: original,
  })
  const generate = options?.generateText
  try {
    const text = generate
      ? await generate({ system, prompt })
      : (
          await defaultGenerateText({
            model: getModelForRole('ximo'),
            system,
            prompt,
          })
        ).text
    return parseNormalizeModelOutput(text, original)
  } catch {
    return { normalizedQuery: original }
  }
}
