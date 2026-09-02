import { getDbClient } from '@/lib/db/client'
import { ensureSchema } from '@/lib/db/schema'
import { hashPassword } from './password'

export type AuthUser = {
  id: string
  username: string
  createdAt: string
}

type UserRow = {
  id: string
  username: string
  password_hash: string
  created_at: string
}

export async function findUserByUsername(
  username: string,
): Promise<(AuthUser & { passwordHash: string }) | null> {
  await ensureSchema()
  const db = getDbClient()
  const result = await db.execute({
    sql: `SELECT id, username, password_hash, created_at
          FROM babata_users WHERE username = ? COLLATE NOCASE LIMIT 1`,
    args: [username.trim()],
  })
  const row = result.rows[0] as unknown as UserRow | undefined
  if (!row) return null
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    createdAt: row.created_at,
  }
}

export async function findUserById(id: string): Promise<AuthUser | null> {
  await ensureSchema()
  const db = getDbClient()
  const result = await db.execute({
    sql: `SELECT id, username, created_at FROM babata_users WHERE id = ? LIMIT 1`,
    args: [id],
  })
  const row = result.rows[0] as unknown as UserRow | undefined
  if (!row) return null
  return {
    id: row.id,
    username: row.username,
    createdAt: row.created_at,
  }
}

export async function createUser(
  username: string,
  plainPassword: string,
): Promise<AuthUser> {
  await ensureSchema()
  const normalized = username.trim()
  if (!normalized || normalized.length < 2) {
    throw new Error('用户名至少 2 个字符')
  }
  if (plainPassword.length < 6) {
    throw new Error('密码至少 6 位')
  }
  const existing = await findUserByUsername(normalized)
  if (existing) {
    throw new Error('用户名已存在')
  }
  const user: AuthUser = {
    id: crypto.randomUUID(),
    username: normalized,
    createdAt: new Date().toISOString(),
  }
  const db = getDbClient()
  await db.execute({
    sql: `INSERT INTO babata_users (id, username, password_hash, created_at)
          VALUES (?, ?, ?, ?)`,
    args: [user.id, user.username, hashPassword(plainPassword), user.createdAt],
  })
  return user
}

export async function changeUserPassword(
  username: string,
  newPlainPassword: string,
): Promise<AuthUser> {
  await ensureSchema()
  const normalized = username.trim()
  if (!normalized) {
    throw new Error('用户名不能为空')
  }
  if (newPlainPassword.length < 6) {
    throw new Error('密码至少 6 位')
  }
  const existing = await findUserByUsername(normalized)
  if (!existing) {
    throw new Error('用户不存在')
  }
  const db = getDbClient()
  await db.execute({
    sql: `UPDATE babata_users SET password_hash = ? WHERE id = ?`,
    args: [hashPassword(newPlainPassword), existing.id],
  })
  return {
    id: existing.id,
    username: existing.username,
    createdAt: existing.createdAt,
  }
}

export async function countUsers(): Promise<number> {
  await ensureSchema()
  const db = getDbClient()
  const result = await db.execute(`SELECT COUNT(*) AS c FROM babata_users`)
  const row = result.rows[0] as unknown as { c: number } | undefined
  return Number(row?.c ?? 0)
}

export async function listUsers(): Promise<AuthUser[]> {
  await ensureSchema()
  const db = getDbClient()
  const result = await db.execute(`
    SELECT id, username, created_at
    FROM babata_users
    ORDER BY created_at ASC
  `)
  return (result.rows as unknown as UserRow[]).map((row) => ({
    id: row.id,
    username: row.username,
    createdAt: row.created_at,
  }))
}

export async function updateUserPasswordById(
  userId: string,
  newPlainPassword: string,
): Promise<AuthUser> {
  await ensureSchema()
  if (newPlainPassword.length < 6) {
    throw new Error('密码至少 6 位')
  }
  const user = await findUserById(userId)
  if (!user) throw new Error('用户不存在')
  const db = getDbClient()
  await db.execute({
    sql: `UPDATE babata_users SET password_hash = ? WHERE id = ?`,
    args: [hashPassword(newPlainPassword), userId],
  })
  return user
}

export async function deleteUser(userId: string): Promise<boolean> {
  await ensureSchema()
  const db = getDbClient()
  const result = await db.execute({
    sql: `DELETE FROM babata_users WHERE id = ?`,
    args: [userId],
  })
  return (result.rowsAffected ?? 0) > 0
}
