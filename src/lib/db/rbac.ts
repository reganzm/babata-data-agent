import type { InValue } from '@libsql/client'
import { getDbClient } from '@/lib/db/client'
import { ensureSchema } from '@/lib/db/schema'
import {
  ALL_PERMISSION_CODES,
  ADMIN_ROLE_NAME,
  isPermissionCode,
  type PermissionCode,
} from '@/lib/auth/permissions'

export type ResourceType = 'data_source'

export type RoleRecord = {
  id: string
  name: string
  description: string
  createdAt: string
  updatedAt: string
}

export type RoleDetail = RoleRecord & {
  permissions: PermissionCode[]
  resources: Array<{
    resourceType: ResourceType
    resourceId: string
    resourceName: string
  }>
}

type RoleRow = {
  id: string
  name: string
  description: string
  created_at: string
  updated_at: string
}

function rowToRole(row: RoleRow): RoleRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const code = (error as { code?: string }).code
  if (code === 'SQLITE_CONSTRAINT' || code === 'SQLITE_CONSTRAINT_UNIQUE') return true
  const cause = (error as { cause?: { code?: string } }).cause
  return (
    cause?.code === 'SQLITE_CONSTRAINT' || cause?.code === 'SQLITE_CONSTRAINT_UNIQUE'
  )
}

async function findAdminRoleId(): Promise<string | undefined> {
  const db = getDbClient()
  const existing = await db.execute({
    sql: `SELECT id FROM babata_roles WHERE name = ? COLLATE NOCASE LIMIT 1`,
    args: [ADMIN_ROLE_NAME],
  })
  return (existing.rows[0] as unknown as { id: string } | undefined)?.id
}

async function ensureAdminRolePermissions(roleId: string): Promise<void> {
  const db = getDbClient()
  for (const permission of ALL_PERMISSION_CODES) {
    await db.execute({
      sql: `INSERT OR IGNORE INTO babata_role_permissions (role_id, permission_code)
            VALUES (?, ?)`,
      args: [roleId, permission],
    })
  }
}

async function assignAllUsersToAdminRole(roleId: string): Promise<void> {
  const db = getDbClient()
  const allUsers = await db.execute(`SELECT id FROM babata_users`)
  for (const row of allUsers.rows as unknown as { id: string }[]) {
    await db.execute({
      sql: `INSERT OR IGNORE INTO babata_user_roles (user_id, role_id) VALUES (?, ?)`,
      args: [row.id, roleId],
    })
  }
}

async function runRbacSeed(): Promise<void> {
  await ensureSchema()
  let adminRoleId = await findAdminRoleId()
  let createdAdminRole = false

  if (!adminRoleId) {
    const db = getDbClient()
    const now = new Date().toISOString()
    adminRoleId = crypto.randomUUID()
    try {
      await db.execute({
        sql: `INSERT INTO babata_roles (id, name, description, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?)`,
        args: [adminRoleId, ADMIN_ROLE_NAME, '拥有全部权限', now, now],
      })
      createdAdminRole = true
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error
      adminRoleId = await findAdminRoleId()
      if (!adminRoleId) throw error
    }
  }

  if (!adminRoleId) return

  await ensureAdminRolePermissions(adminRoleId)
  if (createdAdminRole) {
    await assignAllUsersToAdminRole(adminRoleId)
  }
}

let rbacSeedPromise: Promise<void> | null = null

export async function ensureRbacSeed(): Promise<void> {
  if (!rbacSeedPromise) {
    rbacSeedPromise = runRbacSeed()
  }
  return rbacSeedPromise
}

export async function listRoles(): Promise<RoleRecord[]> {
  await ensureRbacSeed()
  const db = getDbClient()
  const result = await db.execute(`
    SELECT id, name, description, created_at, updated_at
    FROM babata_roles
    ORDER BY updated_at DESC
  `)
  return (result.rows as unknown as RoleRow[]).map(rowToRole)
}

export async function getRoleById(id: string): Promise<RoleDetail | null> {
  await ensureRbacSeed()
  const db = getDbClient()
  const result = await db.execute({
    sql: `SELECT id, name, description, created_at, updated_at
          FROM babata_roles WHERE id = ? LIMIT 1`,
    args: [id],
  })
  const row = result.rows[0] as unknown as RoleRow | undefined
  if (!row) return null
  const permissions = await listRolePermissions(id)
  const resources = await listRoleResources(id)
  return {
    ...rowToRole(row),
    permissions,
    resources,
  }
}

