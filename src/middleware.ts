import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { isAuthDisabled } from '@/lib/auth/config'
import { getSessionCookieName, parseSessionToken } from '@/lib/auth/session'

const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/auth/logout']

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return true
  }
  if (pathname.startsWith('/_next')) return true
  if (pathname.startsWith('/favicon')) return true
  if (/\.(?:ico|png|jpg|jpeg|svg|webp|css|js|woff2?)$/i.test(pathname)) {
    return true
  }
  return false
}

export async function middleware(request: NextRequest) {
  if (isAuthDisabled()) {
    return NextResponse.next()
  }

  const { pathname } = request.nextUrl
  if (isPublicPath(pathname)) {
    return NextResponse.next()
  }

  const token = request.cookies.get(getSessionCookieName())?.value
  const session = await parseSessionToken(token)

  if (pathname === '/login') {
    if (session) {
      return NextResponse.redirect(new URL('/', request.url))
    }
    return NextResponse.next()
  }

  if (!session) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * 匹配所有路径，排除静态资源（middleware 在 Edge 运行，不可用 node:crypto）
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
