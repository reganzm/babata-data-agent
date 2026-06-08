import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildBabataInstructions,
  getDelegationLabel,
  workflowRegistry,
} from './registry'

test('babata instructions forbid null suspendedToolRunId for ximo delegation', () => {
  const instructions = buildBabataInstructions()

  assert.match(instructions, /suspendedToolRunId/)
  assert.match(instructions, /不要传\s*null/)
  assert.match(instructions, /普通委派西莫/)
})

test('babata instructions keep ximo clarification out of data analysis workflow', () => {
  const instructions = buildBabataInstructions()

  assert.match(instructions, /查数类需求默认委派西莫/)
  assert.match(instructions, /文本追问用户/)
  assert.match(instructions, /不要.*data-analysis-report/)
  assert.match(instructions, /不要.*workflow.*澄清弹窗/)
})

test('data analysis report workflow does not use bare Text2SQL as trigger phrase', () => {
  assert.doesNotMatch(
    workflowRegistry.dataAnalysisReport.triggerPhrases.join('\n'),
    /^Text2SQL$/m,
  )
  assert.ok(
    workflowRegistry.dataAnalysisReport.triggerPhrases.some((phrase) =>
      /Text2SQL.*审批|审计/.test(phrase),
    ),
  )
})

test('babata instructions include hundun context support routing', () => {
  const instructions = buildBabataInstructions()

  assert.match(instructions, /混沌/)
  assert.match(instructions, /hundun/)
  assert.match(instructions, /指标口径|字段含义|表含义/)
  assert.match(instructions, /数据血缘/)
  assert.match(instructions, /RAG/)
  assert.match(instructions, /源 SQL|源码/)
  assert.match(instructions, /先委派混沌[\s\S]*再[\s\S]*西莫|混沌[\s\S]*西莫/)
})

test('babata instructions route pure lineage searches directly to Hundun lineage tool', () => {
  const instructions = buildBabataInstructions()

  assert.match(instructions, /查.*血缘|搜.*血缘|看.*血缘/)
  assert.match(instructions, /query-data-lineage/)
  assert.match(instructions, /不要委派西莫/)
  assert.match(instructions, /不要做.*SQL.*分析|不做.*数据分析/)
  assert.match(instructions, /不.*总结|不.*摘要/)
  assert.match(instructions, /只.*图.*表/)
})

test('delegation label resolves hundun', () => {
  assert.equal(getDelegationLabel('agent-hundun'), '混沌')
  assert.equal(getDelegationLabel('hundun'), '混沌')
})
