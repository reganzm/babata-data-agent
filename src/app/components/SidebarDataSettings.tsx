'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BookOpen, Database, Settings, Shield } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { hasAnyPermission, useAuthSession } from '@/app/components/useAuthSession'
import { cn } from '@/lib/utils'

const DATA_SETTINGS_ITEMS = [
  {
    href: '/data-sources',
    label: '数据源',
    description: '管理数据源连接',
    icon: Database,
  },
  {
    href: '/knowledge-bases',
    label: '知识库',
    description: '管理 RAG 文档',
    icon: BookOpen,
  },
] as const

const SETTINGS_ITEM = {
  href: '/settings',
  label: '设置',
  description: '用户与角色管理',
  icon: Shield,
} as const

export function SidebarDataSettings() {
  const pathname = usePathname()
  const auth = useAuthSession()
  const canSeeSettings =
    auth.authDisabled ||
    hasAnyPermission(auth.permissions, [
      'user:read',
      'user:write',
      'role:read',
      'role:write',
    ])
  const menuItems = canSeeSettings
    ? [...DATA_SETTINGS_ITEMS, SETTINGS_ITEM]
    : DATA_SETTINGS_ITEMS

  return (
    <div className="border-t border-sidebar-border bg-sidebar px-3 py-3">
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            'inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border/60',
            'bg-background/70 text-muted-foreground transition-colors',
            'hover:bg-sidebar-accent hover:text-foreground',
            'data-open:bg-sidebar-accent data-open:text-foreground',
          )}
          aria-label="数据与系统设置"
          title="数据与系统设置"
        >
          <Settings className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" sideOffset={8} className="min-w-[220px]">
          <p className="px-2 py-1.5 text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
            我的数据
          </p>
          {menuItems.map((item) => {
            const Icon = item.icon
            const active = pathname.startsWith(item.href)
            return (
              <DropdownMenuItem key={item.href} className="p-0">
                <Link
                  href={item.href}
                  className={cn(
                    'flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left',
                    active && 'bg-accent/60',
                  )}
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{item.label}</span>
                    <span className="block text-xs text-muted-foreground">
                      {item.description}
                    </span>
                  </span>
                </Link>
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
