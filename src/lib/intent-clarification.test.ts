import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateIntentClarificationRequirement } from './intent-clarification'

const tables = [
  { name: 'voice_room_daily' },
  { name: 'voice_room_user_event' },
  { name: 'orders_daily' },
]

test('requires clarification when multiple candidate tables are matched', () => {
  const result = evaluateIntentClarificationRequirement({
    userQuery: '分析 voice_room 的活跃趋势',
    intentSummary: '查询 voice_room_daily 与 voice_room_user_event',
    tables,
  })

  assert.equal(result.required, true)
  assert.match(result.reason, /多个候选表/)
})

test('requires clarification when dimensions or metrics are missing', () => {
  const result = evaluateIntentClarificationRequirement({
    userQuery: '分析订单走势',
    intentSummary: '查询 orders_daily',
    tables,
    clarification: {
      tableName: 'orders_daily',
      dimensions: ['ds'],
      metrics: [],
    },
  })

  assert.equal(result.required, true)
  assert.deepEqual(result.requiredFields, [
    'metrics',
    'timeStart',
    'timeEnd',
    'analysisStrategyId',
  ])
})

test('does not require clarification when table and scope are clear', () => {
  const result = evaluateIntentClarificationRequirement({
    userQuery: '分析订单 GMV',
    intentSummary: '查询 orders_daily，按 ds 统计 gmv',
    tables,
    clarification: {
      tableName: 'orders_daily',
      dimensions: ['ds'],
      metrics: ['gmv'],
      timeStart: '20260501',
      timeEnd: '20260531',
      analysisStrategyId: 'trend',
    },
  })

  assert.equal(result.required, false)
})

test('requires full intent fields even on first round', () => {
  const result = evaluateIntentClarificationRequirement({
    userQuery: '分析订单 GMV 趋势',
    intentSummary: '查询 orders_daily',
    tables,
    clarification: {
      tableName: 'orders_daily',
      dimensions: [],
      metrics: [],
    },
  })

  assert.equal(result.required, true)
  assert.ok(result.requiredFields.includes('dimensions'))
  assert.ok(result.requiredFields.includes('metrics'))
  assert.ok(result.requiredFields.includes('timeStart'))
  assert.ok(result.requiredFields.includes('timeEnd'))
  assert.ok(result.requiredFields.includes('analysisStrategyId'))
})
