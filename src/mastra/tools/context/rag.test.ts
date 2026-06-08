import test from 'node:test'
import assert from 'node:assert/strict'
import { queryRagKnowledgeOperation } from './rag'

test('rag lookup reports unavailable when endpoint is not configured', async () => {
  const previous = process.env.HUNDUN_RAG_ENDPOINT
  delete process.env.HUNDUN_RAG_ENDPOINT

  try {
    const result = await queryRagKnowledgeOperation({
      query: '钻石流水口径',
      limit: 5,
    })

    assert.equal(result.configured, false)
    assert.match(result.message, /RAG.*未配置/)
    assert.deepEqual(result.results, [])
  } finally {
    if (previous === undefined) {
      delete process.env.HUNDUN_RAG_ENDPOINT
    } else {
      process.env.HUNDUN_RAG_ENDPOINT = previous
    }
  }
})

test('rag lookup still reports unavailable while http integration is not implemented', async () => {
  const previous = process.env.HUNDUN_RAG_ENDPOINT
  process.env.HUNDUN_RAG_ENDPOINT = 'https://rag.example.test/query'

  try {
    const result = await queryRagKnowledgeOperation({
      query: '钻石流水口径',
    })

    assert.equal(result.configured, false)
    assert.match(result.message, /尚未接入/)
    assert.deepEqual(result.results, [])
  } finally {
    if (previous === undefined) {
      delete process.env.HUNDUN_RAG_ENDPOINT
    } else {
      process.env.HUNDUN_RAG_ENDPOINT = previous
    }
  }
})
