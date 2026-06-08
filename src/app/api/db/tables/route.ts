import { isSessionPayload, requireApiSession } from '@/lib/auth/server'
import { listTablesOperation } from '@/mastra/tools/db'

export async function GET() {
  const session = await requireApiSession()
  if (!isSessionPayload(session)) return session
  try {
    const { tables } = await listTablesOperation()
    return Response.json({ tables })
  } catch (e) {
    const message = e instanceof Error ? e.message : '获取表列表失败'
    return Response.json({ error: message }, { status: 500 })
  }
}
