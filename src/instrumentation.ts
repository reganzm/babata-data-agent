export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { registerNodeClientAbortHandlers } = await import(
    '@/instrumentation-node'
  )
  registerNodeClientAbortHandlers()
}
