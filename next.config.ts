import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['@mastra/libsql', 'libsql', '@libsql/client'],
}

export default nextConfig
