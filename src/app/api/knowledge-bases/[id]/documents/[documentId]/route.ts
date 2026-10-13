import { NextResponse } from 'next/server'
import { isSessionPayload, requireApiSession } from '@/lib/auth/server'
import {
  deleteKnowledgeDocument,
  readKnowledgeDocumentContent,
} from '@/lib/db/knowledge-bases'

type RouteContext = { params: Promise<{ id: string; documentId: string }> }

function buildAttachmentContentDisposition(filename: string): string {
  const asciiFallback = filename.replace(/[^\x20-\x7E]/g, '_') || 'document.md'
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}

export async function GET(_request: Request, context: RouteContext) {
  const session = await requireApiSession()
  if (!isSessionPayload(session)) return session
  const { id, documentId } = await context.params
  let document
  try {
    document = await readKnowledgeDocumentContent(id, documentId, session.userId)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code
    if (code === 'ENOENT') {
      return NextResponse.json({ error: '文档文件已丢失，请重新上传' }, { status: 404 })
    }
    return NextResponse.json({ error: '读取文档失败' }, { status: 500 })
  }
  if (!document) {
    return NextResponse.json({ error: '文档不存在' }, { status: 404 })
  }
  return new NextResponse(document.content, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': buildAttachmentContentDisposition(document.filename),
    },
  })
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await requireApiSession()
  if (!isSessionPayload(session)) return session
  const { id, documentId } = await context.params
  const deleted = await deleteKnowledgeDocument(id, documentId, session.userId)
  if (!deleted) {
    return NextResponse.json({ error: '文档不存在' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}
