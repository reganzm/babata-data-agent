import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/authorization'
import { isSessionPayload } from '@/lib/auth/server'
import { isPermissionCode, type PermissionCode } from '@/lib/auth/permissions'
import { createRole, listRoles, type ResourceType } from '@/lib/db/rbac'

export async function GET() {
  const session = await requirePermission('role:read')
  if (!isSessionPayload(session)) return session
  try {
    const roles = await listRoles()
    return NextResponse.json({ roles })
  } catch (error) {
    const message = error instanceof Error ? error.message : '加载角色失败'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const session = await requirePermission('role:write')
  if (!isSessionPayload(session)) return session
  try {
    const body = (await request.json()) as {
      name?: string
      description?: string
      permissions?: string[]
      resources?: Array<{ resourceType: ResourceType; resourceId: string }>
    }
    if (!body.name?.trim()) {
      return NextResponse.json({ error: '角色名称不能为空' }, { status: 400 })
    }
    const permissions = (body.permissions ?? []).filter(isPermissionCode) as PermissionCode[]
    const role = await createRole({
      name: body.name,
      description: body.description,
      permissions,
      resources: body.resources,
    })
    return NextResponse.json({ role }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : '创建角色失败'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
