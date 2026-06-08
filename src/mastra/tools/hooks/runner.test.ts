import test from 'node:test'
import assert from 'node:assert/strict'
import { runToolWithHooks, type ToolHook } from './runner'

test('runToolWithHooks executes lifecycle hooks in order on success', async () => {
  const events: string[] = []
  const hook: ToolHook<{ query: string }, { value: string }> = {
    id: 'recorder',
    beforeToolExecute: async (context) => {
      events.push(`before:${context.tool}`)
    },
    transformToolInput: async ({ input }) => {
      events.push('transform-input')
      return { query: input.query.trim() }
    },
    transformToolResult: async ({ result }) => {
      events.push('transform-result')
      return { value: result.value.toUpperCase() }
    },
    afterToolSuccess: async ({ result }) => {
      events.push(`success:${result.value}`)
    },
    afterToolFinally: async () => {
      events.push('finally')
    },
  }

  const result = await runToolWithHooks({
    agent: 'hundun',
    tool: 'query-rag-knowledge',
    input: { query: ' diamond_flow ' },
    hooks: [hook],
    execute: async (input) => {
      events.push(`execute:${input.query}`)
      return { value: input.query }
    },
  })

  assert.deepEqual(result, { value: 'DIAMOND_FLOW' })
  assert.deepEqual(events, [
    'before:query-rag-knowledge',
    'transform-input',
    'execute:diamond_flow',
    'transform-result',
    'success:DIAMOND_FLOW',
    'finally',
  ])
})

test('runToolWithHooks executes error and finally hooks when operation fails', async () => {
  const events: string[] = []
  const hook: ToolHook<{ sql: string }, unknown> = {
    id: 'error-recorder',
    afterToolError: async ({ error }) => {
      events.push(error instanceof Error ? error.message : String(error))
    },
    afterToolFinally: async () => {
      events.push('finally')
    },
  }

  await assert.rejects(
    () =>
      runToolWithHooks({
        agent: 'ximo',
        tool: 'execute-readonly-sql',
        input: { sql: 'DELETE FROM t' },
        hooks: [hook],
        execute: async () => {
          throw new Error('只允许 SELECT')
        },
      }),
    /只允许 SELECT/,
  )

  assert.deepEqual(events, ['只允许 SELECT', 'finally'])
})

