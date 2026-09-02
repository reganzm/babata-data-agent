import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/authorization'
import { isSessionPayload } from '@/lib/auth/server'
import { createUser, listUsers } from '@/lib/auth/users'
import { listUserRoles, replaceUserRoles } from '@/lib/db/rbac'

export async function GET() {
  const session = await requirePermission('user:read')
  if (!isSessionPayload(session)) return session
  try {
    const users = await listUsers()
    const usersWithRoles = await Promise.all(
      users.map(async (user) => ({
        ...user,
        roles: await listUserRoles(user.id),
      })),
    )
    return NextResponse.json({ users: usersWithRoles })
  } catch (error) {
    const message = error instanceof Error ? error.message : '加载用户失败'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const session = await requirePermission('user:write')
  if (!isSessionPayload(session)) return session
  try {
    const body = (await request.json()) as {
      username?: string
      password?: string
      roleIds?: string[]
    }
    if (!body.username?.trim() || !body.password) {
      return NextResponse.json({ error: '用户名和密码不能为空' }, { status: 400 })
    }
    const user = await createUser(body.username, body.password)
    if (Array.isArray(body.roleIds)) {
      await replaceUserRoles(user.id, body.roleIds)
    }
    const roles = await listUserRoles(user.id)
    return NextResponse.json({ user: { ...user, roles } }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : '创建用户失败'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
