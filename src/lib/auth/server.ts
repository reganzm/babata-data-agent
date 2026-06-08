import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { isAuthDisabled } from './config'
import { getSessionCookieName, parseSessionToken, type SessionPayload } from './session'

export async function getServerSession(): Promise<SessionPayload | null> {
  if (isAuthDisabled()) return null
  const jar = await cookies()
  const token = jar.get(getSessionCookieName())?.value
  return await parseSessionToken(token)
}

export async function requireApiSession(): Promise<
  SessionPayload | NextResponse
> {
  if (isAuthDisabled()) {
    return {
      userId: null,
      username: 'dev',
      exp: Math.floor(Date.now() / 1000) + 86400,
    }
  }
  const session = await getServerSession()
  if (!session) {
    return NextResponse.json({ error: '未登录' }, { status: 401 })
  }
  return session
}

export function isSessionPayload(
  value: SessionPayload | NextResponse,
): value is SessionPayload {
  return !(value instanceof NextResponse)
}
