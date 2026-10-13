# Babata

面向数据团队的 **多 Agent 智囊团** 应用：连接 Doris 数仓与本地知识库，支持口语化问数、Workflow 分析报告、SQL 审批与可视化，并提供 RBAC 权限与生产 standalone 部署。

技术栈：**Next.js 16** · **Mastra** · **Vercel AI SDK** · **LibSQL（SQLite）** · **ECharts**

---

## 核心能力

### 多 Agent 协作

| Agent | 代号 | 职责 |
|-------|------|------|
| 巴巴塔 | `babata` | 总管：意图识别、委派子 Agent、编排 Workflow |
| 西莫 | `ximo` | 数仓 Text2SQL、查询规范化、数据分析 |
| 小栗子 | `chestnut` | 图表与可视化建议 |
| 混沌 | `hundun` | 口径 / 血缘 / RAG / 源码探查 |
| 巨斧 | `juju` | 埋点验收与事件追踪 |
| 达克斯 | `dax` | 本地数据源 + 知识库问数（选中数据源/知识库后路由） |

支持 **标准数据分析 Workflow**（Text2SQL → SQL 审批 → 执行 → 报告），以及查询规范化确认门、工具调用心跳续跑等。

### 数据与知识

- **数据源管理**：Doris / CSV / 虚拟数据源（多父源选表）；连接信息加密存储，按用户隔离
- **知识库（RAG）**：Markdown 上传、父子分块、文本检索；可绑定数据源
- **达克斯问数**：对话区选择数据源或知识库后，走本地连接与检索，不干扰全局 Doris 链路

### 权限与安全

- **登录会话**：Cookie 会话，内网 HTTP 部署需 `BABATA_COOKIE_SECURE=false`
- **RBAC**：用户 / 角色 / 权限码；角色可绑定数据源资源；设置页管理
- **SQL 守卫**：仅允许 `SELECT`，自动 `LIMIT`，支持表白名单

### 产品体验

- 对话列表、置顶、重命名、导出 PDF
- 顶栏与左侧会话栏可收起（状态持久化）
- 登录页、数据源 / 知识库 / 设置独立页面
- 流式回复、ECharts 图表、工具调用面板

---

## 快速开始

### 环境要求

- **Node.js** 20+
- **pnpm** 9+（推荐，见 `packageManager` 字段）

### 安装与配置

```bash
pnpm install
cp .env.example .env
# 编辑 .env：至少配置 OPENAI_API_KEY、BABATA_AUTH_SECRET（生产必填）
```

常用变量见 [`.env.example`](./.env.example)，完整说明见下方「环境变量」。

### 创建登录用户

```bash
pnpm user:create admin 你的密码
# 修改密码
pnpm user:chpwd admin 新密码
```

**首个创建的用户会自动成为「系统管理员」**（此时系统中还没有任何管理员）；之后创建的用户默认没有角色，需由管理员在设置页分配。若用户已存在却没有权限，补授权：

```bash
pnpm user:grant-admin admin
```

本地开发可临时关闭鉴权：`.env` 中设置 `BABATA_AUTH_DISABLED=true`。

### 开发

```bash
pnpm dev
# 默认 http://localhost:3000
```

> 开发模式使用 `next dev --webpack`（与生产构建一致，避免 Turbopack 下部分 API 路由异常）。

### 生产构建与启动

```bash
pnpm build
pnpm start
```

- `build` 使用 webpack 生成 standalone，并同步 `.next/static`、`public`、`.env` 到 standalone 目录
- `start` 默认监听 `0.0.0.0:3000`，启动日志会打印本机 Network IP
- 相对路径 `BABATA_STORAGE_URL=file:./storage.db` 会自动解析为**项目根目录**下的数据库文件

---

## Docker 部署

基于 `Dockerfile`（多阶段构建，产出 Next.js standalone 镜像）与 `docker-compose.yml`。需要 Docker 20.10+ 与 Docker Compose v2（`docker compose` 命令）。

### 1. 准备配置

