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
