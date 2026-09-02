export function getHundunHttpTimeoutMs(): number {
  const n = Number(process.env.HUNDUN_HTTP_TIMEOUT_MS ?? '20000')
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 20_000
}
