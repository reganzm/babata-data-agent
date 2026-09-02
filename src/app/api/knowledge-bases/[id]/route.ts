import { NextResponse } from 'next/server'
import { isSessionPayload, requireApiSession } from '@/lib/auth/server'
import {
  deleteKnowledgeBase,
  getKnowledgeBaseById,
  updateKnowledgeBase,
} from '@/lib/db/knowledge-bases'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_request: Request, context: RouteContext) {
  const session = await requireApiSession()
  if (!isSessionPayload(session)) return session
  const { id } = await context.params
  const knowledgeBase = await getKnowledgeBaseById(id, session.userId)
  if (!knowledgeBase) {
    return NextResponse.json({ error: '知识库不存在' }, { status: 404 })
  }
  return NextResponse.json({ knowledgeBase })
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await requireApiSession()
  if (!isSessionPayload(session)) return session
  const { id } = await context.params
  const body = (await request.json()) as {
    name?: string
    description?: string
    enabled?: boolean
  }
  const knowledgeBase = await updateKnowledgeBase(id, session.userId, body)
  if (!knowledgeBase) {
    return NextResponse.json({ error: '知识库不存在' }, { status: 404 })
  }
  return NextResponse.json({ knowledgeBase })
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await requireApiSession()
  if (!isSessionPayload(session)) return session
  const { id } = await context.params
  const deleted = await deleteKnowledgeBase(id, session.userId)
  if (!deleted) return NextResponse.json({ error: '知识库不存在' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
