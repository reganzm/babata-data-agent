---
name: text-to-sql-analysis
description: 当西莫需要澄清查数需求、用 rag-query 补充证据、生成只读 SQL、执行后组织分析与可视化时使用。
agent: ximo
version: 0.3.0
---

# 西莫 Text2SQL 分析 Skill

## 使用场景

- 用户提出查数、指标分析、趋势分析、Top 排名、分组对比等需求。
- 已有足够表名、指标、维度、时间范围，可以生成只读 SQL。
- 上下文不清时需要用 `rag-query` 探查证据后再查数或澄清。
- SQL 执行结果需要转换为分析摘要和可视化块。

## 工作流程

1. 若 prompt 含「混沌上下文证据包」或 RAG 证据，先阅读并据此缩小表、字段与口径候选。
2. 判断表名、指标、维度、时间范围是否明确；仍不清时可用 `rag-query` 继续探查（单次运行最多 10 次）。
3. 信息不足且达 `rag-query` 上限或仍无法确认时，用自然语言追问，不调用 Workflow，不输出审批载荷。
4. 信息足够时按「Doris 联邦表名前缀规则」生成 `SELECT`，交给 `execute-readonly-sql` 执行。
5. SQL 执行成功后调用 `build-visualization` 生成可视化块。
6. 基于真实工具结果输出结论，不编造未执行的数据。

## Doris 联邦表名前缀规则

执行引擎是 Doris；访问 Hive 表需联邦查询并加 `hive_catalog.` 前缀。

- 表名（不区分大小写）包含 `hive`：SQL 中写成 `hive_catalog.<原表名>`。示例：`ads_hive_grafana_susu_xxx` → `hive_catalog.ads_hive_grafana_susu_xxx`。
- 表名已以 `hive_catalog.` 开头：不要重复加前缀。
- 表名包含 `doris`：不加前缀，直接使用原表名。
- 表名同时包含 `hive` 与 `doris`：以 `doris` 为准，不加前缀。

## 安全边界

- 不执行写入、更新、删除、建表、授权等 SQL。
- 不绕过 `execute-readonly-sql` 的只读校验。
- 不用未经工具执行的数字作为结论。
- 不调用已下线的 `list-tables`、`describe-table`。
- `rag-query` 单次运行最多 10 次，禁止无限探查。
