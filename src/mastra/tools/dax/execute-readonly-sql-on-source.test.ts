import test from 'node:test'
import assert from 'node:assert/strict'
import { executeReadonlySqlOnSourceToolOperation } from './execute-readonly-sql-on-source'

test('未选择数据源时拒绝查数，不回退全局 Doris', async () => {
  await assert.rejects(
    () => executeReadonlySqlOnSourceToolOperation({ sql: 'SELECT 1' }),
    /当前对话未选择数据源/,
  )
})
