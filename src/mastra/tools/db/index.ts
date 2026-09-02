// import { describeTableTool } from './describe-table'
import { executeReadonlySqlTool } from './execute-readonly-sql'
// import { listTablesTool } from './list-tables'
import { buildVisualizationTool } from '../visualization/build-viz'
import { eventTrackingQueryTool, listAppKeysTool } from './event-tracking-query'
import { createRagQueryTool } from './rag-query'

export function getXimoDbTools() {
  return {
    // listTables: listTablesTool,
    // describeTable: describeTableTool,
    executeReadonlySql: executeReadonlySqlTool,
    buildVisualization: buildVisualizationTool,
    ragQuery: createRagQueryTool(),
  }
}

/** 巨斧（埋点验收）工具集：app_key 映射 + 埋点专用查询（ds 锁定当天）+ 可视化。
 *  刻意不含 executeReadonlySql，防止手写跨天 / 任意 SQL 绕过 ds 当天限制。 */
export function getJujuDbTools() {
  return {
    listAppKeys: listAppKeysTool,
    eventTrackingQuery: eventTrackingQueryTool,
    buildVisualization: buildVisualizationTool,
  }
}

export {
  listTablesOperation,
  describeTableOperation,
  executeReadonlySqlOperation,
} from './operations'