```bash
cp .env.example .env
# 编辑 .env，至少设置：
#   OPENAI_API_KEY（或 ANTHROPIC_API_KEY）
#   BABATA_AUTH_SECRET          会话签名密钥，填随机长字符串
#   BABATA_DATA_SOURCE_SECRET   数据源密码加密密钥，填随机长字符串
```

- 生成随机密钥：`openssl rand -hex 32`
- `BABATA_AUTH_SECRET`、`BABATA_DATA_SOURCE_SECRET` 为空时 `docker compose` 会直接报错，不会带着占位密钥启动。
- 内网 HTTP 访问保持 `BABATA_COOKIE_SECURE=false`。
- **容器里的 `127.0.0.1` 是容器自己，不是宿主机。** 如果 `KG_RAG_ENDPOINT`、数仓等服务跑在宿主机上，请改用 `host.docker.internal`，例如 `KG_RAG_ENDPOINT=http://host.docker.internal:8080/v1/sql-context`。
- 如需改宿主机端口，在 `.env` 中设置 `BABATA_PORT=8080`（默认 `3000`）。

### 2. 构建并启动

```bash
docker compose up -d --build
```

首次构建需要下载依赖并执行 `next build`，耗时较长。启动后用 `docker compose ps` 查看状态，`healthy` 表示服务就绪；浏览器访问 `http://<服务器IP>:3000`。

内网无法访问官方 npm 时，可指定镜像源（仅当确认源已同步最新包时使用）：

```bash
NPM_REGISTRY=https://registry.npmmirror.com docker compose up -d --build
```

### 3. 创建登录用户（首次部署必做）

先确保服务已启动（`up -d` 之后），再执行：

```bash
docker compose --profile tools run --build --rm cli pnpm user:create admin 你的密码
```

**首个创建的用户会自动成为「系统管理员」**，登录后即可在设置页管理用户、角色与数据源；之后创建的用户默认没有角色，需由管理员分配。

如果登录后没有任何权限（例如用户是在旧版本镜像里创建的），补授权：

```bash
docker compose --profile tools run --build --rm cli pnpm user:grant-admin admin
```

修改密码：

```bash
docker compose --profile tools run --build --rm cli pnpm user:chpwd admin 新密码
```

> 运行镜像是 standalone 产物，不含 `tsx` 与源码，所以用户管理命令通过 `cli` 服务（基于构建阶段镜像、挂载同一数据卷）执行。`--build` 保证用的是最新代码，构建无变化时会直接走缓存。

### 4. 停止、重启、更新

```bash
# 停止（保留容器与数据）
docker compose stop

# 再次启动已停止的服务
docker compose start

# 重启
docker compose restart

# 停止并删除容器、网络（数据卷保留，数据不丢）
docker compose down

# 更新代码后重新构建并滚动重启
docker compose up -d --build
```

**危险操作**：`docker compose down -v` 会同时删除数据卷，即会话、用户、数据源与上传的知识库全部丢失，务必先备份。

### 5. 日志与排查

```bash
# 实时查看应用日志
docker compose logs -f babata

# 查看容器状态与健康检查
docker compose ps

# 进入运行中的容器
docker compose exec babata sh
```

审计日志位于容器内 `/app/logs/babata-audit.log`（挂载在 `babata-logs` 卷）。

### 6. 数据持久化与备份

| 卷 | 容器路径 | 内容 |
|----|----------|------|
| `babata-data` | `/app/data` | `storage.db`（会话、用户、数据源、知识库元数据）与上传的知识库文件 `knowledge/` |
| `babata-logs` | `/app/logs` | 审计日志 |

备份与恢复数据卷：

```bash
# 备份到当前目录
docker run --rm -v babata_babata-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/babata-data-$(date +%F).tgz -C /data .

# 恢复（先 docker compose stop，再执行）
docker run --rm -v babata_babata-data:/data -v "$PWD":/backup alpine \
  sh -c "cd /data && tar xzf /backup/babata-data-YYYY-MM-DD.tgz"
```

> 卷名为 `<项目名>_<卷名>`，项目名由 `docker-compose.yml` 顶部的 `name: babata` 指定，故为 `babata_babata-data`。可用 `docker volume ls` 确认。

---

## 环境变量（摘要）

