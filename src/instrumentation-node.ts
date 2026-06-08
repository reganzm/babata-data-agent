import { handleProcessClientAbort } from '@/lib/client-abort-error'

let abortHandlersInstalled = false

export function registerNodeClientAbortHandlers() {
  if (abortHandlersInstalled) return
  abortHandlersInstalled = true

  process.on('uncaughtException', (error) => {
    if (handleProcessClientAbort(error)) return
    throw error
  })

  process.on('unhandledRejection', (reason) => {
    if (handleProcessClientAbort(reason)) return
    throw reason
  })
}
