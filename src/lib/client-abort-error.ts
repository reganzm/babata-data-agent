export function isClientAbortError(error: unknown): boolean {
  if (!error) return false
  if (
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: string }).code === 'ECONNRESET'
  ) {
    return true
  }
  const message = error instanceof Error ? error.message : String(error)
  return /aborted|aborterror|socket hang up/i.test(message)
}

export function handleProcessClientAbort(error: unknown): boolean {
  if (!isProcessClientAbortError(error)) return false
  console.warn('[client-abort] ignored disconnected client', {
    message: error instanceof Error ? error.message : String(error),
    code:
      error && typeof error === 'object' && 'code' in error
        ? (error as { code?: string }).code
        : undefined,
  })
  return true
}

export function isProcessClientAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message === 'aborted' &&
    'code' in error &&
    (error as { code?: string }).code === 'ECONNRESET'
  )
}
