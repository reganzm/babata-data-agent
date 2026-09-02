import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getKnowledgeUploadMaxBytes,
  mapDataSourceBindingSummaryRows,
} from './knowledge-bases'

test('知识库上传上限默认 5MB', () => {
  const previous = process.env.BABATA_KNOWLEDGE_UPLOAD_MAX_MB
  delete process.env.BABATA_KNOWLEDGE_UPLOAD_MAX_MB
  assert.equal(getKnowledgeUploadMaxBytes(), 5 * 1024 * 1024)
  if (previous === undefined) delete process.env.BABATA_KNOWLEDGE_UPLOAD_MAX_MB
  else process.env.BABATA_KNOWLEDGE_UPLOAD_MAX_MB = previous
})

test('mapDataSourceBindingSummaryRows 映射知识库到数据源反链', () => {
  const map = mapDataSourceBindingSummaryRows([
    {
      knowledge_base_id: 'kb-1',
      id: 'ds-1',
      name: 'doris数据源',
      enabled: 1,
      type: 'doris',
    },
  ])
  assert.deepEqual(map.get('kb-1'), [
    { id: 'ds-1', name: 'doris数据源', enabled: true, type: 'doris' },
  ])
})
