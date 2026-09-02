import test from 'node:test'
import assert from 'node:assert/strict'
import { toPublicDataSource, type DataSourceRecord } from './data-sources'

test('toPublicDataSource 不暴露密码密文', () => {
  const record: DataSourceRecord = {
    id: 'ds-1',
    userId: 'u1',
    name: 'doris',
    description: '数仓',
    type: 'doris',
    enabled: true,
    config: {
      host: 'fe',
      port: 9030,
      user: 'analyst',
      database: 'ads',
      passwordCipher: 'iv.tag.cipher',
    },
    createdAt: '2026-08-30T00:00:00.000Z',
    updatedAt: '2026-08-30T00:00:00.000Z',
  }
  const publicRecord = toPublicDataSource(record, [
    { id: 'kb-1', name: '语音房口径', enabled: true },
  ])
  assert.equal(publicRecord.config.kind, 'sql_engine')
  if (publicRecord.config.kind === 'sql_engine') {
    assert.equal(publicRecord.config.passwordSet, true)
  }
  assert.equal(
    JSON.stringify(publicRecord).includes('iv.tag.cipher'),
    false,
  )
  assert.deepEqual(publicRecord.knowledgeBaseIds, ['kb-1'])
  assert.deepEqual(publicRecord.boundKnowledgeBases, [
    { id: 'kb-1', name: '语音房口径', enabled: true },
  ])
})
