/**
 * 把已有用户加入「系统管理员」角色（幂等）
 * 用法: pnpm user:grant-admin <用户名>
 */
import { findUserByUsername } from '../src/lib/auth/users'
import { grantAdminRole } from '../src/lib/db/rbac'

async function main() {
  const username = process.argv[2]
  if (!username) {
    console.error('用法: pnpm user:grant-admin <用户名>')
    process.exit(1)
  }
  const user = await findUserByUsername(username)
  if (!user) {
    console.error(`用户不存在: ${username}`)
    process.exit(1)
  }
  await grantAdminRole(user.id)
  console.log(`已将 ${user.username} 加入「系统管理员」角色`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
