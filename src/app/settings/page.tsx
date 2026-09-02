'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Shield, Trash2, UserPlus, Users } from 'lucide-react'
import { DataWorkspaceHeader } from '@/app/components/DataWorkspaceHeader'
import {
  hasAnyPermission,
  hasPermission,
  useAuthSession,
} from '@/app/components/useAuthSession'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import type { PermissionCode } from '@/lib/auth/permissions'

type RoleSummary = {
  id: string
  name: string
  description: string
}

type UserRecord = {
  id: string
  username: string
  createdAt: string
  roles: RoleSummary[]
}

type RoleRecord = RoleSummary & {
  permissions: PermissionCode[]
  resources: Array<{
    resourceType: 'data_source'
    resourceId: string
    resourceName: string
  }>
}

type PermissionDefinition = {
  code: PermissionCode
  name: string
  description: string
  group: string
}

type DataSourceOption = {
  id: string
  name: string
  type: string
}

type Tab = 'users' | 'roles'

export default function SettingsPage() {
  const auth = useAuthSession()
  const [tab, setTab] = useState<Tab>('users')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const [users, setUsers] = useState<UserRecord[]>([])
  const [roles, setRoles] = useState<RoleSummary[]>([])
  const [permissionDefs, setPermissionDefs] = useState<PermissionDefinition[]>([])
  const [dataSourceOptions, setDataSourceOptions] = useState<DataSourceOption[]>([])

  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newUserRoleIds, setNewUserRoleIds] = useState<string[]>([])

  const [editingUser, setEditingUser] = useState<UserRecord | null>(null)
  const [editPassword, setEditPassword] = useState('')
  const [editUserRoleIds, setEditUserRoleIds] = useState<string[]>([])

  const [editingRole, setEditingRole] = useState<RoleRecord | null>(null)
  const [roleFormOpen, setRoleFormOpen] = useState(false)
  const [roleName, setRoleName] = useState('')
  const [roleDescription, setRoleDescription] = useState('')
  const [rolePermissions, setRolePermissions] = useState<PermissionCode[]>([])
  const [roleResourceIds, setRoleResourceIds] = useState<string[]>([])

  const canReadUsers = auth.authDisabled || hasPermission(auth.permissions, 'user:read')
  const canWriteUsers = auth.authDisabled || hasPermission(auth.permissions, 'user:write')
  const canDeleteUsers = auth.authDisabled || hasPermission(auth.permissions, 'user:delete')
  const canReadRoles = auth.authDisabled || hasPermission(auth.permissions, 'role:read')
  const canWriteRoles = auth.authDisabled || hasPermission(auth.permissions, 'role:write')
  const canDeleteRoles = auth.authDisabled || hasPermission(auth.permissions, 'role:delete')
  const canAccessSettings =
    auth.authDisabled ||
    hasAnyPermission(auth.permissions, [
      'user:read',
      'user:write',
      'role:read',
      'role:write',
    ])

  const permissionGroups = useMemo(() => {
    const groups = new Map<string, PermissionDefinition[]>()
    for (const item of permissionDefs) {
      const list = groups.get(item.group) ?? []
      list.push(item)
      groups.set(item.group, list)
    }
    return [...groups.entries()]
  }, [permissionDefs])

  const loadUsers = useCallback(async () => {
    const res = await fetch('/api/settings/users')
    const body = (await res.json()) as { users?: UserRecord[]; error?: string }
    if (!res.ok) throw new Error(body.error || '加载用户失败')
    setUsers(body.users ?? [])
  }, [])

  const loadRoles = useCallback(async () => {
    const res = await fetch('/api/settings/roles')
    const body = (await res.json()) as { roles?: RoleSummary[]; error?: string }
    if (!res.ok) throw new Error(body.error || '加载角色失败')
    setRoles(body.roles ?? [])
  }, [])

  const loadMeta = useCallback(async () => {
    const [permRes, dsRes] = await Promise.all([
      fetch('/api/settings/permissions'),
      fetch('/api/settings/resources/data-sources'),
    ])
    const permBody = (await permRes.json()) as {
      permissions?: PermissionDefinition[]
      error?: string
    }
    const dsBody = (await dsRes.json()) as {
      dataSources?: DataSourceOption[]
      error?: string
    }
    if (!permRes.ok) throw new Error(permBody.error || '加载权限定义失败')
    if (!dsRes.ok) throw new Error(dsBody.error || '加载数据源列表失败')
    setPermissionDefs(permBody.permissions ?? [])
    setDataSourceOptions(dsBody.dataSources ?? [])
  }, [])

  const reload = useCallback(async () => {
    setError('')
    await Promise.all([
      canReadUsers ? loadUsers() : Promise.resolve(),
      canReadRoles ? loadRoles() : Promise.resolve(),
      canReadRoles ? loadMeta() : Promise.resolve(),
    ])
  }, [canReadRoles, canReadUsers, loadMeta, loadRoles, loadUsers])

  useEffect(() => {
    if (auth.loading) return
    if (!canAccessSettings) {
      setError('无权限访问设置')
      return
    }
    void reload().catch((item) =>
      setError(item instanceof Error ? item.message : '加载失败'),
    )
  }, [auth.loading, canAccessSettings, reload])

  function toggleRoleId(list: string[], roleId: string): string[] {
    return list.includes(roleId)
      ? list.filter((id) => id !== roleId)
      : [...list, roleId]
  }

  function togglePermission(code: PermissionCode) {
    setRolePermissions((current) =>
      current.includes(code)
        ? current.filter((item) => item !== code)
        : [...current, code],
    )
  }

  function toggleResourceId(resourceId: string) {
    setRoleResourceIds((current) =>
      current.includes(resourceId)
        ? current.filter((id) => id !== resourceId)
        : [...current, resourceId],
    )
  }

  function openCreateRole() {
    setEditingRole(null)
    setRoleName('')
    setRoleDescription('')
    setRolePermissions([])
    setRoleResourceIds([])
    setRoleFormOpen(true)
  }

  async function openEditRole(roleId: string) {
    const res = await fetch(`/api/settings/roles/${roleId}`)
    const body = (await res.json()) as { role?: RoleRecord; error?: string }
    if (!res.ok || !body.role) {
      setError(body.error || '加载角色详情失败')
      return
    }
    setEditingRole(body.role)
    setRoleName(body.role.name)
    setRoleDescription(body.role.description)
    setRolePermissions(body.role.permissions)
    setRoleResourceIds(body.role.resources.map((item) => item.resourceId))
    setRoleFormOpen(true)
  }

  async function saveRole() {
    if (!roleName.trim()) return
    setBusy(true)
    setError('')
    try {
      const payload = {
        name: roleName,
        description: roleDescription,
        permissions: rolePermissions,
        resources: roleResourceIds.map((resourceId) => ({
          resourceType: 'data_source' as const,
          resourceId,
        })),
      }
      const res = editingRole
        ? await fetch(`/api/settings/roles/${editingRole.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch('/api/settings/roles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
      const body = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(body.error || '保存角色失败')
      setRoleFormOpen(false)
      await reload()
    } catch (item) {
      setError(item instanceof Error ? item.message : '保存角色失败')
    } finally {
      setBusy(false)
    }
  }

  async function removeRole(roleId: string) {
    if (!confirm('确定删除该角色？已绑定用户将失去对应权限。')) return
    const res = await fetch(`/api/settings/roles/${roleId}`, { method: 'DELETE' })
    const body = (await res.json()) as { error?: string }
    if (!res.ok) {
      setError(body.error || '删除角色失败')
      return
    }
    await reload()
  }

  async function createUser() {
    if (!newUsername.trim() || !newPassword) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/settings/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: newUsername,
          password: newPassword,
          roleIds: newUserRoleIds,
        }),
      })
      const body = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(body.error || '创建用户失败')
      setNewUsername('')
      setNewPassword('')
      setNewUserRoleIds([])
      await reload()
    } catch (item) {
      setError(item instanceof Error ? item.message : '创建用户失败')
    } finally {
      setBusy(false)
    }
  }

  function openEditUser(user: UserRecord) {
    setEditingUser(user)
    setEditPassword('')
    setEditUserRoleIds(user.roles.map((role) => role.id))
  }

  async function saveUser() {
    if (!editingUser) return
    setBusy(true)
    setError('')
    try {
      const payload: { password?: string; roleIds: string[] } = {
        roleIds: editUserRoleIds,
      }
      if (editPassword.trim()) payload.password = editPassword
      const res = await fetch(`/api/settings/users/${editingUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(body.error || '更新用户失败')
      setEditingUser(null)
      await reload()
    } catch (item) {
      setError(item instanceof Error ? item.message : '更新用户失败')
    } finally {
      setBusy(false)
    }
  }

  async function removeUser(userId: string) {
    if (!confirm('确定删除该用户？')) return
    const res = await fetch(`/api/settings/users/${userId}`, { method: 'DELETE' })
    const body = (await res.json()) as { error?: string }
    if (!res.ok) {
      setError(body.error || '删除用户失败')
      return
    }
    await reload()
  }

  return (
    <div className="min-h-screen bg-background">
      <DataWorkspaceHeader username={auth.username} showSettings />
      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-6 flex items-center gap-3">
          <Shield className="size-6 text-primary" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">系统设置</h1>
            <p className="text-sm text-muted-foreground">
              基于 RBAC 的用户、角色与数据源资源权限管理
            </p>
          </div>
        </div>

        {error ? (
          <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {!canAccessSettings && !auth.loading ? (
          <p className="text-muted-foreground">当前账号无设置访问权限。</p>
        ) : (
          <>
            <div className="mb-6 flex gap-2 rounded-full border border-border/70 bg-muted/40 p-1 w-fit">
              {canReadUsers ? (
                <button
                  type="button"
                  onClick={() => setTab('users')}
                  className={`rounded-full px-4 py-1.5 text-sm transition-colors ${
                    tab === 'users'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  用户管理
                </button>
              ) : null}
              {canReadRoles ? (
                <button
                  type="button"
                  onClick={() => setTab('roles')}
                  className={`rounded-full px-4 py-1.5 text-sm transition-colors ${
                    tab === 'roles'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  角色管理
                </button>
              ) : null}
            </div>

            {tab === 'users' && canReadUsers ? (
              <section className="space-y-6">
                {canWriteUsers ? (
                  <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
                    <h2 className="mb-4 flex items-center gap-2 text-lg font-medium">
                      <UserPlus className="size-4" />
                      新建用户
                    </h2>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Input
                        placeholder="用户名"
                        value={newUsername}
                        onChange={(event) => setNewUsername(event.target.value)}
                      />
                      <Input
                        type="password"
                        placeholder="初始密码（至少 6 位）"
                        value={newPassword}
                        onChange={(event) => setNewPassword(event.target.value)}
                      />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {roles.map((role) => (
                        <button
                          key={role.id}
                          type="button"
                          onClick={() =>
                            setNewUserRoleIds((current) => toggleRoleId(current, role.id))
                          }
                          className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                            newUserRoleIds.includes(role.id)
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-border text-muted-foreground'
                          }`}
                        >
                          {role.name}
                        </button>
                      ))}
                    </div>
                    <Button className="mt-4" disabled={busy} onClick={() => void createUser()}>
                      创建用户
                    </Button>
                  </div>
                ) : null}

                <div className="rounded-xl border border-border bg-card shadow-sm">
                  <div className="border-b border-border px-5 py-3">
                    <h2 className="flex items-center gap-2 text-lg font-medium">
                      <Users className="size-4" />
                      用户列表
                    </h2>
                  </div>
                  <ul className="divide-y divide-border">
                    {users.map((user) => (
                      <li
                        key={user.id}
                        className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
                      >
                        <div>
                          <p className="font-medium">{user.username}</p>
                          <p className="text-xs text-muted-foreground">
                            创建于 {new Date(user.createdAt).toLocaleString('zh-CN')}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {user.roles.length > 0 ? (
                              user.roles.map((role) => (
                                <Badge key={role.id} variant="secondary">
                                  {role.name}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-xs text-muted-foreground">未分配角色</span>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {canWriteUsers ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openEditUser(user)}
                            >
                              编辑
                            </Button>
                          ) : null}
                          {canDeleteUsers && user.id !== auth.userId ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => void removeUser(user.id)}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            ) : null}

            {tab === 'roles' && canReadRoles ? (
              <section className="space-y-6">
                {canWriteRoles ? (
                  <div className="flex justify-end">
                    <Button onClick={openCreateRole}>新建角色</Button>
                  </div>
                ) : null}
                <div className="rounded-xl border border-border bg-card shadow-sm">
                  <ul className="divide-y divide-border">
                    {roles.map((role) => (
                      <li
                        key={role.id}
                        className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
                      >
                        <div>
                          <p className="font-medium">{role.name}</p>
                          {role.description ? (
                            <p className="text-sm text-muted-foreground">{role.description}</p>
                          ) : null}
                        </div>
                        <div className="flex gap-2">
                          {canWriteRoles ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => void openEditRole(role.id)}
                            >
                              编辑
                            </Button>
                          ) : null}
                          {canDeleteRoles && role.name !== '系统管理员' ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => void removeRole(role.id)}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            ) : null}
          </>
        )}

        {editingUser ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-lg">
              <h3 className="mb-4 text-lg font-medium">编辑用户：{editingUser.username}</h3>
              <Input
                type="password"
                placeholder="新密码（留空则不修改）"
                value={editPassword}
                onChange={(event) => setEditPassword(event.target.value)}
                className="mb-3"
              />
              <p className="mb-2 text-sm text-muted-foreground">分配角色</p>
              <div className="mb-4 flex flex-wrap gap-2">
                {roles.map((role) => (
                  <button
                    key={role.id}
                    type="button"
                    onClick={() =>
                      setEditUserRoleIds((current) => toggleRoleId(current, role.id))
                    }
                    className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                      editUserRoleIds.includes(role.id)
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground'
                    }`}
                  >
                    {role.name}
                  </button>
                ))}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditingUser(null)}>
                  取消
                </Button>
                <Button disabled={busy} onClick={() => void saveUser()}>
                  保存
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {roleFormOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-lg">
              <h3 className="mb-4 text-lg font-medium">
                {editingRole ? `编辑角色：${editingRole.name}` : '新建角色'}
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  placeholder="角色名称"
                  value={roleName}
                  onChange={(event) => setRoleName(event.target.value)}
                />
                <Input
                  placeholder="描述（可选）"
                  value={roleDescription}
                  onChange={(event) => setRoleDescription(event.target.value)}
                />
              </div>

              <p className="mb-2 mt-5 text-sm font-medium">权限</p>
              <div className="space-y-4">
                {permissionGroups.map(([group, items]) => (
                  <div key={group}>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {group}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {items.map((item) => (
                        <button
                          key={item.code}
                          type="button"
                          title={item.description}
                          onClick={() => togglePermission(item.code)}
                          className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                            rolePermissions.includes(item.code)
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-border text-muted-foreground'
                          }`}
                        >
                          {item.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <p className="mb-2 mt-5 text-sm font-medium">绑定数据源资源</p>
              <p className="mb-2 text-xs text-muted-foreground">
                用户通过角色获得对已绑定数据源的访问；需同时勾选对应的数据源权限（读取/编辑/删除）。
              </p>
              <div className="flex flex-wrap gap-2">
                {dataSourceOptions.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggleResourceId(item.id)}
                    className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                      roleResourceIds.includes(item.id)
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground'
                    }`}
                  >
                    {item.name}
                  </button>
                ))}
                {dataSourceOptions.length === 0 ? (
                  <span className="text-xs text-muted-foreground">暂无数据源</span>
                ) : null}
              </div>

              <div className="mt-6 flex justify-end gap-2">
                <Button variant="outline" onClick={() => setRoleFormOpen(false)}>
                  取消
                </Button>
                <Button disabled={busy} onClick={() => void saveRole()}>
                  保存
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  )
}
