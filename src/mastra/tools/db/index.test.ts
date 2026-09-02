import test from 'node:test'
import assert from 'node:assert/strict'
import { getXimoDbTools } from './index'

test('ximo tools expose sql, visualization, and rate-limited ragQuery only', () => {
  const tools = getXimoDbTools()

  assert.deepEqual(Object.keys(tools).sort(), [
    'buildVisualization',
    'executeReadonlySql',
    'ragQuery',
  ])
  assert.equal('listTables' in tools, false)
  assert.equal('describeTable' in tools, false)
})
