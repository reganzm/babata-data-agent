# Babata 多 Agent 智囊团 — 规格说明书

| 项目 | 说明 |
|------|------|
| 文档版本 | 0.2.0 |
| 状态 | Draft |
| 创建日期 | 2026-06-02 |
| 适用范围 | `agent/babata` |
| 技术栈 | Mastra Supervisor Agent、Next.js App Router、Vercel AI SDK v6、LibSQL |

---

## 1. 背景与目标

### 1.1 背景

当前 Babata 为单 Agent（`assistant`）聊天骨架，所有请求由同一 Agent 处理。业务上需要区分：

- **总管协调**：理解用户意图、拆分任务、汇总输出；
- **数据分析**：Text2SQL、指标查询、报表解读；
- **通用对话**：概念解释、写作、非数据类问答；
- **固化流程**：步骤确定、可复现、可审计的分析流水线（Workflow）。

### 1.2 目标

构建由 **巴巴塔（总管）** 协调、**西莫（数据分析）** 与 **小栗子（通用助手）** 组成的智囊团，并支持 Agent 内调用 **Workflow** 执行固定分析流程。

### 1.3 非目标（本期可不实现）

- 多用户权限与租户隔离；
- 生产级数据库连接池与细粒度 RBAC；
- 子 Agent 独立对外 API；
- 已废弃的 Mastra `.network()` 路由模式。

---

## 2. 术语

| 术语 | 含义 |
|------|------|
| Supervisor Agent | Mastra 总管 Agent，通过 `agents` / `workflows` 属性调度子资源 |
| 子 Agent | 挂载在 Supervisor 下的 specialist Agent（西莫、小栗子） |
| Workflow | Mastra 工作流，步骤固定，支持 LibSQL 持久化与 HITL |
| 委派（Delegation） | Supervisor 将子任务交给子 Agent 或 Workflow 执行 |
| HITL | Human-in-the-loop，工作流暂停等待人工确认后继续 |

---

## 3. 总体架构

### 3.1 逻辑架构

```text
┌─────────────────────────────────────────────────────────────┐
│                        用户（浏览器）                         │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Next.js 前端                                                 │
│  page.tsx / ChatPanel / StreamdownRenderer                   │
└─────────────────────────────┬───────────────────────────────┘
                              │ POST /api/chat
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  API 层（唯一对外 Agent 入口）                                 │
│  agentId: babata                                             │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  巴巴塔 Supervisor Agent                                      │
│  · 任务理解与拆分                                             │
│  · 路由决策（子 Agent / Workflow）                            │
│  · 结果汇总与用户可见输出                                     │
└───────┬─────────────────┬─────────────────┬───────────────┘
        │                 │                 │
        ▼                 ▼                 ▼
   ┌─────────┐      ┌───────────┐     ┌──────────────────┐
   │  西莫    │      │  小栗子    │     │  Workflows        │
   │ Text2SQL │      │ 通用对话   │     │ 固化分析流水线     │
   └─────────┘      └───────────┘     └──────────────────┘
        │                                    │
        ▼                                    ▼
   只读数据库 Tools                      LibSQL 状态持久化
```

**执行边界**：巴巴塔触发 Workflow 后，**等待 Workflow 完成**并接收结构化结果；总管**不参与** Workflow 内部 step 的逐步决策。Workflow 步骤内仅调用 `tools/db/*` 与 LLM step，**不**在 step 内再委派西莫 Agent（见 §5.3）。

### 3.2 Mastra 编排模式选型

采用 **Supervisor Agent**（`Agent` + `agents` / `workflows` + `stream()` / `generate()`），不使用已废弃的 `.network()`。

| 模式 | 是否采用 | 说明 |
|------|----------|------|
| Supervisor | ✅ | 开放任务、动态委派、总管汇总 |
| Workflow | ✅ | 固定步骤、HITL、可重跑 |
| Handoff | ❌ | 控制权移交，本场景由总管全程负责 |
| Council | ❌ | 多视角合议，非本期需求 |

---

## 4. Agent 规格

### 4.1 Agent 一览

