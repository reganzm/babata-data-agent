# 用户查询规范化（Query Normalization）设计

| 项 | 内容 |
|----|------|
| 状态 | 已确认（待实现计划） |
| 日期 | 2026-07-28 |
| 方案 | 共享规范化层 + 可编辑确认门（方案 1） |

## 1. 背景与目标

用户口语查询常含废话、模糊时间、比较词与业务黑话。在查数之前，需要先产出「一看就懂」的**规范文本**，供用户确认或修改，再交给下游（西莫即问即答 / 标准分析工作流）。

### 产品角色

- **对人**：规范文本可编辑展示，用户一键确认后才继续查数。
- **对机器**：下游只消费确认后的规范字符串（本期不做结构化意图 JSON）。

### 非目标（本期）

- 不做结构化意图对象作为下游主输入。
- 不做项目内可配置术语表（见 §8 TODO）。
- 不替代现有 intent-clarification / SQL 审批。
- 不强制 `weekly-metrics` 走规范化（模板路径）。

## 2. 架构与组件边界

```text
口语输入
  → normalize-user-query
       输入: originalQuery, today, 可选 ragHints
       输出: normalizedQuery
  → 确认门（可编辑 + 一键确认）
       resume: confirmedQuery
  → 下游唯一查询串 = confirmedQuery
       Path A: 混沌 → 西莫
       Path B: 启动 data-analysis-report（userQuery = confirmedQuery）
```

| 组件 | 职责 |
|------|------|
| `normalize-user-query` | 口语 → 规范文本；可选 Hundun RAG 线索 |
| `confirm-normalized-query` | 可 suspend 的确认工具/轻量工作流：预填可编辑规范文本，resume 后返回 `confirmedQuery` |
| 巴巴塔路由约束 | 问数意图：先调用确认工具，再委派或启工作流 |
| 工作流入口适配 | `userQuery` 为已确认规范文本；`originalQuery` 可选仅审计 |

### 确认门挂起机制（消除路径差异）

西莫即问即答路径**没有** `data-analysis-report` suspend，因此确认门不能只挂在标准工作流里。

约定：

- 提供统一的可 suspend 入口（优先：**巴巴塔可调用的 suspend 工具**；若实现上更顺，可用**仅含规范化+确认一步的轻量 workflow**）。
- Path A / Path B 都先走该入口拿到 `confirmedQuery`，再分别委派西莫或启动 `data-analysis-report`。
- 前端用同一 `approvalType: 'query-normalization'` 渲染轻量编辑确认 UI。
- **不在** `data-analysis-report` 内部再嵌一套规范化 suspend（B1）。

### 与现有模块关系

- 复用现有 agent/tool suspend → `pendingApproval` → resume 管道（与 SQL/intent 审批同类，UI 更轻）。
- `parse-intent` 保留，输入已是规范文本。
- 顺序：规范化确认 →（工作流）parse-intent → fetch-schema → 现有 intent-clarification（缺槽位时）→ generate-sql → SQL 审批。

## 3. 规范文本规则

形态：空格分隔的可读短语串，不是 SQL、不是 JSON。

| 规则 | 行为 |
|------|------|
| 去口语废话 | 删除「嗯」「帮我看看」「我想」等，只留核心意图 |
| 比较词标准化 | 低于/不到 → 小于；超过/高于 → 大于；等于/是 → 是 |
| 模糊时间 | 以服务端 `today` 为锚；能落明确区间则写清；「上月/去年」可保留相对表达 |
| 业务黑话 | 优先用 RAG 线索译成字段条件；不确定则保留原表述，不臆造字段 |
| 否定/存在性 | 「没开单」→「没有 订单」，禁止写成「订单金额是 0」 |
| 度量意图 | 「有多少」→「订单数」等可读度量词 |
| 维度映射 | 「华北区」→「区域 华北」 |
| 不发明 | 不得添加原文没有的表名/字段/过滤条件 |

### 示例（验收用例种子）

| # | 口语输入 | 规范文本（期望方向） |
|---|----------|----------------------|
| 1 | 嗯…我想看看去年签的订单。 | 去年 订单 |
| 2 | 零售价低于 50 元的零件。 | 零售价 小于 50 元 零件 |
| 3 | 去年秋天签了多少订单 | 签单日期 2025 年 9 月至 2025 年 11 月 订单数（以 today=2026-07-28 为例） |
| 4 | 已售罄的商品。 | 库存量是 0 的商品（有依据时；否则可保留「已售罄」） |
| 5 | 帮我看看上个月华北区单价超过 100 块的订单有多少 | 签单日期 上月 区域 华北 单价 大于 100 订单数 |
| 6 | 去年没开单的女员工 | 签单日期 去年，没有 订单，女 员工 |

