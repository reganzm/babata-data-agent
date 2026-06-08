import test from 'node:test'
import assert from 'node:assert/strict'
import {
  extractArtifactFromParts,
  resolveAssistantPresentation,
} from './extract-artifact-from-parts'
import { serializeVisualizationBlock } from './build-artifact'
import type { AnalysisArtifact } from './types'

const lineageArtifact: AnalysisArtifact = {
  version: 1,
  summary: '数据血缘关系：business.ads_target',
  charts: [
    {
      id: 'lineage-graph',
      type: 'graph',
      title: '数据血缘关系图',
      encoding: {},
      data: [
        {
          id: '1',
          source: 'business.ods_source',
          target: 'business.ads_target',
        },
      ],
      options: {
        graph: {
          nodes: [
            { id: 'business.ods_source', label: 'business.ods_source' },
            { id: 'business.ads_target', label: 'business.ads_target', matched: true },
          ],
          edges: [
            {
              id: '1',
              source: 'business.ods_source',
              target: 'business.ads_target',
            },
          ],
        },
      },
    },
  ],
}

test('extractArtifactFromParts reads visualization from lineage tool output', () => {
  const artifact = extractArtifactFromParts([
    {
      type: 'data-tool-agent',
      data: {
        visualization: lineageArtifact,
      },
    },
  ])

  assert.equal(artifact?.charts[0]?.type, 'graph')
})

test('resolveAssistantPresentation reads vizBlock from lineage tool output without final text', () => {
  const presentation = resolveAssistantPresentation([
    {
      type: 'data-tool-agent',
      data: {
        vizBlock: serializeVisualizationBlock(lineageArtifact),
      },
    },
  ])

  assert.equal(presentation.artifact?.charts[0]?.type, 'graph')
  assert.equal(presentation.markdown, '')
})
