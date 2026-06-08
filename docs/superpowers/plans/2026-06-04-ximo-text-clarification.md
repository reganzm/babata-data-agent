# 西莫文本澄清 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 普通查数类需求在信息不明确时由西莫用文本追问，不启动 `data-analysis-report` workflow，也不唤起 workflow 澄清弹窗。

**Architecture:** 保持现有巴巴塔作为总管的路由结构，只收紧 system instructions 与委派钩子约束。`data-analysis-report` 仍只在用户明确要求标准流程、标准分析报告、Text2SQL 审批等触发词时使用。

**Tech Stack:** Next.js、Mastra Agent/Workflow、Node `test`、TypeScript。

---

### Task 1: 固定巴巴塔路由约束

**Files:**
- Modify: `src/mastra/registry.test.ts`
- Modify: `src/mastra/registry.ts`
- Modify: `src/mastra/instructions/routing.ts`

- [ ] **Step 1: Write the failing test**

在 `src/mastra/registry.test.ts` 增加断言：普通西莫澄清必须文本追问，且不得启动 `data-analysis-report`。

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec tsx --test "src/mastra/registry.test.ts"`

Expected: FAIL，提示缺少“不启动 data-analysis-report”或“文本追问”相关说明。

- [ ] **Step 3: Write minimal implementation**

更新 `buildBabataInstructions()` 和 `routingDecisionTable`：明确查数类需求默认委派西莫；当表名、维度、指标、时间范围不明确时，西莫直接追问用户；不要为了澄清触发 `data-analysis-report` 或 workflow 弹窗。

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec tsx --test "src/mastra/registry.test.ts"`

Expected: PASS。

### Task 2: 固定西莫委派约束

**Files:**
- Modify: `src/mastra/delegation.test.ts`
- Modify: `src/mastra/delegation.ts`
- Modify: `src/mastra/instructions/ximo.test.ts`
- Modify: `src/mastra/instructions/ximo.ts`

- [ ] **Step 1: Write the failing tests**

在 `delegation.test.ts` 断言西莫委派 prompt 包含：需要澄清时文本追问用户、不要调用 workflow、不要输出 workflow 审批载荷。在 `ximo.test.ts` 断言澄清协议包含表名、维度、指标、时间范围，并要求以自然语言追问。

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec tsx --test "src/mastra/delegation.test.ts" "src/mastra/instructions/ximo.test.ts"`

Expected: FAIL，提示缺少 workflow 禁止项或自然语言追问说明。

- [ ] **Step 3: Write minimal implementation**

更新西莫委派 suffix 与 `ximoInstructions`：缺表名、维度、指标、时间范围时返回 `需要澄清：...` 的自然语言问题；用户补充后基于上下文继续使用数据工具查询。

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec tsx --test "src/mastra/delegation.test.ts" "src/mastra/instructions/ximo.test.ts"`

Expected: PASS。

### Task 3: 验证

**Files:**
- Verify: `src/mastra/registry.test.ts`
- Verify: `src/mastra/delegation.test.ts`
- Verify: `src/mastra/instructions/ximo.test.ts`

- [ ] **Step 1: Run focused tests**

Run: `pnpm exec tsx --test "src/mastra/registry.test.ts" "src/mastra/delegation.test.ts" "src/mastra/instructions/ximo.test.ts"`

Expected: PASS。

- [ ] **Step 2: Run TypeScript check**

Run: `pnpm exec tsc --noEmit`

Expected: PASS。
