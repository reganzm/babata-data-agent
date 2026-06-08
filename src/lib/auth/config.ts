const DEV_FALLBACK_SECRET = 'babata-dev-insecure-secret-change-me'

export function isAuthDisabled(): boolean {
  return process.env.BABATA_AUTH_DISABLED === 'true'
}

export function getAuthSecret(): string {
  const secret = process.env.BABATA_AUTH_SECRET?.trim()
  if (secret) return secret
  if (process.env.NODE_ENV === 'production') {
    throw new Error('生产环境必须设置 BABATA_AUTH_SECRET')
  }
  return DEV_FALLBACK_SECRET
}

export function getSessionMaxAgeSec(): number {
  const days = Number(process.env.BABATA_AUTH_SESSION_DAYS ?? '7')
  return Math.max(1, days) * 24 * 60 * 60
}
