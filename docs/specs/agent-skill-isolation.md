# Agent Skill 隔离与动态加载 — 规格说明书

| 项目 | 说明 |
|------|------|
| 文档版本 | 0.1.0 |
| 状态 | Draft |
| 创建日期 | 2026-06-05 |
| 适用范围 | `agent/babata` |
| 技术栈 | Mastra Agent、Mastra Workspace Skills、LocalFilesystem、SKILL.md |

---

## 1. 背景与目标

### 1.1 背景

当前 Babata 智囊团已经具备多 Agent 分工：

- **巴巴塔（babata）**：总管理解用户意图、路由 Agent 与 Workflow；
- **西莫（ximo）**：负责 Text2SQL、只读查数、分析与可视化；
- **混沌（hundun）**：负责指标口径、血缘、RAG、数仓源码上下文侦察；
- **小栗子（chestnut）**：负责表达优化、报告润色与写作。

随着能力增多，仅靠 Agent 的长 instructions 会带来几个问题：

- 系统提示词越来越长，维护成本高；
- 每个 Agent 的工作流、规范、案例混在一起，职责边界变弱；
- 某些能力只适用于单个 Agent，但在全局暴露后容易被误用；
- 后续新增能力时需要频繁修改 Agent 主 instructions。

Mastra Workspace Skills 支持将可复用能力封装为 `SKILL.md`，由 Agent 在需要时通过 skill 工具搜索、加载和读取引用文件。因此需要为每个 Agent 引入独立 skill 目录，并支持动态发现、加载与切换。

### 1.2 目标

本方案目标是实现“严格隔离版”的 Agent Skill 体系：

- 每个 Agent 只从自己的 skill 目录发现和加载 skill；
- 每个 Agent 拥有独立 Mastra Workspace，避免跨 Agent skill 泄漏；
- Agent 可按任务动态搜索、加载、切换 skill；
- skill 文件以 `SKILL.md` 为中心，支持 `references/`、`scripts/`、`assets/` 辅助资料；
- 通过配置项控制 skill 根目录、是否启用、是否允许热加载；
- 为未来技能审计、版本化、发布流程预留扩展点。

### 1.3 非目标

第一版不做以下事项：

- 不实现远程 skill 仓库或版本发布服务；
- 不实现 skill 图形化管理后台；
- 不实现跨 Agent 共享 skill 池；
- 不让用户在聊天中任意写入或修改 skill；
- 不让 skill 绕过现有工具安全边界、SQL Guardrails、文件白名单或审计 hooks；
- 不引入向量检索，第一版优先使用 Mastra 默认 skill 搜索能力。

---

## 2. 核心设计原则

### 2.1 严格隔离

每个 Agent 使用独立目录和独立 Workspace：

```text
workspace/
  agents/
    babata/
      skills/
        intent-routing/
          SKILL.md
    ximo/
      skills/
        text-to-sql/
          SKILL.md
    hundun/
      skills/
        context-recon/
          SKILL.md
    chestnut/
      skills/
        report-polishing/
          SKILL.md
```

Agent 只能看到自身目录下的 skills。例如 `hundun` 不应搜索、加载或读取 `ximo` 的 `text-to-sql` skill。

### 2.2 Skill 只增强行为，不替代安全边界

Skill 是“指导 Agent 如何做事”的能力包，不是权限系统。所有安全约束仍由现有代码保证：

- 西莫执行 SQL 仍必须经过 `execute-readonly-sql` 与 SQL Guardrails；
- 混沌读取源码仍必须经过 `HUNDUN_SOURCE_ROOTS`、扩展名白名单、路径校验；
- 工具调用仍经过全局 tool hooks 与审计；
- Skill 不能授予 Agent 未在 `tools` 中配置的工具能力。

### 2.3 动态加载优先

Agent 主 instructions 只保留职责、路由与安全边界。具体流程、案例、检查清单下沉到 skill 中，由 Agent 按需调用：

1. 先判断当前任务是否需要 skill；
2. 使用 `skill_search` 搜索自身可用 skill；
3. 使用 `skill` 加载目标 skill；
4. 如需辅助资料，使用 `skill_read` 读取 references/scripts/assets；
5. 当前任务发生阶段切换时，重新搜索或加载新的 skill。

---

## 3. Mastra 配置模型

### 3.1 Workspace 绑定方式

Mastra Skills 配置在 `Workspace` 上，而不是直接写在 `new Agent({ skills })` 上。严格隔离版为每个 Agent 创建独立 Workspace，并将 Workspace 传给对应 Agent。

建议新增：

```text
src/mastra/skills/
  config.ts
  workspace.ts
```

职责：

- `config.ts`：解析 skill 根目录、开关、热加载策略；
- `workspace.ts`：为指定 Agent 创建独立 `Workspace`。

建议接口：

```ts
export type SkillAgentId = 'babata' | 'ximo' | 'hundun' | 'chestnut'

export function createAgentSkillWorkspace(agentId: SkillAgentId): Workspace
```

