import test from 'node:test'
import assert from 'node:assert/strict'
import { ximoDescription, ximoInstructions } from './ximo'

test('ximo asks for clarification when table fields or time are unclear', () => {
  assert.match(ximoInstructions, /澄清协议/)
  assert.match(ximoInstructions, /目标表/)
  assert.match(ximoInstructions, /指标字段/)
  assert.match(ximoInstructions, /时间范围/)
  assert.match(ximoInstructions, /不要执行 SQL/)
  assert.match(ximoInstructions, /维度/)
  assert.match(ximoInstructions, /自然语言/)
  assert.match(ximoInstructions, /用户补充后/)
})

test('ximo consumes hundun evidence package when present', () => {
  assert.match(ximoInstructions, /混沌上下文证据包/)
  assert.match(ximoInstructions, /不得忽略证据包/)
  assert.match(ximoInstructions, /证据包/)
})

test('ximo instructions allow rate-limited rag-query and drop metadata tools', () => {
  assert.match(ximoInstructions, /rag-query/)
  assert.match(ximoInstructions, /最多 10 次/)
  assert.match(ximoInstructions, /已下线/)
  assert.doesNotMatch(ximoInstructions, /使用 list-tables、describe-table/)
})

test('ximo instructions require hive_catalog prefix for hive tables', () => {
  assert.match(ximoInstructions, /hive_catalog\./)
  assert.match(ximoInstructions, /表名含 hive/)
  assert.match(ximoInstructions, /表名含 doris/)
  assert.match(ximoInstructions, /联邦/)
})

test('ximo description allows clarification without data result', () => {
  assert.match(ximoDescription, /信息不明确时先澄清|先澄清/)
})
