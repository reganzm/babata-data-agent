import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/authorization'
import { isSessionPayload } from '@/lib/auth/server'
import {
  deleteUser,
  findUserById,
  updateUserPasswordById,
} from '@/lib/auth/users'
import { listUserRoles, replaceUserRoles } from '@/lib/db/rbac'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_request: Request, context: RouteContext) {
  const session = await requirePermission('user:read')
  if (!isSessionPayload(session)) return session
  const { id } = await context.params
  const user = await findUserById(id)
  if (!user) {
    return NextResponse.json({ error: '用户不存在' }, { status: 404 })
  }
  const roles = await listUserRoles(id)
  return NextResponse.json({ user: { ...user, roles } })
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await requirePermission('user:write')
  if (!isSessionPayload(session)) return session
  const { id } = await context.params
  try {
    const body = (await request.json()) as {
      password?: string
      roleIds?: string[]
    }
    const user = await findUserById(id)
    if (!user) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 })
    }
    if (body.password) {
      await updateUserPasswordById(id, body.password)
    }
    if (Array.isArray(body.roleIds)) {
      await replaceUserRoles(id, body.roleIds)
    }
    const roles = await listUserRoles(id)
    return NextResponse.json({ user: { ...(await findUserById(id)), roles } })
  } catch (error) {
    const message = error instanceof Error ? error.message : '更新用户失败'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await requirePermission('user:delete')
  if (!isSessionPayload(session)) return session
  const { id } = await context.params
  if (session.userId === id) {
    return NextResponse.json({ error: '不能删除当前登录用户' }, { status: 400 })
  }
  const deleted = await deleteUser(id)
  if (!deleted) {
    return NextResponse.json({ error: '用户不存在' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}
