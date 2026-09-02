import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/authorization'
import { isSessionPayload } from '@/lib/auth/server'
import { listAllDataSourcesForBinding } from '@/lib/db/data-sources'

export async function GET() {
  const session = await requirePermission('role:read')
  if (!isSessionPayload(session)) return session
  try {
    const dataSources = await listAllDataSourcesForBinding()
    return NextResponse.json({ dataSources })
  } catch (error) {
    const message = error instanceof Error ? error.message : '加载数据源失败'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
