'use client'

import { memo } from 'react'
import type { AnalysisArtifact, ChartSpec } from '@/lib/visualization/types'
import { Badge } from '@/components/ui/badge'
import { ChartCard } from './ChartCard'
import { EChartsMetricPanel } from './EChartsMetricPanel'
import { EChartsTablePanel } from './EChartsTablePanel'

interface AnalysisVizPanelProps {
  artifact: AnalysisArtifact
}

function isRenderableChart(spec: ChartSpec): boolean {
  return spec.type !== 'metric' && spec.type !== 'table' && spec.data.length > 0
}

const MemoChartCard = memo(ChartCard)

export function AnalysisVizPanel({ artifact }: AnalysisVizPanelProps) {
  const charts = artifact.charts.filter(isRenderableChart)
  const primaryCharts = charts.filter(
    (chart) => chart.options?.layout !== 'secondary',
  )
  const secondaryCharts = charts.filter(
    (chart) => chart.options?.layout === 'secondary',
  )
  const heroCharts = primaryCharts.length > 0 ? primaryCharts : charts.slice(0, 1)
  const supportCharts =
    primaryCharts.length > 0 ? secondaryCharts : charts.slice(1)

  return (
    <section className="overflow-hidden rounded-2xl border border-border/60 bg-viz-shell shadow-[0_8px_30px_-12px_oklch(0_0_0_/_35%)]">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border/50 px-4 py-3.5 sm:px-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">数据洞察</h3>
            {artifact.table && (
              <Badge variant="outline" className="h-5 text-[10px] font-normal">
                {artifact.table.totalRows} 行
              </Badge>
            )}
          </div>
          {artifact.summary && (
            <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed text-muted-foreground">
              {artifact.summary}
            </p>
          )}
        </div>
      </header>

      <div className="space-y-4 p-4 sm:p-5">
        {artifact.metrics && artifact.metrics.length > 0 && (
          <EChartsMetricPanel metrics={artifact.metrics} />
        )}

        {heroCharts.length > 0 && (
          <div className="space-y-3">
            {heroCharts.map((spec) => (
              <MemoChartCard key={spec.id} spec={spec} />
            ))}
          </div>
        )}

        {supportCharts.length > 0 && (
          <div className="grid gap-3 lg:grid-cols-2">
            {supportCharts.map((spec) => (
              <MemoChartCard key={spec.id} spec={spec} />
            ))}
          </div>
        )}

        {artifact.table && <EChartsTablePanel table={artifact.table} />}
      </div>
    </section>
  )
}
