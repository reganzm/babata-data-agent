import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseNormalizeModelOutput,
  normalizeUserQuery,
} from './query-normalization'

test('parseNormalizeModelOutput reads json object', () => {
  const result = parseNormalizeModelOutput(
    '{"normalizedQuery":"零售价 小于 50 元 零件","notes":"比较词"}',
    'fallback',
  )
  assert.equal(result.normalizedQuery, '零售价 小于 50 元 零件')
  assert.equal(result.notes, '比较词')
})

test('parseNormalizeModelOutput strips fences and falls back on empty', () => {
  const fenced = parseNormalizeModelOutput(
    '```json\n{"normalizedQuery":"去年 订单"}\n```',
    'x',
  )
  assert.equal(fenced.normalizedQuery, '去年 订单')

  const empty = parseNormalizeModelOutput('{"normalizedQuery":"  "}', '原话')
  assert.equal(empty.normalizedQuery, '原话')

  const invalid = parseNormalizeModelOutput('not-json', '原话')
  assert.equal(invalid.normalizedQuery, '原话')
})

test('normalizeUserQuery uses injected generator and degrades on throw', async () => {
  const ok = await normalizeUserQuery(
    { originalQuery: '低于50', today: '2026-07-28' },
    {
      generateText: async () =>
        JSON.stringify({ normalizedQuery: '小于 50' }),
    },
  )
  assert.equal(ok.normalizedQuery, '小于 50')

  const degraded = await normalizeUserQuery(
    { originalQuery: '原话查询', today: '2026-07-28' },
    {
      generateText: async () => {
        throw new Error('boom')
      },
    },
  )
  assert.equal(degraded.normalizedQuery, '原话查询')
})
