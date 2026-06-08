import { SESSION_COOKIE } from './constants'
import { getAuthSecret, getSessionMaxAgeSec } from './config'

export type SessionPayload = {
  /** null 表示鉴权关闭（开发模式），不按用户过滤会话 */
  userId: string | null
  username: string
  exp: number
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlToBytes(b64: string): Uint8Array {
  const padded = b64.replace(/-/g, '+').replace(/_/g, '/')
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4))
  const binary = atob(padded + pad)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

async function importHmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(getAuthSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
}

async function signPayloadB64(payloadB64: string): Promise<string> {
  const key = await importHmacKey()
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(payloadB64),
  )
  return bytesToBase64Url(new Uint8Array(sig))
}

export async function createSessionToken(
  payload: Omit<SessionPayload, 'exp'>,
): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + getSessionMaxAgeSec()
  const body: SessionPayload = { ...payload, exp }
  const payloadB64 = bytesToBase64Url(
    new TextEncoder().encode(JSON.stringify(body)),
  )
  return `${payloadB64}.${await signPayloadB64(payloadB64)}`
}

export async function parseSessionToken(
  token: string | undefined,
): Promise<SessionPayload | null> {
  if (!token) return null
  const dot = token.lastIndexOf('.')
  if (dot <= 0) return null
  const payloadB64 = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const expected = await signPayloadB64(payloadB64)
  if (!timingSafeEqualString(sig, expected)) return null
  try {
    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlToBytes(payloadB64)),
    ) as SessionPayload
    if (!payload?.username || typeof payload.exp !== 'number') {
      return null
    }
    if (payload.userId == null || payload.userId === '') {
      return null
    }
    if (payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}

export function sessionCookieOptions(maxAgeSec: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSec,
  }
}

export function getSessionCookieName(): string {
  return SESSION_COOKIE
}
