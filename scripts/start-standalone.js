#!/usr/bin/env node
/**
 * 生产 standalone 启动：默认监听 0.0.0.0（允许内网 IP 访问）。
 * 0.0.0.0 仅表示绑定地址，浏览器请使用下方 Network 中的实际 IP。
 * 可通过环境变量 HOSTNAME / PORT 覆盖。
 */
const fs = require('fs')
const os = require('os')
const path = require('path')
const { prepareStandaloneAssets, getStandaloneDir, getStandaloneServerJs } = require('./prepare-standalone')

const projectRoot = path.join(__dirname, '..')

/**
 * standalone 会 chdir 到 .next/standalone，相对路径 file:./storage.db 会落到错误目录（空库、无用户）。
 * 生产环境将相对 file: 路径解析为项目根目录下的绝对路径。
 */
function resolveStorageUrlForStandalone() {
  const raw = process.env.BABATA_STORAGE_URL?.trim() || 'file:./storage.db'
  if (!raw.startsWith('file:')) return raw

  const filePath = raw.slice('file:'.length)
  if (path.isAbsolute(filePath)) return raw

  const absolutePath = path.resolve(projectRoot, filePath)
  return `file:${absolutePath}`
}

const port = process.env.PORT || '3000'
process.env.HOSTNAME = process.env.HOSTNAME || '0.0.0.0'
process.env.PORT = port
process.env.BABATA_STORAGE_URL = resolveStorageUrlForStandalone()

function isIPv4(net) {
  return net.family === 'IPv4' || net.family === 4
}

function listNetworkIPv4Addresses() {
  const addresses = new Set()
  for (const interfaces of Object.values(os.networkInterfaces())) {
    for (const net of interfaces ?? []) {
      if (isIPv4(net) && !net.internal) {
        addresses.add(net.address)
      }
    }
  }
  return [...addresses]
}

function printAccessHints() {
  const ips = listNetworkIPv4Addresses()
  console.log('')
  console.log('Babata production server')
  console.log(`  Local:    http://localhost:${port}`)
  if (ips.length > 0) {
    for (const ip of ips) {
      console.log(`  Network:  http://${ip}:${port}`)
    }
  } else {
    console.log(`  Network:  http://<this-host-ip>:${port}`)
  }
  console.log('  Note:     0.0.0.0 是监听地址，不能在浏览器中直接打开')
  console.log(`  Storage:  ${process.env.BABATA_STORAGE_URL}`)
  const storagePath = process.env.BABATA_STORAGE_URL.startsWith('file:')
    ? process.env.BABATA_STORAGE_URL.slice('file:'.length)
    : ''
  if (storagePath && !fs.existsSync(storagePath)) {
    console.log('  Warning:  storage.db 尚不存在，首次启动将自动创建（需执行 pnpm user:create 创建登录用户）')
  }
  console.log('')
}

printAccessHints()
prepareStandaloneAssets()
const standaloneDir = getStandaloneDir()
process.chdir(standaloneDir)
require(getStandaloneServerJs())
