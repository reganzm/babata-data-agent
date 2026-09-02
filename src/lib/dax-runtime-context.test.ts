import test from 'node:test'
import assert from 'node:assert/strict'
import {
  bindDaxRuntime,
  getDaxRuntime,
  resolveRuntimeDataSourceId,
  runWithDaxRuntime,
} from './dax-runtime-context'

test('runWithDaxRuntime 在异步范围内暴露所选数据源', async () => {
  assert.equal(getDaxRuntime(), undefined)
  await runWithDaxRuntime(
    { userId: 'u1', selectedDataSourceId: 'ds-1' },
    async () => {
      assert.equal(getDaxRuntime()?.selectedDataSourceId, 'ds-1')
      assert.equal(resolveRuntimeDataSourceId(), 'ds-1')
      assert.equal(resolveRuntimeDataSourceId('ds-explicit'), 'ds-explicit')
    },
  )
  assert.equal(getDaxRuntime(), undefined)
})

test('bindDaxRuntime 可按会话回读选择', () => {
  bindDaxRuntime({
    userId: 'u1',
    conversationId: 'c-1',
    selectedDataSourceId: 'ds-1',
  })
  assert.equal(getDaxRuntime('c-1')?.selectedDataSourceId, 'ds-1')
})
