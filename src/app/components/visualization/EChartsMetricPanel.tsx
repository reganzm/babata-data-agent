'use client'

import { useCallback, useMemo } from 'react'
import {
  buildMetricsEChartsOption,
  estimateMetricsCanvasHeight,
} from '@/lib/visualization/chart-options'
import type { MetricCard as MetricCardSpec } from '@/lib/visualization/types'
import { cn } from '@/lib/utils'
import { EChartsCanvas } from './EChartsCanvas'

interface EChartsMetricPanelProps {
  metrics: MetricCardSpec[]
  className?: string
}

export function EChartsMetricPanel({
  metrics,
  className,
}: EChartsMetricPanelProps) {
  const height = useMemo(
    () => estimateMetricsCanvasHeight(metrics),
    [metrics],
  )

  const buildOption = useCallback(
    (size: { width: number; height: number }, theme: Parameters<typeof buildMetricsEChartsOption>[1]) =>
      buildMetricsEChartsOption(metrics, theme, size.width, height),
    [metrics, height],
  )

  if (metrics.length === 0) return null

  return (
    <EChartsCanvas
      className={cn('px-0.5', className)}
      height={height}
      deps={[metrics, height]}
      buildOption={buildOption}
    />
  )
}
