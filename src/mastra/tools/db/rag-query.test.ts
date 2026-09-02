import test from 'node:test'
import assert from 'node:assert/strict'
import { createRagQueryTool, MAX_XIMO_RAG_QUERY_CALLS } from './rag-query'

type RagQueryResult = {
  limited: boolean
  callsUsed: number
  maxCalls: number
  message: string
}

async function executeRagQuery(
  tool: ReturnType<typeof createRagQueryTool>,
  query: string,
): Promise<RagQueryResult> {
  const result = await tool.execute?.({ query }, {} as never)
  assert.ok(result && typeof result === 'object')
  assert.ok(!('error' in result && (result as { error?: unknown }).error))
  return result as RagQueryResult
}

test('rag-query allows up to 10 calls then rejects without fetching', async () => {
  const originalFetch = globalThis.fetch
  let fetchCount = 0
  globalThis.fetch = (async () => {
    fetchCount += 1
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }) as typeof fetch

  try {
    const tool = createRagQueryTool()
    assert.equal(MAX_XIMO_RAG_QUERY_CALLS, 10)

    for (let i = 1; i <= 10; i += 1) {
      const result = await executeRagQuery(tool, `q-${i}`)
      assert.equal(result.limited, false)
      assert.equal(result.callsUsed, i)
      assert.equal(result.maxCalls, 10)
      assert.match(result.message, /成功|检索/)
    }

    const limited = await executeRagQuery(tool, 'q-11')
    assert.equal(limited.limited, true)
    assert.equal(limited.callsUsed, 10)
    assert.equal(limited.maxCalls, 10)
    assert.match(limited.message, /上限|10/)
    assert.equal(fetchCount, 10)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('each createRagQueryTool instance has an independent call counter', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })) as typeof fetch

  try {
    const first = createRagQueryTool({ maxCalls: 1 })
    const second = createRagQueryTool({ maxCalls: 1 })

    const firstOk = await executeRagQuery(first, 'a')
    const firstLimited = await executeRagQuery(first, 'b')
    const secondOk = await executeRagQuery(second, 'c')

    assert.equal(firstOk.limited, false)
    assert.equal(firstLimited.limited, true)
    assert.equal(secondOk.limited, false)
  } finally {
    globalThis.fetch = originalFetch
  }
})
