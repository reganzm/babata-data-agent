#!/usr/bin/env node
/**
 * Next.js standalone 产物需手动同步 static / public，否则页面只有 HTML 壳子。
 * @see https://nextjs.org/docs/app/api-reference/config/next-config-js/output
 */
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const standaloneRoot = path.join(root, '.next', 'standalone')
const packageName = require(path.join(root, 'package.json')).name

/** @type {{ standaloneRoot: string; appDir: string; serverJs: string } | null} */
let resolvedEntry = null

function copyIfExists(source, target) {
  if (!fs.existsSync(source)) return false
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.cpSync(source, target, { recursive: true })
  return true
}

function findServerJsFiles(dir, maxDepth = 10, depth = 0, results = []) {
  if (depth > maxDepth || !fs.existsSync(dir)) return results
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isFile() && entry.name === 'server.js') {
      results.push(fullPath)
      continue
    }
    if (entry.isDirectory() && entry.name !== 'node_modules') {
      findServerJsFiles(fullPath, maxDepth, depth + 1, results)
    }
  }
  return results
}

function pickBestServerJs(candidates) {
  if (candidates.length === 0) return null
  const preferred = candidates.find((filePath) =>
    filePath.includes(`${path.sep}${packageName}${path.sep}server.js`),
  )
  if (preferred) return preferred
  return [...candidates].sort(
    (a, b) => a.split(path.sep).length - b.split(path.sep).length,
  )[0]
}

function findStandaloneServerEntry() {
  if (!fs.existsSync(standaloneRoot)) return null

  const direct = path.join(standaloneRoot, 'server.js')
  if (fs.existsSync(direct)) {
    return { standaloneRoot, appDir: standaloneRoot, serverJs: direct }
  }

  const serverJs = pickBestServerJs(findServerJsFiles(standaloneRoot))
  if (!serverJs) return null

  return {
    standaloneRoot,
    appDir: path.dirname(serverJs),
    serverJs,
  }
}

function printTree(dir, indent = '    ', depth = 0, maxDepth = 4) {
  if (depth > maxDepth || !fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    console.error(`${indent}- ${entry.name}${entry.isDirectory() ? '/' : ''}`)
    if (entry.isDirectory() && depth < maxDepth) {
      printTree(path.join(dir, entry.name), `${indent}  `, depth + 1, maxDepth)
    }
  }
}

function printStandaloneDiagnostics() {
  console.error('[prepare-standalone] 未找到 .next/standalone/**/server.js')
  console.error('[prepare-standalone] 请确认:')
  console.error('  1. next.config.ts 含 output: "standalone"')
  console.error('  2. 在应用目录执行: pnpm exec next build --webpack')
  console.error('  3. 若在 pnpm workspace 中，需在含 package.json 的 babata 目录构建')
  if (fs.existsSync(standaloneRoot)) {
    console.error('[prepare-standalone] 当前 .next/standalone 内容:')
    printTree(standaloneRoot, '  ')
    const partial = findServerJsFiles(standaloneRoot)
    if (partial.length > 0) {
      console.error('[prepare-standalone] 发现 server.js:')
      for (const filePath of partial) {
        console.error(`  - ${path.relative(root, filePath)}`)
      }
    }
  } else if (fs.existsSync(path.join(root, '.next'))) {
    console.error('[prepare-standalone] .next 存在但无 standalone 目录')
  } else {
    console.error('[prepare-standalone] .next 目录不存在，请先 next build')
  }
}

function resolveStandaloneEntry() {
  if (resolvedEntry) return resolvedEntry
  resolvedEntry = findStandaloneServerEntry()
  return resolvedEntry
}

function prepareStandaloneAssets() {
  const entry = resolveStandaloneEntry()
  if (!entry) {
    printStandaloneDiagnostics()
    process.exit(1)
  }

  const staticCopied = copyIfExists(
    path.join(root, '.next', 'static'),
    path.join(entry.appDir, '.next', 'static'),
  )
  const publicCopied = copyIfExists(
    path.join(root, 'public'),
    path.join(entry.appDir, 'public'),
  )

  let envCopied = false
  for (const name of ['.env', '.env.local', '.env.production']) {
    if (copyIfExists(path.join(root, name), path.join(entry.appDir, name))) {
      envCopied = true
    }
  }

  if (!staticCopied) {
    console.error('[prepare-standalone] 缺少 .next/static，请先执行 pnpm build')
    process.exit(1)
  }

  const parts = ['static', publicCopied && 'public', envCopied && 'env'].filter(Boolean)
  console.log(
    `[prepare-standalone] 已同步 standalone 资源（${parts.join(' + ')}）→ ${path.relative(root, entry.appDir)}`,
  )
  console.log(`[prepare-standalone] 入口 server.js → ${path.relative(root, entry.serverJs)}`)
}

function getStandaloneDir() {
  const entry = resolveStandaloneEntry()
  return entry?.appDir ?? standaloneRoot
}

function getStandaloneServerJs() {
  const entry = resolveStandaloneEntry()
  return entry?.serverJs ?? path.join(standaloneRoot, 'server.js')
}

if (require.main === module) {
  prepareStandaloneAssets()
}

module.exports = {
  prepareStandaloneAssets,
  getStandaloneDir,
  getStandaloneServerJs,
  findStandaloneServerEntry,
  findServerJsFiles,
}
