// import {
//   describeContextTableTool,
//   listContextTablesTool,
// } from './metadata'
// import { queryDataLineageTool } from './lineage'
import { queryRagKnowledgeTool } from './rag'
// import {
//   globWarehouseSourcesTool,
//   readWarehouseSourceTool,
//   searchWarehouseSourcesTool,
// } from './source-files'

export function getHundunContextTools() {
  return {
    // listContextTables: listContextTablesTool,
    // describeContextTable: describeContextTableTool,
    queryRagKnowledge: queryRagKnowledgeTool,
    // queryDataLineage: queryDataLineageTool,
    // globWarehouseSources: globWarehouseSourcesTool,
    // searchWarehouseSources: searchWarehouseSourcesTool,
    // readWarehouseSource: readWarehouseSourceTool,
  }
}
