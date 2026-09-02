'use client'

import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'

type Props = {
  username: string
  compact?: boolean
}

export function AuthHeaderActions({ username, compact = false }: Props) {
  const router = useRouter()

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.replace('/login')
    router.refresh()
  }

  return (
    <div className="flex items-center gap-2">
      {!compact ? (
        <span className="text-sm text-muted-foreground">{username}</span>
      ) : null}
      <Button
        type="button"
        variant="outline"
        size={compact ? 'icon-sm' : 'sm'}
        onClick={() => void handleLogout()}
        className={compact ? undefined : 'gap-1.5'}
        title="退出"
        aria-label="退出"
      >
        <LogOut className="size-3.5" />
        {!compact ? '退出' : null}
      </Button>
    </div>
  )
}
