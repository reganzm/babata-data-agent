# 多 Agent 技术实现说明

> 对应规格：[multi-agent-think-tank.md](../specs/multi-agent-think-tank.md) v0.2.0

## 1. 模块映射

```text
src/mastra/
├── index.ts                 # Mastra + LibSQLStore + 注册 agents
├── memory.ts                # 共享 Memory（L2）
├── instructions/
│   ├── index.ts             # 统一导出
│   ├── routing.ts           # §4.5 路由表
│   ├── babata.ts            # 总管 instructions + description
│   ├── ximo.ts              # 西莫 instructions + description
│   └── chestnut.ts          # 小栗子 instructions + description
├── agents/
│   ├── babata.ts            # Supervisor
│   ├── ximo.ts              # 数据分析 + mock/real db tools
│   └── chestnut.ts          # 写作润色，无 db tools
└── tools/db/
    ├── mock-list-tables.ts
    ├── mock-describe-table.ts
    └── mock-execute-readonly-sql.ts
```

**对外唯一 Agent ID**：`babata`。`assistant` 已废弃，勿在 API 使用。

## 2. Supervisor 配置要点

```ts
// agents/babata.ts（示意）
export const babataAgent = new Agent({
  id: 'babata',
  name: '巴巴塔',
  model: getModel(),
  memory: sharedMemory,
  instructions: buildBabataInstructions(),
  agents: { ximo: ximoAgent, chestnut: chestnutAgent },
  workflows: {}, // P3 注册 data-analysis-report
  defaultOptions: {
    maxSteps: 12,
    delegation: {
      onDelegationStart: ({ primitiveId }) => {
        console.info('[delegation:start]', primitiveId)
      },
      onDelegationComplete: ({ primitiveId, result }) => {
        console.info('[delegation:complete]', primitiveId)
      },
    },
  },
})
```

Mastra 将子 Agent 暴露为 tool，名称形如 **`agent-ximo`**、**`agent-chestnut`**。前端 `ToolStatusBadge` 映射为中文标签。

## 3. 路由规则（实现时必须写入 instructions）

| 意图 | 处理 |
|------|------|
| 查数、SQL、指标 | 委派 `ximo`（必须用到 db mock/real tools） |
| 标准流程 / 规范报告 | P3：`workflow:data-analysis-report`；P1–P2 说明未上线并降级 `ximo` |
| 短问答、概念解释 | **巴巴塔直答**，不委派 `chestnut` |
| 长文、润色、基于已有数据的写作 | 委派 `chestnut` |
| 先查数再写作 | `ximo` → `chestnut` → 巴巴塔终稿 |

完整表见 `instructions/routing.ts`；各 Agent 的 instructions / description 见 `instructions/{babata,ximo,chestnut}.ts`，由 `instructions/index.ts` 统一导出。

## 4. 西莫结构化输出（P1 mock / P2 真实）

子 Agent 回复建议包含 Markdown，并尽量含：

```json
{
  "sql": "SELECT ...",
  "summary": "一句话结论",
  "numbers": [{ "label": "销售额", "value": "1.2M" }],
  "caveats": ["mock 数据，P2 接真实库"]
}
```

总管 instructions 要求：**数字必须来自 ximo tool 输出**，不得臆造。

## 5. Workflow 边界（P3，实现时遵守）

- **仅**巴巴塔触发；西莫 **不得** 调用 Workflow。
- Workflow step **仅** `tools/db/*` + LLM step，**不**委派 ximo Agent。
- Text2SQL → 生成 SQL → 审计(HITL) → 执行 → 报告：走 `data-analysis-report`，不走西莫整条链路。

## 6. Chat API

```ts
// src/app/api/chat/route.ts
const params = await req.json()
const conversationId = params.id ?? params.memory?.thread

const stream = await handleChatStream({
  mastra,
  agentId: 'babata',
  params: {
    ...params,
    memory: {
      thread: conversationId,
      resource: process.env.BABATA_RESOURCE_ID ?? 'babata-local-user',
    },
  },
})
```

前端 `useChat.id` 必须为 `conversationId`；`DefaultChatTransport` 通过 `prepareSendMessagesRequest` 合并 `memory` 字段。

## 7. 环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `BABATA_RESOURCE_ID` | `babata-local-user` | Memory resource |
| `BABATA_STORAGE_URL` | `file:./storage.db` | 与 Mastra LibSQLStore 一致 |
| `MODEL_*` | 见 `.env` | P4 可按 Agent 分级 |

## 8. 参考代码

- 仓库：`agent/mastra-orchestration/server/demos/02-supervisor.ts`
- Workflow HITL：`agent/repo-analyzer/src/mastra/workflows/`
