import test from 'node:test'
import assert from 'node:assert/strict'
import type { RowDataPacket } from 'mysql2'
import type { DataSourceRecord } from './data-sources'
import { assertSqlEngineConfig } from './data-source-config'
import { describeSourceTable, executeReadonlySqlOnSource } from './source-query'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const sampleSource: DataSourceRecord = {
  id: 'ds-local',
  userId: 'u1',
  name: '本地 Doris',
  description: '',
  type: 'doris',
  enabled: true,
  config: {
    host: 'fe.local',
    port: 9030,
    user: 'analyst',
    database: 'ads',
    passwordCipher: 'cipher',
  },
  createdAt: '2026-08-30T00:00:00.000Z',
  updatedAt: '2026-08-30T00:00:00.000Z',
}

test('错误配置不得回退全局 Doris，只报数据源错误', async () => {
  await assert.rejects(
    () =>
      executeReadonlySqlOnSource({
        dataSourceId: 'missing',
        userId: 'u1',
        sql: 'SELECT 1',
        dependencies: {
          getDataSourceById: async () => null,
          queryRows: async () => {
            throw new Error('不应查询全局 Doris')
          },
        },
      }),
    /数据源不存在或无权访问，未使用全局 Doris 配置/,
  )
})

test('达克斯只读 SQL 走所选数据源连接', async () => {
  const queried: string[] = []
  const result = await executeReadonlySqlOnSource({
    dataSourceId: 'ds-local',
    userId: 'u1',
    sql: 'SELECT 1 AS n',
    dependencies: {
      getDataSourceById: async (id) =>
        id === 'ds-local' ? sampleSource : null,
      queryRows: async (record, sql) => {
        const config = assertSqlEngineConfig(record.type, record.config)
        queried.push(`${record.id}:${config.host}:${sql}`)
        return [{ n: 1 }] as RowDataPacket[]
      },
    },
  })
  assert.equal(result.dataSourceId, 'ds-local')
  assert.equal(result.rows[0]?.n, 1)
  assert.match(queried[0] ?? '', /ds-local:fe.local/)
  assert.doesNotMatch(queried.join('\n'), /DORIS_/)
})

test('source-query 不引用全局 queryDoris', () => {
  const source = readFileSync(fileURLToPath(new URL('./source-query.ts', import.meta.url)), 'utf8')
  assert.doesNotMatch(source, /queryDoris|getDorisConfig/)
})

test('非法表名不会去连库', async () => {
  await assert.rejects(
    () =>
      describeSourceTable({
        dataSourceId: 'ds-local',
        userId: 'u1',
        table: 'ads;drop',
        dependencies: {
          getDataSourceById: async () => sampleSource,
          queryRows: async () => {
            throw new Error('不应查询')
          },
        },
      }),
    /非法表名/,
  )
})

test('达克斯 SQL 必须经过只读守卫', async () => {
  await assert.rejects(
    () =>
      executeReadonlySqlOnSource({
        dataSourceId: 'ds-local',
        userId: 'u1',
        sql: 'DELETE FROM ads_recharge',
        dependencies: {
          getDataSourceById: async () => sampleSource,
          queryRows: async () => {
            throw new Error('不应执行非只读 SQL')
          },
        },
      }),
    /禁止的关键字|仅允许单条只读/,
  )
})

test('达克斯允许 WITH CTE + SELECT 只读查询', async () => {
  const result = await executeReadonlySqlOnSource({
    dataSourceId: 'ds-local',
    userId: 'u1',
    sql: `WITH cte AS (SELECT 1 AS n) SELECT n FROM cte`,
    dependencies: {
      getDataSourceById: async () => sampleSource,
      queryRows: async () => [{ n: 1 }] as RowDataPacket[],
    },
  })
  assert.equal(result.rows[0]?.n, 1)
  assert.match(result.sql, /WITH/i)
})

test('达克斯拒绝 INSERT 写操作', async () => {
  await assert.rejects(
    () =>
      executeReadonlySqlOnSource({
        dataSourceId: 'ds-local',
        userId: 'u1',
        sql: 'INSERT INTO ads_recharge SELECT 1',
        dependencies: {
          getDataSourceById: async () => sampleSource,
          queryRows: async () => {
            throw new Error('不应执行写 SQL')
          },
        },
      }),
    /禁止的关键字|仅允许单条只读/,
  )
})
