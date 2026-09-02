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
  const document = await readKnowledgeDocumentContent(id, documentId, session.userId)
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