export async function createRole(input: {
  name: string
  description?: string
  permissions?: PermissionCode[]
  resources?: Array<{ resourceType: ResourceType; resourceId: string }>
}): Promise<RoleDetail> {
  await ensureRbacSeed()
  const name = input.name.trim()
  if (!name) throw new Error('角色名称不能为空')
  const db = getDbClient()
  const duplicate = await db.execute({
    sql: `SELECT id FROM babata_roles WHERE name = ? COLLATE NOCASE LIMIT 1`,
    args: [name],
  })
  if (duplicate.rows.length > 0) throw new Error('角色名称已存在')

  const now = new Date().toISOString()
  const id = crypto.randomUUID()
  await db.execute({
    sql: `INSERT INTO babata_roles (id, name, description, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?)`,
    args: [id, name, input.description?.trim() ?? '', now, now],
  })
  await replaceRolePermissions(id, input.permissions ?? [])
  await replaceRoleResources(id, input.resources ?? [])
  const role = await getRoleById(id)
  if (!role) throw new Error('创建角色失败')
  return role
}

export async function updateRole(
  id: string,
  input: {
    name?: string
    description?: string
    permissions?: PermissionCode[]
    resources?: Array<{ resourceType: ResourceType; resourceId: string }>
  },
): Promise<RoleDetail | null> {
  await ensureRbacSeed()
  const existing = await getRoleById(id)
  if (!existing) return null
  const db = getDbClient()
  const nextName = input.name?.trim() ?? existing.name
  if (!nextName) throw new Error('角色名称不能为空')
  if (nextName.toLowerCase() !== existing.name.toLowerCase()) {
    const duplicate = await db.execute({
      sql: `SELECT id FROM babata_roles WHERE name = ? COLLATE NOCASE AND id <> ? LIMIT 1`,
      args: [nextName, id],
    })
    if (duplicate.rows.length > 0) throw new Error('角色名称已存在')
  }
  const updatedAt = new Date().toISOString()
  await db.execute({
    sql: `UPDATE babata_roles SET name = ?, description = ?, updated_at = ? WHERE id = ?`,
    args: [nextName, input.description?.trim() ?? existing.description, updatedAt, id],
  })
  if (input.permissions) await replaceRolePermissions(id, input.permissions)
  if (input.resources) await replaceRoleResources(id, input.resources)
  return getRoleById(id)
}

export async function deleteRole(id: string): Promise<boolean> {
  await ensureRbacSeed()
  const existing = await getRoleById(id)
  if (!existing) return false
  if (existing.name === ADMIN_ROLE_NAME) {
    throw new Error('系统管理员角色不可删除')
  }
  const db = getDbClient()
  await db.execute({ sql: `DELETE FROM babata_role_permissions WHERE role_id = ?`, args: [id] })
  await db.execute({ sql: `DELETE FROM babata_role_resources WHERE role_id = ?`, args: [id] })
  await db.execute({ sql: `DELETE FROM babata_user_roles WHERE role_id = ?`, args: [id] })
  await db.execute({ sql: `DELETE FROM babata_roles WHERE id = ?`, args: [id] })
  return true
}

async function listRolePermissions(roleId: string): Promise<PermissionCode[]> {
  const db = getDbClient()
  const result = await db.execute({
    sql: `SELECT permission_code FROM babata_role_permissions WHERE role_id = ? ORDER BY permission_code`,
    args: [roleId],
  })
  return (result.rows as unknown as { permission_code: string }[])
    .map((row) => row.permission_code)
    .filter(isPermissionCode)
}

async function replaceRolePermissions(
  roleId: string,
  permissions: PermissionCode[],
): Promise<void> {
  const db = getDbClient()
  await db.execute({
    sql: `DELETE FROM babata_role_permissions WHERE role_id = ?`,
    args: [roleId],
  })
  for (const permission of new Set(permissions)) {
    if (!isPermissionCode(permission)) continue
    await db.execute({
      sql: `INSERT INTO babata_role_permissions (role_id, permission_code) VALUES (?, ?)`,
      args: [roleId, permission],
    })
  }
}

export async function listRoleResources(roleId: string): Promise<
  Array<{ resourceType: ResourceType; resourceId: string; resourceName: string }>
> {
  const db = getDbClient()
  const result = await db.execute({
    sql: `SELECT rr.resource_type, rr.resource_id, ds.name AS resource_name
          FROM babata_role_resources rr
          LEFT JOIN babata_data_sources ds ON ds.id = rr.resource_id
          WHERE rr.role_id = ? AND rr.resource_type = 'data_source'
          ORDER BY ds.name`,
    args: [roleId],
  })
  return (result.rows as unknown as {
    resource_type: ResourceType
    resource_id: string
    resource_name: string | null
  }[]).map((row) => ({
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    resourceName: row.resource_name ?? row.resource_id,
  }))
}

