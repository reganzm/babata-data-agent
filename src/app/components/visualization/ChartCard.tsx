'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { ECharts, EChartsOption } from 'echarts'
import { Maximize2, Minimize2, RotateCcw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { buildEChartsOption } from '@/lib/visualization/chart-options'
import { CHART_TYPE_LABELS } from '@/lib/visualization/label-utils'
import type { ChartSpec } from '@/lib/visualization/types'
import { EChartsCanvas } from './EChartsCanvas'
import { useChartTheme } from './useChartTheme'

interface ChartCardProps {
  spec: ChartSpec
  className?: string
}

type GraphClickParams = {
  seriesType?: string
  dataType?: string
  data?: {
    id?: unknown
    name?: unknown
  }
}

export function ChartCard({ spec, className }: ChartCardProps) {
  const chartRef = useRef<ECharts | null>(null)
  const shellRef = useRef<HTMLDivElement>(null)
  const theme = useChartTheme()
  const [fullscreen, setFullscreen] = useState(false)
  const fullscreenTheme = useMemo(
    () => ({
      ...theme,
      text: 'oklch(0.18 0.018 260)',
      muted: 'oklch(0.43 0.018 260)',
      border: 'oklch(0.84 0.012 260)',
      surface: '#ffffff',
    }),
    [theme],
  )
  const activeTheme = fullscreen ? fullscreenTheme : theme
  const isPrimary = spec.options?.layout !== 'secondary'
  const chartHeight = fullscreen ? undefined : isPrimary ? 340 : 260

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    chart.setOption(
      buildEChartsOption(spec, activeTheme, { fullscreen }) as EChartsOption,
      true,
    )
  }, [spec, activeTheme, fullscreen])

  useEffect(() => {
    const onFullscreenChange = () => {
      setFullscreen(document.fullscreenElement === shellRef.current)
      requestAnimationFrame(() => {
        chartRef.current?.resize()
        chartRef.current?.setOption(
          buildEChartsOption(spec, activeTheme, {
            fullscreen: document.fullscreenElement === shellRef.current,
          }) as EChartsOption,
          true,
        )
      })
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [spec, activeTheme])

  const toggleFullscreen = async () => {
    const el = shellRef.current
    if (!el) return
    if (document.fullscreenElement === el) {
      await document.exitFullscreen()
    } else {
      await el.requestFullscreen()
    }
  }

  const resetZoom = () => {
    chartRef.current?.dispatchAction({
      type: 'dataZoom',
      start: 0,
      end: 100,
    })
  }

  const handleChartClick = (params: unknown) => {
    if (spec.type !== 'graph') return
    const event = params as GraphClickParams
    if (event.seriesType !== 'graph' || event.dataType !== 'node') return
    const table =
      typeof event.data?.id === 'string'
        ? event.data.id
        : typeof event.data?.name === 'string'
          ? event.data.name
          : ''
    if (!table) return

    window.dispatchEvent(
      new CustomEvent('babata:lineage-drilldown', {
        detail: { table },
      }),
    )
  }

  return (
    <div
      ref={shellRef}
      data-viz-chart-shell
      data-viz-chart-id={spec.id}
      className={cn(
        'relative overflow-hidden rounded-xl border border-border/60 bg-viz-surface transition-colors',
        className,
        fullscreen &&
          'flex h-screen w-screen flex-col border-0 bg-white p-4 text-slate-950 sm:p-6',
      )}
    >
      <div
        className={cn(
          'flex items-start justify-between gap-3 px-4 pb-2 pt-3',
          fullscreen &&
            'mx-auto w-full max-w-[1440px] rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-[0_18px_55px_rgba(15,23,42,0.10)]',
        )}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4
              className={cn(
                'truncate text-sm font-medium text-foreground',
                fullscreen && 'text-lg text-slate-950',
              )}
            >
              {spec.title}
            </h4>
            <Badge
              variant="outline"
              className={cn(
                'h-5 border-border/70 px-1.5 text-[10px] font-normal text-muted-foreground',
                fullscreen && 'h-6 border-slate-200 px-2 text-xs text-slate-500',
              )}
            >
              {CHART_TYPE_LABELS[spec.type] ?? spec.type}
            </Badge>
          </div>
          {spec.description && (
            <p
              className={cn(
                'mt-0.5 line-clamp-2 text-xs text-muted-foreground',
                fullscreen && 'mt-1 max-w-4xl text-sm text-slate-500',
              )}
            >
              {spec.description}
            </p>
          )}
        </div>
        <div
          className={cn(
            'flex shrink-0 items-center gap-0.5 rounded-md border border-border/50 bg-background/40 p-0.5',
            fullscreen && 'border-slate-200 bg-slate-50',
          )}
        >
          {spec.options?.showDataZoom && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                'h-7 w-7 text-muted-foreground hover:text-foreground',
                fullscreen && 'text-slate-500 hover:bg-slate-100 hover:text-slate-950',
              )}
              aria-label="重置缩放"
              onClick={resetZoom}
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              'h-7 w-7 text-muted-foreground hover:text-foreground',
              fullscreen && 'text-slate-500 hover:bg-slate-100 hover:text-slate-950',
            )}
            aria-label={fullscreen ? '退出全屏' : '全屏查看'}
            onClick={() => void toggleFullscreen()}
          >
            {fullscreen ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>
      <EChartsCanvas
        className={cn(
          'px-1 pb-2',
          fullscreen &&
            'mx-auto mt-4 w-full max-w-[1440px] rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-[0_18px_55px_rgba(15,23,42,0.08)]',
        )}
        height={fullscreen ? 'min(760px, calc(100vh - 180px))' : chartHeight ?? 260}
        deps={[spec, activeTheme, fullscreen]}
        buildOption={(_size, chartTheme) =>
          buildEChartsOption(spec, fullscreen ? fullscreenTheme : chartTheme, {
            fullscreen,
          })
        }
        onChartReady={(chart) => {
          chartRef.current = chart
        }}
        onChartClick={handleChartClick}
      />
      {fullscreen && (
        <div className="mx-auto mt-3 w-full max-w-[1440px] text-right text-xs text-slate-500">
          Esc 退出全屏
        </div>
      )}
    </div>
  )
}
