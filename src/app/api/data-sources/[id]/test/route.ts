import { NextResponse } from 'next/server'
import { isSessionPayload, requireApiSession } from '@/lib/auth/server'
import { getDataSourceById } from '@/lib/db/data-sources'
import { testDataSourceConnection } from '@/lib/db/source-connection'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(_request: Request, context: RouteContext) {
  const session = await requireApiSession()
  if (!isSessionPayload(session)) return session
  const { id } = await context.params
  const record = await getDataSourceById(id, session.userId)
  if (!record) return NextResponse.json({ error: '数据源不存在' }, { status: 404 })
  if (!record.enabled) {
    return NextResponse.json({ error: '数据源已停用' }, { status: 400 })
  }
  try {
    await testDataSourceConnection(record)
    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : '连接失败'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
