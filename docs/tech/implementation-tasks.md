# 实施任务清单（按优先级）

与 [multi-agent-think-tank.md §11](../specs/multi-agent-think-tank.md#11-实施阶段) 对齐。完成一项即在 PR 中勾选。

---

## P1 — 多 Agent 骨架 + SQLite 会话（当前迭代）

| ID | 任务 | 文件/模块 | 验收 |
|----|------|-----------|------|
| P1-1 | LibSQL 应用表 `babata_*` 与迁移 | `src/lib/db/*` | ✅ |
| P1-2 | 会话 CRUD API | `src/app/api/conversations/**` | ✅ |
| P1-3 | 前端会话改为 API，移除 localStorage | `conversation-store.ts`, `page.tsx` | ✅ |
| P1-4 | `ximo` + mock `tools/db/*` | `src/mastra/tools/db/mock-*.ts`, `agents/ximo.ts` | ✅ |
| P1-5 | `chestnut` 从 assistant 演进 | `agents/chestnut.ts` | ✅ |
| P1-6 | `babata` Supervisor + 路由 instructions | `agents/babata.ts`, `instructions/*` | ✅ |
| P1-7 | 共享 Memory + `threadId` | `mastra/memory.ts`, `api/chat/route.ts` | ✅ |
| P1-8 | `agentId: babata` | `api/chat/route.ts`, `mastra/index.ts` | ✅ |
| P1-9 | 委派 tool 展示文案 | `ToolStatusBadge.tsx` | ✅ |
| P1-10 | `pnpm build` | — | ✅ |

---

## P2 — 西莫真实只读库

| ID | 任务 | 验收 |
|----|------|------|
| P2-1 | `list-tables` / `describe-table` / `execute-readonly-sql` 真实实现 | ✅ 默认 `storage.db` + 演示表种子 |
| P2-2 | SQL 黑名单、行数、超时 | ✅ `sql-guard.ts` |
| P2-3 | 失败回传总管，不编造 | ✅ tool 抛错由 Agent 处理 |
| P2-4 | （可选）L1/L2 thread 对齐任务 | 未做 |

`BABATA_USE_MOCK_DB=true` 可回退 P1 mock。

---

## P3 — `data-analysis-report` + HITL

| ID | 任务 | 验收 |
|----|------|------|
| P3-1 | Workflow 六步 + 仅 `tools/db` | ✅ |
| P3-2 | 挂到 `babata.workflows` | ✅ |
| P3-3 | `workflow_suspended` + metadata | ✅ 流式同步 + 409 拦截 + 轮询刷新 |
| P3-4 | `POST /api/workflow/resume` | ✅ |
| P3-5 | 前端 SQL 审批 UI | ✅ `WorkflowApprovalBanner`（需 metadata 含 pendingApproval） |

---

## P4 — 增强

| ID | 任务 | 验收 |
|----|------|------|
| P4-1 | `weekly-metrics` Workflow | ✅ plan → execute → format |
| P4-2 | `messageFilter` 按 primitiveId | ✅ `delegation.ts` |
| P4-3 | delegation hooks 结构化日志 | ✅ JSON `console.info` + feedback |
| P4-4 | `MODEL_BABATA` / `MODEL_XIMO` / `MODEL_CHESTNUT` | ✅ `getModelForRole()` |
| P4-5 | `src/mastra/registry.ts` 生成 instructions | ✅ `buildBabataInstructions()` |

---

## P5 — 混沌上下文支撑智能体

| ID | 任务 | 验收 |
|----|------|------|
| H0 | 规格与技术方案 | ✅ [规格](../specs/hundun-context-agent.md) / [技术方案](./hundun-context-agent-implementation.md) |
| H1 | Agent 骨架与路由 | `hundun` 注册到 Mastra、Babata Supervisor、registry、routing 与 UI 标签 |
| H2 | 委派约束与审计 | `delegation.ts` 支持 `babata-hundun.*` 审计与证据包约束 |
| H3 | 元数据与占位检索工具 | 混沌具备表元数据工具，RAG/血缘未配置时返回 `configured:false` |
| H4 | 本地源码探查工具 | `glob/search/read` 只读工具受 root 白名单、扩展名和长度限制保护 |
| H5 | 配置与文档同步 | `.env.example` 有中文注释配置，文档索引已更新 |
| H6 | 验证与代码审查 | 相关测试、`pnpm exec tsc --noEmit`、代码审查通过 |

详细拆分见 [hundun-context-agent-implementation.md §9](./hundun-context-agent-implementation.md#9-优先级任务清单)。

---

## P6 — Agent Skill 严格隔离与动态加载

| ID | 任务 | 验收 |
|----|------|------|
| S0 | 规格与技术方案 | ✅ [规格](../specs/agent-skill-isolation.md) / [技术方案](./agent-skill-isolation-implementation.md) |
| S1 | Skill 配置解析 | `src/mastra/skills/config.ts` 解析启用开关、根目录、动态发现 |
| S2 | 每 Agent Workspace 隔离 | `src/mastra/skills/workspace.ts` 只发现当前 Agent skills |
| S3 | 初始 Skill 内容 | 四个 Agent 均具备独立 `SKILL.md` |
| S4 | Agent 接入 | `babata` / `ximo` / `hundun` / `chestnut` 均绑定自身 Workspace |
| S5 | 配置与文档同步 | `.env.example` 有中文注释配置，文档索引已更新 |
| S6 | 验证与代码审查 | skills 测试、Agent 接入测试、`pnpm exec tsc --noEmit`、代码审查通过 |

详细拆分见 [agent-skill-isolation-implementation.md §9](./agent-skill-isolation-implementation.md#9-优先级任务清单)。

---

## 依赖顺序（P1）

```text
P1-1 → P1-2 → P1-3
P1-4 → P1-5 → P1-6 → P1-7 → P1-8
P1-9（可与 P1-8 并行）
P1-10（最后）
```
