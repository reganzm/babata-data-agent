'use client'

import { useMemo, useState } from 'react'
import {
  BarChart3,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  LineChart,
  PieChart,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { CHART_TYPE_LABELS } from '@/lib/visualization/label-utils'
import {
  buildChartFromTableSelection,
  canBuildTableChart,
  getTableChartColumnOptions,
  suggestTableChartDefaults,
  TABLE_CHART_TYPES,
  type TableChartSelection,
  type TableChartType,
} from '@/lib/visualization/table-to-chart'
import {
  copyTableToClipboard,
  downloadTableCsv,
  tableExportFilename,
} from '@/lib/visualization/table-export'
import type { TableSpec } from '@/lib/visualization/types'
import { cn } from '@/lib/utils'
import { ChartCard } from './ChartCard'

const CHART_TYPE_ICONS: Record<TableChartType, typeof LineChart> = {
  line: LineChart,
  bar: BarChart3,
  pie: PieChart,
}

interface TableDataToolbarProps {
  table: TableSpec
  compact?: boolean
  expanded: boolean
  onToggleExpanded: () => void
  showExpandToggle?: boolean
}

export function TableDataToolbar({
  table,
  compact = false,
  expanded,
  onToggleExpanded,
  showExpandToggle = true,
}: TableDataToolbarProps) {
  const defaults = useMemo(() => suggestTableChartDefaults(table), [table])
  const columnOptions = useMemo(() => getTableChartColumnOptions(table), [table])
  const canShowChart = useMemo(() => canBuildTableChart(table), [table])

  const [chartOpen, setChartOpen] = useState(true)
  const [selection, setSelection] = useState<TableChartSelection>(defaults)
  const [actionHint, setActionHint] = useState<string | null>(null)

  const chartSpec = useMemo(
    () => buildChartFromTableSelection(table, selection),
    [selection, table],
  )

  const flashHint = (message: string) => {
    setActionHint(message)
    window.setTimeout(() => setActionHint(null), 1800)
  }

  const handleCopy = async () => {
    try {
      await copyTableToClipboard(table)
      flashHint('已复制')
    } catch {
      flashHint('复制失败')
    }
  }

  const handleDownload = () => {
    downloadTableCsv(table, tableExportFilename(table))
    flashHint('已开始下载')
  }

  const updateSelection = (patch: Partial<TableChartSelection>) => {
    setSelection((current) => ({ ...current, ...patch }))
  }

  return (
    <div className="border-b border-border/50">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 sm:px-4">
        <div className="text-xs text-muted-foreground">
          明细 {table.totalRows} 行
          {table.truncated ? ` · 展示 ${table.rows.length} 行` : ''}
          {actionHint && (
            <span className="ml-2 text-primary">{actionHint}</span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => void handleCopy()}
          >
            <Copy className="h-3.5 w-3.5" />
            复制
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={handleDownload}
          >
            <Download className="h-3.5 w-3.5" />
            下载
          </Button>
          {canShowChart && (
            <Button
              type="button"
              variant={chartOpen ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={() => setChartOpen((value) => !value)}
            >
              <BarChart3 className="h-3.5 w-3.5" />
              {chartOpen ? '收起图表' : '图表'}
            </Button>
          )}
          {showExpandToggle && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs text-muted-foreground"
              onClick={onToggleExpanded}
            >
              {expanded ? '收起明细' : '展开明细'}
              {expanded ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </Button>
          )}
        </div>
      </div>

      {canShowChart && chartOpen && (
        <div className="space-y-3 border-t border-border/40 bg-muted/10 px-3 py-3 sm:px-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">图表类型</span>
            <div className="flex flex-wrap gap-1">
              {TABLE_CHART_TYPES.map((type) => {
                const Icon = CHART_TYPE_ICONS[type]
                const active = selection.chartType === type
                return (
                  <Button
                    key={type}
                    type="button"
                    size="sm"
                    variant={active ? 'secondary' : 'outline'}
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={() => updateSelection({ chartType: type })}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {CHART_TYPE_LABELS[type]}
                  </Button>
                )
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ColumnSelect
              label="维度"
              value={selection.categoryField}
              options={columnOptions.categories}
              onChange={(categoryField) => updateSelection({ categoryField })}
            />
            <ColumnSelect
              label="指标"
              value={selection.valueField}
              options={columnOptions.values}
              onChange={(valueField) => updateSelection({ valueField })}
            />
          </div>

          {chartSpec ? (
            <ChartCard spec={chartSpec} className="border-border/50 bg-card/40" />
          ) : (
            <div className="rounded-lg border border-dashed border-border/70 px-3 py-6 text-center text-xs text-muted-foreground">
              请选择有效的维度与数值指标列
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ColumnSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: { field: string; label: string }[]
  onChange: (field: string) => void
}) {
  const current = options.find((item) => item.field === value)

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            'inline-flex h-7 min-w-[120px] items-center justify-between gap-2 rounded-md border border-border/70 bg-background/70 px-2 text-xs',
            'hover:bg-muted/40',
          )}
        >
          <span className="truncate">{current?.label ?? '请选择'}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[160px]">
          {options.map((option) => (
            <DropdownMenuItem
              key={option.field}
              onClick={() => onChange(option.field)}
              className="justify-between gap-2 text-xs"
            >
              <span className="truncate">{option.label}</span>
              {option.field === value && <Check className="h-3.5 w-3.5" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
