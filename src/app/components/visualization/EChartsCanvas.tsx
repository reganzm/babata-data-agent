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

  // 回调与最新参数放进 ref：实例只在挂载时初始化一次，数据/主题变化只更新 option，
  // 避免流式输出时每个 chunk 都销毁并重建 ECharts 实例
  const buildOptionRef = useRef(buildOption)
  buildOptionRef.current = buildOption
  const themeRef = useRef(theme)
  themeRef.current = theme
  const heightRef = useRef(height)
  heightRef.current = height
  const onChartReadyRef = useRef(onChartReady)
  onChartReadyRef.current = onChartReady
  const onChartClickRef = useRef(onChartClick)
  onChartClickRef.current = onChartClick

  const frameRef = useRef<number | null>(null)
  const applyOptionRef = useRef<() => void>(() => {})

  useEffect(() => {
    let disposed = false
    let chart: ECharts | null = null
    let observer: ResizeObserver | null = null

    applyOptionRef.current = () => {
      if (!chart || !containerRef.current) return
      const currentHeight = heightRef.current
      const width = containerRef.current.clientWidth || 320
      const parsedHeight =
        typeof currentHeight === 'number'
          ? currentHeight
          : containerRef.current.clientHeight || 240
      chart.setOption(
        buildOptionRef.current(
          { width, height: parsedHeight },
          themeRef.current,
        ) as EChartsOption,
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
      onChartReadyRef.current?.(chart)
      chart.on('click', (params: unknown) => onChartClickRef.current?.(params))
      applyOptionRef.current()

      observer = new ResizeObserver(() => {
        if (frameRef.current != null) return
        frameRef.current = requestAnimationFrame(() => {
          frameRef.current = null
          chart?.resize()
          applyOptionRef.current()
        })
      })
      observer.observe(containerRef.current)
    })()

    return () => {
      disposed = true
      observer?.disconnect()
      if (frameRef.current != null) {
        cancelAnimationFrame(frameRef.current)
        frameRef.current = null
      }
      applyOptionRef.current = () => {}
      chart?.dispose()
      chartRef.current = null
      onChartReadyRef.current?.(null)
    }
  }, [])

  useEffect(() => {
    if (!chartRef.current) return
    // 同一帧内的多次数据更新合并为一次 setOption
    if (frameRef.current != null) return
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null
      applyOptionRef.current()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- caller controls deps
  }, [theme, height, ...deps])

  return (
    <div
      ref={containerRef}
      className={cn('w-full', className)}
      style={{ height: typeof height === 'number' ? `${height}px` : height }}
    />
  )
}
