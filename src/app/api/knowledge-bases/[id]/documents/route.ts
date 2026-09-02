import { NextResponse } from 'next/server'
import { isSessionPayload, requireApiSession } from '@/lib/auth/server'
import { addMarkdownDocument } from '@/lib/db/knowledge-bases'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(request: Request, context: RouteContext) {
  const session = await requireApiSession()
  if (!isSessionPayload(session)) return session
  const { id } = await context.params
  const form = await request.formData()
  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: '请上传 Markdown 文件' }, { status: 400 })
  }
  const content = await file.text()
  try {
    const document = await addMarkdownDocument(id, session.userId, {
      filename: file.name,
      content,
    })
    return NextResponse.json({ document }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : '上传失败'
    const status = message.includes('不存在') ? 404 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
