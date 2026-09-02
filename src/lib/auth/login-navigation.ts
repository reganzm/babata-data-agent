export function safeInternalRedirect(value: string | null | undefined): string {
  if (!value) return '/'
  const trimmed = value.trim()
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return '/'
  if (trimmed === '/login' || trimmed.startsWith('/login?') || trimmed.startsWith('/login/')) {
    return '/'
  }
  return trimmed
}

export function resolveLoginOrigin(request: Request): string {
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
  const host = forwardedHost || request.headers.get('host')?.trim()
  const forwardedProto = request.headers
    .get('x-forwarded-proto')
    ?.split(',')[0]
    ?.trim()
    .toLowerCase()

  if (host) {
    const urlProto = new URL(request.url).protocol === 'https:' ? 'https' : 'http'
    const proto =
      forwardedProto === 'https' || forwardedProto === 'http'
        ? forwardedProto
        : urlProto
    return `${proto}://${host}`
  }

  return new URL(request.url).origin
}

export function loginErrorMessage(code: string | null): string | null {
  if (!code) return null
  if (code === 'invalid') return '用户名或密码错误'
  if (code === 'missing') return '请输入用户名和密码'
  return '登录失败'
}

export function buildLoginErrorLocation(
  request: Request,
  code: 'invalid' | 'missing' | 'failed',
): URL {
  const location = new URL('/login', `${resolveLoginOrigin(request)}/`)
  location.searchParams.set('error', code)
  return location
}

export function buildPostLoginLocation(request: Request, redirect: string): URL {
  return new URL(safeInternalRedirect(redirect), `${resolveLoginOrigin(request)}/`)
}
