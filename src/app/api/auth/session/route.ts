import { NextResponse } from 'next/server'
import { isAuthDisabled } from '@/lib/auth/config'
import { resourceIdForUser } from '@/lib/auth/constants'
import { getServerSession } from '@/lib/auth/server'
import { findUserById } from '@/lib/auth/users'
import { listUserPermissions, listUserRoles } from '@/lib/db/rbac'

export async function GET() {
  if (isAuthDisabled()) {
    return NextResponse.json({
      authenticated: false,
      authDisabled: true,
      user: null,
      permissions: [],
      roles: [],
    })
  }
  const session = await getServerSession()
  if (!session?.userId) {
    return NextResponse.json({
      authenticated: false,
      user: null,
      permissions: [],
      roles: [],
    })
  }
  const user = await findUserById(session.userId)
  if (!user) {
    return NextResponse.json({
      authenticated: false,
      user: null,
      permissions: [],
      roles: [],
    })
  }
  const [permissions, roles] = await Promise.all([
    listUserPermissions(session.userId),
    listUserRoles(session.userId),
  ])
  return NextResponse.json({
    authenticated: true,
    user: {
      id: user.id,
      username: user.username,
      resourceId: resourceIdForUser(user.id),
    },
    permissions,
    roles: roles.map((role) => ({ id: role.id, name: role.name })),
  })
}
