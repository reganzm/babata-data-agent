import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applyDataSourceSelection,
  extractChatMode,
  resolveDefaultKnowledgeBaseId,
} from './chat-composer-state'

const dataSources = [
  {
    id: 'ds-1',
    name: 'Doris',
    type: 'doris',
    enabled: true,
    knowledgeBaseIds: ['kb-a', 'kb-b'],
  },
]

const knowledgeBases = [
  { id: 'kb-a', name: '语音房', enabled: true },
  { id: 'kb-b', name: '备用库', enabled: true },
]

test('resolveDefaultKnowledgeBaseId 选中数据源时默认第一个绑定库', () => {
  assert.equal(
    resolveDefaultKnowledgeBaseId({
      dataSourceId: 'ds-1',
      dataSources,
      knowledgeBases,
    }),
    'kb-a',
  )
})

test('resolveDefaultKnowledgeBaseId 当前选择仍在绑定范围内时保留', () => {
  assert.equal(
    resolveDefaultKnowledgeBaseId({
      dataSourceId: 'ds-1',
      dataSources,
      knowledgeBases,
      currentKnowledgeBaseId: 'kb-b',
    }),
    'kb-b',
  )
})

test('applyDataSourceSelection 切换数据源时自动更新知识库', () => {
  const next = applyDataSourceSelection({
    state: {
      selectedDataSourceId: '',
      selectedKnowledgeBaseId: '',
      chatMode: 'agent',
    },
    dataSourceId: 'ds-1',
    dataSources,
    knowledgeBases,
  })
  assert.equal(next.selectedDataSourceId, 'ds-1')
  assert.equal(next.selectedKnowledgeBaseId, 'kb-a')
})

test('extractChatMode 从 body 或 requestContext 读取模式', () => {
  assert.equal(extractChatMode({ chatMode: 'plan' }), 'plan')
  assert.equal(extractChatMode({ requestContext: { chatMode: 'plan' } }), 'plan')
  assert.equal(extractChatMode({}), 'agent')
})
