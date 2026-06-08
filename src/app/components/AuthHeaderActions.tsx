'use client'

import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'

type Props = {
  username: string
}

export function AuthHeaderActions({ username }: Props) {
  const router = useRouter()

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.replace('/login')
    router.refresh()
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-muted-foreground">{username}</span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => void handleLogout()}
        className="gap-1.5"
      >
        <LogOut className="size-3.5" />
        退出
      </Button>
    </div>
  )
}
