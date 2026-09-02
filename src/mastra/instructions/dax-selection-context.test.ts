import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDaxSelectionContextBlock } from './dax-selection-context'

test('buildDaxSelectionContextBlock 已选数据源时禁止重复追问', () => {
  const block = buildDaxSelectionContextBlock({
    selectedDataSourceId: 'ds-abc',
    selectedKnowledgeBaseId: '',
  })
  assert.match(block, /已选数据源 ID：`ds-abc`/)
  assert.match(block, /勿重复向用户索取/)
  assert.match(block, /未单独选知识库/)
})

test('buildDaxSelectionContextBlock 数据源已绑定知识库时说明自动 RAG', () => {
  const block = buildDaxSelectionContextBlock({
    selectedDataSourceId: 'ds-1',
    boundKnowledgeBaseIds: ['kb-a', 'kb-b'],
  })
  assert.match(block, /已绑定 2 个已启用知识库/)
  assert.match(block, /预检索/)
})
