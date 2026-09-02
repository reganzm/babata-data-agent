import { NextResponse } from 'next/server'
import { isSessionPayload, requireApiSession } from '@/lib/auth/server'
import { reparseDocument } from '@/lib/db/knowledge-bases'

type RouteContext = { params: Promise<{ id: string; documentId: string }> }

export async function POST(_request: Request, context: RouteContext) {
  const session = await requireApiSession()
  if (!isSessionPayload(session)) return session
  const { id, documentId } = await context.params
  try {
    const document = await reparseDocument(id, documentId, session.userId)
    return NextResponse.json({ document })
  } catch (error) {
    const message = error instanceof Error ? error.message : '重新解析失败'
    const status = message.includes('不存在') ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
