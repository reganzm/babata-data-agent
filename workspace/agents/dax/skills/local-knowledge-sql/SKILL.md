---
name: local-knowledge-sql
description: 当达克斯需要检索本地知识库父块、基于口径生成只读 SQL、并在所选 Doris 数据源上出数与可视化时使用。
agent: dax
version: 0.1.0
---

# 达克斯本地知识库与问数 Skill

## 使用场景

- 用户在对话中选择了数据源、知识库，或两者都选。
- 需要先用本地 Markdown 知识库确认口径、字段、表含义。
- 需要在所选 Doris 上执行只读 SQL 并可视化。

## 工作流程

1. 若有知识库（用户所选，或数据源已绑定且启用），先调用 `retrieve-local-knowledge`。
2. 用召回的父块回答口径问题；检索为空时说明未命中，不要编造。
3. 用户要出数且已选数据源时，可用 `list-source-tables` / `describe-source-table` 确认表字段。
4. 编写只读 SQL：仅允许 `WITH` / CTE + `SELECT`（含子查询、UNION），交给 `execute-readonly-sql-on-source`。不要使用全局 `DORIS_*`。
5. SQL 成功后调用 `build-visualization`，把 `vizBlock` 附在回复末尾。
6. 只选知识库时不要查数。

## 安全边界

- 不执行写入、更新、删除、建表、授权、存储过程或多语句 SQL；只允许 `WITH` / CTE + `SELECT`。
- 不调用混沌、不访问 `KG_RAG_ENDPOINT`、不走查询确认门。
- 不用未经工具执行的数字作为结论。
