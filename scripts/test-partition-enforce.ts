/**
 * 验证 ds 分区校正（pnpm exec tsx scripts/test-partition-enforce.ts）
 */
import {
  enforcePartitionFieldInSql,
  sqlUsesDtAsPartition,
} from '../src/lib/partition-field'

const sampleSql = `SELECT SUM(enter_user) AS enter_user
FROM ads_doris_peanut_voice_room_hourly_stat_1h
WHERE dt >= DATE_SUB(CURRENT_DATE, INTERVAL 14 DAY)
GROUP BY dt
ORDER BY dt
LIMIT 15`

const columnsWithDs = [
  { name: 'ds', type: 'int' },
  { name: 'dt', type: 'date' },
  { name: 'enter_user', type: 'bigint' },
]

const columnsOnlyDt = [
  { name: 'dt', type: 'date' },
  { name: 'enter_user', type: 'bigint' },
]

const clarification = {
  tableName: 'ads_doris_peanut_voice_room_hourly_stat_1h',
  dimensions: ['ds'],
  metrics: ['enter_user'],
  timeStart: '20260519',
  timeEnd: '20260602',
  analysisStrategyId: '' as const,
  additionalNotes: '日期分区字段是ds',
}

let out = enforcePartitionFieldInSql(sampleSql, columnsWithDs, null)
console.log('with ds in schema:', out)
console.log('still dt?', sqlUsesDtAsPartition(out))

out = enforcePartitionFieldInSql(sampleSql, columnsOnlyDt, clarification)
console.log('\nschema only dt + clarification ds:', out)
console.log('still dt?', sqlUsesDtAsPartition(out))
