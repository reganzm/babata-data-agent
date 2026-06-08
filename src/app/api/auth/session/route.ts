import { NextResponse } from 'next/server'
import { isAuthDisabled } from '@/lib/auth/config'
import { resourceIdForUser } from '@/lib/auth/constants'
import { getServerSession } from '@/lib/auth/server'
import { findUserById } from '@/lib/auth/users'

export async function GET() {
  if (isAuthDisabled()) {
    return NextResponse.json({
      authenticated: false,
      authDisabled: true,
      user: null,
    })
  }
  const session = await getServerSession()
  if (!session?.userId) {
    return NextResponse.json({ authenticated: false, user: null })
  }
  const user = await findUserById(session.userId)
  if (!user) {
    return NextResponse.json({ authenticated: false, user: null })
  }
  return NextResponse.json({
    authenticated: true,
    user: {
      id: user.id,
      username: user.username,
      resourceId: resourceIdForUser(user.id),
    },
  })
}
