import test from 'node:test'
import assert from 'node:assert/strict'
import { createConfirmNormalizedQueryTool } from './confirm-normalized-query'

async function executeTool(
  tool: ReturnType<typeof createConfirmNormalizedQueryTool>,
  input: { originalQuery: string; ragHints?: string },
  agent?: {
    suspend?: (payload: unknown) => Promise<void>
    resumeData?: { approved: boolean; confirmedQuery?: string }
  },
) {
  const result = await tool.execute?.(input, { agent } as never)
  assert.ok(result && typeof result === 'object')
  return result as {
    confirmedQuery: string
    cancelled: boolean
    normalizedQuery: string
  }
}

test('skip HITL returns normalized query without suspend', async () => {
  const previous = process.env.BABATA_SKIP_QUERY_NORMALIZATION_HITL
  process.env.BABATA_SKIP_QUERY_NORMALIZATION_HITL = 'true'
  let suspended = false
  try {
    const tool = createConfirmNormalizedQueryTool({
      normalize: async () => ({ normalizedQuery: '去年 订单' }),
    })
    const result = await executeTool(
      tool,
      { originalQuery: '嗯看看去年订单' },
      {
        suspend: async () => {
          suspended = true
        },
      },
    )
    assert.equal(suspended, false)
    assert.equal(result.cancelled, false)
    assert.equal(result.confirmedQuery, '去年 订单')
    assert.equal(result.normalizedQuery, '去年 订单')
  } finally {
    if (previous === undefined) {
      delete process.env.BABATA_SKIP_QUERY_NORMALIZATION_HITL
    } else {
      process.env.BABATA_SKIP_QUERY_NORMALIZATION_HITL = previous
    }
  }
})

test('first call without resumeData suspends with query-normalization payload', async () => {
  const previous = process.env.BABATA_SKIP_QUERY_NORMALIZATION_HITL
  delete process.env.BABATA_SKIP_QUERY_NORMALIZATION_HITL
  let suspendPayload: unknown
  try {
    const tool = createConfirmNormalizedQueryTool({
      normalize: async () => ({ normalizedQuery: '零售价 小于 50 元 零件' }),
    })
    await executeTool(
      tool,
      { originalQuery: '零售价低于50元的零件' },
      {
        suspend: async (payload) => {
          suspendPayload = payload
        },
      },
    )
    assert.deepEqual(suspendPayload, {
      approvalType: 'query-normalization',
      originalQuery: '零售价低于50元的零件',
      normalizedQuery: '零售价 小于 50 元 零件',
    })
  } finally {
    if (previous === undefined) {
      delete process.env.BABATA_SKIP_QUERY_NORMALIZATION_HITL
    } else {
      process.env.BABATA_SKIP_QUERY_NORMALIZATION_HITL = previous
    }
  }
})

test('resume approved true uses confirmedQuery', async () => {
  const previous = process.env.BABATA_SKIP_QUERY_NORMALIZATION_HITL
  delete process.env.BABATA_SKIP_QUERY_NORMALIZATION_HITL
  try {
    const tool = createConfirmNormalizedQueryTool({
      normalize: async () => ({ normalizedQuery: '去年 订单' }),
    })
    const result = await executeTool(
      tool,
      { originalQuery: '去年订单' },
      {
        resumeData: {
          approved: true,
          confirmedQuery: '签单日期 去年 订单',
        },
      },
    )
    assert.equal(result.cancelled, false)
    assert.equal(result.confirmedQuery, '签单日期 去年 订单')
    assert.equal(result.normalizedQuery, '去年 订单')
  } finally {
    if (previous === undefined) {
      delete process.env.BABATA_SKIP_QUERY_NORMALIZATION_HITL
    } else {
      process.env.BABATA_SKIP_QUERY_NORMALIZATION_HITL = previous
    }
  }
})

test('resume approved false cancels', async () => {
  const previous = process.env.BABATA_SKIP_QUERY_NORMALIZATION_HITL
  delete process.env.BABATA_SKIP_QUERY_NORMALIZATION_HITL
  try {
    const tool = createConfirmNormalizedQueryTool({
      normalize: async () => ({ normalizedQuery: '去年 订单' }),
    })
    const result = await executeTool(
      tool,
      { originalQuery: '去年订单' },
      {
        resumeData: { approved: false },
      },
    )
    assert.equal(result.cancelled, true)
    assert.equal(result.confirmedQuery, '')
    assert.equal(result.normalizedQuery, '去年 订单')
  } finally {
    if (previous === undefined) {
      delete process.env.BABATA_SKIP_QUERY_NORMALIZATION_HITL
    } else {
      process.env.BABATA_SKIP_QUERY_NORMALIZATION_HITL = previous
    }
  }
})

test('resume approved with blank confirmedQuery falls back to normalizedQuery', async () => {
  const previous = process.env.BABATA_SKIP_QUERY_NORMALIZATION_HITL
  delete process.env.BABATA_SKIP_QUERY_NORMALIZATION_HITL
  try {
    const tool = createConfirmNormalizedQueryTool({
      normalize: async () => ({ normalizedQuery: '去年 订单' }),
    })
    const result = await executeTool(
      tool,
      { originalQuery: '去年订单' },
      {
        resumeData: { approved: true, confirmedQuery: '   ' },
      },
    )
    assert.equal(result.cancelled, false)
    assert.equal(result.confirmedQuery, '去年 订单')
  } finally {
    if (previous === undefined) {
      delete process.env.BABATA_SKIP_QUERY_NORMALIZATION_HITL
    } else {
      process.env.BABATA_SKIP_QUERY_NORMALIZATION_HITL = previous
    }
  }
})
