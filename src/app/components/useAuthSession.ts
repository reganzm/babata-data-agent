'use client'

import { useEffect, useState } from 'react'
import type { PermissionCode } from '@/lib/auth/permissions'
import { BABATA_RESOURCE_ID } from '@/lib/db/constants'

export type AuthSessionState = {
  loading: boolean
  authenticated: boolean
  authDisabled: boolean
  username?: string
  userId?: string
  resourceId?: string
  permissions: PermissionCode[]
}

const EMPTY: AuthSessionState = {
  loading: true,
  authenticated: false,
  authDisabled: false,
  permissions: [],
}

export function useAuthSession(): AuthSessionState {
  const [state, setState] = useState<AuthSessionState>(EMPTY)

  useEffect(() => {
    let cancelled = false
    void fetch('/api/auth/session')
      .then((res) => res.json())
      .then(
        (data: {
          authDisabled?: boolean
          authenticated?: boolean
          user?: { id?: string; username?: string; resourceId?: string }
          permissions?: PermissionCode[]
        }) => {
          if (cancelled) return
          if (data.authDisabled) {
            setState({
              loading: false,
              authenticated: false,
              authDisabled: true,
              username: '开发模式',
              resourceId: BABATA_RESOURCE_ID,
              permissions: [],
            })
            return
          }
          setState({
            loading: false,
            authenticated: Boolean(data.authenticated),
            authDisabled: false,
            username: data.user?.username,
            userId: data.user?.id,
            resourceId: data.user?.resourceId,
            permissions: data.permissions ?? [],
          })
        },
      )
      .catch(() => {
        if (!cancelled) setState({ ...EMPTY, loading: false })
      })
    return () => {
      cancelled = true
    }
  }, [])

  return state
}

export function hasPermission(
  permissions: PermissionCode[],
  code: PermissionCode,
): boolean {
  return permissions.includes(code)
}

export function hasAnyPermission(
  permissions: PermissionCode[],
  codes: PermissionCode[],
): boolean {
  return codes.some((code) => permissions.includes(code))
}
