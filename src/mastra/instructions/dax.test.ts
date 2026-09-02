import test from 'node:test'
import assert from 'node:assert/strict'
import { daxInstructions } from './dax'

test('达克斯指令禁止走混沌与全局 Doris', () => {
  assert.match(daxInstructions, /retrieve-local-knowledge/)
  assert.match(daxInstructions, /execute-readonly-sql-on-source/)
  assert.match(daxInstructions, /禁止调用混沌|不调用混沌/)
  assert.match(daxInstructions, /DORIS_\*/)
  assert.match(daxInstructions, /confirm-normalized-query/)
  assert.match(daxInstructions, /WITH.*CTE.*SELECT|WITH.*SELECT/s)
  assert.match(daxInstructions, /INSERT|UPDATE|DELETE/)
  assert.match(daxInstructions, /预检索知识库/)
})
