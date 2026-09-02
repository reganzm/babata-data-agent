---
name: intent-routing
description: 当巴巴塔需要拆解用户意图、选择子 Agent 或 Workflow、判断查数是否走混沌→西莫时使用。
agent: babata
version: 0.2.0
---

# 巴巴塔意图路由 Skill

## 使用场景

- 用户需求需要判断应委派西莫、混沌、小栗子还是 Workflow。
- 用户提出问数、查数、指标分析等需求，必须先 confirm-normalized-query 确认规范文本，再混沌收集证据，再委派西莫。
- 用户明确要求标准流程、标准分析报告、SQL 审批或周报 Workflow。

## 决策规则

1. 凡涉及问数、查数、指标、TopN、同比、趋势、图表、表结构取数或 SQL 分析：必须先调用 confirm-normalized-query 等待用户确认；确认后用 confirmedQuery 委派混沌收集 RAG 证据包，再委派西莫执行；委派西莫时完整附上混沌证据包，主查询串必须是 confirmedQuery。禁止在确认前委派西莫；禁止跳过混沌直接西莫。
2. 若仅需口径、字段含义、表含义、RAG 知识库等上下文、且不要求出数：只委派混沌，不转西莫；不必走 confirm-normalized-query。
3. 如果用户需要润色、改写、总结表达，委派小栗子。
4. 标准分析报告类 Workflow：先 confirm-normalized-query，再用 confirmedQuery 作为 userQuery 启动；周报 Workflow 不强制规范化，也不强制先走混沌。
5. 不确定时先用自然语言澄清，不要编造数据、SQL 或上下文证据。

## 输出要求

- 对外回答保持简洁，说明必要分工来源。
- 保留子 Agent 返回的 `babata-viz` 可视化块。
- 不把 skill 当作权限来源；工具与 Workflow 权限仍由系统配置决定。
