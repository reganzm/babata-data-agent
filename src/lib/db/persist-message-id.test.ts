import test from 'node:test'
import assert from 'node:assert/strict'
import { toPersistedMessageId } from './persist-message-id'

test('同一条消息落到不同会话时必须得到不同的存储 ID', () => {
  const localId = 'msg-shared-1'
  const left = toPersistedMessageId('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', localId)
  const right = toPersistedMessageId('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', localId)
  assert.notEqual(left, right)
  assert.equal(left, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa:msg-shared-1')
  assert.equal(right, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb:msg-shared-1')
})

test('已经带本会话前缀的 ID 不会重复叠加', () => {
  const conversationId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  const once = toPersistedMessageId(conversationId, 'msg-1')
  assert.equal(toPersistedMessageId(conversationId, once), once)
})

test('从另一个会话拷来的 ID 会改挂到当前会话', () => {
  const fromOld = toPersistedMessageId(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'msg-1',
  )
  const forNew = toPersistedMessageId(
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    fromOld,
  )
  assert.equal(forNew, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb:msg-1')
})