| 分类 | 变量 | 说明 |
|------|------|------|
| LLM | `MODEL_PROVIDER` / `MODEL_NAME` / `MODEL_BASE_URL` | 模型提供商与名称；兼容 OpenAI API 的网关 |
| LLM | `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | API 密钥 |
| 登录 | `BABATA_AUTH_SECRET` | 会话签名密钥（生产必填） |
| 登录 | `BABATA_COOKIE_SECURE` | 内网 HTTP 必须为 `false` |
| 存储 | `BABATA_STORAGE_URL` | LibSQL 路径，默认 `file:./storage.db` |
| 数仓 | `DORIS_DSN` 或 `DORIS_HOST` 等 | 西莫 / Workflow 全局 Doris（只读） |
| 混沌 | `KG_RAG_ENDPOINT` / `HUNDUN_LINEAGE_ENDPOINT` | RAG 与血缘 HTTP 接口 |
| 混沌 | `HUNDUN_SOURCE_ROOTS` | 源码探查根目录 |
| 安全 | `BABATA_DATA_SOURCE_SECRET` | 数据源密码加密密钥（生产必填） |

**注意：** `.env` 已在 `.gitignore` 中，请勿提交仓库。生产部署在服务器上单独维护 `.env`。

---

## 项目结构

```
babata/
├── src/
│   ├── app/              # Next.js 页面与 API（对话、数据源、知识库、设置、登录）
│   ├── lib/              # 会话存储、RBAC、可视化、数据源/知识库逻辑
│   └── mastra/           # Agent、Workflow、Tools、Skills
├── workspace/agents/     # Agent Skills（按 Agent 隔离）
├── scripts/              # 用户管理、standalone 启动与资源同步
├── Dockerfile            # 多阶段构建镜像
├── docker-compose.yml    # Compose 部署（应用 + 数据卷 + 用户管理工具服务）
├── docs/                 # 规格说明、技术方案、实施计划
└── storage.db            # 本地 SQLite（会话、用户、数据源、知识库，运行时生成）
```

---

## 文档索引

| 链接 | 说明 |
|------|------|
| [docs/README.md](./docs/README.md) | 文档总索引 |
| [docs/specs/](./docs/specs/README.md) | 功能与设计规格 |
| [多 Agent 智囊团](./docs/specs/multi-agent-think-tank.md) | Agent 编排与 Workflow |
| [数据源与知识库 RAG](./docs/specs/rag.md) | 达克斯、知识库、绑定关系 |
| [RBAC](./docs/specs/rbac.md) | 用户、角色、数据源授权 |
| [虚拟数据源](./docs/specs/virtual-data-source.md) | 多父源选表与 SQL 路由 |
| [上下文与记忆](./docs/specs/context-and-memory.md) | SQLite 分层存储 |
| [docs/superpowers/plans/](./docs/superpowers/plans/) | 实施计划 |

---

## 常用命令

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 开发服务器（webpack） |
| `pnpm build` | 生产构建 + standalone 资源同步 |
| `pnpm start` | standalone 生产启动 |
| `pnpm lint` | ESLint |
| `pnpm user:create <用户> <密码>` | 创建登录用户 |
| `pnpm user:chpwd <用户> <新密码>` | 修改用户密码 |
| `pnpm user:grant-admin <用户>` | 把已有用户加入「系统管理员」角色 |
| `docker compose up -d --build` | Docker 构建并启动（详见「Docker 部署」） |
| `docker compose stop` / `docker compose down` | Docker 停止 / 删除容器（数据卷保留） |

---

## 部署提示

1. 在项目根目录执行 `pnpm build && pnpm start`，不要在 `.next/standalone` 子目录单独 build
2. 确保 `storage.db` 与 `.env` 位于项目根（或通过 `BABATA_STORAGE_URL` 指定绝对路径）
3. 首次部署后执行 `pnpm user:create` 创建管理员（首个用户自动成为「系统管理员」）
4. 浏览器请使用服务器 **Network IP**（如 `http://10.x.x.x:3000`），不要访问 `http://0.0.0.0:3000`

---

## License

Private / 内部项目。使用前请遵守团队与数据安全规范。
