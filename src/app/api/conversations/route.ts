import { NextResponse } from 'next/server'
import {
  createConversation,
  listConversations,
} from '@/lib/db/conversations'
import { isSessionPayload, requireApiSession } from '@/lib/auth/server'

export async function GET() {
  const session = await requireApiSession()
  if (!isSessionPayload(session)) return session
  try {
    const conversations = await listConversations(session.userId)
    return NextResponse.json({ conversations })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '加载会话列表失败'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST() {
  const session = await requireApiSession()
  if (!isSessionPayload(session)) return session
  try {
    const conversation = await createConversation(session.userId)
    return NextResponse.json({ conversation }, { status: 201 })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '创建会话失败'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
