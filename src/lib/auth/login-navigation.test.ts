import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildPostLoginLocation,
  loginErrorMessage,
  resolveLoginOrigin,
  safeInternalRedirect,
} from './login-navigation'

test('safeInternalRedirect 只允许站内相对路径', () => {
  assert.equal(safeInternalRedirect(null), '/')
  assert.equal(safeInternalRedirect(''), '/')
  assert.equal(safeInternalRedirect('https://evil.example'), '/')
  assert.equal(safeInternalRedirect('//evil.example'), '/')
  assert.equal(safeInternalRedirect('/login'), '/')
  assert.equal(safeInternalRedirect('/login?redirect=/'), '/')
  assert.equal(safeInternalRedirect('/chat'), '/chat')
  assert.equal(safeInternalRedirect('/'), '/')
})

test('resolveLoginOrigin 优先使用转发头，避免跳到 127.0.0.1', () => {
  const request = new Request('http://127.0.0.1:3000/api/auth/login', {
    headers: {
      host: '127.0.0.1:3000',
      'x-forwarded-host': '10.0.0.8:3000',
      'x-forwarded-proto': 'http',
    },
  })
  assert.equal(resolveLoginOrigin(request), 'http://10.0.0.8:3000')
})

test('buildPostLoginLocation 使用转发主机拼接站内跳转', () => {
  const request = new Request('http://127.0.0.1:3000/api/auth/login', {
    headers: {
      host: '127.0.0.1:3000',
      'x-forwarded-host': '10.0.0.8:3000',
      'x-forwarded-proto': 'http',
    },
  })
  assert.equal(
    buildPostLoginLocation(request, '/chat').toString(),
    'http://10.0.0.8:3000/chat',
  )
})

test('loginErrorMessage 映射登录失败查询参数', () => {
  assert.equal(loginErrorMessage('invalid'), '用户名或密码错误')
  assert.equal(loginErrorMessage('missing'), '请输入用户名和密码')
  assert.equal(loginErrorMessage('unknown'), '登录失败')
  assert.equal(loginErrorMessage(null), null)
})
