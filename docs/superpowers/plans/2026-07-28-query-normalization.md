# Query Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在查数前把用户口语规范化为可读规范文本，经可编辑确认门后，西莫与标准工作流只消费确认后的规范字符串。

**Architecture:** 纯函数 `normalizeUserQuery`（可注入 LLM）+ 巴巴塔可 suspend 工具 `confirm-normalized-query`；前端新增 `approvalType: 'query-normalization'` 轻量确认 UI；路由强制问数先确认。

**Tech Stack:** TypeScript、Mastra `createTool` + agent suspend、Zod、AI SDK `generateText`、node:test、React

**Spec:** `docs/superpowers/specs/2026-07-28-query-normalization-design.md`

## Global Constraints

- 下游只吃确认后的规范字符串，不做结构化意图 JSON
- 术语表 YAML 本期不做（TODO）
- 确认在工作流外；不改 `data-analysis-report` 内部加规范化 suspend
- `weekly-metrics` 不强制规范化
- 配置项必须有中文注释
- 测试：`pnpm exec tsx --test "<file>"`
- 用户未要求前不 git commit

---

## File Map

| 文件 | 职责 |
|------|------|
| `src/lib/query-normalization.ts` | 规范化核心：prompt、解析、降级 |
| `src/lib/query-normalization.test.ts` | 契约与降级测试 |
| `src/mastra/tools/query/confirm-normalized-query.ts` | suspend 确认工具 |
| `src/mastra/tools/query/confirm-normalized-query.test.ts` | 跳过 HITL / suspend / resume |
| `src/mastra/agents/babata.ts` | 注册工具 |
| `src/mastra/instructions/routing.ts` | 问数先规范化确认 |
| `src/lib/workflow-stream-metadata.ts` | tool suspend → workflowId |
| `src/lib/workflow-progress.ts` | approvalType 评分 |
| `src/lib/workflow-resume-client.ts` | resumeData 含 confirmedQuery |
| `src/app/components/QueryNormalizationDialog.tsx` | 确认 UI |
| `src/app/page.tsx` | 挂载 Dialog |
| `.env.example` | `BABATA_SKIP_QUERY_NORMALIZATION_HITL` |

---

### Task 1: normalizeUserQuery 核心

**Files:**
- Create: `src/lib/query-normalization.ts`
- Create: `src/lib/query-normalization.test.ts`

**Interfaces:**
- Produces:
  - `NormalizeUserQueryInput = { originalQuery: string; today: string; ragHints?: string }`
  - `NormalizeUserQueryResult = { normalizedQuery: string; notes?: string }`
  - `normalizeUserQuery(input, options?: { generateText?: (args) => Promise<string> }): Promise<NormalizeUserQueryResult>`
  - `parseNormalizeModelOutput(text: string, fallbackQuery: string): NormalizeUserQueryResult`
  - `buildNormalizeUserQueryPrompt(input): { system: string; prompt: string }`

- [x] **Step 1: 写失败测试**

覆盖：
1. `parseNormalizeModelOutput` 解析 JSON `{ normalizedQuery, notes }`
2. 模型输出带 markdown fence 仍能解析
3. 空/非法输出 → `normalizedQuery === originalQuery`
4. `normalizeUserQuery` 在注入 `generateText` 返回合法 JSON 时透传
5. `generateText` 抛错时降级为原话

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseNormalizeModelOutput,
  normalizeUserQuery,
} from './query-normalization'

test('parseNormalizeModelOutput reads json object', () => {
  const r = parseNormalizeModelOutput(
    '{"normalizedQuery":"零售价 小于 50 元 零件","notes":"比较词"}',
    'fallback',
  )
  assert.equal(r.normalizedQuery, '零售价 小于 50 元 零件')
  assert.equal(r.notes, '比较词')
})

test('parseNormalizeModelOutput strips fences and falls back on empty', () => {
  const fenced = parseNormalizeModelOutput(
    '```json\n{"normalizedQuery":"去年 订单"}\n```',
    'x',
  )
  assert.equal(fenced.normalizedQuery, '去年 订单')
  const empty = parseNormalizeModelOutput('{"normalizedQuery":"  "}', '原话')
  assert.equal(empty.normalizedQuery, '原话')
})

