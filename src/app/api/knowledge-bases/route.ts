import { NextResponse } from 'next/server'
import { isSessionPayload, requireApiSession } from '@/lib/auth/server'
import { createKnowledgeBase, listKnowledgeBases } from '@/lib/db/knowledge-bases'

export async function GET() {
  const session = await requireApiSession()
  if (!isSessionPayload(session)) return session
  try {
    const knowledgeBases = await listKnowledgeBases(session.userId)
    return NextResponse.json({ knowledgeBases })
  } catch (error) {
    const message = error instanceof Error ? error.message : '加载知识库失败'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const session = await requireApiSession()
  if (!isSessionPayload(session)) return session
  try {
    const body = (await request.json()) as {
      name?: string
      description?: string
      enabled?: boolean
    }
    if (!body.name?.trim()) {
      return NextResponse.json({ error: '名称不能为空' }, { status: 400 })
    }
    const knowledgeBase = await createKnowledgeBase(session.userId, {
      name: body.name.trim(),
      description: body.description,
      enabled: body.enabled,
    })
    return NextResponse.json({ knowledgeBase }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : '创建知识库失败'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
