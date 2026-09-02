import test from 'node:test'
import assert from 'node:assert/strict'
import { buildFtsQuery, retrieveLocalKnowledge, uniqueParentIds } from './retrieve'

test('buildFtsQuery 把关键词变成 OR 短语', () => {
  assert.equal(buildFtsQuery('充值 口径'), '"充值" OR "口径"')
  assert.equal(buildFtsQuery('   '), '')
})

test('buildFtsQuery 无空格中文按字切分便于 FTS 命中', () => {
  assert.equal(
    buildFtsQuery('语音房日统计'),
    '"语" OR "音" OR "房" OR "日" OR "统" OR "计"',
  )
})

test('uniqueParentIds 按首次出现去重', () => {
  assert.deepEqual(
    uniqueParentIds([
      { parentId: 'p1' },
      { parentId: 'p2' },
      { parentId: 'p1' },
    ]),
    ['p1', 'p2'],
  )
})

test('空知识库或空查询不访问索引，直接返回空父块', async () => {
  assert.deepEqual(
    await retrieveLocalKnowledge({ knowledgeBaseIds: [], query: '充值' }),
    { parents: [] },
  )
  assert.deepEqual(
    await retrieveLocalKnowledge({ knowledgeBaseIds: ['kb-1'], query: '   ' }),
    { parents: [] },
  )
})
