'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { BookOpen } from 'lucide-react'
import { DataWorkspaceHeader } from '@/app/components/DataWorkspaceHeader'
import { useAuthUsername } from '@/app/components/useAuthUsername'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  CsvDataSourceManageDialog,
  DataSourceBindingDialog,
  DataSourceCreateMenu,
  DataSourceEditorDialog,
  VirtualDataSourceEditorDialog,
  emptyEditor,
  type DataSourceEditorState,
} from './DataSourceDialogs'
import {
  DATA_SOURCE_TYPE_LABELS,
  formatPublicDataSourceSummary,
  type PublicDataSourceConfig,
} from '@/lib/db/data-source-config'
import type { DataSourceType } from '@/lib/db/data-sources'

type BoundKnowledgeBaseSummary = {
  id: string
  name: string
  enabled: boolean
}

type PublicDataSource = {
  id: string
  name: string
  description: string
  type: DataSourceType
  enabled: boolean
  config: PublicDataSourceConfig
  knowledgeBaseIds: string[]
  boundKnowledgeBases: BoundKnowledgeBaseSummary[]
}

type KnowledgeBaseOption = { id: string; name: string; enabled: boolean }

export default function DataSourcesPage() {
  const username = useAuthUsername()
  const [items, setItems] = useState<PublicDataSource[]>([])
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseOption[]>([])
  const [query, setQuery] = useState('')
  const [enabledFilter, setEnabledFilter] = useState<'all' | 'on' | 'off'>('all')
  const [editor, setEditor] = useState<DataSourceEditorState | null>(null)
  const [bindingId, setBindingId] = useState<string | null>(null)
  const [selectedBindings, setSelectedBindings] = useState<string[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [dataSourceRes, knowledgeRes] = await Promise.all([
      fetch('/api/data-sources'),
      fetch('/api/knowledge-bases'),
    ])
    const dataSourceBody = (await dataSourceRes.json()) as {
      dataSources?: PublicDataSource[]
      error?: string
    }
    const knowledgeBody = (await knowledgeRes.json()) as {
      knowledgeBases?: KnowledgeBaseOption[]
      error?: string
    }
    if (!dataSourceRes.ok) throw new Error(dataSourceBody.error || '加载数据源失败')
    setItems(dataSourceBody.dataSources ?? [])
    setKnowledgeBases(knowledgeBody.knowledgeBases ?? [])
  }, [])

  useEffect(() => {
    void load().catch((item) =>
      setError(item instanceof Error ? item.message : '加载失败'),
    )
  }, [load])

  const filtered = useMemo(() => {
    return items.filter((item) => {
      const matchQuery =
        !query.trim() ||
        item.name.includes(query.trim()) ||
        item.description.includes(query.trim())
      const matchEnabled =
        enabledFilter === 'all' ||
        (enabledFilter === 'on' ? item.enabled : !item.enabled)
      return matchQuery && matchEnabled
    })
  }, [items, query, enabledFilter])

  const physicalSources = useMemo(
    () =>
      items
        .filter((item) => item.type !== 'virtual')
        .map((item) => ({
          id: item.id,
          name: item.name,
          type: item.type,
          enabled: item.enabled,
        })),
    [items],
  )

  async function saveEditor() {
    if (!editor) return
    setBusy(true)
    setError('')
    try {
      if (editor.type === 'file_csv' && !editor.id) {
        if (!editor.databaseName.trim()) throw new Error('请填写逻辑库名')
        const form = new FormData()
        form.set('name', editor.name)
        form.set('description', editor.description)
        form.set('databaseName', editor.databaseName)
        for (const file of editor.csvFiles) {
          form.append('file', file)
        }
        const res = await fetch('/api/data-sources', { method: 'POST', body: form })
        const body = (await res.json()) as { error?: string }
        if (!res.ok) throw new Error(body.error || '保存失败')
        setEditor(null)
        await load()
        return
      }

      if (editor.type === 'file_csv' && editor.id) {
        await saveCsvMeta()
        return
      }

      if (editor.type === 'virtual') {
        if (editor.virtualTables.length === 0) {
          throw new Error('请至少选择一张表')
        }
        const payload = {
          type: 'virtual' as const,
          name: editor.name,
          description: editor.description,
          enabled: editor.enabled,
          tables: editor.virtualTables.map((table) => ({
            parentDataSourceId: table.parentDataSourceId,
            tableName: table.tableName,
            exposedName: table.exposedName,
            description: table.description,
          })),
        }
        const res = await fetch(
          editor.id ? `/api/data-sources/${editor.id}` : '/api/data-sources',
          {
            method: editor.id ? 'PATCH' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          },
        )
        const body = (await res.json()) as { error?: string }
        if (!res.ok) throw new Error(body.error || '保存失败')
        setEditor(null)
        await load()
        return
      }

      const payload =
        editor.type === 'sqlite'
          ? {
              type: editor.type,
              name: editor.name,
              description: editor.description,
              enabled: editor.enabled,
              databaseName: editor.databaseName,
              filePath: editor.filePath || undefined,
            }
          : {
              type: editor.type,
              name: editor.name,
              description: editor.description,
              host: editor.host,
              port: Number(editor.port || 9030),
              user: editor.user,
              database: editor.database,
              enabled: editor.enabled,
              // 编辑时留空表示不改密码；新建时需要把空密码也传给后端（测试库允许空密码）
              ...(editor.id
                ? editor.password
                  ? { password: editor.password }
                  : {}
                : { password: editor.password }),
            }
      const res = await fetch(
        editor.id ? `/api/data-sources/${editor.id}` : '/api/data-sources',
        {
          method: editor.id ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      )
      const body = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(body.error || '保存失败')
      setEditor(null)
      await load()
    } catch (item) {
      setError(item instanceof Error ? item.message : '保存失败')
    } finally {
      setBusy(false)
    }
  }

  async function saveCsvMeta() {
    if (!editor?.id) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/data-sources/${editor.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editor.name,
          description: editor.description,
          databaseName: editor.databaseName,
        }),
      })
      const body = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(body.error || '保存失败')
      setEditor(null)
      await load()
    } catch (item) {
      setError(item instanceof Error ? item.message : '保存失败')
    } finally {
      setBusy(false)
    }
  }

  async function uploadCsvTable(file: File) {
    if (!editor?.id) return
    setBusy(true)
    setError('')
    try {
      const form = new FormData()
      form.set('file', file)
      const res = await fetch(`/api/data-sources/${editor.id}/csv-tables`, {
        method: 'POST',
        body: form,
      })
      const body = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(body.error || '上传失败')
      await load()
    } catch (item) {
      setError(item instanceof Error ? item.message : '上传失败')
    } finally {
      setBusy(false)
    }
  }

  async function deleteCsvTable(tableName: string) {
    if (!editor?.id) return
    if (!confirm(`确定删除表 ${tableName}？`)) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch(
        `/api/data-sources/${editor.id}/csv-tables?tableName=${encodeURIComponent(tableName)}`,
        { method: 'DELETE' },
      )
      const body = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(body.error || '删除失败')
      await load()
    } catch (item) {
      setError(item instanceof Error ? item.message : '删除失败')
    } finally {
      setBusy(false)
    }
  }

  const editingCsvItem =
    editor?.id && editor.type === 'file_csv'
      ? items.find((item) => item.id === editor.id && item.config.kind === 'csv')
      : null

  async function runSourceAction(
    path: string,
    method: 'PATCH' | 'POST' | 'DELETE' | 'PUT',
    body?: unknown,
  ) {
    const res = await fetch(path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) {
      const payload = (await res.json()) as { error?: string }
      throw new Error(payload.error || '操作失败')
    }
  }

  return (
    <main className="flex min-h-screen flex-col bg-background">
      <DataWorkspaceHeader username={username} />
      <section className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
        <DataSourceToolbar
          query={query}
          enabledFilter={enabledFilter}
          onQueryChange={setQuery}
          onEnabledFilterChange={setEnabledFilter}
          onCreate={(type) => setEditor(emptyEditor(type))}
        />
        {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}
        <DataSourceList
          items={filtered}
          onToggle={(item) =>
            void runSourceAction(`/api/data-sources/${item.id}`, 'PATCH', {
              enabled: !item.enabled,
            })
              .then(load)
              .catch((itemError) =>
                setError(itemError instanceof Error ? itemError.message : '更新失败'),
              )
          }
          onTest={(id) => {
            setBusy(true)
            void runSourceAction(`/api/data-sources/${id}/test`, 'POST')
              .then(() => alert('连接成功'))
              .catch((itemError) =>
                setError(itemError instanceof Error ? itemError.message : '连接失败'),
              )
              .finally(() => setBusy(false))
          }}
          onBind={(item) => {
            setBindingId(item.id)
            setSelectedBindings(item.knowledgeBaseIds)
          }}
          onEdit={(item) => {
            const next = emptyEditor(item.type)
            next.id = item.id
            next.name = item.name
            next.description = item.description
            next.enabled = item.enabled
            if (item.config.kind === 'sql_engine') {
              next.host = item.config.host
              next.port = String(item.config.port)
              next.user = item.config.user
              next.database = item.config.database
            } else if (item.config.kind === 'sqlite') {
              next.databaseName = item.config.databaseName
              next.filePath = item.config.filePath
            } else if (item.config.kind === 'csv') {
              next.databaseName = item.config.databaseName
            } else if (item.config.kind === 'virtual') {
              next.virtualTables = item.config.tables.map((table) => ({
                parentDataSourceId: table.parentDataSourceId,
                parentDataSourceName: table.parentDataSourceName,
                parentDataSourceType: table.parentDataSourceType,
                tableName: table.tableName,
                exposedName: table.exposedName,
                description: table.description,
              }))
            }
            setEditor(next)
          }}
          onDelete={(id) => {
            if (!confirm('确定删除该数据源？绑定会一并解除。')) return
            void runSourceAction(`/api/data-sources/${id}`, 'DELETE')
              .then(load)
              .catch((itemError) =>
                setError(itemError instanceof Error ? itemError.message : '删除失败'),
              )
          }}
        />
      </section>
      {editor && editor.type === 'file_csv' && editor.id ? (
        <CsvDataSourceManageDialog
          editor={editor}
          tables={editingCsvItem?.config.kind === 'csv' ? editingCsvItem.config.tables : []}
          busy={busy}
          onChange={setEditor}
          onClose={() => setEditor(null)}
          onSaveMeta={() => void saveCsvMeta()}
          onUploadCsv={(file) => void uploadCsvTable(file)}
          onDeleteTable={(tableName) => void deleteCsvTable(tableName)}
        />
      ) : editor && editor.type === 'virtual' ? (
        <VirtualDataSourceEditorDialog
          editor={editor}
          physicalSources={physicalSources}
          busy={busy}
          onChange={setEditor}
          onClose={() => setEditor(null)}
          onSave={() => void saveEditor()}
        />
      ) : editor ? (
        <DataSourceEditorDialog
          editor={editor}
          busy={busy}
          onChange={setEditor}
          onClose={() => setEditor(null)}
          onSave={() => void saveEditor()}
        />
      ) : null}
      {bindingId ? (
        <DataSourceBindingDialog
          knowledgeBases={knowledgeBases}
          selectedBindings={selectedBindings}
          busy={busy}
          onToggle={(id, checked) =>
            setSelectedBindings((current) =>
              checked ? [...current, id] : current.filter((item) => item !== id),
            )
          }
          onClose={() => setBindingId(null)}
          onSave={() => {
            setBusy(true)
            void runSourceAction(`/api/data-sources/${bindingId}/bindings`, 'PUT', {
              knowledgeBaseIds: selectedBindings,
            })
              .then(() => {
                setBindingId(null)
                return load()
              })
              .catch((itemError) =>
                setError(itemError instanceof Error ? itemError.message : '绑定失败'),
              )
              .finally(() => setBusy(false))
          }}
        />
      ) : null}
    </main>
  )
}