async function replaceRoleResources(
  roleId: string,
  resources: Array<{ resourceType: ResourceType; resourceId: string }>,
): Promise<void> {
  const db = getDbClient()
  await db.execute({
    sql: `DELETE FROM babata_role_resources WHERE role_id = ?`,
    args: [roleId],
  })
  for (const resource of resources) {
    if (resource.resourceType !== 'data_source') continue
    await db.execute({
      sql: `INSERT INTO babata_role_resources (role_id, resource_type, resource_id)
            VALUES (?, ?, ?)`,
      args: [roleId, resource.resourceType, resource.resourceId],
    })
  }
}

export async function listUserRoleIds(userId: string): Promise<string[]> {
  await ensureRbacSeed()
  const db = getDbClient()
  const result = await db.execute({
    sql: `SELECT role_id FROM babata_user_roles WHERE user_id = ?`,
    args: [userId],
  })
  return (result.rows as unknown as { role_id: string }[]).map((row) => row.role_id)
}

export async function listUserRoles(userId: string): Promise<RoleRecord[]> {
  await ensureRbacSeed()
  const db = getDbClient()
  const result = await db.execute({
    sql: `SELECT r.id, r.name, r.description, r.created_at, r.updated_at
          FROM babata_roles r
          INNER JOIN babata_user_roles ur ON ur.role_id = r.id
          WHERE ur.user_id = ?
          ORDER BY r.name`,
    args: [userId],
  })
  return (result.rows as unknown as RoleRow[]).map(rowToRole)
}

export async function replaceUserRoles(userId: string, roleIds: string[]): Promise<void> {
  await ensureRbacSeed()
  const db = getDbClient()
  await db.execute({ sql: `DELETE FROM babata_user_roles WHERE user_id = ?`, args: [userId] })
  for (const roleId of new Set(roleIds)) {
    const role = await db.execute({
      sql: `SELECT id FROM babata_roles WHERE id = ? LIMIT 1`,
      args: [roleId],
    })
    if (role.rows.length === 0) continue
    await db.execute({
      sql: `INSERT INTO babata_user_roles (user_id, role_id) VALUES (?, ?)`,
      args: [userId, roleId],
    })
  }
}

export async function listUserPermissions(userId: string): Promise<PermissionCode[]> {
  if (!userId) return ALL_PERMISSION_CODES
  await ensureRbacSeed()
  const db = getDbClient()
  const result = await db.execute({
    sql: `SELECT DISTINCT rp.permission_code
          FROM babata_role_permissions rp
          INNER JOIN babata_user_roles ur ON ur.role_id = rp.role_id
          WHERE ur.user_id = ?
          ORDER BY rp.permission_code`,
    args: [userId],
  })
  return (result.rows as unknown as { permission_code: string }[])
    .map((row) => row.permission_code)
    .filter(isPermissionCode)
}

export async function userHasPermission(
  userId: string | null,
  permission: PermissionCode,
): Promise<boolean> {
  if (!userId) return true
  const permissions = await listUserPermissions(userId)
  return permissions.includes(permission)
}

export async function listAccessibleDataSourceIds(
  userId: string | null,
  permission: PermissionCode,
): Promise<string[] | null> {
  if (!userId) return null
  await ensureRbacSeed()
  const db = getDbClient()
  const result = await db.execute({
    sql: `SELECT DISTINCT rr.resource_id
          FROM babata_role_resources rr
          INNER JOIN babata_user_roles ur ON ur.role_id = rr.role_id
          INNER JOIN babata_role_permissions rp ON rp.role_id = rr.role_id
          WHERE ur.user_id = ?
            AND rr.resource_type = 'data_source'
            AND rp.permission_code = ?`,
    args: [userId, permission],
  })
  return (result.rows as unknown as { resource_id: string }[]).map((row) => row.resource_id)
}

export async function canAccessDataSource(
  userId: string | null,
  dataSourceId: string,
  permission: PermissionCode,
): Promise<boolean> {
  if (!userId) return true
  const db = getDbClient()
  const owned = await db.execute({
    sql: `SELECT id FROM babata_data_sources WHERE id = ? AND user_id = ? LIMIT 1`,
    args: [dataSourceId, userId],
  })
  if (owned.rows.length > 0) return true
  const granted = await listAccessibleDataSourceIds(userId, permission)
  return granted?.includes(dataSourceId) ?? false
}

export function buildDataSourceAccessFilter(
  userId: string | null,
  permission: PermissionCode,
): { sql: string; args: InValue[] } | null {
  if (!userId) return null
  return {
    sql: `(user_id = ? OR id IN (
      SELECT rr.resource_id
      FROM babata_role_resources rr
      INNER JOIN babata_user_roles ur ON ur.role_id = rr.role_id
      INNER JOIN babata_role_permissions rp ON rp.role_id = rr.role_id
      WHERE ur.user_id = ? AND rr.resource_type = 'data_source' AND rp.permission_code = ?
    ))`,
    args: [userId, userId, permission],
  }
}
