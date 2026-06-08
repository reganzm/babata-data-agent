import test from 'node:test'
import assert from 'node:assert/strict'
import {
  handleProcessClientAbort,
  isClientAbortError,
  isProcessClientAbortError,
} from '@/lib/client-abort-error'

test('isClientAbortError detects ECONNRESET and aborted errors', () => {
  assert.equal(isClientAbortError({ code: 'ECONNRESET' }), true)
  assert.equal(isClientAbortError(new Error('aborted')), true)
  assert.equal(isClientAbortError(new Error('socket hang up')), true)
  assert.equal(isClientAbortError(new Error('database failed')), false)
})

test('handleProcessClientAbort only handles client disconnect errors', () => {
  const originalWarn = console.warn
  const warnings: unknown[] = []
  console.warn = (...args: unknown[]) => {
    warnings.push(args)
  }

  try {
    const abortedReset = new Error('aborted') as Error & { code: string }
    abortedReset.code = 'ECONNRESET'
    assert.equal(handleProcessClientAbort(abortedReset), true)
    assert.equal(handleProcessClientAbort(new Error('unexpected')), false)
  } finally {
    console.warn = originalWarn
  }

  assert.equal(warnings.length, 1)
})

test('process client abort detection is intentionally narrow', () => {
  const abortedReset = new Error('aborted') as Error & { code: string }
  abortedReset.code = 'ECONNRESET'

  assert.equal(isProcessClientAbortError(abortedReset), true)
  assert.equal(isProcessClientAbortError({ code: 'ECONNRESET' }), false)
  assert.equal(isProcessClientAbortError(new Error('socket hang up')), false)
})
