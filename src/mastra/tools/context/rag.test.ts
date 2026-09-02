import test from 'node:test'
import assert from 'node:assert/strict'
import { queryRagKnowledgeOperation } from './rag'

test('rag lookup uses default KG_RAG_ENDPOINT when env is empty', async () => {
  const previous = process.env.KG_RAG_ENDPOINT
  delete process.env.KG_RAG_ENDPOINT
  const previousFetch = globalThis.fetch
  const requested: Array<{ url: string; init?: RequestInit }> = []

  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    requested.push({ url: String(url), init })
    return new Response(JSON.stringify({ answer: 'ok', hits: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch

  try {
    const result = await queryRagKnowledgeOperation({
      query: '语音房日维度指标口径',
    })

    assert.equal(requested[0]?.url, 'http://127.0.0.1:8080/v1/sql-context')
    assert.equal(requested[0]?.init?.method, 'POST')
    assert.equal(result.configured, true)
    assert.deepEqual(result.data, { answer: 'ok', hits: [] })
  } finally {
    if (previous === undefined) {
      delete process.env.KG_RAG_ENDPOINT
    } else {
      process.env.KG_RAG_ENDPOINT = previous
    }
    globalThis.fetch = previousFetch
  }
})

test('rag lookup posts query and returns raw json data', async () => {
  const previous = process.env.KG_RAG_ENDPOINT
  const previousFetch = globalThis.fetch
  process.env.KG_RAG_ENDPOINT = 'http://rag.example.test/kgrag'
  let requestBody = ''

  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    requestBody = String(init?.body ?? '')
    return new Response(
      JSON.stringify({
        query: '钻石流水',
        contexts: [{ text: '口径说明' }],
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      },
    )
  }) as typeof fetch

  try {
    const result = await queryRagKnowledgeOperation({
      query: '钻石流水',
    })

    assert.equal(requestBody, JSON.stringify({ query: '钻石流水' }))
    assert.equal(result.configured, true)
    assert.match(result.message, /检索成功|查询成功/)
    assert.deepEqual(result.data, {
      query: '钻石流水',
      contexts: [{ text: '口径说明' }],
    })
  } finally {
    if (previous === undefined) {
      delete process.env.KG_RAG_ENDPOINT
    } else {
      process.env.KG_RAG_ENDPOINT = previous
    }
    globalThis.fetch = previousFetch
  }
})

test('rag lookup returns structured failure when endpoint responds non-2xx', async () => {
  const previous = process.env.KG_RAG_ENDPOINT
  const previousFetch = globalThis.fetch
  process.env.KG_RAG_ENDPOINT = 'http://rag.example.test/kgrag'

  globalThis.fetch = (async () =>
    new Response('bad gateway', {
      status: 502,
      headers: { 'content-type': 'text/plain' },
    })) as typeof fetch

  try {
    const result = await queryRagKnowledgeOperation({
      query: '钻石流水',
    })

    assert.equal(result.configured, true)
    assert.match(result.message, /请求失败|HTTP 502/)
    assert.equal(result.data, undefined)
  } finally {
    if (previous === undefined) {
      delete process.env.KG_RAG_ENDPOINT
    } else {
      process.env.KG_RAG_ENDPOINT = previous
    }
    globalThis.fetch = previousFetch
  }
})

test('rag lookup returns structured failure when request times out', async () => {
  const previous = process.env.KG_RAG_ENDPOINT
  const previousTimeout = process.env.HUNDUN_HTTP_TIMEOUT_MS
  const previousFetch = globalThis.fetch
  process.env.KG_RAG_ENDPOINT = 'http://rag.example.test/kgrag'
  process.env.HUNDUN_HTTP_TIMEOUT_MS = '20'

  globalThis.fetch = (async (_url, init) => {
    await new Promise<void>((_, reject) => {
      const signal = init?.signal
      if (!signal) {
        reject(new Error('missing abort signal'))
        return
      }
      const fail = () => {
        const error = new Error('The operation was aborted due to timeout')
        error.name = 'TimeoutError'
        reject(error)
      }
      if (signal.aborted) {
        fail()
        return
      }
      signal.addEventListener('abort', fail)
    })
    return new Response('ok')
  }) as typeof fetch

  try {
    const result = await queryRagKnowledgeOperation({ query: '超时' })
    assert.equal(result.configured, true)
    assert.match(result.message, /请求失败|timeout|aborted|超时/i)
  } finally {
    if (previous === undefined) delete process.env.KG_RAG_ENDPOINT
    else process.env.KG_RAG_ENDPOINT = previous
    if (previousTimeout === undefined) delete process.env.HUNDUN_HTTP_TIMEOUT_MS
    else process.env.HUNDUN_HTTP_TIMEOUT_MS = previousTimeout
    globalThis.fetch = previousFetch
  }
})

test('rag lookup returns structured failure when endpoint request throws', async () => {
  const previous = process.env.KG_RAG_ENDPOINT
  const previousFetch = globalThis.fetch
  process.env.KG_RAG_ENDPOINT = 'http://rag.example.test/kgrag'

  globalThis.fetch = (async () => {
    throw new Error('connection refused')
  }) as typeof fetch

  try {
    const result = await queryRagKnowledgeOperation({
      query: '钻石流水',
    })

    assert.equal(result.configured, true)
    assert.match(result.message, /请求失败/)
    assert.match(result.message, /connection refused/)
    assert.equal(result.data, undefined)
  } finally {
    if (previous === undefined) {
      delete process.env.KG_RAG_ENDPOINT
    } else {
      process.env.KG_RAG_ENDPOINT = previous
    }
    globalThis.fetch = previousFetch
  }
})
