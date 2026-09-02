import test from 'node:test'
import assert from 'node:assert/strict'
import { shouldApplyConversationUpdate } from './conversation-persist-target'

test('只把更新应用到产生该回复的会话，即使当前选中了另一个会话', () => {
  assert.equal(
    shouldApplyConversationUpdate('session-new', 'session-old'),
    false,
  )
  assert.equal(
    shouldApplyConversationUpdate('session-new', 'session-new'),
    true,
  )
  assert.equal(shouldApplyConversationUpdate('session-new', null), false)
})
