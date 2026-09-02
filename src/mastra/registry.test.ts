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

test('babata instructions force hundun then ximo for data queries', () => {
  const instructions = buildBabataInstructions()

  assert.match(instructions, /混沌/)
  assert.match(instructions, /hundun/)
  assert.match(instructions, /问数|查数/)
  assert.match(instructions, /query-rag-knowledge|RAG/)
  assert.match(instructions, /confirm-normalized-query/)
  assert.match(instructions, /禁止跳过混沌直接西莫/)
  assert.match(instructions, /完整附上混沌证据包/)
  assert.match(
    instructions,
    /confirm-normalized-query[\s\S]*混沌[\s\S]*西莫|先调用工具[\s\S]*confirm-normalized-query/,
  )
  assert.doesNotMatch(instructions, /查数类需求默认委派西莫/)
})

test('babata instructions do not keep pure lineage-only routing', () => {
  const instructions = buildBabataInstructions()

  assert.doesNotMatch(instructions, /query-data-lineage/)
  assert.doesNotMatch(instructions, /血缘专用|直接委派混沌[\s\S]*query-data-lineage/)
})

test('babata instructions keep workflows without mandatory hundun', () => {
  const instructions = buildBabataInstructions()

  assert.match(instructions, /data-analysis-report/)
  assert.match(instructions, /weekly-metrics/)
  assert.match(instructions, /不强制先走混沌/)
})

test('delegation label resolves hundun', () => {
  assert.equal(getDelegationLabel('agent-hundun'), '混沌')
  assert.equal(getDelegationLabel('hundun'), '混沌')
})

test('有本地选择时路由表强制委派达克斯', () => {
  const instructions = buildBabataInstructions()
  assert.match(instructions, /selectedDataSourceId/)
  assert.match(instructions, /只委派达克斯/)
  assert.match(instructions, /达克斯/)
})

test('delegation label resolves dax', () => {
  assert.equal(getDelegationLabel('agent-dax'), '达克斯')
  assert.equal(getDelegationLabel('dax'), '达克斯')
})
