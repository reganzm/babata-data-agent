import test from 'node:test'
import assert from 'node:assert/strict'
import { getHundunContextTools } from './index'

test('hundun context tools expose metadata and context lookup only', () => {
  const tools = getHundunContextTools()

  assert.deepEqual(Object.keys(tools).sort(), [
    'describeContextTable',
    'globWarehouseSources',
    'listContextTables',
    'queryDataLineage',
    'queryRagKnowledge',
    'readWarehouseSource',
    'searchWarehouseSources',
  ])
  assert.equal('executeReadonlySql' in tools, false)
  assert.equal('buildVisualization' in tools, false)
})
