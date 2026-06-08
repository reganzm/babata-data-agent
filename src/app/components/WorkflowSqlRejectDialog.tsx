'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  ANALYSIS_STRATEGIES,
  EMPTY_SQL_CLARIFICATION,
  formatSqlClarificationToFeedback,
  isSqlClarificationValid,
  type SqlClarification,
} from '@/lib/sql-clarification'
import { YyyyMMddRangePicker } from './YyyyMMddRangePicker'

export { EMPTY_SQL_CLARIFICATION }

interface TableMeta {
  name: string
  description?: string
}

interface ColumnMeta {
  name: string
  type: string
  description?: string
}

interface WorkflowSqlRejectDialogProps {
  open: boolean
  loading: boolean
  title?: string
  subtitle?: string
  clarification: SqlClarification
  onClarificationChange: (value: SqlClarification) => void
  onCancel: () => void
  isConfirmValid?: (clarification: SqlClarification) => boolean
  invalidHint?: string
  onConfirm: (payload: {
    feedback: string
    clarification: SqlClarification
  }) => void
}

function toggleInList(list: string[], value: string): string[] {
  return list.includes(value)
    ? list.filter((x) => x !== value)
    : [...list, value]
}

export function WorkflowSqlRejectDialog({
  open,
  loading,
  title,
  subtitle,
  clarification,
  onClarificationChange,
  onCancel,
  isConfirmValid,
  invalidHint,
  onConfirm,
}: WorkflowSqlRejectDialogProps) {
  const [tables, setTables] = useState<TableMeta[]>([])
  const [columns, setColumns] = useState<ColumnMeta[]>([])
  const [tablesLoading, setTablesLoading] = useState(false)
  const [columnsLoading, setColumnsLoading] = useState(false)
  const [tablesError, setTablesError] = useState<string | null>(null)
  const [columnsError, setColumnsError] = useState<string | null>(null)
  const [tableSearch, setTableSearch] = useState('')
  const [tablePickerOpen, setTablePickerOpen] = useState(false)

  const patch = useCallback(
    (partial: Partial<SqlClarification>) => {
      onClarificationChange({ ...clarification, ...partial })
    },
    [clarification, onClarificationChange],
  )

  const loadTables = useCallback(async () => {
    setTablesLoading(true)
    setTablesError(null)
    try {
      const res = await fetch('/api/db/tables')
      const data = (await res.json()) as {
        tables?: TableMeta[]
        error?: string
      }
      if (!res.ok) throw new Error(data.error ?? '加载表列表失败')
      setTables(data.tables ?? [])
    } catch (e) {
      setTablesError(e instanceof Error ? e.message : '加载表列表失败')
      setTables([])
    } finally {
      setTablesLoading(false)
    }
  }, [])

  const loadColumns = useCallback(async (tableName: string) => {
    if (!tableName.trim()) {
      setColumns([])
      return
    }
    setColumnsLoading(true)
    setColumnsError(null)
    try {
      const res = await fetch(
        `/api/db/tables/${encodeURIComponent(tableName)}/columns`,
      )
      const data = (await res.json()) as {
        columns?: ColumnMeta[]
        error?: string
      }
      if (!res.ok) throw new Error(data.error ?? '加载字段失败')
      setColumns(data.columns ?? [])
    } catch (e) {
      setColumnsError(e instanceof Error ? e.message : '加载字段失败')
      setColumns([])
    } finally {
      setColumnsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    void loadTables()
    setTablePickerOpen(false)
  }, [open, loadTables])

  useEffect(() => {
    if (!open || !clarification.tableName.trim()) {
      setColumns([])
      return
    }
    void loadColumns(clarification.tableName)
  }, [open, clarification.tableName, loadColumns])

  const filteredTables = useMemo(() => {
    const q = tableSearch.trim().toLowerCase()
    if (!q) return tables
    return tables.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.description?.toLowerCase().includes(q) ?? false),
    )
  }, [tables, tableSearch])

  const showTableList =
    tablePickerOpen || !clarification.tableName || tableSearch.trim().length > 0

  const selectTable = (name: string) => {
    if (name === clarification.tableName) {
      setTablePickerOpen(false)
      setTableSearch('')
      return
    }
    onClarificationChange({
      ...clarification,
      tableName: name,
      dimensions: [],
      metrics: [],
    })
    setTableSearch('')
    setTablePickerOpen(false)
  }

  if (!open) return null

  const valid = isConfirmValid
    ? isConfirmValid(clarification)
    : isSqlClarificationValid(clarification)

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sql-reject-title"
    >
      <div
        className="flex h-[min(88dvh,720px)] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-border bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-border px-4 py-2.5">
          <h3
            id="sql-reject-title"
            className="text-sm font-semibold text-foreground sm:text-base"
          >
            {title ?? '澄清分析需求并重新生成 SQL'}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {subtitle ?? '确认表、维度、时间与指标后提交（最多 3 轮）'}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
          <div className="space-y-3">
            <section>
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-medium text-foreground sm:text-sm">
                  目标表 <span className="text-destructive">*</span>
                </label>
                {clarification.tableName && !tablePickerOpen && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    disabled={loading}
                    onClick={() => setTablePickerOpen(true)}
                  >
                    更换表
                  </Button>
                )}
              </div>
              {clarification.tableName && !showTableList ? (
                <p
                  className="mt-1 truncate rounded-md border border-border bg-muted/30 px-2 py-1.5 font-mono text-xs"
                  title={clarification.tableName}
                >
                  {clarification.tableName}
                </p>
              ) : (
                <>
                  <Input
                    className="mt-1 h-8 text-sm"
                    placeholder="搜索表名…"
                    value={tableSearch}
                    onChange={(e) => setTableSearch(e.target.value)}
                    onFocus={() => setTablePickerOpen(true)}
                    disabled={loading || tablesLoading}
                  />
                  {tablesError && (
                    <p className="mt-1 text-xs text-destructive">{tablesError}</p>
                  )}
                  <div className="mt-1.5 max-h-[7rem] overflow-y-auto rounded-md border border-border">
                    {tablesLoading ? (
                      <p className="p-2 text-xs text-muted-foreground">加载中…</p>
                    ) : filteredTables.length === 0 ? (
                      <p className="p-2 text-xs text-muted-foreground">无匹配表</p>
                    ) : (
                      <ul className="divide-y divide-border">
                        {filteredTables.map((t) => (
                          <li key={t.name}>
                            <button
                              type="button"
                              className={`w-full px-2 py-1.5 text-left text-xs hover:bg-muted/60 sm:text-sm ${
                                clarification.tableName === t.name
                                  ? 'bg-primary/10 font-medium'
                                  : ''
                              }`}
                              disabled={loading}
                              onClick={() => selectTable(t.name)}
                            >
                              <span className="font-mono">{t.name}</span>
                              {t.description && (
                                <span className="mt-0.5 block truncate text-[10px] text-muted-foreground sm:text-xs">
                                  {t.description}
                                </span>
                              )}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              )}
            </section>

            {clarification.tableName && (
              <div className="grid gap-3 md:grid-cols-2">
                <section>
                  <label className="text-xs font-medium text-foreground sm:text-sm">
                    分析维度
                  </label>
                  {columnsError && (
                    <p className="text-[10px] text-destructive">{columnsError}</p>
                  )}
                  <FieldCheckboxList
                    loading={columnsLoading || loading}
                    columns={columns}
                    selected={clarification.dimensions}
                    onToggle={(name) =>
                      patch({
                        dimensions: toggleInList(clarification.dimensions, name),
                      })
                    }
                  />
                </section>

                <section>
                  <label className="text-xs font-medium text-foreground sm:text-sm">
                    待分析指标 <span className="text-destructive">*</span>
                  </label>
                  <FieldCheckboxList
                    loading={columnsLoading || loading}
                    columns={columns}
                    selected={clarification.metrics}
                    onToggle={(name) =>
                      patch({
                        metrics: toggleInList(clarification.metrics, name),
                      })
                    }
                  />
                </section>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <section className="sm:col-span-1">
                <YyyyMMddRangePicker
                  timeStart={clarification.timeStart}
                  timeEnd={clarification.timeEnd}
                  disabled={loading}
                  onChange={(range) => patch(range)}
                />
              </section>

              <section>
                <label className="text-xs font-medium text-foreground">分析策略</label>
                <select
                  className="mt-0.5 h-8 w-full rounded-md border border-border bg-background px-2 text-xs"
                  value={clarification.analysisStrategyId}
                  onChange={(e) =>
                    patch({
                      analysisStrategyId: e.target
                        .value as SqlClarification['analysisStrategyId'],
                    })
                  }
                  disabled={loading}
                >
                  <option value="">请选择…</option>
                  {ANALYSIS_STRATEGIES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </section>
            </div>

            <section>
              <label className="text-xs font-medium text-foreground">其它说明</label>
              <textarea
                className="mt-0.5 w-full resize-none rounded-md border border-border bg-background px-2 py-1.5 text-xs leading-relaxed"
                rows={2}
                value={clarification.additionalNotes}
                onChange={(e) => patch({ additionalNotes: e.target.value })}
                disabled={loading}
                placeholder="过滤条件、口径、分区字段说明等"
              />
            </section>
          </div>
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-border bg-card px-4 py-2.5 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
          {!valid && invalidHint && (
            <p className="mr-auto self-center text-xs text-warning">{invalidHint}</p>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={onCancel}
          >
            取消
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={loading || !valid}
            onClick={() =>
              onConfirm({
                feedback: formatSqlClarificationToFeedback(clarification),
                clarification,
              })
            }
          >
            {loading ? '提交中…' : '确认并重新生成'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function FieldCheckboxList({
  columns,
  selected,
  loading,
  onToggle,
}: {
  columns: ColumnMeta[]
  selected: string[]
  loading: boolean
  onToggle: (name: string) => void
}) {
  if (loading) {
    return <p className="mt-1 text-[10px] text-muted-foreground">加载字段…</p>
  }
  if (columns.length === 0) {
    return <p className="mt-1 text-[10px] text-muted-foreground">暂无字段</p>
  }
  return (
    <div className="mt-1 max-h-[5.5rem] overflow-y-auto rounded-md border border-border p-1.5 sm:max-h-[6.5rem]">
      <div className="flex flex-wrap gap-x-2 gap-y-0.5">
        {columns.map((col) => (
          <label
            key={col.name}
            className="inline-flex cursor-pointer items-center gap-1 text-[10px] sm:text-xs"
          >
            <input
              type="checkbox"
              className="size-3 rounded border-border"
              checked={selected.includes(col.name)}
              disabled={loading}
              onChange={() => onToggle(col.name)}
            />
            <span className="font-mono">{col.name}</span>
            <span className="text-muted-foreground">({col.type})</span>
          </label>
        ))}
      </div>
    </div>
  )
}
