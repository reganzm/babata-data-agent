import { buildVisualizationTool } from '@/mastra/tools/visualization/build-viz'
import { executeReadonlySqlOnSourceTool } from './execute-readonly-sql-on-source'
import { retrieveLocalKnowledgeTool } from './retrieve-local-knowledge'
import { describeSourceTableTool, listSourceTablesTool } from './source-metadata'

export function getDaxTools() {
  return {
    retrieveLocalKnowledge: retrieveLocalKnowledgeTool,
    listSourceTables: listSourceTablesTool,
    describeSourceTable: describeSourceTableTool,
    executeReadonlySqlOnSource: executeReadonlySqlOnSourceTool,
    buildVisualization: buildVisualizationTool,
  }
}
