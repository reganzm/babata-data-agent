'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  buildTableEChartsOption,
  estimateTableCanvasHeight,
} from '@/lib/visualization/chart-options'
import {
  resolveInitialTableDetailsExpanded,
  shouldApplyInitialTableExpansion,
} from '@/lib/visualization/table-detail-expansion'
import type { TableSpec } from '@/lib/visualization/types'
import { cn } from '@/lib/utils'
import { EChartsCanvas } from './EChartsCanvas'
import { TableDataToolbar } from './TableDataToolbar'

interface EChartsTablePanelProps {
  table: TableSpec
  className?: string
  defaultExpanded?: boolean
  /** 内联 Markdown 表格等场景：不显示折叠栏 */
  compact?: boolean
}

export function EChartsTablePanel({
  table,
  className,
  defaultExpanded,
  compact = false,
}: EChartsTablePanelProps) {
  const shouldStartExpanded = useMemo(
    () =>
      resolveInitialTableDetailsExpanded({
        defaultExpanded,
      }),
    [defaultExpanded],
  )
  const [expanded, setExpanded] = useState(shouldStartExpanded)
  const userHasToggledDetailsRef = useRef(false)
  const toggleExpanded = useCallback(() => {
    userHasToggledDetailsRef.current = true
    setExpanded((value) => !value)
  }, [])
  useEffect(() => {
    if (
      shouldApplyInitialTableExpansion({
        shouldStartExpanded,
        userHasToggledDetails: userHasToggledDetailsRef.current,
      })
    ) {
      setExpanded(true)
    }
  }, [shouldStartExpanded])
  const canvasHeight = useMemo(
    () => estimateTableCanvasHeight(table),
    [table],
  )

  const buildOption = useCallback(
    (
      size: { width: number; height: number },
      theme: Parameters<typeof buildTableEChartsOption>[1],
    ) => buildTableEChartsOption(table, theme, size.width, canvasHeight),
    [table, canvasHeight],
  )

  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border border-border/60 bg-viz-surface',
        className,
      )}
    >
      <TableDataToolbar
        table={table}
        compact={compact}
        expanded={expanded}
        onToggleExpanded={toggleExpanded}
        showExpandToggle
      />

      {expanded && (
        <div
          className={cn(
            'overflow-auto',
            compact ? '' : 'max-h-[420px]',
          )}
        >
          <EChartsCanvas
            height={canvasHeight}
            deps={[table, canvasHeight]}
            buildOption={buildOption}
          />
        </div>
      )}
    </div>
  )
}
