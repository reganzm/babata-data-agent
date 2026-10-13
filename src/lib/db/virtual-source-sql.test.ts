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

test('resolveVirtualSql treats top-level CTE names as CTEs, not tables', () => {
  const resolved = resolveVirtualSql(
    `WITH user_theme AS (
       SELECT p.theme_id, p.user_id FROM dws_practice_summary p GROUP BY p.theme_id, p.user_id
     ), agg AS (
       SELECT theme_id, COUNT(*) AS n FROM user_theme GROUP BY theme_id
     )
     SELECT t.theme_name, agg.n FROM d_theme t LEFT JOIN agg ON agg.theme_id = t.theme_id`,
    qualifiedBindings,
  )
  assert.deepEqual(resolved.referencedTables.sort(), ['d_theme', 'dws_practice_summary'])
})

test('a CTE cannot hide a real table of the same name from the allow list', () => {
  // CTE 定义体内的 FROM secret 指向真实表，必须照常校验
  assert.throws(
    () =>
      resolveVirtualSql(
        'WITH secret AS (SELECT * FROM secret) SELECT * FROM secret',
        qualifiedBindings,
      ),
    /表 secret 不在当前虚拟数据源允许列表中/,
  )
  assert.throws(
    () =>
      resolveVirtualSql(
        'WITH x AS (SELECT * FROM d_theme) SELECT * FROM x JOIN secret ON 1 = 1',
        qualifiedBindings,
      ),
    /表 secret 不在当前虚拟数据源允许列表中/,
  )
})

test('only top-level CTEs are recognised; nested WITH names are still treated as tables', () => {
  assert.throws(
    () =>
      resolveVirtualSql(
        'SELECT * FROM (WITH a AS (SELECT 1 AS x) SELECT * FROM a) t',
        qualifiedBindings,
      ),
    /表 a 不在当前虚拟数据源允许列表中/,
  )
})

test('FROM inside EXTRACT / TRIM / SUBSTRING / IS DISTINCT FROM does not introduce a table', () => {
  assert.deepEqual(
    extractReferencedTableNames(
      `SELECT EXTRACT(YEAR FROM p.practice_start_time) AS y,
              TRIM(BOTH ' ' FROM t.theme_name) AS n,
              SUBSTRING(t.theme_name FROM 1 FOR 3) AS s
       FROM dws_practice_summary p JOIN d_theme t ON t.theme_id = p.theme_id
       WHERE p.user_id IS DISTINCT FROM 0`,
    ).sort(),
    ['d_theme', 'dws_practice_summary'],
  )
})

test('backtick-quoted table names are recognised and foreign db prefixes are stripped', () => {
  assert.deepEqual(
    extractReferencedTableNames('SELECT * FROM `dws_practice_summary` p'),
    ['dws_practice_summary'],
  )
  const resolved = resolveVirtualSql(
    'SELECT COUNT(*) FROM `other_db`.`d_theme` t',
    qualifiedBindings,
  )
  assert.doesNotMatch(resolved.rewrittenSql, /other_db/)
  assert.match(resolved.rewrittenSql, /FROM d_theme t/)
})
