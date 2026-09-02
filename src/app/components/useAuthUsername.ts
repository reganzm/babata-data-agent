'use client'

import { useEffect, useState } from 'react'
import { BABATA_RESOURCE_ID } from '@/lib/db/constants'

export function useAuthUsername(): string | undefined {
  const [username, setUsername] = useState<string>()
  useEffect(() => {
    let cancelled = false
    void fetch('/api/auth/session')
      .then((res) => res.json())
      .then((data: { authDisabled?: boolean; authenticated?: boolean; user?: { username?: string } }) => {
        if (cancelled) return
        if (data.authDisabled) {
          setUsername('开发模式')
          return
        }
        if (data.authenticated && data.user?.username) {
          setUsername(data.user.username)
        }
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])
  return username ?? (typeof BABATA_RESOURCE_ID === 'string' ? undefined : undefined)
}
