import { NextResponse } from 'next/server'
import { verifyPassword } from '@/lib/auth/password'
import {
  createSessionToken,
  getSessionCookieName,
  sessionCookieOptions,
} from '@/lib/auth/session'
import { getSessionMaxAgeSec } from '@/lib/auth/config'
import { findUserByUsername } from '@/lib/auth/users'
import { resourceIdForUser } from '@/lib/auth/constants'

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      username?: string
      password?: string
    }
    const username = body.username?.trim()
    const password = body.password ?? ''
    if (!username || !password) {
      return NextResponse.json(
        { error: '请输入用户名和密码' },
        { status: 400 },
      )
    }

    const user = await findUserByUsername(username)
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return NextResponse.json(
        { error: '用户名或密码错误' },
        { status: 401 },
      )
    }

    const token = await createSessionToken({
      userId: user.id,
      username: user.username,
    })
    const res = NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        resourceId: resourceIdForUser(user.id),
      },
    })
    res.cookies.set(
      getSessionCookieName(),
      token,
      sessionCookieOptions(getSessionMaxAgeSec()),
    )
    return res
  } catch (error) {
    const message = error instanceof Error ? error.message : '登录失败'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
