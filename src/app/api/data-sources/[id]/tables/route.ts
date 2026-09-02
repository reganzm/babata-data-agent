import { NextResponse } from 'next/server'
import { isSessionPayload, requireApiSession } from '@/lib/auth/server'
import { getDataSourceById } from '@/lib/db/data-sources'
import { isVirtualType } from '@/lib/db/data-source-config'
import { listParentSourceTables } from '@/lib/db/source-query'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_request: Request, context: RouteContext) {
  const session = await requireApiSession()
  if (!isSessionPayload(session)) return session
  const { id } = await context.params
  try {
    const record = await getDataSourceById(id, session.userId)
    if (!record) {
      return NextResponse.json({ error: '数据源不存在' }, { status: 404 })
    }
    if (isVirtualType(record.type)) {
      return NextResponse.json(
        { error: '不能从虚拟数据源加载表，请选择物理数据源' },
        { status: 400 },
      )
    }
    const result = await listParentSourceTables({
      dataSourceId: id,
      userId: session.userId,
    })
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : '加载表列表失败'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
