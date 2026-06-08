import test from 'node:test'
import assert from 'node:assert/strict'
import { queryDataLineageOperation } from './lineage'

const lineageHtml = `
<html>
  <body>
    <table>
      <thead>
        <tr><th>ID</th><th>目标表</th><th>源表</th></tr>
      </thead>
      <tbody>
        <tr>
          <td>1587788</td>
          <td>business.ads_doris_aegis_peanut_anchor_history_guild_weekly</td>
          <td>business.ods_dim_doris_pn_guild_user_1d</td>
        </tr>
        <tr>
          <td>1810793</td>
          <td>business.ads_doris_aegis_peanut_guild_score_extra_weekly</td>
          <td>business.ads_doris_aegis_peanut_anchor_history_guild_weekly</td>
        </tr>
      </tbody>
    </table>
  </body>
</html>
`

test('lineage lookup reports unavailable when endpoint is not configured', async () => {
  const previous = process.env.HUNDUN_LINEAGE_ENDPOINT
  delete process.env.HUNDUN_LINEAGE_ENDPOINT

  try {
    const result = await queryDataLineageOperation({
      table: 'ads_doris_peanut_voice_room_hourly_stat_1h',
      direction: 'both',
    })

    assert.equal(result.configured, false)
    assert.match(result.message, /血缘.*未配置/)
    assert.deepEqual(result.results, [])
  } finally {
    if (previous === undefined) {
      delete process.env.HUNDUN_LINEAGE_ENDPOINT
    } else {
      process.env.HUNDUN_LINEAGE_ENDPOINT = previous
    }
  }
})

test('lineage lookup parses html table into graph and visualization block', async () => {
  const previous = process.env.HUNDUN_LINEAGE_ENDPOINT
  const previousFetch = globalThis.fetch
  const requestedUrls: string[] = []
  process.env.HUNDUN_LINEAGE_ENDPOINT = 'https://lineage.example.test/blood?p='
  globalThis.fetch = (async (url: string | URL | Request) => {
    requestedUrls.push(String(url))
    return new Response(lineageHtml, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })
  }) as typeof fetch

  try {
    const result = await queryDataLineageOperation({
      table: 'ads_doris_aegis_peanut_anchor_history_guild_weekly',
    })

    assert.equal(
      requestedUrls[0],
      'https://lineage.example.test/blood?p=ads_doris_aegis_peanut_anchor_history_guild_weekly',
    )
    assert.equal(result.configured, true)
    assert.match(result.message, /查询到 2 条血缘关系/)
    assert.equal(result.results.length, 2)
    assert.equal(result.results[0].direction, 'upstream')
    assert.equal(result.results[1].direction, 'downstream')
    assert.deepEqual(result.graph.edges, [
      {
        id: '1587788',
        source: 'business.ods_dim_doris_pn_guild_user_1d',
        target: 'business.ads_doris_aegis_peanut_anchor_history_guild_weekly',
      },
      {
        id: '1810793',
        source: 'business.ads_doris_aegis_peanut_anchor_history_guild_weekly',
        target: 'business.ads_doris_aegis_peanut_guild_score_extra_weekly',
      },
    ])
    assert.equal(
      result.graph.nodes.some(
        (node: { id: string; matched?: boolean }) =>
          node.id ===
            'business.ads_doris_aegis_peanut_anchor_history_guild_weekly' &&
          node.matched,
      ),
      true,
    )
    assert.match(result.vizBlock ?? '', /```babata-viz/)
    assert.equal(result.visualization?.charts[0]?.type, 'graph')
    assert.equal(result.visualization?.summary, undefined)
    assert.equal(result.visualization?.charts[0]?.description, undefined)
    assert.deepEqual(result.visualization?.charts[0]?.data, [
      {
        source: 'business.ods_dim_doris_pn_guild_user_1d',
        target: 'business.ads_doris_aegis_peanut_anchor_history_guild_weekly',
      },
      {
        source: 'business.ads_doris_aegis_peanut_anchor_history_guild_weekly',
        target: 'business.ads_doris_aegis_peanut_guild_score_extra_weekly',
      },
    ])
    assert.deepEqual(result.visualization?.table?.columns, [
      { field: 'sourceTable', label: '源表', kind: 'nominal' },
      { field: 'targetTable', label: '目标表', kind: 'nominal' },
    ])
    assert.deepEqual(result.visualization?.table?.rows, [
      {
        sourceTable: 'business.ods_dim_doris_pn_guild_user_1d',
        targetTable: 'business.ads_doris_aegis_peanut_anchor_history_guild_weekly',
      },
      {
        sourceTable: 'business.ads_doris_aegis_peanut_anchor_history_guild_weekly',
        targetTable: 'business.ads_doris_aegis_peanut_guild_score_extra_weekly',
      },
    ])
  } finally {
    if (previous === undefined) {
      delete process.env.HUNDUN_LINEAGE_ENDPOINT
    } else {
      process.env.HUNDUN_LINEAGE_ENDPOINT = previous
    }
    globalThis.fetch = previousFetch
  }
})

test('lineage lookup returns structured failure when endpoint request throws', async () => {
  const previous = process.env.HUNDUN_LINEAGE_ENDPOINT
  const previousFetch = globalThis.fetch
  process.env.HUNDUN_LINEAGE_ENDPOINT = 'https://lineage.example.test/blood?p='
  globalThis.fetch = (async () => {
    throw new Error('connection refused')
  }) as typeof fetch

  try {
    const result = await queryDataLineageOperation({
      table: 'ads_doris_aegis_peanut_anchor_history_guild_weekly',
    })

    assert.equal(result.configured, true)
    assert.match(result.message, /请求失败/)
    assert.match(result.message, /connection refused/)
    assert.deepEqual(result.graph, { nodes: [], edges: [] })
  } finally {
    if (previous === undefined) {
      delete process.env.HUNDUN_LINEAGE_ENDPOINT
    } else {
      process.env.HUNDUN_LINEAGE_ENDPOINT = previous
    }
    globalThis.fetch = previousFetch
  }
})
