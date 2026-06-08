import test from 'node:test'
import assert from 'node:assert/strict'
import { hundunDescription, hundunInstructions } from './hundun'

test('hundun instructions define context evidence responsibilities', () => {
  assert.match(hundunInstructions, /上下文证据包/)
  assert.match(hundunInstructions, /指标口径/)
  assert.match(hundunInstructions, /数据血缘/)
  assert.match(hundunInstructions, /RAG/)
  assert.match(hundunInstructions, /源 SQL|源码/)
})

test('hundun instructions forbid data execution and fabricated evidence', () => {
  assert.match(hundunInstructions, /不执行.*SQL/)
  assert.match(hundunInstructions, /不调用.*build-visualization/)
  assert.match(hundunInstructions, /不编造/)
  assert.match(hundunInstructions, /未配置/)
  assert.match(hundunInstructions, /来源/)
})

test('hundun instructions preserve lineage visualization blocks', () => {
  assert.match(hundunInstructions, /query-data-lineage/)
  assert.match(hundunInstructions, /babata-viz/)
  assert.match(hundunInstructions, /vizBlock/)
})

test('hundun instructions keep pure lineage searches direct and lightweight', () => {
  assert.match(hundunInstructions, /血缘.*专用路径/)
  assert.match(hundunInstructions, /只调用\s*query-data-lineage/)
  assert.match(hundunInstructions, /不展开.*指标口径/)
  assert.match(hundunInstructions, /不.*RAG/)
  assert.match(hundunInstructions, /不.*源码/)
  assert.match(hundunInstructions, /不做.*数据分析|不做.*推理/)
  assert.match(hundunInstructions, /不.*总结|不.*摘要/)
  assert.match(hundunInstructions, /只.*图.*表/)
})

test('hundun description supports babata routing', () => {
  assert.match(hundunDescription, /上下文/)
  assert.match(hundunDescription, /证据/)
  assert.match(hundunDescription, /血缘/)
  assert.match(hundunDescription, /RAG/)
  assert.match(hundunDescription, /不执行.*SQL/)
})
