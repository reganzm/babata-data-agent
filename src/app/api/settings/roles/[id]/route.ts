import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/authorization'
import { isSessionPayload } from '@/lib/auth/server'
import { isPermissionCode, type PermissionCode } from '@/lib/auth/permissions'
import {
  deleteRole,
  getRoleById,
  updateRole,
  type ResourceType,
} from '@/lib/db/rbac'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_request: Request, context: RouteContext) {
  const session = await requirePermission('role:read')
  if (!isSessionPayload(session)) return session
  const { id } = await context.params
  const role = await getRoleById(id)
  if (!role) {
    return NextResponse.json({ error: '角色不存在' }, { status: 404 })
  }
  return NextResponse.json({ role })
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await requirePermission('role:write')
  if (!isSessionPayload(session)) return session
  const { id } = await context.params
  try {
    const body = (await request.json()) as {
      name?: string
      description?: string
      permissions?: string[]
      resources?: Array<{ resourceType: ResourceType; resourceId: string }>
    }
    const permissions = body.permissions
      ? (body.permissions.filter(isPermissionCode) as PermissionCode[])
      : undefined
    const role = await updateRole(id, {
      name: body.name,
      description: body.description,
      permissions,
      resources: body.resources,
    })
    if (!role) {
      return NextResponse.json({ error: '角色不存在' }, { status: 404 })
    }
    return NextResponse.json({ role })
  } catch (error) {
    const message = error instanceof Error ? error.message : '更新角色失败'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await requirePermission('role:delete')
  if (!isSessionPayload(session)) return session
  const { id } = await context.params
  try {
    const deleted = await deleteRole(id)
    if (!deleted) {
      return NextResponse.json({ error: '角色不存在' }, { status: 404 })
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : '删除角色失败'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
