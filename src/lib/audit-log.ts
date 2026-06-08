import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

export type AuditPayload = {
  event: string
  [key: string]: unknown
}

export function shouldLogAudit(): boolean {
  const flag = process.env.BABATA_AUDIT_LOG?.trim().toLowerCase()
  if (flag === 'false' || flag === '0' || flag === 'off') return false
  return flag === 'true' || process.env.NODE_ENV === 'development'
}

export function logAuditEvent(payload: AuditPayload): void {
  if (!shouldLogAudit()) return
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    component: 'babata-audit',
    ...payload,
  })
  console.info(line)
  appendAuditLogLine(line)
}

function getAuditLogFile(): string {
  return resolve(
    process.cwd(),
    process.env.BABATA_AUDIT_LOG_FILE?.trim() || 'logs/babata-audit.log',
  )
}

function appendAuditLogLine(line: string): void {
  try {
    const logFile = getAuditLogFile()
    mkdirSync(dirname(logFile), { recursive: true })
    appendFileSync(logFile, `${line}\n`, 'utf8')
  } catch (error) {
    console.warn('[babata-audit] failed to append audit log file', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

export function logSqlAudit(params: {
  sql: string
  queryParams?: unknown[]
}): void {
  logAuditEvent({
    event: 'sql.query',
    sql: params.sql,
    params: params.queryParams ?? [],
  })
}

export function logToolAudit(params: {
  tool: string
  agent?: 'ximo' | 'hundun'
  phase: 'input' | 'result' | 'error'
  input?: unknown
  result?: unknown
  error?: unknown
}): void {
  const agent = params.agent ?? 'ximo'
  logAuditEvent({
    event: `${agent}-tool.${params.tool}.${params.phase}`,
    agent,
    tool: params.tool,
    phase: params.phase,
    input: params.input,
    result: params.result,
    error:
      params.error instanceof Error
        ? params.error.message
        : params.error === undefined
          ? undefined
          : String(params.error),
  })
}
