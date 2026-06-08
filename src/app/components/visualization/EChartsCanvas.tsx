'use client'

import { useEffect, useRef } from 'react'
import type { ECharts, EChartsOption } from 'echarts'
import { cn } from '@/lib/utils'
import { useChartTheme } from './useChartTheme'
import type { ChartThemeColors } from '@/lib/visualization/chart-options'

export type EChartsSize = {
  width: number
  height: number
}

export type EChartsOptionBuilder = (
  size: EChartsSize,
  theme: ChartThemeColors,
) => Record<string, unknown>

interface EChartsCanvasProps {
  buildOption: EChartsOptionBuilder
  height: number | string
  className?: string
  deps?: unknown[]
  onChartReady?: (chart: ECharts | null) => void
  onChartClick?: (params: unknown) => void
}

export function EChartsCanvas({
  buildOption,
  height,
  className,
  deps = [],
  onChartReady,
  onChartClick,
}: EChartsCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<ECharts | null>(null)
  const theme = useChartTheme()
  const buildOptionRef = useRef(buildOption)
  buildOptionRef.current = buildOption

  useEffect(() => {
    let disposed = false
    let chart: ECharts | null = null
    let observer: ResizeObserver | null = null

    const applyOption = () => {
      if (!chart || !containerRef.current) return
      const width = containerRef.current.clientWidth || 320
      const parsedHeight =
        typeof height === 'number'
          ? height
          : containerRef.current.clientHeight || 240
      chart.setOption(
        buildOptionRef.current({ width, height: parsedHeight }, theme) as EChartsOption,
        true,
      )
    }

    void (async () => {
      if (!containerRef.current) return
      const echarts = await import('echarts')
      if (disposed || !containerRef.current) return

      chart = echarts.init(containerRef.current, undefined, {
        renderer: 'canvas',
      })
      chartRef.current = chart
      onChartReady?.(chart)
      if (onChartClick) {
        chart.on('click', onChartClick)
      }
      applyOption()

      observer = new ResizeObserver(() => {
        chart?.resize()
        applyOption()
      })
      observer.observe(containerRef.current)
    })()

    return () => {
      disposed = true
      observer?.disconnect()
      if (chart && onChartClick) {
        chart.off('click', onChartClick)
      }
      chart?.dispose()
      chartRef.current = null
      onChartReady?.(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- caller controls deps
  }, [theme, height, onChartReady, onChartClick, ...deps])

  return (
    <div
      ref={containerRef}
      className={cn('w-full', className)}
      style={{ height: typeof height === 'number' ? `${height}px` : height }}
    />
  )
}
