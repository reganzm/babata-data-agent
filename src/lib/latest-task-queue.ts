export type LatestTaskQueue<T> = {
  push: (value: T) => void
  flush: () => Promise<void>
}

export function createLatestTaskQueue<T>(
  task: (value: T) => Promise<void>,
): LatestTaskQueue<T> {
  let running = false
  let pendingValue: T | undefined
  let hasPendingValue = false
  let idleResolvers: Array<() => void> = []

  const notifyIdle = () => {
    if (running || hasPendingValue) return
    const resolvers = idleResolvers
    idleResolvers = []
    resolvers.forEach((resolve) => resolve())
  }

  const drain = async () => {
    if (running) return
    running = true
    try {
      while (hasPendingValue) {
        const current = pendingValue as T
        pendingValue = undefined
        hasPendingValue = false
        await task(current)
      }
    } finally {
      running = false
      notifyIdle()
      if (hasPendingValue) {
        void drain()
      }
    }
  }

  return {
    push(value) {
      pendingValue = value
      hasPendingValue = true
      void drain()
    },
    flush() {
      if (!running && !hasPendingValue) return Promise.resolve()
      return new Promise<void>((resolve) => {
        idleResolvers.push(resolve)
      })
    },
  }
}
