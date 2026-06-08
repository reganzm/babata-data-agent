import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runToolWithHooks } from './runner'
import { defaultToolHooks } from './built-in'

function withAuditEnvironment<T>(run: (lines: string[]) => Promise<T> | T): Promise<T> | T {
  const previousEnabled = process.env.BABATA_AUDIT_LOG
  const previousFile = process.env.BABATA_AUDIT_LOG_FILE
  const originalInfo = console.info
  const lines: string[] = []
  const tempDir = mkdtempSync(join(tmpdir(), 'tool-hook-audit-'))
  process.env.BABATA_AUDIT_LOG = 'true'
  process.env.BABATA_AUDIT_LOG_FILE = join(tempDir, 'audit.log')
  console.info = (message?: unknown) => {
    lines.push(String(message))
  }

  const restore = () => {
    console.info = originalInfo
    if (previousEnabled === undefined) delete process.env.BABATA_AUDIT_LOG
    else process.env.BABATA_AUDIT_LOG = previousEnabled
    if (previousFile === undefined) delete process.env.BABATA_AUDIT_LOG_FILE
    else process.env.BABATA_AUDIT_LOG_FILE = previousFile
    rmSync(tempDir, { recursive: true, force: true })
  }

  try {
    const result = run(lines)
    if (result instanceof Promise) {
      return result.finally(restore)
    }
    restore()
    return result
  } catch (error) {
    restore()
    throw error
  }
}

test('default tool hooks emit compatible input and result audit events', async () => {
  await withAuditEnvironment(async (lines) => {
    const result = await runToolWithHooks({
      agent: 'hundun',
      tool: 'query-rag-knowledge',
      input: { query: '钻石流水' },
      hooks: defaultToolHooks,
      execute: async () => ({ configured: false, results: [] }),
    })

    assert.deepEqual(result, { configured: false, results: [] })
    assert.equal(lines.length, 2)
    const inputPayload = JSON.parse(lines[0]) as { event: string; input: unknown }
    const resultPayload = JSON.parse(lines[1]) as {
      event: string
      result: { configured: boolean }
    }
    assert.equal(inputPayload.event, 'hundun-tool.query-rag-knowledge.input')
    assert.deepEqual(inputPayload.input, { query: '钻石流水' })
    assert.equal(resultPayload.event, 'hundun-tool.query-rag-knowledge.result')
    assert.equal(resultPayload.result.configured, false)
  })
})

test('default tool hooks emit compatible error audit events', async () => {
  await withAuditEnvironment(async (lines) => {
    await assert.rejects(
      () =>
        runToolWithHooks({
          tool: 'execute-readonly-sql',
          input: { sql: 'DELETE FROM t' },
          hooks: defaultToolHooks,
          execute: async () => {
            throw new Error('只允许 SELECT')
          },
        }),
      /只允许 SELECT/,
    )

    assert.equal(lines.length, 2)
    const errorPayload = JSON.parse(lines[1]) as {
      event: string
      agent: string
      error: string
    }
    assert.equal(errorPayload.event, 'ximo-tool.execute-readonly-sql.error')
    assert.equal(errorPayload.agent, 'ximo')
    assert.equal(errorPayload.error, '只允许 SELECT')
  })
})

