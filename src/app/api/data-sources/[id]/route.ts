import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/authorization'
import { isSessionPayload, requireApiSession } from '@/lib/auth/server'
import {
  deleteDataSource,
  getPublicDataSourceById,
  updateDataSource,
} from '@/lib/db/data-sources'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_request: Request, context: RouteContext) {
  const session = await requireApiSession()
  if (!isSessionPayload(session)) return session
  const { id } = await context.params
  const dataSource = await getPublicDataSourceById(id, session.userId)
  if (!dataSource) return NextResponse.json({ error: '数据源不存在' }, { status: 404 })
  return NextResponse.json({ dataSource })
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await requireApiSession()
  if (!isSessionPayload(session)) return session
  const writeCheck = await requirePermission('data_source:write')
  if (!isSessionPayload(writeCheck)) return writeCheck
  const { id } = await context.params
  const body = (await request.json()) as {
    name?: string
    description?: string
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
  const dataSource = await updateDataSource(id, session.userId, body)
  if (!dataSource) return NextResponse.json({ error: '数据源不存在' }, { status: 404 })
  return NextResponse.json({ dataSource })
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await requireApiSession()
  if (!isSessionPayload(session)) return session
  const deleteCheck = await requirePermission('data_source:delete')
  if (!isSessionPayload(deleteCheck)) return deleteCheck
  const { id } = await context.params
  const deleted = await deleteDataSource(id, session.userId)
  if (!deleted) return NextResponse.json({ error: '数据源不存在' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
