import { NextResponse } from 'next/server'
import {
  deleteConversation,
  getConversationById,
  updateConversation,
  type ConversationMetadata,
  type StoredMessage,
} from '@/lib/db/conversations'
import { isSessionPayload, requireApiSession } from '@/lib/auth/server'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: Request, context: RouteContext) {
  const session = await requireApiSession()
  if (!isSessionPayload(session)) return session
  try {
    const { id } = await context.params
    const conversation = await getConversationById(id, session.userId)
    if (!conversation) {
      return NextResponse.json({ error: '会话不存在' }, { status: 404 })
    }
    return NextResponse.json({ conversation })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '加载会话失败'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(req: Request, context: RouteContext) {
  const session = await requireApiSession()
  if (!isSessionPayload(session)) return session
  try {
    const { id } = await context.params
    const body = (await req.json()) as {
      title?: string
      messages?: StoredMessage[]
      metadata?: ConversationMetadata
      pinned?: boolean
    }
    const conversation = await updateConversation(id, session.userId, body)
    if (!conversation) {
      return NextResponse.json({ error: '会话不存在' }, { status: 404 })
    }
    return NextResponse.json({ conversation })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '更新会话失败'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(_req: Request, context: RouteContext) {
  const session = await requireApiSession()
  if (!isSessionPayload(session)) return session
  try {
    const { id } = await context.params
    const ok = await deleteConversation(id, session.userId)
    if (!ok) {
      return NextResponse.json({ error: '会话不存在' }, { status: 404 })
    }
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '删除会话失败'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
