import test from 'node:test'
import assert from 'node:assert/strict'
import { assertReadonlySelect } from './sql-guard'

test('assertReadonlySelect 允许 SELECT 与子查询', () => {
  const sql = assertReadonlySelect('SELECT * FROM ads_recharge WHERE ds = 1')
  assert.match(sql, /SELECT/i)
})

test('assertReadonlySelect 允许 WITH CTE 后接 SELECT', () => {
  const sql = assertReadonlySelect(`
    WITH daily AS (
      SELECT ds, COUNT(*) AS cnt FROM ads_recharge GROUP BY ds
    )
    SELECT * FROM daily ORDER BY ds
  `)
  assert.match(sql, /WITH/i)
  assert.match(sql, /SELECT/i)
})

test('assertReadonlySelect 允许多层 WITH 与 RECURSIVE', () => {
  assert.doesNotThrow(() =>
    assertReadonlySelect(`
      WITH RECURSIVE tree AS (
        SELECT id, parent_id FROM dim_node WHERE parent_id IS NULL
        UNION ALL
        SELECT n.id, n.parent_id FROM dim_node n INNER JOIN tree t ON n.parent_id = t.id
      )
      SELECT * FROM tree
    `),
  )
})

test('assertReadonlySelect 拒绝 INSERT UPDATE DELETE', () => {
  for (const sql of [
    'INSERT INTO t SELECT 1',
    'UPDATE ads_recharge SET cnt = 1',
    'DELETE FROM ads_recharge',
  ]) {
    assert.throws(() => assertReadonlySelect(sql), /禁止的关键字|仅允许单条只读/)
  }
})

test('assertReadonlySelect 拒绝 DDL', () => {
  assert.throws(
    () => assertReadonlySelect('DROP TABLE ads_recharge'),
    /禁止的关键字|仅允许单条只读/,
  )
})

test('assertReadonlySelect 多语句时只保留首条只读 SELECT', () => {
  const sql = assertReadonlySelect('SELECT 1; DELETE FROM t')
  assert.match(sql, /^SELECT 1/i)
  assert.doesNotMatch(sql, /DELETE/i)
})

test('assertReadonlySelect 拒绝非 SELECT/WITH 开头语句', () => {
  assert.throws(
    () => assertReadonlySelect('CALL some_proc()'),
    /禁止的关键字|仅允许单条只读/,
  )
})
