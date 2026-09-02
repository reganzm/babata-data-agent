import test from 'node:test'
import assert from 'node:assert/strict'
import { formatToolErrorMessage } from './tool-error-message'

test('formats raw delegated agent JSON error as a friendly message', () => {
  const message = formatToolErrorMessage({
    toolName: '西莫 · 数据分析',
    errorText:
      '{"message":"[Agent:巴巴塔] - Failed agent tool execution for ximo","domain":"TOOL","details":{"errorMessage":"resumeStream failed"}}',
  })

  assert.equal(
    message,
    '西莫执行失败，请稍后重试；如果仍失败，请调整问题或改用标准分析流程。',
  )
})

test('keeps heartbeat timeout text instead of generic hundun message', () => {
  const message = formatToolErrorMessage({
    toolName: '混沌 · 上下文支撑',
    errorText: '执行超时，已由心跳续跑自动推进',
  })
  assert.equal(message, '执行超时，已由心跳续跑自动推进')
})

test('does not expose backend JSON for unknown tool errors', () => {
  const message = formatToolErrorMessage({
    toolName: 'unknown-tool',
    errorText: '{"code":"INTERNAL","stack":"secret"}',
  })

  assert.equal(message, '工具执行失败，请稍后重试。')
  assert.equal(message.includes('secret'), false)
})
