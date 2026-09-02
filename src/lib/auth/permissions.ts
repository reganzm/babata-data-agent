export const PERMISSION_CODES = [
  'user:read',
  'user:write',
  'user:delete',
  'role:read',
  'role:write',
  'role:delete',
  'data_source:read',
  'data_source:write',
  'data_source:delete',
] as const

export type PermissionCode = (typeof PERMISSION_CODES)[number]

export type PermissionDefinition = {
  code: PermissionCode
  name: string
  description: string
  group: '用户' | '角色' | '数据源'
}

export const PERMISSION_DEFINITIONS: PermissionDefinition[] = [
  {
    code: 'user:read',
    name: '查看用户',
    description: '查看用户列表与详情',
    group: '用户',
  },
  {
    code: 'user:write',
    name: '编辑用户',
    description: '创建用户、修改密码、分配角色',
    group: '用户',
  },
  {
    code: 'user:delete',
    name: '删除用户',
    description: '删除用户账号',
    group: '用户',
  },
  {
    code: 'role:read',
    name: '查看角色',
    description: '查看角色、权限与资源绑定',
    group: '角色',
  },
  {
    code: 'role:write',
    name: '编辑角色',
    description: '创建/修改角色、配置权限与资源',
    group: '角色',
  },
  {
    code: 'role:delete',
    name: '删除角色',
    description: '删除角色',
    group: '角色',
  },
  {
    code: 'data_source:read',
    name: '读取数据源',
    description: '查看已绑定或拥有的数据源',
    group: '数据源',
  },
  {
    code: 'data_source:write',
    name: '编辑数据源',
    description: '创建、修改、测试数据源',
    group: '数据源',
  },
  {
    code: 'data_source:delete',
    name: '删除数据源',
    description: '删除数据源',
    group: '数据源',
  },
]

export const ALL_PERMISSION_CODES: PermissionCode[] = [...PERMISSION_CODES]

export function isPermissionCode(value: string): value is PermissionCode {
  return (PERMISSION_CODES as readonly string[]).includes(value)
}

export const ADMIN_ROLE_NAME = '系统管理员'
