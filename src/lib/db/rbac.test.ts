import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ALL_PERMISSION_CODES,
  isPermissionCode,
  PERMISSION_DEFINITIONS,
} from '@/lib/auth/permissions'
import { buildDataSourceAccessFilter } from '@/lib/db/rbac'

test('isPermissionCode 识别合法权限码', () => {
  assert.equal(isPermissionCode('user:read'), true)
  assert.equal(isPermissionCode('data_source:write'), true)
  assert.equal(isPermissionCode('unknown'), false)
})

test('权限定义覆盖全部权限码', () => {
  const defined = new Set(PERMISSION_DEFINITIONS.map((item) => item.code))
  for (const code of ALL_PERMISSION_CODES) {
    assert.equal(defined.has(code), true, `缺少权限定义：${code}`)
  }
})

test('buildDataSourceAccessFilter 未登录时不过滤', () => {
  assert.equal(buildDataSourceAccessFilter(null, 'data_source:read'), null)
})

test('buildDataSourceAccessFilter 登录用户包含拥有者与角色授权子查询', () => {
  const filter = buildDataSourceAccessFilter('user-1', 'data_source:read')
  assert.ok(filter)
  assert.match(filter.sql, /user_id = \?/)
  assert.match(filter.sql, /babata_role_resources/)
  assert.deepEqual(filter.args, ['user-1', 'user-1', 'data_source:read'])
})
