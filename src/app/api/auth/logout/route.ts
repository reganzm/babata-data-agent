import { NextResponse } from 'next/server'
import { getSessionCookieName, sessionCookieOptions } from '@/lib/auth/session'

export async function POST(req: Request) {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(getSessionCookieName(), '', {
    ...sessionCookieOptions(0, req),
    maxAge: 0,
  })
  return res
}