### 3.2 推荐实现形态

每个 Agent 的 workspace `basePath` 指向自己的目录：

```ts
const workspace = new Workspace({
  filesystem: new LocalFilesystem({
    basePath: resolve(skillRoot, 'agents', agentId),
  }),
  skills: async () => discoverAgentSkillPaths(agentId),
})
```

其中：

- `skillRoot` 默认是项目根目录下 `workspace`；
- `basePath` 限制在 `workspace/agents/<agentId>`；
- `discoverAgentSkillPaths()` 只返回当前 Agent 目录下的 `skills/*` 或具体 `SKILL.md`；
- 不返回其他 Agent 路径，防止跨 Agent skill 被搜索。

如果 Mastra 当前版本对 `Agent.workspace` 支持稳定，则每个 Agent 直接配置：

```ts
export const hundunAgent = new Agent({
  id: 'hundun',
  name: '混沌',
  workspace: createAgentSkillWorkspace('hundun'),
  instructions: hundunInstructions,
  tools: getHundunContextTools(),
  model: getModelForRole('hundun'),
})
```

如果运行时发现只能在 `Mastra` 实例级配置单个 workspace，则第一版退化为“动态 skills 函数按 request context 过滤 Agent 目录”，但仍必须保证 Agent 只能看到自己的 skill 路径。

---

## 4. Skill 目录规范

### 4.1 基本结构

```text
workspace/agents/<agentId>/skills/<skillName>/
  SKILL.md
  references/
  scripts/
  assets/
```

约束：

- `SKILL.md` 必须存在；
- `skillName` 使用小写 kebab-case；
- 不允许 `..`、绝对路径、隐藏目录作为 skill 名；
- `references/` 存放规则、案例、口径说明；
- `scripts/` 只放可读辅助脚本或说明，第一版不自动执行；
- `assets/` 存放示例图片或静态资料。

### 4.2 `SKILL.md` 元数据

每个 `SKILL.md` 必须包含 frontmatter：

```md
---
name: hundun-context-recon
description: 当需要查询指标口径、血缘、RAG 或数仓源码上下文时使用。
agent: hundun
version: 0.1.0
---
```

字段说明：

| 字段 | 必填 | 说明 |
|------|------|------|
| `name` | 是 | Skill 名称，建议与目录名一致 |
| `description` | 是 | 供 Agent 判断是否加载的简短说明 |
| `agent` | 是 | 归属 Agent，必须与目录中的 `<agentId>` 一致 |
| `version` | 是 | Skill 版本，便于审计与回滚 |

### 4.3 初始 Skill 建议

第一版建议每个 Agent 至少准备一个核心 skill：

| Agent | Skill | 用途 |
|------|-------|------|
| `babata` | `intent-routing` | 用户意图拆解、Agent/Workflow 路由、是否需要混沌先侦察 |
| `ximo` | `text-to-sql-analysis` | 澄清、表选择、SQL 生成、执行后可视化与报告结构 |
| `hundun` | `context-recon` | 元数据、RAG、血缘、源码探查与证据包输出 |
| `chestnut` | `report-polishing` | 中文表达、标题、摘要、结构化润色 |

---

## 5. Skill 动态加载与切换协议

### 5.1 加载协议

Agent 在任务开始时按以下规则决策：

1. 如果主 instructions 已能处理，且任务简单，不强制加载 skill；
2. 如果任务匹配某类专业流程，先调用 `skill_search`；
3. 搜索到高相关 skill 后调用 `skill` 加载完整说明；
4. 如果 skill 指向 references，再调用 `skill_read` 读取必要资料；
5. 将加载到的 skill 指令仅用于当前任务或当前阶段。

### 5.2 切换协议

“切换 skill”不是修改全局状态，而是在当前任务阶段重新选择和加载更匹配的 skill。

典型场景：

- 巴巴塔先加载 `intent-routing` 判断需要混沌，再委派混沌；
- 混沌加载 `context-recon` 生成证据包；
- 巴巴塔收到证据包后，再委派西莫；
- 西莫加载 `text-to-sql-analysis` 进行查数；
- 最后如需润色，委派小栗子加载 `report-polishing`。

Agent 必须在输出中遵守：

- 不声明“永久切换到某 skill”；
- 不把上一个 skill 的约束错误带入不相关阶段；
- 切换后仍遵守 Agent 主 instructions 与工具权限。

### 5.3 建议 Instructions 增量

每个 Agent 主 instructions 增加一段统一约束：

```md
## Skill 使用

- 你只能使用当前 Agent Workspace 暴露的 skills。
- 当任务需要专业流程或案例时，先用 skill_search 搜索，再用 skill 加载。
- 只在当前任务阶段使用已加载 skill；阶段变化时可以重新搜索和加载更合适的 skill。
- Skill 不能覆盖系统安全规则、工具权限、审计要求或 Agent 职责边界。
```

---

## 6. 配置项

