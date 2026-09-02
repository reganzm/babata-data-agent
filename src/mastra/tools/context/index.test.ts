import test from 'node:test'
import assert from 'node:assert/strict'
import { getHundunContextTools } from './index'

test('hundun context tools currently expose queryRagKnowledge only', () => {
  const tools = getHundunContextTools()

  assert.deepEqual(Object.keys(tools).sort(), ['queryRagKnowledge'])
  assert.equal('executeReadonlySql' in tools, false)
  assert.equal('buildVisualization' in tools, false)
  assert.equal('queryDataLineage' in tools, false)
  assert.equal('listContextTables' in tools, false)
})
