# query-rag-knowledge HTTP 接入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让混沌 `query-rag-knowledge` 通过 `KG_RAG_ENDPOINT` 对知识图谱 RAG 服务做 POST 检索，并原样透传 JSON。

**Architecture:** 在 `src/mastra/tools/context/rag.ts` 中实现 HTTP 调用；配置读取 `KG_RAG_ENDPOINT`，缺省 `http://127.0.0.1:8080/v1/sql-context`；输出保留 `configured/message`，新增 `data` 承载原始响应。

**Tech Stack:** TypeScript、Mastra `createTool`、Zod、`fetch`、node:test

---

### Task 1: 失败测试与实现

**Files:**
- Modify: `src/mastra/tools/context/rag.ts`
- Modify: `src/mastra/tools/context/rag.test.ts`
- Modify: `.env.example`
- Modify: `.env`

- [x] **Step 1: 写失败测试**（默认 endpoint、成功透传、HTTP 失败、请求抛错）
- [x] **Step 2: 跑测试确认失败**
- [x] **Step 3: 实现最小 HTTP 接入**
- [x] **Step 4: 跑测试通过并更新配置文件注释**
