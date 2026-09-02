import test from 'node:test'
import assert from 'node:assert/strict'
import { hundunDescription, hundunInstructions } from './hundun'

test('hundun instructions define rag context evidence responsibilities', () => {
  assert.match(hundunInstructions, /上下文证据包/)
  assert.match(hundunInstructions, /指标口径/)
  assert.match(hundunInstructions, /RAG/)
  assert.match(hundunInstructions, /query-rag-knowledge/)
  assert.match(hundunInstructions, /用户问题/)
})

test('hundun instructions forbid data execution and fabricated evidence', () => {
  assert.match(hundunInstructions, /不执行.*SQL/)
  assert.match(hundunInstructions, /不调用.*build-visualization/)
  assert.match(hundunInstructions, /不编造/)
  assert.match(hundunInstructions, /未配置|不可用|未找到证据/)
  assert.match(hundunInstructions, /来源/)
})

test('hundun instructions stay on rag-only path', () => {
  assert.doesNotMatch(hundunInstructions, /query-data-lineage/)
  assert.doesNotMatch(hundunInstructions, /babata-viz/)
  assert.doesNotMatch(hundunInstructions, /血缘.*专用路径/)
  assert.match(hundunInstructions, /已下线/)
  assert.match(hundunInstructions, /RAG 证据/)
})

test('hundun description supports babata routing', () => {
  assert.match(hundunDescription, /上下文/)
  assert.match(hundunDescription, /证据/)
  assert.match(hundunDescription, /RAG/)
  assert.match(hundunDescription, /不执行.*SQL/)
  assert.doesNotMatch(hundunDescription, /血缘/)
  assert.doesNotMatch(hundunDescription, /源 SQL|源码/)
})
