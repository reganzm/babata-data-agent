'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BookOpen, Database, MessageSquare, Shield } from 'lucide-react'
import { ThemeToggle } from '@/app/components/ThemeToggle'
import { AuthHeaderActions } from '@/app/components/AuthHeaderActions'
import { LayoutCollapseButton } from '@/app/components/LayoutCollapseButton'
import { hasAnyPermission, useAuthSession } from '@/app/components/useAuthSession'
import { cn } from '@/lib/utils'

type Props = {
  username?: string
  showSettings?: boolean
  subtitle?: string
  collapsed?: boolean
  onToggleCollapse?: () => void
}

const NAV = [
  { href: '/', label: '对话', icon: MessageSquare },
  { href: '/data-sources', label: '数据源', icon: Database },
  { href: '/knowledge-bases', label: '知识库', icon: BookOpen },
] as const

const DEFAULT_SUBTITLE = '我的数据 · 数据源与知识库'

export function DataWorkspaceHeader({
  username,
  showSettings = false,
  subtitle = DEFAULT_SUBTITLE,
  collapsed = false,
  onToggleCollapse,
}: Props) {
  const pathname = usePathname()
  const auth = useAuthSession()
  const canSeeSettings =
    showSettings ||
    auth.authDisabled ||
    hasAnyPermission(auth.permissions, [
      'user:read',
      'user:write',
      'role:read',
      'role:write',
    ])
  const navItems = canSeeSettings
    ? [...NAV, { href: '/settings', label: '设置', icon: Shield }]
    : NAV

  return (
    <header
      className={cn(
        'z-10 shrink-0 border-b border-border bg-card shadow-sm',
        'dark:shadow-[0_1px_0_0_var(--sidebar-border),0_4px_24px_-4px_oklch(0_0_0_/_35%)]',
        collapsed ? 'px-3 py-2' : 'px-6 py-4',
      )}
    >
      <div
        className={cn(
          'flex items-center justify-between gap-3',
          collapsed ? 'min-h-9' : 'gap-4',
        )}
      >
        <div className={cn('min-w-0', collapsed && 'flex items-center gap-2')}>
          <Link
            href="/"
            className={cn(
              'bg-gradient-to-r from-neon-cyan to-neon-green bg-clip-text font-bold text-transparent',
              collapsed ? 'text-base' : 'text-xl',
            )}
          >
            Babata
          </Link>
          {!collapsed ? (
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>

        <nav
          className={cn(
            'flex items-center rounded-full border border-border/70 bg-muted/40',
            collapsed ? 'gap-0.5 p-0.5' : 'gap-1 p-1',
          )}
          aria-label="主导航"
        >
          {navItems.map((item) => {
            const Icon = item.icon
            const active =
              item.href === '/'
                ? pathname === '/'
                : pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                aria-label={item.label}
                className={cn(
                  'flex items-center justify-center rounded-full transition-colors',
                  collapsed ? 'size-8' : 'px-3 py-1.5 text-sm',
                  active
                    ? 'bg-primary text-primary-foreground shadow-[0_0_10px_var(--neon-cyan-glow)]'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {collapsed ? (
                  <Icon className="size-4" />
                ) : (
                  item.label
                )}
              </Link>
            )
          })}
        </nav>

        <div className="flex items-center gap-2">
          {username ? (
            <AuthHeaderActions username={username} compact={collapsed} />
          ) : null}
          {onToggleCollapse ? (
            <LayoutCollapseButton
              target="header"
              collapsed={collapsed}
              onClick={onToggleCollapse}
            />
          ) : null}
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
