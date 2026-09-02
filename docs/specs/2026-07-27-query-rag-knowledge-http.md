# query-rag-knowledge HTTP 接入设计

状态：已确认  
日期：2026-07-27

## 目标

将混沌现有工具 `query-rag-knowledge` 接入知识图谱 RAG 检索服务，按用户问题发起 HTTP POST 检索，并把接口返回的 JSON 原样透传给 Agent。

## 决策

- 不新建独立工具名；继续使用 `query-rag-knowledge`。
- 配置项命名为 `KG_RAG_ENDPOINT`，写入 `.env` / `.env.example`。
- 默认值：`http://127.0.0.1:8080/v1/sql-context`。
- 请求：`POST`，`Content-Type: application/json`，Body `{ "query": "<用户问题>" }`。
- 响应：JSON 原样透传；网络/HTTP 错误返回结构化失败信息，不抛未捕获异常。

## 非目标

- 不强制解析为 `title/content/source/score` 结构。
- 不在前端新增专用 RAG 可视化。

## 验收标准

1. 配置或使用默认 endpoint 时，能对服务发起 POST 并透传 JSON。
2. HTTP 非 2xx、fetch 抛错时返回可读失败信息。
3. 相关单元测试覆盖成功与失败路径。
