'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Calendar } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DATE_RANGE_PRESETS,
  dateInputValueToYyyyMMdd,
  formatYyyyMMddRangeLabel,
  getDateRangePreset,
  isValidYyyyMMdd,
  yyyyMMddToDateInputValue,
  type DateRangePresetId,
} from '@/lib/sql-clarification'

interface YyyyMMddRangePickerProps {
  timeStart: string
  timeEnd: string
  disabled?: boolean
  onChange: (range: { timeStart: string; timeEnd: string }) => void
}

export function YyyyMMddRangePicker({
  timeStart,
  timeEnd,
  disabled,
  onChange,
}: YyyyMMddRangePickerProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const listId = useId()

  const label = formatYyyyMMddRangeLabel(timeStart, timeEnd)
  const invalid =
    (timeStart.length > 0 && !isValidYyyyMMdd(timeStart)) ||
    (timeEnd.length > 0 && !isValidYyyyMMdd(timeEnd)) ||
    (isValidYyyyMMdd(timeStart) &&
      isValidYyyyMMdd(timeEnd) &&
      timeStart > timeEnd)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const applyPreset = (id: DateRangePresetId) => {
    onChange(getDateRangePreset(id))
    setOpen(false)
  }

  const applyCustom = (isoStart: string, isoEnd: string) => {
    const nextStart = dateInputValueToYyyyMMdd(isoStart)
    const nextEnd = dateInputValueToYyyyMMdd(isoEnd)
    onChange({ timeStart: nextStart, timeEnd: nextEnd })
    if (
      isValidYyyyMMdd(nextStart) &&
      isValidYyyyMMdd(nextEnd) &&
      nextStart <= nextEnd
    ) {
      setOpen(false)
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <label className="text-xs font-medium text-foreground">时间范围</label>
      <button
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={listId}
        className="mt-0.5 flex h-8 w-full items-center justify-between gap-2 rounded-md border border-border bg-background px-2 text-left text-xs disabled:opacity-50"
        onClick={() => setOpen((v) => !v)}
      >
        <span
          className={`truncate font-mono tracking-wide ${label ? 'text-foreground' : 'text-muted-foreground'}`}
        >
          {label || '点击选择 yyyyMMdd 范围'}
        </span>
        <Calendar className="size-3.5 shrink-0 text-muted-foreground" />
      </button>

      {invalid && (
        <p className="mt-0.5 text-[10px] text-destructive">
          请选择有效日期范围，且开始日期不能晚于结束日期
        </p>
      )}

      {open && (
        <div
          id={listId}
          role="dialog"
          className="absolute left-0 right-0 z-50 mt-1 rounded-md border border-border bg-popover p-2 shadow-lg sm:right-auto sm:min-w-[18rem]"
        >
          <p className="mb-1.5 text-[10px] text-muted-foreground">
            快捷选择（一次设置起止日期）
          </p>
          <div className="flex flex-wrap gap-1">
            {DATE_RANGE_PRESETS.map((p) => (
              <Button
                key={p.id}
                type="button"
                variant="secondary"
                size="sm"
                className="h-7 px-2 text-[10px]"
                disabled={disabled}
                onClick={() => applyPreset(p.id)}
              >
                {p.label}
              </Button>
            ))}
          </div>

          <p className="mb-1 mt-2 text-[10px] text-muted-foreground">自定义范围</p>
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-1 text-xs"
              disabled={disabled}
              value={yyyyMMddToDateInputValue(timeStart)}
              onChange={(e) =>
                applyCustom(e.target.value, yyyyMMddToDateInputValue(timeEnd))
              }
            />
            <span className="shrink-0 text-xs text-muted-foreground">至</span>
            <input
              type="date"
              className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-1 text-xs"
              disabled={disabled}
              value={yyyyMMddToDateInputValue(timeEnd)}
              onChange={(e) =>
                applyCustom(yyyyMMddToDateInputValue(timeStart), e.target.value)
              }
            />
          </div>
          {isValidYyyyMMdd(timeStart) && isValidYyyyMMdd(timeEnd) && (
            <p className="mt-1.5 text-center font-mono text-[10px] text-muted-foreground">
              {timeStart} ~ {timeEnd}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
