import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/authorization'
import { isSessionPayload, requireApiSession } from '@/lib/auth/server'
import {
  createCsvDataSource,
  createSqlEngineDataSource,
  createSqliteDataSource,
  createVirtualDataSource,
  listDataSources,
  type DataSourceType,
} from '@/lib/db/data-sources'
import {
  DEFAULT_SQL_ENGINE_PORTS,
  isSqlEngineType,
  isVirtualType,
} from '@/lib/db/data-source-config'

export async function GET() {
  const session = await requireApiSession()
  if (!isSessionPayload(session)) return session
  try {
    const dataSources = await listDataSources(session.userId)
    return NextResponse.json({ dataSources })
  } catch (error) {
    const message = error instanceof Error ? error.message : '加载数据源失败'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const session = await requireApiSession()
  if (!isSessionPayload(session)) return session
  const writeCheck = await requirePermission('data_source:write')
  if (!isSessionPayload(writeCheck)) return writeCheck
  try {
    const contentType = request.headers.get('content-type') ?? ''
    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData()
      const name = String(form.get('name') ?? '').trim()
      const description = String(form.get('description') ?? '').trim()
      const databaseName = String(form.get('databaseName') ?? '').trim()
      const files = form.getAll('file').filter((item): item is File => item instanceof File)
      if (!name || !databaseName) {
        return NextResponse.json(
          { error: '名称和逻辑库名不能为空' },
          { status: 400 },
        )
      }
      const dataSource = await createCsvDataSource(session.userId, {
        name,
        description,
        databaseName,
        files: await Promise.all(
          files.map(async (file) => ({
            content: await file.text(),
            originalFilename: file.name,
          })),
        ),
      })
      return NextResponse.json({ dataSource }, { status: 201 })
    }

    const body = (await request.json()) as {
      name?: string
      description?: string
      type?: DataSourceType
      enabled?: boolean
      host?: string
      port?: number
      user?: string
      password?: string
      database?: string
      databaseName?: string
      filePath?: string
      tables?: Array<{
        parentDataSourceId: string
        tableName: string
        exposedName: string
        description?: string
      }>
    }
    const type = body.type ?? 'doris'
    if (!body.name?.trim()) {
      return NextResponse.json({ error: '名称不能为空' }, { status: 400 })
    }

    if (type === 'file_csv') {
      return NextResponse.json(
        { error: 'CSV 数据源请使用 multipart 上传接口' },
        { status: 400 },
      )
    }

    if (isVirtualType(type)) {
      if (!Array.isArray(body.tables) || body.tables.length === 0) {
        return NextResponse.json(
          { error: '虚拟数据源至少需要选择一张表' },
          { status: 400 },
        )
      }
      const dataSource = await createVirtualDataSource(session.userId, {
        name: body.name,
        description: body.description,
        enabled: body.enabled,
        tables: body.tables,
      })
      return NextResponse.json({ dataSource }, { status: 201 })
    }

    if (type === 'sqlite') {
      if (!body.databaseName?.trim()) {
        return NextResponse.json({ error: 'SQLite 逻辑库名不能为空' }, { status: 400 })
      }
      const dataSource = await createSqliteDataSource(session.userId, {
        name: body.name,
        description: body.description,
        enabled: body.enabled,
        databaseName: body.databaseName,
        filePath: body.filePath,
      })
      return NextResponse.json({ dataSource }, { status: 201 })
    }

    if (!isSqlEngineType(type)) {
      return NextResponse.json(
        { error: `不支持的数据源类型：${type}` },
        { status: 400 },
      )
    }
    if (!body.host?.trim() || !body.user?.trim() || !body.database?.trim()) {
      return NextResponse.json(
        { error: '主机、用户和数据库不能为空' },
        { status: 400 },
      )
    }
    const dataSource = await createSqlEngineDataSource(session.userId, {
      name: body.name,
      description: body.description,
      type,
      enabled: body.enabled,
      host: body.host,
      port: body.port ?? DEFAULT_SQL_ENGINE_PORTS[type],
      user: body.user,
      password: body.password ?? '',
      database: body.database,
    })
    return NextResponse.json({ dataSource }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : '创建数据源失败'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
