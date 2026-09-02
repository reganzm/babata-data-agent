import test from 'node:test'
import assert from 'node:assert/strict'
import { daxAgent } from './dax'

test('达克斯 Agent 已注册', () => {
  assert.equal(daxAgent.id, 'dax')
  assert.equal(daxAgent.name, '达克斯')
})
