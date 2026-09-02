import test from 'node:test'
import assert from 'node:assert/strict'
import { chunkMarkdownDocument } from './chunk-markdown'

test('按二级标题切父块，再切出子块', () => {
  const markdown = `## 充值口径

日充值金额指用户当日成功支付的合计。

口径不含退款。

## 表说明

ads_doris_recharge 是日汇总表。
`
  const { parents, children } = chunkMarkdownDocument(markdown)
  assert.equal(parents.length, 2)
  assert.equal(parents[0]?.headingPath, '充值口径')
  assert.match(parents[0]?.content ?? '', /日充值金额/)
  assert.ok(children.length >= 2)
  assert.ok(children.every((child) => child.parentIndex >= 0))
})

test('无标题时整篇作为一个父块', () => {
  const { parents, children } = chunkMarkdownDocument('只有一段说明文字。')
  assert.equal(parents.length, 1)
  assert.equal(parents[0]?.headingPath, '')
  assert.equal(children.length, 1)
  assert.equal(children[0]?.parentIndex, 0)
})
