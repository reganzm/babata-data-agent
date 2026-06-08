import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  logAuditEvent,
  logSqlAudit,
  logToolAudit,
  shouldLogAudit,
} from './audit-log'

function withAuditEnvironment<T>(
  run: (params: { lines: string[]; logFile: string; tempDir: string }) => T,
): T {
  const previousEnabled = process.env.BABATA_AUDIT_LOG
  const previousFile = process.env.BABATA_AUDIT_LOG_FILE
  const originalInfo = console.info
  const lines: string[] = []
  const tempDir = mkdtempSync(join(tmpdir(), 'babata-audit-'))
  const logFile = join(tempDir, 'audit.log')
  process.env.BABATA_AUDIT_LOG = 'true'
  process.env.BABATA_AUDIT_LOG_FILE = logFile
  console.info = (message?: unknown) => {
    lines.push(String(message))
  }

  try {
    return run({ lines, logFile, tempDir })
  } finally {
    console.info = originalInfo
    if (previousEnabled === undefined) {
      delete process.env.BABATA_AUDIT_LOG
    } else {
      process.env.BABATA_AUDIT_LOG = previousEnabled
    }
    if (previousFile === undefined) {
      delete process.env.BABATA_AUDIT_LOG_FILE
    } else {
      process.env.BABATA_AUDIT_LOG_FILE = previousFile
    }
    rmSync(tempDir, { recursive: true, force: true })
  }
}

test('audit logging can be enabled explicitly', () => {
  const previous = process.env.BABATA_AUDIT_LOG
  process.env.BABATA_AUDIT_LOG = 'true'
  try {
    assert.equal(shouldLogAudit(), true)
  } finally {
    if (previous === undefined) {
      delete process.env.BABATA_AUDIT_LOG
    } else {
      process.env.BABATA_AUDIT_LOG = previous
    }
  }
})

test('logSqlAudit prints full SQL and params as structured JSON', () => {
  withAuditEnvironment(({ lines }) => {
    logSqlAudit({
      sql: 'SELECT room_id, revenue FROM voice_rooms WHERE ds = ? ORDER BY revenue DESC',
      queryParams: ['20260604'],
    })

    assert.equal(lines.length, 1)
    const payload = JSON.parse(lines[0]) as {
      component: string
      event: string
      sql: string
      params: string[]
    }
    assert.equal(payload.component, 'babata-audit')
    assert.equal(payload.event, 'sql.query')
    assert.equal(
      payload.sql,
      'SELECT room_id, revenue FROM voice_rooms WHERE ds = ? ORDER BY revenue DESC',
    )
    assert.deepEqual(payload.params, ['20260604'])
  })
})

test('logAuditEvent respects disabled audit flag', () => {
  const previous = process.env.BABATA_AUDIT_LOG
  const originalInfo = console.info
  const lines: string[] = []
  process.env.BABATA_AUDIT_LOG = 'false'
  console.info = (message?: unknown) => {
    lines.push(String(message))
  }

  try {
    logAuditEvent({ event: 'test.disabled' })
  } finally {
    console.info = originalInfo
    if (previous === undefined) {
      delete process.env.BABATA_AUDIT_LOG
    } else {
      process.env.BABATA_AUDIT_LOG = previous
    }
  }

  assert.deepEqual(lines, [])
})

test('logToolAudit prints ximo tool intermediate result', () => {
  withAuditEnvironment(({ lines }) => {
    logToolAudit({
      tool: 'execute-readonly-sql',
      phase: 'result',
      input: { sql: 'SELECT 1' },
      result: { rowCount: 1, rows: [{ value: 1 }] },
    })

    const payload = JSON.parse(lines[0]) as {
      event: string
      tool: string
      result: { rowCount: number; rows: Array<{ value: number }> }
    }
    assert.equal(payload.event, 'ximo-tool.execute-readonly-sql.result')
    assert.equal(payload.tool, 'execute-readonly-sql')
    assert.deepEqual(payload.result.rows, [{ value: 1 }])
  })
})

test('logToolAudit can classify hundun tool events', () => {
  withAuditEnvironment(({ lines }) => {
    logToolAudit({
      agent: 'hundun',
      tool: 'query-rag-knowledge',
      phase: 'result',
      input: { query: '钻石流水口径' },
      result: { configured: false, results: [] },
    })

    const payload = JSON.parse(lines[0]) as {
      event: string
      agent: string
      tool: string
    }
    assert.equal(payload.event, 'hundun-tool.query-rag-knowledge.result')
    assert.equal(payload.agent, 'hundun')
    assert.equal(payload.tool, 'query-rag-knowledge')
  })
})

test('logAuditEvent appends structured JSON lines to audit log file', () => {
  withAuditEnvironment(({ logFile }) => {
    logAuditEvent({ event: 'file.write', value: 42 })

    const lines = readFileSync(logFile, 'utf8').trim().split('\n')
    assert.equal(lines.length, 1)
    const payload = JSON.parse(lines[0]) as {
      component: string
      event: string
      value: number
    }
    assert.equal(payload.component, 'babata-audit')
    assert.equal(payload.event, 'file.write')
    assert.equal(payload.value, 42)
  })
})

test('logAuditEvent does not throw when audit file cannot be written', () => {
  const previousEnabled = process.env.BABATA_AUDIT_LOG
  const previousFile = process.env.BABATA_AUDIT_LOG_FILE
  const originalInfo = console.info
  const originalWarn = console.warn
  const tempDir = mkdtempSync(join(tmpdir(), 'babata-audit-unwritable-'))
  const warnings: string[] = []
  process.env.BABATA_AUDIT_LOG = 'true'
  process.env.BABATA_AUDIT_LOG_FILE = tempDir
  console.info = () => {}
  console.warn = (message?: unknown) => {
    warnings.push(String(message))
  }

  try {
    assert.doesNotThrow(() => logAuditEvent({ event: 'file.write.failed' }))
  } finally {
    console.info = originalInfo
    console.warn = originalWarn
    if (previousEnabled === undefined) {
      delete process.env.BABATA_AUDIT_LOG
    } else {
      process.env.BABATA_AUDIT_LOG = previousEnabled
    }
    if (previousFile === undefined) {
      delete process.env.BABATA_AUDIT_LOG_FILE
    } else {
      process.env.BABATA_AUDIT_LOG_FILE = previousFile
    }
    rmSync(tempDir, { recursive: true, force: true })
  }

  assert.deepEqual(warnings, [
    '[babata-audit] failed to append audit log file',
  ])
})
