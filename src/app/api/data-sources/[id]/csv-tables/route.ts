import { NextResponse } from 'next/server'
import { isSessionPayload, requireApiSession } from '@/lib/auth/server'
import {
  addCsvTableToDataSource,
  removeCsvTableFromDataSource,
} from '@/lib/db/data-sources'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(request: Request, context: RouteContext) {
  const session = await requireApiSession()
  if (!isSessionPayload(session)) return session
  const { id } = await context.params
  try {
    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: '请上传 CSV 文件' }, { status: 400 })
    }
    const dataSource = await addCsvTableToDataSource(id, session.userId, {
      content: await file.text(),
      originalFilename: file.name,
    })
    return NextResponse.json({ dataSource })
  } catch (error) {
    const message = error instanceof Error ? error.message : '上传 CSV 失败'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const session = await requireApiSession()
  if (!isSessionPayload(session)) return session
  const { id } = await context.params
  const tableName = new URL(request.url).searchParams.get('tableName')?.trim()
  if (!tableName) {
    return NextResponse.json({ error: '缺少 tableName 参数' }, { status: 400 })
  }
  try {
    const dataSource = await removeCsvTableFromDataSource(
      id,
      session.userId,
      tableName,
    )
    return NextResponse.json({ dataSource })
  } catch (error) {
    const message = error instanceof Error ? error.message : '删除 CSV 表失败'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
