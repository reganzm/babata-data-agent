import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

const DEV_FALLBACK_DATA_SOURCE_SECRET =
  'babata-dev-data-source-secret-change-me'

function deriveKey(secret: string): Buffer {
  const trimmed = secret.trim()
  if (!trimmed) {
    throw new Error('未配置 BABATA_DATA_SOURCE_SECRET，无法加密数据源密码')
  }
  return createHash('sha256').update(trimmed).digest()
}

export function getDataSourceSecret(): string {
  const secret = process.env.BABATA_DATA_SOURCE_SECRET?.trim()
  if (secret) return secret
  if (process.env.NODE_ENV === 'production') {
    return ''
  }
  return DEV_FALLBACK_DATA_SOURCE_SECRET
}

export function encryptSecret(plain: string, secret = getDataSourceSecret()): string {
  const key = deriveKey(secret)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`
}

export function decryptSecret(payload: string, secret = getDataSourceSecret()): string {
  const key = deriveKey(secret)
  const parts = payload.split('.')
  const [ivText, tagText, dataText] = parts
  // 空密码加密后密文本体（dataText）是空字符串，属于合法格式，不能用真值判断
  if (parts.length !== 3 || !ivText || !tagText || dataText === undefined) {
    throw new Error('数据源密码密文格式无效')
  }
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(ivText, 'base64'),
  )
  decipher.setAuthTag(Buffer.from(tagText, 'base64'))
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataText, 'base64')),
    decipher.final(),
  ])
  return decrypted.toString('utf8')
}
