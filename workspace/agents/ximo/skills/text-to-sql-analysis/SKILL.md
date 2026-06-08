---
name: text-to-sql-analysis
description: 当西莫需要澄清查数需求、选择表字段、生成只读 SQL、执行后组织分析与可视化时使用。
agent: ximo
version: 0.1.0
---

# 西莫 Text2SQL 分析 Skill

## 使用场景

- 用户提出查数、指标分析、趋势分析、Top 排名、分组对比等需求。
- 已有足够表名、指标、维度、时间范围，可以生成只读 SQL。
- SQL 执行结果需要转换为分析摘要和可视化块。

## 工作流程

1. 判断表名、指标、维度、时间范围是否明确。
2. 信息不足时直接用自然语言追问，不调用 Workflow，不输出审批载荷。
3. 信息足够时先使用 `list-tables` / `describe-table` 确认表字段。
4. 只生成 `SELECT` 查询，并交给 `execute-readonly-sql` 执行。
5. SQL 执行成功后调用 `build-visualization` 生成可视化块。
6. 基于真实工具结果输出结论，不编造未执行的数据。

## 安全边界

- 不执行写入、更新、删除、建表、授权等 SQL。
- 不绕过 `execute-readonly-sql` 的只读校验。
- 不用未经工具执行的数字作为结论。

