# Babata 规格文档

本目录存放 Babata 项目的功能与设计规格说明书。

| 文档 | 说明 | 状态 |
|------|------|------|
| [multi-agent-think-tank.md](./multi-agent-think-tank.md) | 多 Agent 智囊团（巴巴塔 / 西莫 / 小栗子）与 Workflow 编排 | Draft v0.2.0 |
| [context-and-memory.md](./context-and-memory.md) | 上下文分层、SQLite 会话存储、Mastra 记忆、委派过滤 | Draft v0.2.0 |
| [hundun-context-agent.md](./hundun-context-agent.md) | 混沌（Hundun）上下文支撑智能体：口径、血缘、RAG 与源码探查方案 | Draft v0.1.0 |
| [agent-skill-isolation.md](./agent-skill-isolation.md) | Agent Skill 严格隔离、动态发现、加载与切换方案 | Draft v0.1.0 |
| [2026-07-27-query-rag-knowledge-http.md](./2026-07-27-query-rag-knowledge-http.md) | 混沌 `query-rag-knowledge` 接入 `KG_RAG_ENDPOINT` HTTP 检索 | 已确认 |
| [rag.md](./rag.md) | 数据源与知识库（RAG）管理：独立 CRUD、绑定、达克斯本地问数 | Draft |
| [virtual-data-source.md](./virtual-data-source.md) | 虚拟数据源：多父源选表、单父 SQL 路由、RAG 绑定 | Draft v0.1.0 |
| [rbac.md](./rbac.md) | RBAC 用户/角色管理、数据源资源绑定与权限控制 | Draft v0.1.0 |
| [查询规范化设计](../superpowers/specs/2026-07-28-query-normalization-design.md) | 用户口语 → 规范文本 + 确认门（西莫/工作流共用） | 已确认（待实现计划） |

**技术落地**：[../tech/README.md](../tech/README.md)
