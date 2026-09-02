import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildCsvColumnDefinitions,
  inferSqliteColumnType,
  parseCsvDocument,
  resolveCsvTableNameFromFilename,
  sanitizeSqlIdentifier,
} from './csv-data-source'

test('parseCsvDocument 解析表头与数据行', () => {
  const parsed = parseCsvDocument('name,amount\nroom_a,12\nroom_b,3.5\n')
  assert.deepEqual(parsed.headers, ['name', 'amount'])
  assert.equal(parsed.rows.length, 2)
  assert.equal(parsed.columns[0]?.name, 'name')
  assert.equal(parsed.columns[0]?.sqlType, 'TEXT')
  assert.equal(parsed.columns[1]?.sqlType, 'REAL')
})

test('inferSqliteColumnType 识别整数列', () => {
  assert.equal(inferSqliteColumnType(['1', '2', '']), 'INTEGER')
})

test('sanitizeSqlIdentifier 过滤非法字符', () => {
  assert.equal(sanitizeSqlIdentifier('  7-day ', 'fallback'), '_7_day')
  assert.equal(sanitizeSqlIdentifier('', 'fallback'), 'fallback')
})

test('resolveCsvTableNameFromFilename 使用文件名作为表名', () => {
  assert.equal(resolveCsvTableNameFromFilename('mt_consumption.csv'), 'mt_consumption')
})

test('buildCsvColumnDefinitions 保留重复列名供上层去重', () => {
  const columns = buildCsvColumnDefinitions({
    headers: ['id', 'id'],
    rows: [['1', '2']],
  })
  assert.equal(columns[0]?.name, 'id')
  assert.equal(columns[1]?.name, 'id')
})
