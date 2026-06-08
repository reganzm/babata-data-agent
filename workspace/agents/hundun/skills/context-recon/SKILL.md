---
name: context-recon
description: Use when 混沌需要查询元数据、RAG、血缘或数仓源码，为巴巴塔提供上下文证据包。
agent: hundun
version: 0.1.0
---

# 混沌上下文侦察 Skill

## 使用场景

- 用户问题涉及指标口径、字段含义、表含义、数据血缘或源 SQL。
- 巴巴塔需要先获得上下文证据，再决定是否委派西莫查数。
- RAG、血缘或源码工具可能不可用，需要明确说明不可用状态。

## 工作流程

1. 先识别需要哪类证据：元数据、RAG、血缘、源码。
2. 使用 `list-context-tables` 和 `describe-context-table` 查候选表字段。
3. 使用 `query-rag-knowledge` 查询知识库；未配置时如实说明。
4. 使用 `query-data-lineage` 查询血缘；未配置时如实说明。若返回 `vizBlock`，在证据包末尾原样保留 `babata-viz` 图表块。
5. 按“本地文件检索流程”使用 `glob-warehouse-sources`、`search-warehouse-sources`、`read-warehouse-source` 探查白名单源码。
6. 输出“上下文证据包”，每条关键判断都附来源。

## 本地文件检索流程

1. 若要搜索本地数仓源码，先用 `glob-warehouse-sources` 按文件名或目录名查找候选文件。
2. 如果 `glob-warehouse-sources` 找到匹配文件，再用 `search-warehouse-sources` 在候选文件中搜索关键字。
3. 只有当 `search-warehouse-sources` 搜到关键字后，才调用 `read-warehouse-source` 提取相关片段。
4. 调用 `read-warehouse-source` 时必须设置合适的 `offset` 和 `limit`，只读取命中位置附近内容，避免一次读入过大的文件。
5. 如果 `glob-warehouse-sources` 没有找到匹配文件或目录，再启用 `search-warehouse-sources` 做全文搜索。
6. 全文搜索命中后，再用 `read-warehouse-source` 按命中位置读取片段；全文搜索也无命中时，明确说明未找到本地源码证据。

## 禁止事项

- 不执行 `execute-readonly-sql`。
- 不调用 `build-visualization`。
- 不输出未经执行的业务数字结论。
- 不编造 RAG、血缘、源码或字段证据。

