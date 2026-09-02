import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RequestContext } from '@mastra/core/di'
import { buildMastraRequestContext } from './mastra-request-context'

test('buildMastraRequestContext 从 plain object 构造可 .get 的 RequestContext', () => {
  const context = buildMastraRequestContext(
    { selectedDataSourceId: 'ds-1' },
    { userId: 'user-1', conversationId: 'conv-1' },
  )

  assert.equal(typeof context.get, 'function')
  assert.equal(context.get('selectedDataSourceId'), 'ds-1')
  assert.equal(context.get('userId'), 'user-1')
})

test('buildMastraRequestContext 合并已有 RequestContext', () => {
  const base = new RequestContext([['selectedKnowledgeBaseId', 'kb-1']])
  const context = buildMastraRequestContext(base, { userId: 'user-2' })

  assert.equal(context.get('selectedKnowledgeBaseId'), 'kb-1')
  assert.equal(context.get('userId'), 'user-2')
})