新增 `.env.example` 配置项时必须保留中文注释：

```env
# 是否启用 Mastra Agent Skills（false 时不创建 agent skill workspace）
AGENT_SKILLS_ENABLED=true

# Agent Skills 根目录，默认使用项目根目录下 workspace
AGENT_SKILLS_ROOT=workspace

# 是否在每次请求时动态重新发现 skill 目录（开发环境建议 true，生产建议 false）
AGENT_SKILLS_DYNAMIC_DISCOVERY=true
```

默认策略：

- 开发环境默认启用动态发现，方便新增/修改 `SKILL.md` 后立即生效；
- 生产环境可关闭动态发现，启动时固定 skill 列表，降低运行时文件系统开销；
- 未启用时 Agent 不配置 workspace，不暴露 skill 工具。

---

## 7. 安全与审计

### 7.1 路径安全

Skill discovery 必须满足：

- 只扫描 `AGENT_SKILLS_ROOT/agents/<agentId>/skills`；
- 不跟随越界 symlink；
- 不接受绝对路径作为 skill 名；
- 不接受包含 `..` 的路径；
- 不读取 `.env`、密钥、证书等敏感文件。

### 7.2 权限边界

Skill 不改变 Agent 的工具集合。示例：

- `hundun` 的 skill 可以指导它使用 `glob/search/read` context tools；
- 但不能让 `hundun` 获得 `execute-readonly-sql`；
- `ximo` 的 skill 可以指导 SQL 生成；
- 但仍必须经过 `execute-readonly-sql` 的只读校验。

### 7.3 审计

第一版优先复用 Mastra skill 工具自身结果与现有工具 hooks。后续可扩展：

- `agent-skill.search`：记录搜索关键词、候选 skill；
- `agent-skill.load`：记录加载的 skill 名称、版本、agent；
- `agent-skill.read`：记录读取的 reference 路径；
- 不在审计日志中完整记录大型 references 内容。

---

## 8. 错误处理

| 场景 | 行为 |
|------|------|
| Agent skill 目录不存在 | 不暴露该 Agent 的 skill，Agent 仍可按主 instructions 工作 |
| `SKILL.md` 缺失 | 忽略该目录并记录开发期 warning |
| frontmatter agent 不匹配 | 忽略该 skill，防止目录误放导致越权 |
| skill 搜索无结果 | Agent 回退主 instructions，不编造 skill 内容 |
| skill 加载失败 | Agent 明确说明 skill 不可用，继续使用已有工具和主职责 |
| 动态发现异常 | 回退上一次可用 skill 列表或空列表，不能中断 Agent 初始化 |

---

## 9. 测试与验收

### 9.1 单元测试

建议新增：

- `src/mastra/skills/config.test.ts`
  - 默认配置；
  - 关闭 skills；
  - 自定义根目录；
  - 动态发现开关。
- `src/mastra/skills/workspace.test.ts`
  - `babata` 只发现 `babata` 目录 skills；
  - `hundun` 不会发现 `ximo` 目录 skills；
  - 忽略缺少 `SKILL.md` 的目录；
  - 阻断路径穿越和越界 symlink。
- Agent 配置测试：
  - 每个 Agent 配置自己的 workspace；
  - 未启用时不配置 workspace；
  - 主 instructions 包含 skill 使用边界。

### 9.2 验收标准

- `babata`、`ximo`、`hundun`、`chestnut` 均有独立 skill 目录；
- 每个 Agent 只能搜索和加载本 Agent skills；
- 新增或修改 skill 后，开发环境可动态发现；
- skill 切换通过“重新搜索/加载”完成，不依赖全局共享状态；
- 关闭 `AGENT_SKILLS_ENABLED` 后系统仍可正常运行；
- `pnpm exec tsx --test "src/mastra/skills/*.test.ts"` 通过；
- `pnpm exec tsc --noEmit` 通过。

---

## 10. 推荐落地顺序

1. 新增 `src/mastra/skills/config.ts` 与测试；
2. 新增 `src/mastra/skills/workspace.ts` 与隔离测试；
3. 创建 `workspace/agents/<agentId>/skills/<skillName>/SKILL.md` 初始目录；
4. 将 `workspace: createAgentSkillWorkspace('<agentId>')` 接入四个 Agent；
5. 在各 Agent instructions 中加入 skill 使用边界；
6. 更新 `.env.example`；
7. 运行 skills 测试、Agent 配置测试、TypeScript；
8. 进行代码审查，重点检查跨 Agent skill 泄漏风险。

---

## 11. Review 重点

请重点 review：

- 是否接受每个 Agent 一个 Workspace 的严格隔离模型；
- `workspace/agents/<agentId>/skills` 目录结构是否符合团队维护习惯；
- 是否需要第一版就为 skill 加载写独立审计事件；
- 是否允许生产环境关闭动态发现以提升稳定性；
- 初始四个 skill 是否足够，还是需要先只给 `babata`、`ximo`、`hundun` 配置。

