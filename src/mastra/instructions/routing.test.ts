import test from 'node:test'
import assert from 'node:assert/strict'
import { routingDecisionTable } from './routing'

test('路由表最上方要求已选本地数据源或知识库时只委派达克斯', () => {
  const firstRow = routingDecisionTable.split('\n').find((line) => line.includes('| 请求上下文'))
  assert.ok(firstRow)
  assert.match(firstRow ?? '', /达克斯/)
  assert.match(routingDecisionTable, /selectedDataSourceId/)
})

test('未选择时路由表仍保留混沌与西莫查数顺序', () => {
  assert.match(routingDecisionTable, /confirm-normalized-query/)
  assert.match(routingDecisionTable, /混沌/)
  assert.match(routingDecisionTable, /西莫/)
})
