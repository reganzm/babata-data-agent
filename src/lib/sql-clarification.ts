/** 10 种常用数据分析方法论，供驳回澄清时选择 */
export const ANALYSIS_STRATEGIES = [
  {
    id: 'descriptive',
    label: '描述性统计概览',
    hint: '总量、均值、分位数、分布概况',
  },
  {
    id: 'yoy_mom',
    label: '同比 / 环比分析',
    hint: '与上期、去年同期对比增长率',
  },
  {
    id: 'trend',
    label: '趋势分析',
    hint: '按日/周/月的时间序列走势',
  },
  {
    id: 'drilldown',
    label: '维度下钻与分组对比',
    hint: '按地区、品类等维度拆分对比',
  },
  {
    id: 'funnel',
    label: '漏斗 / 转化分析',
    hint: '多步骤转化率与流失节点',
  },
  {
    id: 'cohort',
    label: '留存与 Cohort 分析',
    hint: '分 cohort 的留存率、复购',
  },
  {
    id: 'topn',
    label: 'Top-N 排名与帕累托',
    hint: '头部贡献、80/20 结构',
  },
  {
    id: 'anomaly',
    label: '异常检测与波动诊断',
    hint: '突增突降、离群点识别',
  },
  {
    id: 'correlation',
    label: '相关性与驱动因素',
    hint: '指标关联、简单归因探索',
  },
  {
    id: 'forecast',
    label: '预测与简单外推',
    hint: '基于历史的短期预估',
  },
] as const

export type AnalysisStrategyId = (typeof ANALYSIS_STRATEGIES)[number]['id']

export interface SqlClarification {
  tableName: string
  dimensions: string[]
  metrics: string[]
  timeStart: string
  timeEnd: string
  analysisStrategyId: AnalysisStrategyId | ''
  additionalNotes: string
}

/** 分区/统计常用日期格式 */
export const YYYY_MM_DD_PATTERN = /^\d{8}$/

export function isValidYyyyMMdd(s: string): boolean {
  if (!YYYY_MM_DD_PATTERN.test(s)) return false
  const y = Number(s.slice(0, 4))
  const m = Number(s.slice(4, 6))
  const d = Number(s.slice(6, 8))
  if (m < 1 || m > 12 || d < 1 || d > 31) return false
  const date = new Date(y, m - 1, d)
  return (
    date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d
  )
}

/** 将 yyyyMMdd 转为 `<input type="date">` 的 value */
export function yyyyMMddToDateInputValue(s: string): string {
  if (!isValidYyyyMMdd(s)) return ''
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
}

/** 从 date input 的 ISO 日期转为 yyyyMMdd */
export function dateInputValueToYyyyMMdd(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return ''
  return `${y}${m.padStart(2, '0')}${d.padStart(2, '0')}`
}

/** 仅保留数字并截断为 8 位 */
export function normalizeYyyyMMddInput(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 8)
}

export function yyyyMMddFromDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

export function formatYyyyMMddRangeLabel(
  timeStart: string,
  timeEnd: string,
): string {
  if (isValidYyyyMMdd(timeStart) && isValidYyyyMMdd(timeEnd)) {
    return `${timeStart} ~ ${timeEnd}`
  }
  if (isValidYyyyMMdd(timeStart)) return `${timeStart} ~ …`
  if (isValidYyyyMMdd(timeEnd)) return `… ~ ${timeEnd}`
  return ''
}

export type DateRangePresetId = 'last7' | 'last30' | 'thisMonth' | 'yesterday'

export const DATE_RANGE_PRESETS: { id: DateRangePresetId; label: string }[] = [
  { id: 'yesterday', label: '昨天' },
  { id: 'last7', label: '近 7 天' },
  { id: 'last30', label: '近 30 天' },
  { id: 'thisMonth', label: '本月' },
]

export function getDateRangePreset(
  id: DateRangePresetId,
): { timeStart: string; timeEnd: string } {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const end = yyyyMMddFromDate(today)

  switch (id) {
    case 'yesterday': {
      const d = new Date(today)
      d.setDate(d.getDate() - 1)
      const y = yyyyMMddFromDate(d)
      return { timeStart: y, timeEnd: y }
    }
    case 'last7': {
      const s = new Date(today)
      s.setDate(s.getDate() - 6)
      return { timeStart: yyyyMMddFromDate(s), timeEnd: end }
    }
    case 'last30': {
      const s = new Date(today)
      s.setDate(s.getDate() - 29)
      return { timeStart: yyyyMMddFromDate(s), timeEnd: end }
    }
    case 'thisMonth': {
      const s = new Date(today.getFullYear(), today.getMonth(), 1)
      return { timeStart: yyyyMMddFromDate(s), timeEnd: end }
    }
  }
}

