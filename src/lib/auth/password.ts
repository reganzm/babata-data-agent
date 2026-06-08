import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 } as const
const KEY_LEN = 64

export function hashPassword(plain: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(plain, salt, KEY_LEN, SCRYPT_PARAMS)
  return `scrypt:${salt.toString('base64')}:${hash.toString('base64')}`
}

export function verifyPassword(plain: string, stored: string): boolean {
  const parts = stored.split(':')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  const salt = Buffer.from(parts[1], 'base64')
  const expected = Buffer.from(parts[2], 'base64')
  const actual = scryptSync(plain, salt, expected.length, SCRYPT_PARAMS)
  if (actual.length !== expected.length) return false
  return timingSafeEqual(actual, expected)
}
