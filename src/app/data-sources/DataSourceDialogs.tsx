'use client'

import { useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  DATA_SOURCE_TYPE_LABELS,
  DEFAULT_SQL_ENGINE_PORTS,
  type DataSourceType,
} from '@/lib/db/data-source-config'
import { suggestVirtualExposedName } from '@/lib/db/virtual-source-sql'

export type VirtualTableEditorBinding = {
  parentDataSourceId: string
  parentDataSourceName: string
  parentDataSourceType: DataSourceType
  tableName: string
  exposedName: string
  description?: string
}

export type DataSourceEditorState = {
  id?: string
  type: DataSourceType
  name: string
  description: string
  host: string
  port: string
  user: string
  password: string
  database: string
  databaseName: string
  filePath: string
  tableName: string
  csvFiles: File[]
  virtualTables: VirtualTableEditorBinding[]
  enabled: boolean
}

type PhysicalDataSourceOption = {
  id: string
  name: string
  type: DataSourceType
  enabled: boolean
}

type KnowledgeBaseOption = { id: string; name: string; enabled: boolean }

export const CREATEABLE_DATA_SOURCE_TYPES: DataSourceType[] = [
  'doris',
  'mysql',
  'clickhouse',
  'starrocks',
  'file_csv',
  'sqlite',
]

export function emptyEditor(type: DataSourceType = 'doris'): DataSourceEditorState {
  const defaultPort = isSqlEngineDefaultPort(type)
    ? String(DEFAULT_SQL_ENGINE_PORTS[type])
    : ''
  return {
    type,
    name: '',
    description: '',
    host: '',
    port: defaultPort,
    user: '',
    password: '',
    database: '',
    databaseName: '',
    filePath: '',
    tableName: '',
    csvFiles: [],
    virtualTables: [],
    enabled: true,
  }
}

function isSqlEngineDefaultPort(
  type: DataSourceType,
): type is keyof typeof DEFAULT_SQL_ENGINE_PORTS {
  return type in DEFAULT_SQL_ENGINE_PORTS
}

