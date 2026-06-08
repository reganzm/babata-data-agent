import {
  getMessagePersistMaxRows,
  shouldStripAgentStepsOnPersist,
  truncateRows,
} from '@/lib/storage-limits'

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function slimSqlPayload(
  payload: Record<string, unknown>,
  maxRows: number,
): Record<string, unknown> {
  if (!Array.isArray(payload.rows)) return payload

  const { rows, truncated, totalCount } = truncateRows(
    payload.rows as unknown[],
    maxRows,
  )
  const rowCount =
    typeof payload.rowCount === 'number'
      ? Math.max(payload.rowCount, totalCount)
      : totalCount

  return {
    ...payload,
    rows,
    rowCount,
    ...(truncated ? { truncated: true } : {}),
  }
}

function slimToolResultEntry(
  entry: unknown,
  maxRows: number,
): unknown {
  if (!isRecord(entry)) return entry

  const next: Record<string, unknown> = { ...entry }
  if (isRecord(next.result)) {
    next.result = slimSqlPayload(next.result, maxRows)
  }
  if (isRecord(next.output)) {
    next.output = slimSqlPayload(next.output, maxRows)
  }
  return next
}

function slimToolResultList(value: unknown, maxRows: number): unknown {
  if (!Array.isArray(value)) return value
  return value.map((item) => slimToolResultEntry(item, maxRows))
}

function slimAgentRunData(
  data: Record<string, unknown>,
  maxRows: number,
  stripSteps: boolean,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...data }

  if (stripSteps) {
    delete next.steps
  } else if (Array.isArray(next.steps)) {
    next.steps = next.steps.map((step) => {
      if (!isRecord(step)) return step
      const slimmed: Record<string, unknown> = { ...step }
      for (const key of [
        'toolResults',
        'staticToolResults',
        'dynamicToolResults',
      ] as const) {
        if (key in slimmed) {
          slimmed[key] = slimToolResultList(slimmed[key], maxRows)
        }
      }
      return slimmed
    })
  }

  for (const key of [
    'toolResults',
    'staticToolResults',
    'dynamicToolResults',
    'subAgentToolResults',
  ] as const) {
    if (key in next) {
      next[key] = slimToolResultList(next[key], maxRows)
    }
  }

  if (Array.isArray(next.rows)) {
    const { rows, truncated, totalCount } = truncateRows(
      next.rows as unknown[],
      maxRows,
    )
    next.rows = rows
    if (truncated) {
      next.truncated = true
      next.rowCount =
        typeof next.rowCount === 'number'
          ? Math.max(next.rowCount, totalCount)
          : totalCount
    }
  }

  return next
}

function slimTextJsonRows(text: string, maxRows: number): string {
  return text.replace(/```json\s*([\s\S]*?)```/gi, (match, jsonBody: string) => {
    try {
      const payload = JSON.parse(jsonBody) as Record<string, unknown>
      if (!Array.isArray(payload.rows)) return match

      const { rows, truncated, totalCount } = truncateRows(
        payload.rows as unknown[],
        maxRows,
      )
      if (!truncated) return match

      payload.rows = rows
      payload.rowCount =
        typeof payload.rowCount === 'number'
          ? Math.max(payload.rowCount, totalCount)
          : totalCount
      payload.truncated = true
      return `\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``
    } catch {
      return match
    }
  })
}

export function slimMessagePart(
  part: unknown,
  options?: { maxRows?: number; stripSteps?: boolean },
): unknown {
  if (!isRecord(part)) return part

  const maxRows = options?.maxRows ?? getMessagePersistMaxRows()
  const stripSteps = options?.stripSteps ?? shouldStripAgentStepsOnPersist()
  const next: Record<string, unknown> = { ...part }

  if (next.type === 'text' && typeof next.text === 'string') {
    next.text = slimTextJsonRows(next.text, maxRows)
    return next
  }

  if (next.type === 'data-tool-agent' && isRecord(next.data)) {
    next.data = slimAgentRunData(next.data, maxRows, stripSteps)
    return next
  }

  if (
    typeof next.type === 'string' &&
    (next.type.startsWith('tool-') || next.type === 'dynamic-tool')
  ) {
    if (isRecord(next.output)) {
      next.output = slimAgentRunData(next.output, maxRows, stripSteps)
    }
    return next
  }

  return next
}

export function slimMessagePartsForPersist(parts: unknown[]): unknown[] {
  return parts.map((part) => slimMessagePart(part))
}

export function slimStoredMessageParts(parts: unknown[]): unknown[] {
  return slimMessagePartsForPersist(parts)
}
