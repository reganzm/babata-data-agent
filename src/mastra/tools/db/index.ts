import { describeTableTool } from './describe-table'
import { executeReadonlySqlTool } from './execute-readonly-sql'
import { listTablesTool } from './list-tables'
import { buildVisualizationTool } from '../visualization/build-viz'

export function getXimoDbTools() {
  return {
    listTables: listTablesTool,
    describeTable: describeTableTool,
    executeReadonlySql: executeReadonlySqlTool,
    buildVisualization: buildVisualizationTool,
  }
}

export {
  listTablesOperation,
  describeTableOperation,
  executeReadonlySqlOperation,
} from './operations'
