import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildPrefetchedKnowledgeInstructionBlock,
  formatRetrievedParentsForPrompt,
} from './dax-knowledge-context'

test('formatRetrievedParentsForPrompt 按章节拼接父块', () => {
  const text = formatRetrievedParentsForPrompt([
    {
      headingPath: '表概览 > 粒度',
      content: '粒度为 voice_room_id + ds',
      childHits: 2,
    },
  ])
  assert.match(text, /### 表概览 > 粒度/)
  assert.match(text, /voice_room_id \+ ds/)
})

test('buildPrefetchedKnowledgeInstructionBlock 有召回内容时注入 RAG 块', () => {
  const block = buildPrefetchedKnowledgeInstructionBlock({
    knowledgeBaseIds: ['kb-1'],
    prefetchedKnowledgeContext: '### 示例\n字段说明',
  })
  assert.match(block, /系统已自动召回/)
  assert.match(block, /字段说明/)
})

test('buildPrefetchedKnowledgeInstructionBlock 无命中时要求先 retrieve', () => {
  const block = buildPrefetchedKnowledgeInstructionBlock({
    knowledgeBaseIds: ['kb-1', 'kb-2'],
    prefetchedKnowledgeContext: '',
  })
  assert.match(block, /必须先调用 retrieve-local-knowledge/)
  assert.match(block, /kb-1/)
})
