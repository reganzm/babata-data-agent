# RBAC 用户与角色权限

基于角色的访问控制（Role-Based Access Control，RBAC）：用户关联角色，角色关联权限与资源；访问数据源时校验「拥有者 **或** 角色绑定资源 + 对应权限」。

## 模型

| 实体 | 说明 |
|------|------|
| 用户 | `babata_users`，可分配多个角色 |
| 角色 | `babata_roles`，名称唯一 |
| 权限 | `babata_role_permissions`，权限码字符串 |
| 资源 | `babata_role_resources`，v1 仅 `data_source` |

## 权限码

| 权限码 | 说明 |
|--------|------|
| `user:read` | 查看用户 |
| `user:write` | 创建用户、改密、分配角色 |
| `user:delete` | 删除用户 |
| `role:read` | 查看角色与绑定 |
| `role:write` | 创建/编辑角色、权限与资源 |
| `role:delete` | 删除角色 |
| `data_source:read` | 读取数据源 |
| `data_source:write` | 编辑数据源 |
| `data_source:delete` | 删除数据源 |

## 数据源访问规则

1. **拥有者**：`babata_data_sources.user_id = 当前用户` → 拥有全部操作权。
2. **角色授权**：角色在 `babata_role_resources` 绑定该数据源，且角色具备相应 `data_source:*` 权限 → 允许对应操作。
3. **开发模式**（未启用登录 / `userId === null`）：不做 RBAC 过滤。

## 初始化

首次创建「系统管理员」角色并赋予全部权限时，会将**当时已存在的所有用户**挂到该角色（兼容旧部署）。之后新建用户需由管理员显式分配角色。

## API

| 方法 | 路径 | 权限 |
|------|------|------|
| GET | `/api/settings/permissions` | `role:read` |
| GET/POST | `/api/settings/users` | `user:read` / `user:write` |
| GET/PATCH/DELETE | `/api/settings/users/{id}` | 对应 user:* |
| GET/POST | `/api/settings/roles` | `role:read` / `role:write` |
| GET/PATCH/DELETE | `/api/settings/roles/{id}` | 对应 role:* |
| GET | `/api/settings/resources/data-sources` | `role:read` |
| GET | `/api/auth/session` | 返回 `permissions`、`roles` |

## 界面

`/settings`：用户管理（CRUD、角色分配）、角色管理（CRUD、权限勾选、数据源资源绑定）。导航栏「设置」对具备用户或角色读/写权限的用户可见。

## 实现位置

- `src/lib/auth/permissions.ts` — 权限定义
- `src/lib/auth/authorization.ts` — API 权限校验
- `src/lib/db/rbac.ts` — 角色/用户角色/资源绑定
- `src/lib/db/data-sources.ts` — 列表与读写按 RBAC 过滤
- `src/app/settings/page.tsx` — 管理界面
