import test from 'node:test'
import assert from 'node:assert/strict'
import {
  extractReferencedTableNames,
  resolveVirtualSql,
  rewriteVirtualSql,
  suggestVirtualExposedName,
  validateVirtualTableBindings,
} from './virtual-source-sql'
import type { VirtualTableBinding } from './data-source-config'

const bindings: VirtualTableBinding[] = [
  {
    parentDataSourceId: 'parent-doris',
    tableName: 'voice_room_daily_stat',
    exposedName: 'voice_room_daily_stat',
  },
  {
    parentDataSourceId: 'parent-csv',
    tableName: 'mt_consumption',
    exposedName: 'mt_consumption',
  },
]

test('extractReferencedTableNames reads FROM and JOIN tables', () => {
  const tables = extractReferencedTableNames(
    'SELECT a.id FROM voice_room_daily_stat a JOIN voice_room_daily_stat b ON a.id = b.id',
  )
  assert.deepEqual(tables.sort(), ['voice_room_daily_stat'])
})

test('extractReferencedTableNames ignores commas inside subquery function calls', () => {
  const tables = extractReferencedTableNames(`
    SELECT COUNT(*) AS ranked_users,
           SUM(CASE WHEN rate >= 30 THEN 1 ELSE 0 END) AS ge30
    FROM (
      SELECT t.user_id,
             SUM(t.highest_score - t.first_score) / NULLIF(SUM(t.section_full_score), 0) * 100 AS rate
      FROM voice_room_daily_stat t
      WHERE t.section_type BETWEEN 1 AND 6
      GROUP BY t.user_id
      HAVING COUNT(*) >= 20
    ) x
  `)
  assert.deepEqual(tables, ['voice_room_daily_stat'])
})

test('rewriteVirtualSql replaces exposed names with parent table names', () => {
  const rewritten = rewriteVirtualSql(
    'SELECT * FROM voice_room_daily_stat WHERE ds = 20260101',
    bindings,
  )
  assert.match(rewritten, /FROM voice_room_daily_stat/)
})

test('resolveVirtualSql routes single-parent SQL', () => {
  const resolved = resolveVirtualSql(
    'SELECT COUNT(*) AS total FROM mt_consumption',
    bindings,
  )
  assert.equal(resolved.parentDataSourceId, 'parent-csv')
  assert.match(resolved.rewrittenSql, /FROM mt_consumption/)
})

test('resolveVirtualSql rejects cross-parent SQL', () => {
  assert.throws(
    () =>
      resolveVirtualSql(
        'SELECT * FROM voice_room_daily_stat JOIN mt_consumption ON 1 = 1',
        bindings,
      ),
    /跨父源/,
  )
})

test('validateVirtualTableBindings rejects duplicate exposed names', () => {
  assert.throws(
    () =>
      validateVirtualTableBindings([
        {
          parentDataSourceId: 'a',
          tableName: 't1',
          exposedName: 'same_name',
        },
        {
          parentDataSourceId: 'b',
          tableName: 't2',
          exposedName: 'same_name',
        },
      ]),
    /重复/,
  )
})

test('suggestVirtualExposedName adds parent prefix on conflict', () => {
  const suggested = suggestVirtualExposedName({
    parentName: 'doris',
    tableName: 'orders',
    existingExposedNames: ['orders'],
  })
  assert.equal(suggested, 'doris_orders')
})

const qualifiedBindings: VirtualTableBinding[] = [
  {
    parentDataSourceId: 'parent-starrocks',
    tableName: 'dws_practice_summary',
    exposedName: 'dws_practice_summary',
  },
  {
    parentDataSourceId: 'parent-starrocks',
    tableName: 'd_theme',
    exposedName: 'd_theme',
  },
]

test('extractReferencedTableNames reads catalog.db.table and db.table references', () => {
  const tables = extractReferencedTableNames(`
    SELECT p.theme_id
    FROM default_catalog.chatbot.dws_practice_summary p
    LEFT JOIN chatbot.d_theme t ON t.theme_id = p.theme_id
  `)
  assert.deepEqual(tables.sort(), ['d_theme', 'dws_practice_summary'])
})

test('resolveVirtualSql accepts fully qualified table names and strips the prefix', () => {
  const resolved = resolveVirtualSql(
    `SELECT COUNT(*) AS cnt
     FROM default_catalog.chatbot.dws_practice_summary p
     LEFT JOIN default_catalog.chatbot.d_theme t ON t.theme_id = p.theme_id
     WHERE p.enterprise_id = 45`,
    qualifiedBindings,
  )
  assert.equal(resolved.parentDataSourceId, 'parent-starrocks')
  assert.deepEqual(resolved.referencedTables.sort(), ['d_theme', 'dws_practice_summary'])
  assert.doesNotMatch(resolved.rewrittenSql, /default_catalog|chatbot\./)
  assert.match(resolved.rewrittenSql, /FROM dws_practice_summary p/)
  assert.match(resolved.rewrittenSql, /JOIN d_theme t/)
})

test('resolveVirtualSql still rejects qualified tables outside the allow list', () => {
  assert.throws(
    () =>
      resolveVirtualSql(
        'SELECT * FROM default_catalog.chatbot.secret_table',
        qualifiedBindings,
      ),
    /表 secret_table 不在当前虚拟数据源允许列表中/,
  )
})

test('resolveVirtualSql maps a foreign db prefix onto the bound table instead of leaking it', () => {
  const resolved = resolveVirtualSql(
    'SELECT * FROM other_db.dws_practice_summary',
    qualifiedBindings,
  )
  assert.doesNotMatch(resolved.rewrittenSql, /other_db/)
})
