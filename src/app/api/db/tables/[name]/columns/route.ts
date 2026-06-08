import { isSessionPayload, requireApiSession } from '@/lib/auth/server'
import { describeTableOperation } from '@/mastra/tools/db'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const session = await requireApiSession()
  if (!isSessionPayload(session)) return session
  const { name } = await params
  const table = decodeURIComponent(name)
  if (!table.trim()) {
    return Response.json({ error: '缺少表名' }, { status: 400 })
  }
  try {
    const result = await describeTableOperation(table)
    return Response.json(result)
  } catch (e) {
    const message = e instanceof Error ? e.message : '获取表结构失败'
    return Response.json({ error: message }, { status: 500 })
  }
}
