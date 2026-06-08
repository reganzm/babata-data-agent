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

test('ximo description allows clarification without data result', () => {
  assert.match(ximoDescription, /信息不明确时先澄清/)
})
