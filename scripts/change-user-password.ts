/**
 * 修改用户密码（storage.db 的 babata_users 表）
 * 用法: pnpm user:chpwd <用户名> <新密码>
 */
import { changeUserPassword } from '../src/lib/auth/users'

async function main() {
  const username = process.argv[2]
  const newPassword = process.argv[3]
  if (!username || !newPassword) {
    console.error('用法: pnpm user:chpwd <用户名> <新密码>')
    process.exit(1)
  }
  const user = await changeUserPassword(username, newPassword)
  console.log(`已更新用户密码: ${user.username} (id=${user.id})`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
