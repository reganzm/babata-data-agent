import test from 'node:test'
import assert from 'node:assert/strict'
import { getDaxTools } from './index'

test('达克斯工具集包含本地检索与按数据源查数，不含全局 execute-readonly-sql', () => {
  const tools = getDaxTools()
  assert.ok(tools.retrieveLocalKnowledge)
  assert.ok(tools.executeReadonlySqlOnSource)
  assert.ok(tools.listSourceTables)
  assert.ok(tools.describeSourceTable)
  assert.ok(tools.buildVisualization)
  assert.equal('executeReadonlySql' in tools, false)
})
