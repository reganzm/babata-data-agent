import test from 'node:test'
import assert from 'node:assert/strict'
import {
  extractDaxSelection,
  resolveChatAgentId,
  resolveKnowledgeBaseIdsForDax,
  shouldRouteToDax,
} from './dax-routing'

test('选择数据源或知识库时走达克斯', () => {
  assert.equal(shouldRouteToDax({ selectedDataSourceId: 'ds-1' }), true)
  assert.equal(shouldRouteToDax({ selectedKnowledgeBaseId: 'kb-1' }), true)
  assert.equal(shouldRouteToDax({}), false)
  assert.equal(shouldRouteToDax({ selectedDataSourceId: '  ' }), false)
})

test('只选数据源时使用已绑定且启用的知识库', () => {
  assert.deepEqual(
    resolveKnowledgeBaseIdsForDax({
      selectedDataSourceId: 'ds-1',
      boundEnabledKnowledgeBaseIds: ['kb-a', 'kb-b'],
    }),
    ['kb-a', 'kb-b'],
  )
})

test('同时选择知识库时只检索所选知识库', () => {
  assert.deepEqual(
    resolveKnowledgeBaseIdsForDax({
      selectedDataSourceId: 'ds-1',
      selectedKnowledgeBaseId: 'kb-b',
      boundEnabledKnowledgeBaseIds: ['kb-a', 'kb-b'],
    }),
    ['kb-b'],
  )
})

test('只选知识库时不查数，只检索该库', () => {
  assert.deepEqual(
    resolveKnowledgeBaseIdsForDax({
      selectedKnowledgeBaseId: 'kb-only',
      boundEnabledKnowledgeBaseIds: ['kb-a'],
    }),
    ['kb-only'],
  )
})

test('有选择时聊天入口直接走达克斯，无选择仍走巴巴塔', () => {
  assert.equal(resolveChatAgentId({ selectedDataSourceId: 'ds-1' }), 'dax')
  assert.equal(resolveChatAgentId({}), 'babata')
})

test('extractDaxSelection 从 body 或 requestContext 读取选择', () => {
  assert.deepEqual(
    extractDaxSelection({
      selectedDataSourceId: 'ds-1',
      requestContext: { selectedKnowledgeBaseId: 'kb-1' },
    }),
    { selectedDataSourceId: 'ds-1', selectedKnowledgeBaseId: 'kb-1' },
  )
})
