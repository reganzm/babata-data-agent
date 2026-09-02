'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Database } from 'lucide-react'
import { DataWorkspaceHeader } from '@/app/components/DataWorkspaceHeader'
import { useAuthUsername } from '@/app/components/useAuthUsername'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
type KnowledgeDocument = {
  id: string
  filename: string
  parseStatus: string
  parseError: string | null
}

type BoundDataSourceSummary = {
  id: string
  name: string
  enabled: boolean
  type: string
}

type KnowledgeBaseRecord = {
  id: string
  name: string
  description: string
  enabled: boolean
  sourceType: string
  documents: KnowledgeDocument[]
  boundDataSources: BoundDataSourceSummary[]
}

export default function KnowledgeBasesPage() {
  const username = useAuthUsername()
  const [items, setItems] = useState<KnowledgeBaseRecord[]>([])
  const [query, setQuery] = useState('')
  const [enabledFilter, setEnabledFilter] = useState<'all' | 'on' | 'off'>('all')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch('/api/knowledge-bases')
    const body = (await res.json()) as {
      knowledgeBases?: KnowledgeBaseRecord[]
      error?: string
    }
    if (!res.ok) throw new Error(body.error || '加载知识库失败')
    setItems(body.knowledgeBases ?? [])
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

  async function createItem() {
    if (!name.trim()) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/knowledge-bases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description }),
      })
      const body = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(body.error || '创建失败')
      setName('')
      setDescription('')
      await load()
    } catch (item) {
      setError(item instanceof Error ? item.message : '创建失败')
    } finally {
      setBusy(false)
    }
  }

  async function toggleEnabled(item: KnowledgeBaseRecord) {
    const res = await fetch(`/api/knowledge-bases/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !item.enabled }),
    })
    if (!res.ok) {
      const body = (await res.json()) as { error?: string }
      setError(body.error || '更新失败')
      return
    }
    await load()
  }

  async function removeItem(id: string) {
    if (!confirm('确定删除该知识库？文档与绑定会一并删除。')) return
    const res = await fetch(`/api/knowledge-bases/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const body = (await res.json()) as { error?: string }
      setError(body.error || '删除失败')
      return
    }
    await load()
  }

  async function uploadMarkdownFiles(knowledgeBaseId: string, files: File[]) {
    if (files.length === 0) return
    setBusy(true)
    setError('')
    const failures: string[] = []
    try {
      for (const file of files) {
        const form = new FormData()
        form.set('file', file)
        const res = await fetch(`/api/knowledge-bases/${knowledgeBaseId}/documents`, {
          method: 'POST',
          body: form,
        })
        const body = (await res.json()) as { error?: string }
        if (!res.ok) {
          failures.push(`${file.name}: ${body.error || '上传失败'}`)
        }
      }
      await load()
      if (failures.length > 0) {
        setError(failures.join('；'))
      }
    } catch (item) {
      setError(item instanceof Error ? item.message : '上传失败')
    } finally {
      setBusy(false)
    }
  }

  async function removeDocument(knowledgeBaseId: string, documentId: string, filename: string) {
    if (!confirm(`确定删除文档「${filename}」及其索引？`)) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch(
        `/api/knowledge-bases/${knowledgeBaseId}/documents/${documentId}`,
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

  async function downloadDocument(
    knowledgeBaseId: string,
    documentId: string,
    filename: string,
  ) {
    setBusy(true)
    setError('')
    try {
      const res = await fetch(
        `/api/knowledge-bases/${knowledgeBaseId}/documents/${documentId}`,
      )
      if (!res.ok) {
        const body = (await res.json()) as { error?: string }
        throw new Error(body.error || '下载失败')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const anchor = window.document.createElement('a')
      anchor.href = url
      anchor.download = filename
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (item) {
      setError(item instanceof Error ? item.message : '下载失败')
    } finally {
      setBusy(false)
    }
  }

  async function reparse(knowledgeBaseId: string, documentId: string) {
    setBusy(true)
    try {
      const res = await fetch(
        `/api/knowledge-bases/${knowledgeBaseId}/documents/${documentId}/reparse`,
        { method: 'POST' },
      )
      const body = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(body.error || '重新解析失败')
      await load()
    } catch (item) {
      setError(item instanceof Error ? item.message : '重新解析失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="flex min-h-screen flex-col bg-background">
      <DataWorkspaceHeader username={username} />
      <section className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold tracking-tight">知识库</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            支持批量上传 Markdown 文档，按标题切父块，子块做文本检索。
          </p>
        </div>

        <div className="mb-6 grid gap-2 rounded-xl border border-border bg-card p-4 md:grid-cols-[1fr_1fr_auto]">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="知识库名称"
          />
          <Input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="说明（可选）"
          />
          <Button disabled={busy || !name.trim()} onClick={() => void createItem()}>
            新建
          </Button>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索知识库"
            className="max-w-xs"
          />
          <select
            value={enabledFilter}
            onChange={(event) =>
              setEnabledFilter(event.target.value as 'all' | 'on' | 'off')
            }
            className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
          >
            <option value="all">全部状态</option>
            <option value="on">已启用</option>
            <option value="off">已停用</option>
          </select>
        </div>

        {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}

        <KnowledgeBaseList
          items={filtered}
          busy={busy}
          onToggle={(item) => void toggleEnabled(item)}
          onUpload={(id, files) => void uploadMarkdownFiles(id, files)}
          onDelete={(id) => void removeItem(id)}
          onDeleteDocument={(knowledgeBaseId, documentId, filename) =>
            void removeDocument(knowledgeBaseId, documentId, filename)
          }
          onDownloadDocument={(knowledgeBaseId, documentId, filename) =>
            void downloadDocument(knowledgeBaseId, documentId, filename)
          }
          onReparse={(knowledgeBaseId, documentId) =>
            void reparse(knowledgeBaseId, documentId)
          }
        />
      </section>
    </main>
  )
}

function KnowledgeBaseList(props: {
  items: KnowledgeBaseRecord[]
  busy: boolean
  onToggle: (item: KnowledgeBaseRecord) => void
  onUpload: (knowledgeBaseId: string, files: File[]) => void
  onDelete: (id: string) => void
  onDeleteDocument: (
    knowledgeBaseId: string,
    documentId: string,
    filename: string,
  ) => void
  onDownloadDocument: (
    knowledgeBaseId: string,
    documentId: string,
    filename: string,
  ) => void
  onReparse: (knowledgeBaseId: string, documentId: string) => void
}) {
  if (props.items.length === 0) {
    return <p className="text-sm text-muted-foreground">还没有知识库。</p>
  }
  return (
    <div className="space-y-3">
      {props.items.map((item) => {
        const boundDataSources = item.boundDataSources ?? []
        return (
        <article key={item.id} className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="font-medium">{item.name}</h3>
                <Badge variant={item.enabled ? 'default' : 'secondary'}>
                  {item.enabled ? '启用' : '停用'}
                </Badge>
                <Badge variant="outline">{item.sourceType}</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {item.description || '无说明'}
              </p>
              <div className="mt-3 rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5">
                <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                  <Database className="h-3.5 w-3.5 text-primary" />
                  绑定的数据源
                  <span className="font-normal text-muted-foreground">
                    （{boundDataSources.length} 个）
                  </span>
                </div>
                {boundDataSources.length > 0 ? (
                  <ul className="mt-2 space-y-1.5">
                    {boundDataSources.map((dataSource) => (
                      <li
                        key={dataSource.id}
                        className="flex items-center justify-between gap-2 text-sm"
                      >
                        <span className="truncate">
                          {dataSource.name}
                          <span className="ml-1.5 text-xs text-muted-foreground">
                            {dataSource.type}
                          </span>
                        </span>
                        <Badge
                          variant={dataSource.enabled ? 'secondary' : 'outline'}
                          className="shrink-0 font-normal"
                        >
                          {dataSource.enabled ? '已启用' : '已停用'}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">
                    尚未被数据源绑定，可在数据源管理页关联此知识库。
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => props.onToggle(item)}>
                {item.enabled ? '停用' : '启用'}
              </Button>
              <label className="inline-flex h-7 cursor-pointer items-center rounded-lg border border-border px-2.5 text-[0.8rem]">
                上传 Markdown
                <input
                  type="file"
                  accept=".md,text/markdown"
                  multiple
                  className="hidden"
                  disabled={props.busy}
                  onChange={(event) => {
                    const files = Array.from(event.target.files ?? [])
                    if (files.length > 0) props.onUpload(item.id, files)
                    event.target.value = ''
                  }}
                />
              </label>
              <Button variant="destructive" size="sm" onClick={() => props.onDelete(item.id)}>
                删除
              </Button>
            </div>
          </div>
          <div className="mt-3 space-y-2">
            {item.documents.map((document) => (
              <div
                key={document.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm"
              >
                <div>
                  <span>{document.filename}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {document.parseStatus}
                    {document.parseError ? ` · ${document.parseError}` : ''}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {document.parseStatus === 'failed' ? (
                    <Button
                      variant="outline"
                      size="xs"
                      disabled={props.busy}
                      onClick={() => props.onReparse(item.id, document.id)}
                    >
                      重新解析
                    </Button>
                  ) : null}
                  <Button
                    variant="outline"
                    size="xs"
                    disabled={props.busy}
                    onClick={() =>
                      props.onDownloadDocument(item.id, document.id, document.filename)
                    }
                  >
                    下载
                  </Button>
                  <Button
                    variant="destructive"
                    size="xs"
                    disabled={props.busy}
                    onClick={() =>
                      props.onDeleteDocument(item.id, document.id, document.filename)
                    }
                  >
                    删除
                  </Button>
                </div>
              </div>
            ))}
            {item.documents.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                还没有文档，上传一份或多份 .md 即可检索。
              </p>
            ) : null}
          </div>
        </article>
        )
      })}
    </div>
  )
}
