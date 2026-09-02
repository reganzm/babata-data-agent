import type { NextConfig } from 'next'
import { existsSync } from 'node:fs'
import path from 'node:path'

function resolveOutputFileTracingRoot(startDir: string): string {
  let dir = startDir
  for (;;) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
      return dir
    }
    const parent = path.dirname(dir)
    if (parent === dir) return startDir
    dir = parent
  }
}

const appRoot = process.cwd()

const nextConfig: NextConfig = {
  output: 'standalone',
  // pnpm monorepo 部署时需指向 workspace 根，否则 standalone 可能只有 workspace/ 壳目录
  outputFileTracingRoot: resolveOutputFileTracingRoot(appRoot),
  serverExternalPackages: ['@mastra/libsql', 'libsql', '@libsql/client'],
  // 允许局域网 IP 访问 dev HMR（webpack-hmr WebSocket）
  allowedDevOrigins: ['10.112.34.100'],
}

export default nextConfig
