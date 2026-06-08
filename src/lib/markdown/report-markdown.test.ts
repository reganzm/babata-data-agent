import test from 'node:test'
import assert from 'node:assert/strict'
import {
  REPORT_REMARK_GFM_OPTIONS,
  normalizeReportMarkdown,
} from './report-markdown'

test('normalizes double tilde numeric ranges before markdown rendering', () => {
  assert.equal(
    normalizeReportMarkdown(
      '一句话总结：20~~22点是确定性最高的黄金窗口，4~~8点低谷补量。',
    ),
    '一句话总结：20~22点是确定性最高的黄金窗口，4~8点低谷补量。',
  )
})

test('keeps intentional markdown strikethrough outside numeric ranges', () => {
  assert.equal(
    normalizeReportMarkdown('这里是 ~~删除内容~~，不是时间范围。'),
    '这里是 ~~删除内容~~，不是时间范围。',
  )
})

test('disables single-tilde strikethrough for numeric ranges', () => {
  assert.equal(REPORT_REMARK_GFM_OPTIONS.singleTilde, false)
})
