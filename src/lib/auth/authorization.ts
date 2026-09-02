import { NextResponse } from 'next/server'
import type { SessionPayload } from './session'
import { isSessionPayload, requireApiSession } from './server'
import type { PermissionCode } from '@/lib/auth/permissions'
import { userHasPermission } from '@/lib/db/rbac'

export async function requirePermission(
  permission: PermissionCode,
): Promise<SessionPayload | NextResponse> {
  const session = await requireApiSession()
  if (!isSessionPayload(session)) return session
  if (!session.userId) return session
  const allowed = await userHasPermission(session.userId, permission)
  if (!allowed) {
    return NextResponse.json({ error: '无权限执行此操作' }, { status: 403 })
  }
  return session
}

export async function requireAnyPermission(
  permissions: PermissionCode[],
): Promise<SessionPayload | NextResponse> {
  const session = await requireApiSession()
  if (!isSessionPayload(session)) return session
  if (!session.userId) return session
  for (const permission of permissions) {
    if (await userHasPermission(session.userId, permission)) return session
  }
  return NextResponse.json({ error: '无权限执行此操作' }, { status: 403 })
}
