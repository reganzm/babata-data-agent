'use client'

import { useCallback, useEffect, useState } from 'react'

const HEADER_KEY = 'babata-layout-header-collapsed'
const SIDEBAR_KEY = 'babata-layout-sidebar-collapsed'

function readStoredBoolean(key: string, defaultValue: boolean): boolean {
  if (typeof window === 'undefined') return defaultValue
  const value = localStorage.getItem(key)
  if (value === 'true') return true
  if (value === 'false') return false
  return defaultValue
}

export function useLayoutCollapse() {
  const [headerCollapsed, setHeaderCollapsed] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setHeaderCollapsed(readStoredBoolean(HEADER_KEY, false))
    setSidebarCollapsed(readStoredBoolean(SIDEBAR_KEY, false))
    setHydrated(true)
  }, [])

  const toggleHeader = useCallback(() => {
    setHeaderCollapsed((current) => {
      const next = !current
      localStorage.setItem(HEADER_KEY, String(next))
      return next
    })
  }, [])

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((current) => {
      const next = !current
      localStorage.setItem(SIDEBAR_KEY, String(next))
      return next
    })
  }, [])

  return {
    headerCollapsed,
    sidebarCollapsed,
    toggleHeader,
    toggleSidebar,
    hydrated,
  }
}