test('normalizeUserQuery uses injected generator and degrades on throw', async () => {
  const ok = await normalizeUserQuery(
    { originalQuery: '低于50', today: '2026-07-28' },
    {
      generateText: async () =>
        JSON.stringify({ normalizedQuery: '小于 50' }),
    },
  )
  assert.equal(ok.normalizedQuery, '小于 50')

  const degraded = await normalizeUserQuery(
    { originalQuery: '原话查询', today: '2026-07-28' },
    {
      generateText: async () => {
        throw new Error('boom')
      },
    },
  )
  assert.equal(degraded.normalizedQuery, '原话查询')
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm exec tsx --test "src/lib/query-normalization.test.ts"`  
Expected: FAIL（模块不存在）

- [ ] **Step 3: 最小实现**

`src/lib/query-normalization.ts`：
- system：数据分析查询规范化器；规则对齐设计 §3；只输出 JSON
- `parseNormalizeModelOutput`：去 fence → JSON.parse → trim；失败/空则 fallback
- `normalizeUserQuery`：默认用 `generateText` + `getModelForRole('ximo')`；可注入；catch 降级

- [ ] **Step 4: 跑测试通过**

Run: `pnpm exec tsx --test "src/lib/query-normalization.test.ts"`  
Expected: PASS

---

### Task 2: confirm-normalized-query suspend 工具

**Files:**
- Create: `src/mastra/tools/query/confirm-normalized-query.ts`
- Create: `src/mastra/tools/query/confirm-normalized-query.test.ts`

**Interfaces:**
- Consumes: `normalizeUserQuery`
- Produces: `confirmNormalizedQueryTool`（`createTool`）
  - input: `{ originalQuery: string; ragHints?: string }`
  - output: `{ confirmedQuery: string; cancelled: boolean; normalizedQuery: string }`
  - suspend: `{ approvalType: 'query-normalization'; originalQuery; normalizedQuery }`
  - resume: `{ approved: boolean; confirmedQuery?: string }`

- [x] **Step 1: 写失败测试**

1. `BABATA_SKIP_QUERY_NORMALIZATION_HITL=true` 时不 suspend，直接返回规范化结果
2. 未 skip 且无 resumeData 时调用 `suspend`
3. resume `approved: true` + `confirmedQuery` 返回用户确认文本
4. resume `approved: false` → `cancelled: true`
5. resume 确认但 confirmedQuery 空白 → 回退 normalizedQuery（或拒绝；实现选：回退 normalized，与工具侧兜底一致；前端仍校验非空）

```ts
// 用 createTool 后 tool.execute(input, { agent: { suspend, resumeData } })
```

- [ ] **Step 2: 跑测试确认失败**
- [ ] **Step 3: 实现工具**
  - 先 `normalizeUserQuery`
  - skip HITL → return `{ confirmedQuery: normalized, cancelled: false, normalizedQuery }`
  - else if !resumeData?.approved（含首次）→ `await suspend({ approvalType: 'query-normalization', ... })`
  - else if approved === false → cancelled
  - else confirmedQuery = trim(resumeData.confirmedQuery) || normalizedQuery
- [ ] **Step 4: 跑测试通过**

---

### Task 3: 注册到巴巴塔 + 路由

**Files:**
- Modify: `src/mastra/agents/babata.ts`
- Modify: `src/mastra/instructions/routing.ts`
- Modify: `src/mastra/registry.test.ts`（若有指令快照断言则更新）
- Modify: `workspace/agents/babata/skills/intent-routing/SKILL.md`（若存在问数顺序描述则同步）

- [ ] **Step 1: babata 增加 tools**

```ts
tools: {
  confirmNormalizedQuery: confirmNormalizedQueryTool,
},
```

- [ ] **Step 2: routing 问数行改为**

先调用 `confirm-normalized-query`（或工具展示名）拿到 `confirmedQuery`，再混沌→西莫；标准流程同样先确认，再 `data-analysis-report`，`userQuery` 必须为确认文本。周报不强制。

- [ ] **Step 3: 跑 registry / related tests**

---

### Task 4: 流元数据与 resume 客户端

**Files:**
- Modify: `src/lib/workflow-stream-metadata.ts`
- Modify: `src/lib/workflow-stream-metadata.test.ts`
- Modify: `src/lib/workflow-progress.ts`
- Modify: `src/lib/workflow-progress.test.ts`
- Modify: `src/lib/workflow-resume-client.ts`

- [ ] **Step 1: tool suspend 映射**

若 `toolName` 含 `confirmNormalizedQuery` / `confirm-normalized-query` → `workflowId: 'query-normalization'`

- [ ] **Step 2: scoreSuspendPayload** 对 `query-normalization` 给高分（≥ intent-clarification，如 28）

- [ ] **Step 3: resume 支持**

扩展 `resumeAfterSqlApproval` 或新增 `resumeAfterQueryNormalization`：
- resumeData: `{ approved: true, confirmedQuery }` 或 `{ approved: false }`
- 走 `agentRunId` → `/api/chat`（主路径）；若有 workflowRunId 也可走 workflow resume

- [ ] **Step 4: 测试更新并跑通**

---

### Task 5: 前端确认 Dialog

**Files:**
- Create: `src/app/components/QueryNormalizationDialog.tsx`
- Create: `src/lib/query-normalization-dialog-state.ts`（可复用 intent-clarification-dialog-state，若够用则不新建）
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Dialog**
  - 读 `approvalType === 'query-normalization'`
  - 可编辑 textarea 预填 `normalizedQuery`
  - 可折叠原话
  - 确认：非空 `confirmedQuery` → resume
  - 取消：`approved: false`

- [ ] **Step 2: page.tsx 挂载**，pendingApproval 传入；session lock 对 query-normalization 保持挂起锁（不要像 few-shot-save 那样排除）

- [ ] **Step 3: 手动/静态检查类型无报错**

---

### Task 6: 配置与文档收尾

**Files:**
- Modify: `.env.example`
- 确认 specs/README 已链到设计文档

- [ ] **Step 1: .env.example**

```env
# 是否跳过查询规范化确认门（true 时直接使用规范化结果，便于自动化测试）
# BABATA_SKIP_QUERY_NORMALIZATION_HITL=true
```

- [ ] **Step 2: 全量相关测试**

```bash
pnpm exec tsx --test "src/lib/query-normalization.test.ts"
pnpm exec tsx --test "src/mastra/tools/query/confirm-normalized-query.test.ts"
pnpm exec tsx --test "src/lib/workflow-stream-metadata.test.ts"
pnpm exec tsx --test "src/lib/workflow-progress.test.ts"
pnpm exec tsx --test "src/mastra/registry.test.ts"
```

---

## Spec Coverage Check

| Spec 项 | Task |
|---------|------|
| normalize + 规则/契约 | Task 1 |
| 确认门 suspend 工具 | Task 2 |
| Path A/B 路由先确认 | Task 3 |
| 元数据 / resume | Task 4 |
| 可编辑 UI | Task 5 |
| 跳过 HITL 配置 | Task 2 + 6 |
| 术语表 TODO | 不实现（已在设计 doc） |
| weekly-metrics 不强制 | Task 3 路由说明 |
