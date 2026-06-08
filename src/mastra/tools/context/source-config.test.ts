import test from 'node:test'
import assert from 'node:assert/strict'
import { getHundunSourceConfig } from './source-config'

test('source config reports unconfigured when roots are empty', () => {
  const config = getHundunSourceConfig({
    HUNDUN_SOURCE_ROOTS: '',
  })

  assert.equal(config.configured, false)
  assert.deepEqual(config.roots, [])
})

test('source config applies defaults and parses numeric limits', () => {
  const config = getHundunSourceConfig({
    HUNDUN_SOURCE_ROOTS: 'D:/warehouse/sql,C:/warehouse/docs',
    HUNDUN_SOURCE_SEARCH_LIMIT: '7',
    HUNDUN_SOURCE_READ_MAX_CHARS: '1234',
  })

  assert.equal(config.configured, true)
  assert.deepEqual(config.extensions, [
    '.sql',
    '.hql',
    '.md',
    '.yaml',
    '.yml',
    '.ts',
    '.tsx',
  ])
  assert.equal(config.searchLimit, 7)
  assert.equal(config.readMaxChars, 1234)
  assert.equal(config.searchBackend, 'auto')
})

test('source config filters invalid extensions and falls back for bad limits', () => {
  const config = getHundunSourceConfig({
    HUNDUN_SOURCE_ROOTS: 'D:/warehouse/sql',
    HUNDUN_SOURCE_EXTENSIONS: 'sql,.hql,.env,.pem,.log',
    HUNDUN_SOURCE_SEARCH_LIMIT: '-1',
    HUNDUN_SOURCE_READ_MAX_CHARS: 'NaN',
  })

  assert.deepEqual(config.extensions, ['.sql', '.hql'])
  assert.equal(config.searchLimit, 20)
  assert.equal(config.readMaxChars, 12000)
})

test('source config caps excessive limits', () => {
  const config = getHundunSourceConfig({
    HUNDUN_SOURCE_ROOTS: 'D:/warehouse/sql',
    HUNDUN_SOURCE_SEARCH_LIMIT: '1000000',
    HUNDUN_SOURCE_READ_MAX_CHARS: '1000000000',
  })

  assert.equal(config.searchLimit, 100)
  assert.equal(config.readMaxChars, 50000)
})

test('source config supports explicit search backend override', () => {
  const config = getHundunSourceConfig({
    HUNDUN_SOURCE_ROOTS: 'D:/warehouse/sql',
    HUNDUN_SOURCE_SEARCH_BACKEND: 'typescript',
  })

  assert.equal(config.searchBackend, 'typescript')
})
