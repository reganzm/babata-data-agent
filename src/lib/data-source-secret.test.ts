import test from 'node:test'
import assert from 'node:assert/strict'
import { decryptSecret, encryptSecret } from './data-source-secret'

test('encryptSecret 与 decryptSecret 往返一致', () => {
  const secret = 'unit-test-data-source-secret-key'
  const cipher = encryptSecret('p@ss/词', secret)
  assert.notEqual(cipher, 'p@ss/词')
  assert.equal(decryptSecret(cipher, secret), 'p@ss/词')
})

test('缺少密钥时加密抛错', () => {
  assert.throws(() => encryptSecret('x', ''), /BABATA_DATA_SOURCE_SECRET/)
})

test('开发环境未配置 BABATA_DATA_SOURCE_SECRET 时使用占位密钥', () => {
  const prevNodeEnv = process.env.NODE_ENV
  const prevSecret = process.env.BABATA_DATA_SOURCE_SECRET
  process.env.NODE_ENV = 'development'
  delete process.env.BABATA_DATA_SOURCE_SECRET
  try {
    const cipher = encryptSecret('local-password')
    assert.equal(decryptSecret(cipher), 'local-password')
  } finally {
    process.env.NODE_ENV = prevNodeEnv
    if (prevSecret === undefined) {
      delete process.env.BABATA_DATA_SOURCE_SECRET
    } else {
      process.env.BABATA_DATA_SOURCE_SECRET = prevSecret
    }
  }
})
