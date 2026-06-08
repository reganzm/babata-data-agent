/**
 * 创建登录用户（写入 storage.db 的 babata_users 表）
 * 用法: pnpm user:create <用户名> <密码>
 */
import { createUser } from '../src/lib/auth/users'

async function main() {
  const username = process.argv[2]
  const password = process.argv[3]
  if (!username || !password) {
    console.error('用法: pnpm user:create <用户名> <密码>')
    process.exit(1)
  }
  const user = await createUser(username, password)
  console.log(`已创建用户: ${user.username} (id=${user.id})`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
