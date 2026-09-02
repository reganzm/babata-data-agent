import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isInvalidSuspendedToolRunId,
  sanitizeAgentToolArgs,
  wrapToolsToSanitizeAgentResumeArgs,
} from './sanitize-agent-tool-args'

test('isInvalidSuspendedToolRunId rejects nullish and string null', () => {
  assert.equal(isInvalidSuspendedToolRunId(null), true)
  assert.equal(isInvalidSuspendedToolRunId(undefined), true)
  assert.equal(isInvalidSuspendedToolRunId(''), true)
  assert.equal(isInvalidSuspendedToolRunId('null'), true)
  assert.equal(isInvalidSuspendedToolRunId('undefined'), true)
  assert.equal(isInvalidSuspendedToolRunId('  '), true)
  assert.equal(isInvalidSuspendedToolRunId('run-123'), false)
})

test('sanitizeAgentToolArgs strips invalid resume fields', () => {
  const cleaned = sanitizeAgentToolArgs({
    prompt: '查 Peanut 总收入证据',
    suspendedToolRunId: null,
    resumeData: { approved: true, confirmedQuery: 'Peanut 总收入' },
  })
  assert.equal(cleaned.prompt, '查 Peanut 总收入证据')
  assert.equal('suspendedToolRunId' in cleaned, false)
  assert.equal('resumeData' in cleaned, false)
})

test('sanitizeAgentToolArgs keeps valid suspendedToolRunId and resumeData', () => {
  const kept = sanitizeAgentToolArgs({
    prompt: '继续',
    suspendedToolRunId: 'hundun-run-1',
    resumeData: { city: 'SF' },
  })
  assert.equal(kept.suspendedToolRunId, 'hundun-run-1')
  assert.deepEqual(kept.resumeData, { city: 'SF' })
})

test('wrapToolsToSanitizeAgentResumeArgs sanitizes agent tool execute input', async () => {
  let received: unknown
  const tools = wrapToolsToSanitizeAgentResumeArgs({
    'agent-hundun': {
      execute: async (input: unknown) => {
        received = input
        return { ok: true }
      },
    },
    confirmNormalizedQuery: {
      execute: async (input: unknown) => input,
    },
  })

  assert.ok(tools)
  await (
    tools['agent-hundun'] as {
      execute: (input: unknown) => Promise<unknown>
    }
  ).execute({
    prompt: '证据包',
    suspendedToolRunId: 'null',
    resumeData: { approved: true },
  })

  assert.deepEqual(received, { prompt: '证据包' })

  const confirmResult = await (
    tools.confirmNormalizedQuery as {
      execute: (input: unknown) => Promise<unknown>
    }
  ).execute({
    originalQuery: 'x',
    suspendedToolRunId: null,
  })
  assert.deepEqual(confirmResult, {
    originalQuery: 'x',
    suspendedToolRunId: null,
  })
})
