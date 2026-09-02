import test from 'node:test'
import assert from 'node:assert/strict'
import { sessionCookieOptions, shouldUseSecureCookie } from './session'

function withEnv(
  key: string,
  value: string | undefined,
  run: () => void,
): void {
  const previous = process.env[key]
  if (value === undefined) {
    delete process.env[key]
  } else {
    process.env[key] = value
  }
  try {
    run()
  } finally {
    if (previous === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = previous
    }
  }
}

test('BABATA_COOKIE_SECURE=true 时会话 Cookie 必须带 Secure', () => {
  withEnv('BABATA_COOKIE_SECURE', 'true', () => {
    const httpRequest = new Request('http://10.0.0.8:3000/api/auth/login')
    assert.equal(shouldUseSecureCookie(httpRequest), true)
    assert.equal(sessionCookieOptions(3600, httpRequest).secure, true)
  })
})

test('BABATA_COOKIE_SECURE=false 时即使 HTTPS 也不设 Secure', () => {
  withEnv('BABATA_COOKIE_SECURE', 'false', () => {
    const httpsRequest = new Request('https://babata.example/api/auth/login')
    assert.equal(shouldUseSecureCookie(httpsRequest), false)
    assert.equal(sessionCookieOptions(3600, httpsRequest).secure, false)
  })
})

test('未配置时 HTTP 请求不设 Secure，避免生产 HTTP 部署丢登录态', () => {
  withEnv('BABATA_COOKIE_SECURE', undefined, () => {
    const request = new Request('http://10.0.0.8:3000/api/auth/login')
    assert.equal(shouldUseSecureCookie(request), false)
    assert.equal(sessionCookieOptions(3600, request).secure, false)
  })
})

test('未配置时即使带 X-Forwarded-Proto=https 也不设 Secure（内网 HTTP 默认）', () => {
  withEnv('BABATA_COOKIE_SECURE', undefined, () => {
    const request = new Request('http://127.0.0.1:3000/api/auth/login', {
      headers: { 'x-forwarded-proto': 'https, http' },
    })
    assert.equal(shouldUseSecureCookie(request), false)
    assert.equal(sessionCookieOptions(3600, request).secure, false)
  })
})