| ID | 名称 | 角色 | 对外暴露 |
|----|------|------|----------|
| `babata` | 巴巴塔 | 总管 Supervisor | ✅（唯一 API 入口） |
| `ximo` | 西莫 | 数据分析 / Text2SQL | ❌（仅被巴巴塔委派） |
| `chestnut` | 小栗子 | 通用聊天助手 | ❌（仅被巴巴塔委派） |

### 4.2 巴巴塔（`babata`）

**职责**

1. 理解用户自然语言需求，判断任务类型；
2. 将复杂需求拆为可执行的子任务；
3. 委派给 `ximo`、`chestnut` 或触发 Workflow；
4. 校验子结果是否满足用户问题；
5. 以统一口吻输出最终答复（可注明分工来源）。

**配置要点**

```ts
new Agent({
  id: 'babata',
  name: '巴巴塔',
  agents: { ximo: ximoAgent, chestnut: chestnutAgent },
  workflows: { /* 见第 5 节 */ },
  defaultOptions: {
    maxSteps: 12, // 可配置，防止无限委派循环
    delegation: { onDelegationStart, onDelegationComplete },
  },
})
```

**指令（instructions）必须包含**

- [§4.5 路由决策表](#45-路由决策表) 全文或等价摘要；
- 各子 Agent 的 `description` 与 Workflow 触发条件；
- **简单概念解释、短问答由巴巴塔直接回答**，勿为省事先委派小栗子；
- 数据类结论必须以 `ximo` 或 Workflow 执行结果为准，禁止编造 SQL/数字；
- 输出格式：Markdown、结构清晰、中文为主。

### 4.3 西莫（`ximo`）

**职责**

- 库表结构探查（list / describe）；
- 生成并执行**只读** SQL；
- 对查询结果做指标解读、趋势说明、异常提示。

**适用场景**

- 查数、报表、TopN、同比环比、漏斗、留存等；
- 用户给出表名/字段时的 SQL 编写与解释。

**不适用场景**

- 纯闲聊、概念科普、与数据库无关的写作（**优先巴巴塔直答**；长文/润色再委派 `chestnut`，见 §4.5）。

**`description` 示例（供总管路由）**

> 数据分析与 Text2SQL 专家。适用于查表结构、编写只读 SQL、执行查询、解释指标与趋势。输出须含：SQL（如有）、结果摘要、关键数字、注意事项。不处理纯闲聊或与数据库无关的写作。

**工具（Tools）— 规划**

| Tool ID | 功能 | 约束 |
|---------|------|------|
| `list-tables` | 列出可访问表 | 表白名单 |
| `describe-table` | 表结构/字段说明 | 表白名单 |
| `execute-readonly-sql` | 执行 SELECT | 超时、最大行数、禁止 DDL/DML |

**安全要求**

- 数据库账号只读；
- SQL 执行前可做关键字黑名单（INSERT/UPDATE/DELETE/DROP 等）；
- 单次查询行数上限（如 1000）；
- 执行超时（如 30s）。

### 4.4 小栗子（`chestnut`）

**职责**

- 长文、邮件/文案、说明性写作、头脑风暴；
- **基于西莫或 Workflow 结构化结果的润色**（巴巴塔传入摘要，禁止小栗子自行查数）。

**不适用场景**

- 可直接由总管完成的短问答（避免无效二次 LLM）；
- 直接访问数据库或执行 SQL；
- 编造未委派执行的数据结论。

**`description` 示例**

> 写作与润色助手。适用于长文、邮件、文案、基于已提供数据上下文的说明性改写。不执行 SQL、不访问业务数据库；不处理仅需一两句话即可回答的概念解释（由总管直答）。

### 4.5 路由决策表

巴巴塔（或后续 `registry` 生成的 instructions）须遵循下表；**优先级自上而下**，命中即停。

| 用户意图信号 | 处理方 | 说明 |
|--------------|--------|------|
| 查数、指标、TopN、同比、表结构、SQL | `ximo` | 须委派或触发含真实/mock 数据工具的执行，禁止总管编造数字 |
| 「标准流程」「标准分析报告」「按规范出报告」等 | `workflow:data-analysis-report` | P3 起可用；P1–P2 可提示「流程尚未上线」并降级 `ximo` |
| 「周报」「固定指标模板」 | `workflow:weekly-metrics` | P4+；未上线时同上 |
| 在已有数据结果上写说明、邮件、老板汇报 | `chestnut` | 巴巴塔先拿到 `ximo`/Workflow 摘要再委派 |
| 长文、多段落写作、风格化改写 | `chestnut` | — |
| 概念解释、短问答、与库无关的一般问题 | **巴巴塔直答** | **不**委派小栗子 |
| 混合：先查数再写作 | `ximo` → `chestnut` → 巴巴塔终稿 | 顺序固定，数据上下文由总管传入小栗子 |

**反例（禁止）**

- 用户问「什么是 RAG」→ 委派小栗子（应直答）；
- 用户问销售额 → 总管不委派西莫直接给数字；
- 用户要标准报告 → 仅用西莫单次 SQL 代替 Workflow（除非 Workflow 未上线且已降级）。

**默认策略**：数据类在「西莫单次委派」与「标准 Workflow」之间**默认西莫**（更快）；仅当用户明确要求流程/模板/可审计报告时走 Workflow。

---

## 5. Workflow 规格

### 5.1 使用原则

| 场景 | 使用 Workflow | 使用子 Agent 委派 |
|------|---------------|-------------------|
| 步骤固定、需审计/重跑 | ✅ | — |
| 需 HITL（如人工批 SQL） | ✅ | — |
| 开放性问题、路径不确定 | — | ✅ |
| 简单单次查数 | 可选 | ✅ 优先 `ximo` |

Workflow 注册在 `mastra/index.ts`，并挂载到巴巴塔的 `workflows` 属性；巴巴塔 instructions 中说明触发话术。

### 5.2 规划 Workflow 列表

| Workflow ID | 名称 | 说明 | 阶段 |
|-------------|------|------|------|
| `data-analysis-report` | 标准数据分析报告 | Schema → SQL → [HITL] → 执行 → 解读 | **P3** |
| `weekly-metrics` | 周报指标流水线 | 固定指标模板 + 执行 + 模板化输出 | **P4** |

### 5.3 `data-analysis-report` 步骤（草案）

```text
Step 1  parse-intent      解析用户指标意图（结构化）
Step 2  fetch-schema      调用 list-tables / describe-table
Step 3  generate-sql      LLM step 生成 SQL（仅基于 Step 2 schema）
Step 4  human-approval    [可选] suspend，等待用户确认 SQL
Step 5  execute-sql       调用 execute-readonly-sql tool
Step 6  interpret-results 自然语言解读 + 结构化结果 JSON
```

**Step 内能力（已定案）**

- Workflow **仅**调用 `tools/db/*` 与各 step 内 LLM，**不在** step 内再委派 `ximo` Agent，避免「Workflow + 子 Supervisor」双重编排与错误归因困难。
- 西莫 Agent **仅**用于巴巴塔动态委派（开放查数、探索性分析）。

**持久化**：使用现有 `LibSQLStore`（`file:./storage.db`），支持 suspend/resume（参考 `repo-analyzer` 的 `human-approval` step）。

**输出**：供巴巴塔做 executive summary 的结构化 payload + 人类可读 Markdown。建议西莫/Workflow 均返回结构化字段：`{ sql?, summary, numbers[], caveats[] }`（实现阶段约定 schema）。

### 5.4 HITL 与会话状态机

Workflow 挂起期间，前端会话处于 **`workflow_suspended`**，与日常聊天互斥。

| 状态 | 含义 | 允许的用户操作 |
|------|------|----------------|
| `idle` | 无进行中的 chat/workflow | 新建消息、切换会话 |
| `chatting` | `POST /api/chat` 流式进行中 | 等待完成（实现可禁发） |
| `workflow_suspended` | Workflow 在 `human-approval` 挂起 | **仅**确认/拒绝 SQL 并 `resume`；**禁止**并发新发 `/api/chat` |

**存储**：`babata_conversations.metadata` 写入 `activeWorkflowRunId`、`pendingApproval`（字段见 [context-and-memory.md §3.2](./context-and-memory.md#32-sqlite-应用表结构l1)）。

**API（P3 交付）**

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/chat` | 日常对话；`workflow_suspended` 时返回 409 或明确错误码 |
| POST | `/api/workflow/resume` | 携带 `workflowRunId`、用户审批结果，恢复执行 |

**时序（UC-05）**

```text
用户发起报告请求 → POST /api/chat → 巴巴塔触发 workflow
  → Step 4 suspend → 流结束或推送「待确认 SQL」事件
  → 前端展示 SQL，PATCH metadata
  → 用户确认 → POST /api/workflow/resume
  → Workflow 完成 → 巴巴塔汇总 → PATCH L1 assistant 消息
```

**冲突规则**：`workflow_suspended` 下若用户尝试普通聊天，前端拦截并引导至审批 UI；resume 成功或取消后清除 `metadata.pendingApproval`。

---

## 6. 目录与模块结构

### 6.1 目标目录树

```text
src/mastra/
├── index.ts                      # 注册 agents + workflows
├── agents/
│   ├── babata.ts                 # Supervisor
│   ├── ximo.ts
│   └── chestnut.ts               # 由原 assistant 演进
├── tools/
│   └── db/
│       ├── list-tables.ts
│       ├── describe-table.ts
│       └── execute-readonly-sql.ts
└── workflows/
    ├── data-analysis-report.ts
    └── steps/
        ├── parse-intent.ts
        ├── fetch-schema.ts
        ├── generate-sql.ts
        ├── human-approval.ts
        ├── execute-sql.ts
        └── interpret-results.ts
```

### 6.2 与现有代码映射

| 现有 | 目标 |
|------|------|
| `agents/assistant.ts` | 重命名/迁移为 `agents/chestnut.ts` |
| `api/chat/route.ts` `agentId: 'assistant'` | 改为 `agentId: 'babata'` |
| `mastra/tools/.gitkeep` | 实现 `tools/db/*` |
| `mastra/workflows/.gitkeep` | 实现 `workflows/*` |

---

## 7. API 与前端

### 7.1 API

**端点**：`POST /api/chat`（保持不变）

**变更**：

```ts
handleChatStream({
  mastra,
  agentId: 'babata', // 原 'assistant'
  params,
})
```

**约束**：不新增面向 `ximo` / `chestnut` 的公开路由。

**HITL**：`POST /api/workflow/resume` 见 [§5.4](#54-hitl-与会话状态机)；与 [context-and-memory.md §3.3](./context-and-memory.md#33-会话-api-l1-读写) 一致，**P3** 实现。

### 7.2 前端

| 模块 | 变更级别 | 说明 |
|------|----------|------|
| `ChatPanel` | 低 | 仍使用 `useChat` + `/api/chat` |
| `StreamdownRenderer` | 无 | 继续渲染总管最终 Markdown |
| `ToolStatusBadge` | 中（可选） | 扩展展示委派状态（西莫/小栗子/Workflow） |
| `conversation-store` | 中 | 改为调用 `/api/conversations`，持久化至 SQLite（见 [context-and-memory.md](./context-and-memory.md)） |

### 7.3 流式与委派可见性

**P1 最低要求**：西莫/小栗子/Workflow 执行超过约 2s 时，流或 UI 须展示**进行中状态**（如「正在请西莫分析数据…」），避免长时间无反馈；**最终正文**仍以巴巴塔汇总 Markdown 为主。

**P4 增强**：若 Mastra / AI SDK 流暴露 delegation 事件，前端可展示：

- `巴巴塔 → 正在请西莫分析数据…`
- `巴巴塔 → 正在请小栗子整理文案…`
- `巴巴塔 → 执行标准分析流程…`

实现时以流中的 `primitiveId`（如 `ximo`、`chestnut`、`workflow:data-analysis-report`）驱动文案，**不要写死组件内的 Agent 名称列表**，便于后续扩展。

**不展示**：子 Agent 独立 memory 的全文、嵌套 tool 原始参数（除非调试模式）。用户可见层仍以巴巴塔最终回复为主。委派详情模式见 [context-and-memory.md §2.2](./context-and-memory.md#22-设计原则)。

---

## 8. 存储与记忆

上下文与记忆的分层设计见 **[context-and-memory.md](./context-and-memory.md)**（四层模型、ID 映射、L1/L2 协同、委派过滤）。

**摘要**：

| 层级 | 存储 | 用途 |
|------|------|------|
| L1 | SQLite `storage.db`（`babata_*` 表，经 `/api/conversations`） | 用户可见消息，**不用 localStorage** |
| L2 | 同一 `storage.db`（巴巴塔 `memory.thread` = `conversationId`） | 总管 Agent 推理与委派 |
| L3 | `storage.db`（子 Agent 委派 thread） | 仅委派 prompt + 回复（Mastra 隔离） |
| L4 | `storage.db`（Workflow run） | 固化流程状态、HITL suspend/resume |

### 8.1 L1 / L2 协同策略（已定案）

与 [context-and-memory.md §4](./context-and-memory.md#4-请求链路与持久化策略) 一致，**不做**浏览器 localStorage 双写：

| 职责 | 真相源 |
|------|--------|
| 列表、历史消息展示、标题 | **L1**（`babata_*`） |
| 巴巴塔推理与委派 thread | **L2**（Mastra，`threadId = conversationId`） |

**请求约定（P1）**

1. 打开会话：`GET /api/conversations/:id` 加载 L1 → 灌入 `useChat`。
2. 发送：`PATCH` 保存 user 消息 → `POST /api/chat`（`memory.thread = conversationId`，可携带当前 `messages[]` 以兼容 AI SDK v6）。
3. 流结束：`PATCH` 保存 assistant 消息；Mastra 自动追加 L2。

**不一致处理**：若 PATCH 失败，以 **L1 展示为准** 重试保存；下一轮 chat 依赖 L2 时可选 thread 对齐（P2）。实现阶段禁止「仅更新 L2 不更新 L1」导致 UI 与模型历史分叉。

**记忆策略**：遵循 Mastra Supervisor 默认 — 子 Agent 长期仅持久化委派片段；`messageFilter` 见 context 文档 §5.2。

---

## 9. 环境变量

沿用现有 `.env`，可按 Agent 分级扩展：

| 变量 | 说明 |
|------|------|
| `MODEL_PROVIDER` | openai / anthropic |
| `MODEL_NAME` | 模型名 |
| `MODEL_BASE_URL` | 兼容 API 基址 |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | 密钥 |

**按 Agent 分级（可选，P2+）**

| 变量 | 说明 |
|------|------|
| `MODEL_BABATA` | 总管；未设则回退 `MODEL_NAME` |
| `MODEL_XIMO` | 数据分析；未设则回退 `MODEL_NAME` |
| `MODEL_CHESTNUT` | 润色/写作；未设则回退 `MODEL_NAME` |

**西莫扩展（规划）**

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | 只读分析库连接串 |
| `SQL_MAX_ROWS` | 单次查询行数上限 |
| `SQL_TIMEOUT_MS` | 执行超时 |

---

## 10. 典型用例

### UC-01 纯聊天（短问答）

- **输入**：「解释一下 RAG」
- **路径**：**巴巴塔直答**（不委派小栗子）

### UC-02 单次查数

- **输入**：「上月各区域销售额 Top5」
- **路径**：巴巴塔 → `ximo`（schema + SQL + execute）→ 巴巴塔表格化输出

### UC-03 混合任务

- **输入**：「查 Q1 收入，再写一段给老板的说明」
- **路径**：巴巴塔 → `ximo` → 巴巴塔 → `chestnut`（带数据上下文）→ 巴巴塔终稿

### UC-04 固化流程

- **输入**：「按标准流程出一份数据分析报告」
- **路径**：巴巴塔 → `workflow:data-analysis-report` → 巴巴塔摘要

### UC-05 SQL 人工确认（HITL）

- **输入**：同 UC-04，且 Workflow 配置 `human-approval`
- **路径**：见 [§5.4](#54-hitl-与会话状态机)：`workflow_suspended` → 展示 SQL → `POST /api/workflow/resume` → 巴巴塔汇总

---

## 11. 实施阶段

| 阶段 | 内容 | 交付物 |
|------|------|--------|
| **P0** | 规格评审 | 本文档、[context-and-memory.md](./context-and-memory.md) |
| **P1** | 三 Agent + Supervisor + L1 SQLite 会话 API + 记忆映射 | `babata` / `ximo` / `chestnut`；西莫 **mock tools**；委派进行中状态；`memory.thread` = `conversationId` |
| **P2** | 西莫真实 DB Tools | `tools/db/*`，只读与安全约束；L1/L2 可选对齐任务 |
| **P3** | `data-analysis-report` Workflow + HITL API | 含 `human-approval`、`POST /api/workflow/resume` |
| **P4** | `weekly-metrics`、委派流增强、记忆调优 | `maxSteps`、`messageFilter`、delegation hooks、按 Agent 模型分级 |

---

## 12. 验收标准

### P1 完成标准

- [ ] `POST /api/chat` 仅调用 `agentId: 'babata'`
- [ ] 巴巴塔可将数据类问题委派给西莫，且西莫使用 **mock tools** 返回固定结构化数据（禁止无 tool 编造 SQL/数字）
- [ ] 短问答由巴巴塔直答；长文/润色可委派小栗子
- [ ] 委派执行期间有进行中状态提示；用户可见层以巴巴塔汇总流式 Markdown 为主
- [ ] 会话经 `/api/conversations` 持久化至 SQLite，**无** localStorage
- [ ] `params.memory.thread` 与前端 `conversationId` 一致（见 [context-and-memory.md §10](./context-and-memory.md#10-分阶段落地与验收)）
- [ ] 切换会话后上下文不串话
- [ ] `pnpm build` 通过

### P2 完成标准

- [ ] 西莫 `tools/db/*` 连接真实只读库，具备安全限制
- [ ] SQL 执行失败时错误信息回传总管，不编造结果

### P3 完成标准

- [ ] `data-analysis-report` 可按步骤执行并可 suspend/resume
- [ ] 巴巴塔可根据用户意图触发该 Workflow

---

## 13. 风险与对策

| 风险 | 影响 | 对策 |
|------|------|------|
| 总管错误路由 | 答非所问 | §4.5 决策表写入 instructions；delegation hooks 日志 |
| 无效委派小栗子 | 延迟/费用 | 短问答直答；小栗子仅写作/润色 |
| 总管编造数据 | 信任危机 | 指令禁止；P1 西莫必须 mock tool；P2+ 必须真实 tool |
| 委派循环过多 | 延迟/费用 | `maxSteps` 上限；task completion scorer（P4 可选） |
| 长时间无 UI 反馈 | 体验差 | P1 进行中状态；§7.3 |
| SQL 注入/误操作 | 安全 | 只读账号 + 关键字过滤 + 行数/超时限制 |
| 子 Agent 上下文过长 | 成本 | `messageFilter`（见 context 文档 §5.2） |
| L1/L2 不一致 | 展示与推理分叉 | §8.1；PATCH 失败重试；P2 可选 thread 对齐 |
| HITL 与 chat 并发 | 状态错乱 | §5.4 状态机；suspend 时拒绝新 chat |
| SQLite 同文件并发写 | 开发期偶发失败 | 单进程 dev；生产再评估连接策略 |

---

## 14. 参考资料

- [context-and-memory.md](./context-and-memory.md) — 上下文与记忆机制（本项目）
- [Mastra Supervisor Agents](https://mastra.ai/docs/agents/supervisor-agents)
- [Mastra Multi-agent Systems](https://mastra.ai/guides/concepts/multi-agent-systems)
- 仓库内参考实现：`agent/mastra-orchestration/server/demos/02-supervisor.ts`
- 仓库内 Workflow 参考：`agent/repo-analyzer/src/mastra/workflows/`

---

## 15. 修订记录

| 版本 | 日期 | 作者 | 说明 |
|------|------|------|------|
| 0.1.0 | 2026-06-02 | — | 初稿：智囊团三 Agent + Workflow 方案 |
| 0.2.0 | 2026-06-02 | — | 评审修订：§4.5 路由表、§5.3/5.4 Workflow/HITL、§8.1 L1/L2、阶段与验收对齐 |