function DataSourceToolbar(props: {
  query: string
  enabledFilter: 'all' | 'on' | 'off'
  onQueryChange: (value: string) => void
  onEnabledFilterChange: (value: 'all' | 'on' | 'off') => void
  onCreate: (type: DataSourceType) => void
}) {
  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">数据源</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            支持 Doris、MySQL、ClickHouse、StarRocks、CSV、SQLite 与虚拟数据源。密码加密存储，接口不回传明文。
          </p>
        </div>
        <DataSourceCreateMenu onCreate={props.onCreate} />
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <Input
          value={props.query}
          onChange={(event) => props.onQueryChange(event.target.value)}
          placeholder="搜索名称或说明"
          className="max-w-xs"
        />
        <select
          value={props.enabledFilter}
          onChange={(event) =>
            props.onEnabledFilterChange(event.target.value as 'all' | 'on' | 'off')
          }
          className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
        >
          <option value="all">全部状态</option>
          <option value="on">已启用</option>
          <option value="off">已停用</option>
        </select>
      </div>
    </>
  )
}

function DataSourceList(props: {
  items: PublicDataSource[]
  onToggle: (item: PublicDataSource) => void
  onTest: (id: string) => void
  onBind: (item: PublicDataSource) => void
  onEdit: (item: PublicDataSource) => void
  onDelete: (id: string) => void
}) {
  if (props.items.length === 0) {
    return <p className="text-sm text-muted-foreground">还没有数据源，先新建一个连接。</p>
  }
  return (
    <div className="space-y-3">
      {props.items.map((item) => {
        const boundKnowledgeBases = item.boundKnowledgeBases ?? []
        return (
        <article
          key={item.id}
          className="rounded-xl border border-border bg-card p-4 shadow-[0_0_24px_-16px_var(--neon-cyan-glow)]"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="font-medium">{item.name}</h3>
                <Badge variant={item.enabled ? 'default' : 'secondary'}>
                  {item.enabled ? '启用' : '停用'}
                </Badge>
                <Badge variant="outline">
                  {DATA_SOURCE_TYPE_LABELS[item.type] ?? item.type}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {item.description || '无说明'} ·{' '}
                {formatPublicDataSourceSummary(item.type, item.config)}
              </p>
              <div className="mt-3 rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5">
                <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                  <BookOpen className="h-3.5 w-3.5 text-primary" />
                  绑定的 RAG 知识库
                  <span className="font-normal text-muted-foreground">
                    （{boundKnowledgeBases.length} 个）
                  </span>
                </div>
                {boundKnowledgeBases.length > 0 ? (
                  <ul className="mt-2 space-y-1.5">
                    {boundKnowledgeBases.map((knowledgeBase) => (
                      <li
                        key={knowledgeBase.id}
                        className="flex items-center justify-between gap-2 text-sm"
                      >
                        <span className="truncate">{knowledgeBase.name}</span>
                        <Badge
                          variant={knowledgeBase.enabled ? 'secondary' : 'outline'}
                          className="shrink-0 font-normal"
                        >
                          {knowledgeBase.enabled ? '已启用' : '已停用'}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">
                    尚未绑定知识库，达克斯问数时无法自动检索业务口径。
                  </p>
                )}
                {item.config.kind === 'sql_engine' && item.config.passwordSet ? (
                  <p className="mt-2 text-xs text-muted-foreground">密码已设置</p>
                ) : null}
                {item.config.kind === 'csv' ? (
                  <div className="mt-2 space-y-1">
                    {item.config.tables.length > 0 ? (
                      item.config.tables.map((table) => (
                        <p key={table.tableName} className="text-xs text-muted-foreground">
                          {item.config.kind === 'csv' ? item.config.databaseName : ''}.
                          {table.tableName} · {table.originalFilename} · {table.rowCount} 行
                        </p>
                      ))
                    ) : (
                      <p className="text-xs text-muted-foreground">库内还没有 CSV 表</p>
                    )}
                  </div>
                ) : null}
                {item.config.kind === 'virtual' ? (
                  <div className="mt-2 space-y-2">
                    {item.config.tables.length > 0 ? (
                      Object.entries(
                        item.config.tables.reduce<
                          Record<string, typeof item.config.tables>
                        >((groups, table) => {
                          const key = table.parentDataSourceName
                          groups[key] = groups[key] ?? []
                          groups[key].push(table)
                          return groups
                        }, {}),
                      ).map(([parentName, tables]) => (
                        <div key={parentName}>
                          <p className="text-xs font-medium text-foreground">{parentName}</p>
                          <ul className="mt-1 space-y-0.5">
                            {tables.map((table) => (
                              <li
                                key={`${table.parentDataSourceId}:${table.exposedName}`}
                                className="text-xs text-muted-foreground"
                              >
                                {table.exposedName}
                                {table.exposedName !== table.tableName
                                  ? ` ← ${table.tableName}`
                                  : ''}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-muted-foreground">还没有绑定任何表</p>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => props.onToggle(item)}>
                {item.enabled ? '停用' : '启用'}
              </Button>
              <Button variant="outline" size="sm" onClick={() => props.onTest(item.id)}>
                测试连接
              </Button>
              <Button variant="outline" size="sm" onClick={() => props.onBind(item)}>
                绑定知识库
              </Button>
              <Button variant="outline" size="sm" onClick={() => props.onEdit(item)}>
                编辑
              </Button>
              <Button variant="destructive" size="sm" onClick={() => props.onDelete(item.id)}>
                删除
              </Button>
            </div>
          </div>
        </article>
        )
      })}
    </div>
  )
}
