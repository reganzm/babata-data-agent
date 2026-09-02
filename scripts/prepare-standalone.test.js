const fs = require('fs')
const os = require('os')
const path = require('path')
const { test, describe, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')

describe('prepare-standalone server.js discovery', () => {
  /** @type {string} */
  let tempRoot

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'babata-standalone-'))
    fs.writeFileSync(
      path.join(tempRoot, 'package.json'),
      JSON.stringify({ name: 'babata' }),
    )
    fs.mkdirSync(path.join(tempRoot, 'scripts'), { recursive: true })
    fs.copyFileSync(
      path.join(__dirname, 'prepare-standalone.js'),
      path.join(tempRoot, 'scripts', 'prepare-standalone.js'),
    )
  })

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  })

  test('finds nested workspace/babata/server.js', () => {
    const nestedDir = path.join(tempRoot, '.next', 'standalone', 'workspace', 'babata')
    fs.mkdirSync(nestedDir, { recursive: true })
    fs.writeFileSync(path.join(nestedDir, 'server.js'), 'module.exports = {}')

    const { findStandaloneServerEntry } = require(path.join(
      tempRoot,
      'scripts',
      'prepare-standalone.js',
    ))

    const originalCwd = process.cwd()
    try {
      process.chdir(tempRoot)
      const entry = findStandaloneServerEntry()
      assert.ok(entry)
      assert.equal(entry.serverJs, path.join(nestedDir, 'server.js'))
      assert.equal(entry.appDir, nestedDir)
    } finally {
      process.chdir(originalCwd)
    }
  })
})
