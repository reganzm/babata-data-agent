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
import {
  buildLoginErrorLocation,
  buildPostLoginLocation,
  safeInternalRedirect,
} from '@/lib/auth/login-navigation'

type LoginMode = 'json' | 'form'

type LoginFields = {
  username: string
  password: string
  redirect: string
  mode: LoginMode
}

function isFormContentType(contentType: string): boolean {
  return (
    contentType.includes('application/x-www-form-urlencoded') ||
    contentType.includes('multipart/form-data')
  )
}

async function readLoginFields(req: Request): Promise<LoginFields> {
  const contentType = req.headers.get('content-type') ?? ''
  if (isFormContentType(contentType)) {
    const form = await req.formData()
    return {
      username: String(form.get('username') ?? '').trim(),
      password: String(form.get('password') ?? ''),
      redirect: safeInternalRedirect(String(form.get('redirect') ?? '')),
      mode: 'form',
    }
  }

  const body = (await req.json()) as {
    username?: string
    password?: string
    redirect?: string
  }
  return {
    username: body.username?.trim() ?? '',
    password: body.password ?? '',
    redirect: safeInternalRedirect(body.redirect),
    mode: 'json',
  }
}

function withSessionCookie(req: Request, response: NextResponse, token: string) {
  response.cookies.set(
    getSessionCookieName(),
    token,
    sessionCookieOptions(getSessionMaxAgeSec(), req),
  )
  return response
}

function fail(
  req: Request,
  mode: LoginMode,
  code: 'invalid' | 'missing' | 'failed',
  status: number,
  message: string,
) {
  if (mode === 'form') {
    return NextResponse.redirect(buildLoginErrorLocation(req, code), 303)
  }
  return NextResponse.json({ error: message }, { status })
}

export async function POST(req: Request) {
  try {
    const fields = await readLoginFields(req)
    if (!fields.username || !fields.password) {
      return fail(req, fields.mode, 'missing', 400, '请输入用户名和密码')
    }

    const user = await findUserByUsername(fields.username)
    if (!user || !verifyPassword(fields.password, user.passwordHash)) {
      return fail(req, fields.mode, 'invalid', 401, '用户名或密码错误')
    }

    const token = await createSessionToken({
      userId: user.id,
      username: user.username,
    })

    if (fields.mode === 'form') {
      return withSessionCookie(
        req,
        NextResponse.redirect(buildPostLoginLocation(req, fields.redirect), 303),
        token,
      )
    }

    return withSessionCookie(
      req,
      NextResponse.json({
        user: {
          id: user.id,
          username: user.username,
          resourceId: resourceIdForUser(user.id),
        },
      }),
      token,
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : '登录失败'
    const contentType = req.headers.get('content-type') ?? ''
    const mode: LoginMode = isFormContentType(contentType) ? 'form' : 'json'
    return fail(req, mode, 'failed', 500, message)
  }
}