export const EMPTY_SQL_CLARIFICATION: SqlClarification = {
  tableName: '',
  dimensions: [],
  metrics: [],
  timeStart: '',
  timeEnd: '',
  analysisStrategyId: '',
  additionalNotes: '',
}

export function getAnalysisStrategyLabel(id: AnalysisStrategyId | ''): string {
  if (!id) return ''
  return ANALYSIS_STRATEGIES.find((s) => s.id === id)?.label ?? id
}

/** 将结构化澄清序列化为 workflow rejectionFeedback 文本，供 LLM 使用 */
export function formatSqlClarificationToFeedback(c: SqlClarification): string {
  const strategy = getAnalysisStrategyLabel(c.analysisStrategyId)
  const strategyHint = c.analysisStrategyId
    ? ANALYSIS_STRATEGIES.find((s) => s.id === c.analysisStrategyId)?.hint
    : undefined

  const lines: string[] = ['【用户结构化澄清 — 生成 SQL 时必须遵守】']

  if (c.tableName.trim()) {
    lines.push(`- 目标表：\`${c.tableName.trim()}\``)
  }
  if (c.dimensions.length > 0) {
    lines.push(`- 分析维度：${c.dimensions.join('、')}`)
    const partitionField = inferPartitionField(c)
    if (partitionField) {
      lines.push(
        `- 日期分区字段（WHERE / GROUP BY 必须使用，禁止改用其它日期列如 dt）：${partitionField}`,
      )
    }
  }
  if (c.metrics.length > 0) {
    lines.push(`- 待分析指标：${c.metrics.join('、')}`)
  }
  if (c.timeStart || c.timeEnd) {
    const start = c.timeStart || '（未指定）'
    const end = c.timeEnd || '（未指定）'
    lines.push(`- 时间范围（yyyyMMdd）：${start} 至 ${end}`)
  }
  if (strategy) {
    lines.push(
      `- 分析策略：${strategy}${strategyHint ? `（${strategyHint}）` : ''}`,
    )
  }
  if (c.additionalNotes.trim()) {
    lines.push(`- 其它说明：${c.additionalNotes.trim()}`)
  }

  if (lines.length === 1) {
    return '用户驳回了 SQL，请根据 Apache Doris 可执行语法重写（避免不支持的 CTE/函数）。'
  }

  lines.push(
    '',
    '请基于以上澄清重新理解意图并生成 Doris 兼容的单条 SELECT；勿重复被驳回 SQL 的写法。',
  )
  return lines.join('\n')
}

function hasValidTimeRange(c: SqlClarification): boolean {
  const hasStart = Boolean(c.timeStart)
  const hasEnd = Boolean(c.timeEnd)
  if (!hasStart && !hasEnd) return false
  if (!isValidYyyyMMdd(c.timeStart) || !isValidYyyyMMdd(c.timeEnd)) return false
  return c.timeStart <= c.timeEnd
}

export function isSqlClarificationValid(c: SqlClarification): boolean {
  if (!c.tableName.trim()) return false
  if (
    (c.timeStart && c.timeStart.length !== 8) ||
    (c.timeEnd && c.timeEnd.length !== 8)
  ) {
    return false
  }
  if (c.timeStart || c.timeEnd) {
    if (!hasValidTimeRange(c)) return false
  }
  const hasScope =
    c.dimensions.length > 0 ||
    c.metrics.length > 0 ||
    hasValidTimeRange(c) ||
    Boolean(c.analysisStrategyId) ||
    c.additionalNotes.trim().length > 0
  return hasScope
}

