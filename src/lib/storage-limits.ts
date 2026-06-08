/** SQL 查询最大返回行数（execute-readonly-sql / workflow） */
export function getSqlMaxRows(): number {
  const n = Number(process.env.SQL_MAX_ROWS ?? '1000')
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1000
}

/** 持久化消息里保留的 SQL rows 上限（图表 / 表格回放） */
export function getMessagePersistMaxRows(): number {
  const n = Number(process.env.MESSAGE_PERSIST_MAX_ROWS ?? '100')
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 100
}

/** 持久化时去掉 agent run 的 steps 快照（体积大头） */
export function shouldStripAgentStepsOnPersist(): boolean {
  return process.env.MESSAGE_PERSIST_STRIP_STEPS !== 'false'
}

export type TruncatedRows<T> = {
  rows: T[]
  truncated: boolean
  totalCount: number
}

export function truncateRows<T>(rows: T[], maxRows: number): TruncatedRows<T> {
  const totalCount = rows.length
  if (totalCount <= maxRows) {
    return { rows, truncated: false, totalCount }
  }
  return { rows: rows.slice(0, maxRows), truncated: true, totalCount }
}