允许同义微调（用词顺序、少量同义替换），但不得改变比较方向、否定语义或时间范围含义。

## 4. LLM 契约

### 输入

- `originalQuery: string`
- `today: string`（ISO 日期，服务端注入）
- `ragHints?: string`（Hundun 短线索；可空）

### 输出

```ts
{
  normalizedQuery: string  // 必填，非空
  notes?: string           // 系统侧短说明，默认不展示给用户
}
```

禁止输出 SQL、Markdown 代码块、长篇解释。`normalizedQuery` 为空视为失败。

### RAG

- hints 可选；超时/失败则纯 LLM 规范化，不阻断确认门。
- 为控延迟，规范化阶段 RAG 宜轻量，失败可跳过。

## 5. 确认门交互

| 项 | 约定 |
|----|------|
| 模式 | 展示可编辑规范文本 + 一键确认（模式 B） |
| 展示 | 挂起态：「请确认查询理解」；预填 `normalizedQuery`；可折叠「原话」 |
| 确认 | `approved: true`，`confirmedQuery` = 编辑后文本（trim 非空） |
| 取消 | `approved: false`，中止本轮查数 |
| 跳过 | `BABATA_SKIP_QUERY_NORMALIZATION_HITL=true` 时跳过确认，直接用规范化结果（测试/自动化） |

### Suspend / Resume 载荷

```ts
// suspend
{
  approvalType: 'query-normalization',
  originalQuery: string,
  normalizedQuery: string,
}

// resume 确认
{ approved: true, confirmedQuery: string }

// resume 取消
{ approved: false }
```

## 6. 双路径接入

### Path A（西莫即问即答）

巴巴塔识别问数 → 调用 `confirm-normalized-query`（内含规范化 + suspend 确认）→ 用返回的 `confirmedQuery` 委派混沌 → 西莫。  
确认前禁止西莫执行查数。委派主查询串必须是 `confirmedQuery`；`originalQuery` 仅可作参考。

### Path B（标准分析工作流）

同样先走 `confirm-normalized-query`（B1，工作流外）。启动 `data-analysis-report` 时：

- `userQuery` = `confirmedQuery`
- `originalQuery` 可选，仅日志/审计

`data-analysis-report` 内不新增规范化 suspend。

### Path C（周报）

本期不强制规范化。

## 7. 失败与降级

| 情况 | 处理 |
|------|------|
| LLM 失败 / 空输出 | 确认门预填 `originalQuery`，允许用户手改后确认 |
| 用户确认时空串 | 禁止确认，提示必填 |
| 规范化偏差 | 靠用户编辑纠正；本期不做「重新规范化」按钮 |

## 8. 后续 TODO

- [ ] 项目内可配置术语表（YAML/JSON）：LLM 优先按表翻译，未命中再靠模型 + RAG
- [ ] （可选）结构化意图 JSON + 模板渲染规范文本
- [ ] （可选）确认门「重新规范化」按钮

## 9. 测试策略

- **单测 / 用例表**：§3 六类示例 + 否定/比较词边界；对 `normalize-user-query` 做可注入模型或 fixture 的契约测试。
- **集成**：未确认前不触发查数；确认后下游收到的是 `confirmedQuery`（含用户修改版）。
- **开关**：`BABATA_SKIP_QUERY_NORMALIZATION_HITL=true` 时自动化可跳过确认门。

## 10. 配置

| 变量 | 用途 |
|------|------|
| `BABATA_SKIP_QUERY_NORMALIZATION_HITL` | `true` 时跳过规范化确认门，直接使用规范化结果（或降级后的原话） |

（示例文件与真实配置均需中文注释，禁止裸参数。）

## 11. 影响面（实现时）

预期触及（实现计划中细化）：

- 规范化核心：`src/lib/` 或 `src/mastra/` 下新模块（`normalize-user-query`）
- 可 suspend 确认工具或轻量 workflow（`confirm-normalized-query`）
- 巴巴塔 routing / delegation 指令（问数必须先确认）
- 工作流启动参数（可选 `originalQuery`）
- 前端 suspend UI（`approvalType: 'query-normalization'`）
- `workflow-progress` / pendingApproval 解析与评分
- `.env.example` 新开关注释
- 用例与文档索引链接