export function DataSourceCreateMenu(props: {
  onCreate: (type: DataSourceType) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex h-8 items-center justify-center gap-1 rounded-lg bg-primary px-3 text-sm text-primary-foreground shadow-xs hover:bg-primary/90">
        新建数据源
        <ChevronDown className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[180px]">
        <DropdownMenuItem onClick={() => props.onCreate('virtual')}>
          虚拟数据源
        </DropdownMenuItem>
        {CREATEABLE_DATA_SOURCE_TYPES.map((type) => (
          <DropdownMenuItem key={type} onClick={() => props.onCreate(type)}>
            {DATA_SOURCE_TYPE_LABELS[type]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function DataSourceEditorDialog(props: {
  editor: DataSourceEditorState
  busy: boolean
  onChange: (next: DataSourceEditorState) => void
  onClose: () => void
  onSave: () => void
}) {
  const { editor, busy, onChange, onClose, onSave } = props
  const isSqlEngine =
    editor.type !== 'file_csv' && editor.type !== 'sqlite' && editor.type !== 'virtual'
  const isSqlite = editor.type === 'sqlite'
  const isCsv = editor.type === 'file_csv'

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-2xl border border-border bg-card p-5">
        <h3 className="mb-4 text-lg font-medium">
          {editor.id
            ? `编辑${DATA_SOURCE_TYPE_LABELS[editor.type]}数据源`
            : `新建${DATA_SOURCE_TYPE_LABELS[editor.type]}数据源`}
        </h3>
        <div className="grid gap-3">
          <Input
            value={editor.name}
            onChange={(event) => onChange({ ...editor, name: event.target.value })}
            placeholder="名称"
          />
          <Input
            value={editor.description}
            onChange={(event) =>
              onChange({ ...editor, description: event.target.value })
            }
            placeholder="说明"
          />
          {isSqlEngine ? (
            <>
              <div className="grid grid-cols-3 gap-2">
                <Input
                  className="col-span-2"
                  value={editor.host}
                  onChange={(event) => onChange({ ...editor, host: event.target.value })}
                  placeholder="主机"
                />
                <Input
                  value={editor.port}
                  onChange={(event) => onChange({ ...editor, port: event.target.value })}
                  placeholder="端口"
                />
              </div>
              <Input
                value={editor.user}
                onChange={(event) => onChange({ ...editor, user: event.target.value })}
                placeholder="用户"
              />
              <Input
                type="password"
                value={editor.password}
                onChange={(event) =>
                  onChange({ ...editor, password: event.target.value })
                }
                placeholder={editor.id ? '留空则不改密码' : '密码'}
              />
              <Input
                value={editor.database}
                onChange={(event) =>
                  onChange({ ...editor, database: event.target.value })
                }
                placeholder="数据库"
              />
            </>
          ) : null}
          {isSqlite ? (
            <>
              <Input
                value={editor.databaseName}
                onChange={(event) =>
                  onChange({ ...editor, databaseName: event.target.value })
                }
                placeholder="逻辑库名"
              />
              <Input
                value={editor.filePath}
                onChange={(event) =>
                  onChange({ ...editor, filePath: event.target.value })
                }
                placeholder="SQLite 文件路径（留空自动创建）"
              />
            </>
          ) : null}
          {isCsv && !editor.id ? (
            <>
              <Input
                value={editor.databaseName}
                onChange={(event) =>
                  onChange({ ...editor, databaseName: event.target.value })
                }
                placeholder="逻辑库名（例如 brand）"
              />
              <label className="flex cursor-pointer flex-col gap-1 rounded-lg border border-dashed border-border px-3 py-3 text-sm">
                <span className="font-medium">上传 CSV 文件（可选，可多选）</span>
                <span className="text-xs text-muted-foreground">
                  {editor.csvFiles.length > 0
                    ? editor.csvFiles.map((file) => file.name).join('、')
                    : '表名自动取文件名（不含 .csv），首行作为表头'}
                </span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  multiple
                  className="hidden"
                  onChange={(event) =>
                    onChange({
                      ...editor,
                      csvFiles: [...(event.target.files ?? [])],
                    })
                  }
                />
              </label>
            </>
          ) : null}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button disabled={busy} onClick={onSave}>
            保存
          </Button>
        </div>
      </div>
    </div>
  )
}

export function VirtualDataSourceEditorDialog(props: {
  editor: DataSourceEditorState
  physicalSources: PhysicalDataSourceOption[]
  busy: boolean
  onChange: (next: DataSourceEditorState) => void
  onClose: () => void
  onSave: () => void
}) {
  const { editor, physicalSources, busy, onChange, onClose, onSave } = props
  const [parentId, setParentId] = useState('')
  const [loadedTables, setLoadedTables] = useState<
    Array<{ name: string; description?: string }>
  >([])
  const [selectedTableNames, setSelectedTableNames] = useState<string[]>([])
  const [tableSearchQuery, setTableSearchQuery] = useState('')
  const [loadError, setLoadError] = useState('')

  const enabledParents = physicalSources.filter((item) => item.enabled)

  const filteredLoadedTables = useMemo(() => {
    const query = tableSearchQuery.trim().toLowerCase()
    if (!query) return loadedTables
    return loadedTables.filter(
      (table) =>
        table.name.toLowerCase().includes(query) ||
        table.description?.toLowerCase().includes(query),
    )
  }, [loadedTables, tableSearchQuery])

  async function loadParentTables() {
    if (!parentId) return
    setLoadError('')
    setLoadedTables([])
    setSelectedTableNames([])
    setTableSearchQuery('')
    try {
      const res = await fetch(`/api/data-sources/${parentId}/tables`)
      const body = (await res.json()) as {
        tables?: Array<{ name: string; description?: string }>
        error?: string
      }
      if (!res.ok) throw new Error(body.error || '加载表失败')
      setLoadedTables(body.tables ?? [])
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '加载表失败')
    }
  }

  function addSelectedTables() {
    const parent = enabledParents.find((item) => item.id === parentId)
    if (!parent || selectedTableNames.length === 0) return
    const existingNames = new Set(editor.virtualTables.map((item) => item.exposedName))
    const nextTables = [...editor.virtualTables]
    for (const tableName of selectedTableNames) {
      const exposedName = suggestVirtualExposedName({
        parentName: parent.name,
        tableName,
        existingExposedNames: [...existingNames],
      })
      existingNames.add(exposedName)
      const sourceTable = loadedTables.find((item) => item.name === tableName)
      nextTables.push({
        parentDataSourceId: parent.id,
        parentDataSourceName: parent.name,
        parentDataSourceType: parent.type,
        tableName,
        exposedName,
        description: sourceTable?.description,
      })
    }
    onChange({ ...editor, virtualTables: nextTables })
    setSelectedTableNames([])
  }

  function removeTable(exposedName: string) {
    onChange({
      ...editor,
      virtualTables: editor.virtualTables.filter(
        (item) => item.exposedName !== exposedName,
      ),
    })
  }

  function updateExposedName(currentName: string, nextName: string) {
    onChange({
      ...editor,
      virtualTables: editor.virtualTables.map((item) =>
        item.exposedName === currentName
          ? { ...item, exposedName: nextName.trim() }
          : item,
      ),
    })
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-2xl border border-border bg-card p-5">
        <h3 className="mb-4 text-lg font-medium">
          {editor.id ? '编辑虚拟数据源' : '新建虚拟数据源'}
        </h3>
        <div className="grid gap-3">
          <Input
            value={editor.name}
            onChange={(event) => onChange({ ...editor, name: event.target.value })}
            placeholder="名称，例如 语音房业务域"
          />
          <Input
            value={editor.description}
            onChange={(event) =>
              onChange({ ...editor, description: event.target.value })
            }
            placeholder="说明"
          />
        </div>

        <div className="mt-5 rounded-lg border border-border/70 bg-muted/20 p-3">
          <p className="text-sm font-medium">已选表（{editor.virtualTables.length}）</p>
          {editor.virtualTables.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {editor.virtualTables.map((table) => (
                <li
                  key={`${table.parentDataSourceId}:${table.tableName}:${table.exposedName}`}
                  className="grid gap-2 rounded-lg bg-background/80 p-3 md:grid-cols-[1fr_1fr_auto]"
                >
                  <div className="min-w-0 text-sm">
                    <p className="font-medium">{table.parentDataSourceName}</p>
                    <p className="text-xs text-muted-foreground">
                      原表 {table.tableName}
                    </p>
                  </div>
                  <Input
                    value={table.exposedName}
                    onChange={(event) =>
                      updateExposedName(table.exposedName, event.target.value)
                    }
                    placeholder="暴露表名"
                  />
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => removeTable(table.exposedName)}
                  >
                    移除
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              还没有选择表。请先从物理数据源加载并勾选表。
            </p>
          )}
        </div>

        <div className="mt-5 rounded-lg border border-border/70 bg-muted/20 p-3">
          <p className="text-sm font-medium">从物理数据源添加表</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <select
              value={parentId}
              onChange={(event) => {
                setParentId(event.target.value)
                setTableSearchQuery('')
                setLoadedTables([])
                setSelectedTableNames([])
              }}
              className="h-8 min-w-[220px] rounded-lg border border-input bg-transparent px-2 text-sm"
            >
              <option value="">选择父数据源</option>
              {enabledParents.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({DATA_SOURCE_TYPE_LABELS[item.type]})
                </option>
              ))}
            </select>
            <Button variant="outline" size="sm" disabled={!parentId || busy} onClick={() => void loadParentTables()}>
              加载表
            </Button>
            <Button
              size="sm"
              disabled={selectedTableNames.length === 0 || busy}
              onClick={addSelectedTables}
            >
              添加所选
            </Button>
          </div>
          {loadError ? (
            <p className="mt-2 text-xs text-destructive">{loadError}</p>
          ) : null}
          {loadedTables.length > 0 ? (
            <div className="mt-3 space-y-2">
              <Input
                value={tableSearchQuery}
                onChange={(event) => setTableSearchQuery(event.target.value)}
                placeholder="搜索表名或说明"
                className="h-8"
              />
              <p className="text-xs text-muted-foreground">
                显示 {filteredLoadedTables.length} / {loadedTables.length} 张表
                {selectedTableNames.length > 0
                  ? ` · 已选 ${selectedTableNames.length} 张`
                  : ''}
              </p>
              <div className="max-h-56 space-y-1 overflow-auto rounded-lg border border-border/60 bg-background/70 p-2">
                {filteredLoadedTables.length > 0 ? (
                  filteredLoadedTables.map((table) => (
                    <label
                      key={table.name}
                      className="flex items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/40"
                    >
                      <input
                        type="checkbox"
                        checked={selectedTableNames.includes(table.name)}
                        onChange={(event) =>
                          setSelectedTableNames((current) =>
                            event.target.checked
                              ? [...current, table.name]
                              : current.filter((name) => name !== table.name),
                          )
                        }
                      />
                      <span className="min-w-0 break-all">
                        <span className="font-medium">{table.name}</span>
                        {table.description ? (
                          <span className="ml-2 text-xs text-muted-foreground">
                            {table.description}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  ))
                ) : (
                  <p className="px-2 py-3 text-xs text-muted-foreground">
                    没有匹配的表，请调整搜索关键词。
                  </p>
                )}
              </div>
            </div>
          ) : null}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button disabled={busy} onClick={onSave}>
            保存
          </Button>
        </div>
      </div>
    </div>
  )
}

export function CsvDataSourceManageDialog(props: {
  editor: DataSourceEditorState
  tables: Array<{
    tableName: string
    rowCount: number
    originalFilename: string
  }>
  busy: boolean
  onChange: (next: DataSourceEditorState) => void
  onClose: () => void
  onSaveMeta: () => void
  onUploadCsv: (file: File) => void
  onDeleteTable: (tableName: string) => void
}) {
  const { editor, tables, busy, onChange, onClose, onSaveMeta, onUploadCsv, onDeleteTable } =
    props

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl border border-border bg-card p-5">
        <h3 className="mb-4 text-lg font-medium">管理 CSV 数据源</h3>
        <div className="grid gap-3">
          <Input
            value={editor.name}
            onChange={(event) => onChange({ ...editor, name: event.target.value })}
            placeholder="名称"
          />
          <Input
            value={editor.description}
            onChange={(event) =>
              onChange({ ...editor, description: event.target.value })
            }
            placeholder="说明"
          />
          <Input
            value={editor.databaseName}
            onChange={(event) =>
              onChange({ ...editor, databaseName: event.target.value })
            }
            placeholder="逻辑库名"
          />
        </div>

        <div className="mt-5 rounded-lg border border-border/70 bg-muted/20 p-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-sm font-medium">库内 CSV 表（{tables.length}）</p>
            <label className="inline-flex h-7 cursor-pointer items-center rounded-lg border border-border px-2.5 text-[0.8rem]">
              继续上传 CSV
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) onUploadCsv(file)
                  event.target.value = ''
                }}
              />
            </label>
          </div>
          {tables.length > 0 ? (
            <ul className="space-y-2">
              {tables.map((table) => (
                <li
                  key={table.tableName}
                  className="flex items-center justify-between gap-3 rounded-lg bg-background/80 px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{table.tableName}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {table.originalFilename} · {table.rowCount} 行
                    </p>
                  </div>
                  <Button
                    variant="destructive"
                    size="xs"
                    disabled={busy}
                    onClick={() => onDeleteTable(table.tableName)}
                  >
                    删除
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">
              还没有 CSV 表。上传后表名会自动取文件名（不含 .csv）。
            </p>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            关闭
          </Button>
          <Button disabled={busy} onClick={onSaveMeta}>
            保存基本信息
          </Button>
        </div>
      </div>
    </div>
  )
}

export function DataSourceBindingDialog(props: {
  knowledgeBases: KnowledgeBaseOption[]
  selectedBindings: string[]
  busy: boolean
  onToggle: (id: string, checked: boolean) => void
  onClose: () => void
  onSave: () => void
}) {
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-5">
        <h3 className="mb-4 text-lg font-medium">绑定知识库</h3>
        <div className="max-h-72 space-y-2 overflow-auto">
          {props.knowledgeBases.map((item) => (
            <label key={item.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={props.selectedBindings.includes(item.id)}
                onChange={(event) => props.onToggle(item.id, event.target.checked)}
              />
              <span>{item.name}</span>
              {!item.enabled ? (
                <span className="text-xs text-muted-foreground">已停用</span>
              ) : null}
            </label>
          ))}
          {props.knowledgeBases.length === 0 ? (
            <p className="text-sm text-muted-foreground">请先创建知识库。</p>
          ) : null}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={props.onClose}>
            取消
          </Button>
          <Button disabled={props.busy} onClick={props.onSave}>
            保存绑定
          </Button>
        </div>
      </div>
    </div>
  )
}
