import { NextResponse } from 'next/server'
import { isSessionPayload, requireApiSession } from '@/lib/auth/server'
import { replaceDataSourceBindings } from '@/lib/db/data-sources'
import { getKnowledgeBaseById } from '@/lib/db/knowledge-bases'

type RouteContext = { params: Promise<{ id: string }> }

export async function PUT(request: Request, context: RouteContext) {
  const session = await requireApiSession()
  if (!isSessionPayload(session)) return session
  const { id } = await context.params
  const body = (await request.json()) as { knowledgeBaseIds?: string[] }
  const ids = Array.isArray(body.knowledgeBaseIds) ? body.knowledgeBaseIds : []
  for (const knowledgeBaseId of ids) {
    const knowledgeBase = await getKnowledgeBaseById(knowledgeBaseId, session.userId)
    if (!knowledgeBase) {
      return NextResponse.json({ error: '知识库不存在或无权绑定' }, { status: 400 })
    }
  }
  try {
    const knowledgeBaseIds = await replaceDataSourceBindings(id, session.userId, ids)
    return NextResponse.json({ knowledgeBaseIds })
  } catch (error) {
    const message = error instanceof Error ? error.message : '绑定失败'
    const status = message.includes('不存在') ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