/** 从 workflow rejectionFeedback 文本反解析结构化澄清 */
export function parseSqlClarificationFromFeedback(
  feedback: string,
): SqlClarification | null {
  if (!feedback.includes('【用户结构化澄清')) return null

  const tableMatch = feedback.match(/- 目标表：`([^`]+)`/)
  const dimMatch = feedback.match(/- 分析维度：(.+)/)
  const metricMatch = feedback.match(/- 待分析指标：(.+)/)
  const timeMatch = feedback.match(
    /- 时间范围（yyyyMMdd）：(\S+)\s+至\s+(\S+)/,
  )
  const partitionMatch = feedback.match(
    /- 日期分区字段[^：]*：(\w+)/,
  )
  const notesMatch = feedback.match(/- 其它说明：(.+)/)

  const splitFields = (line: string) =>
    line
      .split(/[、,，]/)
      .map((s) => s.trim())
      .filter(Boolean)

  const dimensions = dimMatch ? splitFields(dimMatch[1]) : []
  const partitionFromLine = partitionMatch?.[1]
  if (partitionFromLine && !dimensions.includes(partitionFromLine)) {
    dimensions.push(partitionFromLine)
  }

  const timeStart =
    timeMatch?.[1] && /^\d{8}$/.test(timeMatch[1]) ? timeMatch[1] : ''
  const timeEnd =
    timeMatch?.[2] && /^\d{8}$/.test(timeMatch[2]) ? timeMatch[2] : ''

  return {
    tableName: tableMatch?.[1]?.trim() ?? '',
    dimensions,
    metrics: metricMatch ? splitFields(metricMatch[1]) : [],
    timeStart,
    timeEnd,
    analysisStrategyId: '',
    additionalNotes: notesMatch?.[1]?.trim() ?? '',
  }
}

/** 推断日期分区字段（ds 等） */
export function inferPartitionField(c: SqlClarification): string | null {
  if (c.dimensions.some((d) => /^ds$/i.test(d.trim()))) return 'ds'
  const fromNotes = c.additionalNotes.match(
    /分区字段[是为:\s]*([a-zA-Z_][\w]*)/i,
  )
  if (fromNotes?.[1]) return fromNotes[1]
  const dsMention = c.additionalNotes.match(/\b(ds)\b/i)
  if (dsMention) return 'ds'
  return null
}

/** 供 generate-sql 使用的硬性约束文案 */
export function buildSqlClarificationConstraints(
  c: SqlClarification | null | undefined,
): string {
  if (!c?.tableName && !c?.dimensions.length && !c?.metrics.length) return ''

  const lines: string[] = ['【澄清硬性约束 — 违反即视为错误】']
  if (c.tableName.trim()) {
    lines.push(`- 只能查询表 \`${c.tableName.trim()}\``)
  }
  if (c.dimensions.length > 0) {
    lines.push(`- GROUP BY / 时间维度只能使用：${c.dimensions.join('、')}`)
    const partition = inferPartitionField(c)
    if (partition) {
      lines.push(
        `- 日期过滤与按日分组必须使用 \`${partition}\`，禁止使用 dt、date 等其它列替代`,
      )
      if (isValidYyyyMMdd(c.timeStart) && isValidYyyyMMdd(c.timeEnd)) {
        lines.push(
          `- 分区过滤示例：\`${partition}\` >= '${c.timeStart}' AND \`${partition}\` <= '${c.timeEnd}'（yyyyMMdd 整数比较）`,
        )
      }
    }
  }
  if (c.metrics.length > 0) {
    lines.push(`- SELECT 中指标字段应来自：${c.metrics.join('、')}`)
  }
  if (c.additionalNotes.trim()) {
    lines.push(`- 用户补充：${c.additionalNotes.trim()}`)
  }
  return lines.join('\n')
}

export type UserClarificationPayload = {
  tableName?: string
  dimensions?: string[]
  metrics?: string[]
  timeStart?: string
  timeEnd?: string
  analysisStrategyId?: string
  additionalNotes?: string
}

export function resolveUserClarification(input: {
  rejectionFeedback?: string | null
  userClarification?: UserClarificationPayload | null
}): SqlClarification | null {
  const raw = input.userClarification
  const hasStructuredClarification =
    raw &&
    (Boolean(raw.tableName?.trim()) ||
      (raw.dimensions?.length ?? 0) > 0 ||
      (raw.metrics?.length ?? 0) > 0 ||
      Boolean(raw.timeStart) ||
      Boolean(raw.timeEnd) ||
      Boolean(raw.additionalNotes?.trim()))
  if (hasStructuredClarification && raw) {
    return {
      ...EMPTY_SQL_CLARIFICATION,
      tableName: raw.tableName ?? '',
      dimensions: raw.dimensions ?? [],
      metrics: raw.metrics ?? [],
      timeStart: raw.timeStart ?? '',
      timeEnd: raw.timeEnd ?? '',
      analysisStrategyId:
        (raw.analysisStrategyId as SqlClarification['analysisStrategyId']) ?? '',
      additionalNotes: raw.additionalNotes ?? '',
    }
  }
  if (input.rejectionFeedback?.trim()) {
    return parseSqlClarificationFromFeedback(input.rejectionFeedback.trim())
  }
  return null
}
