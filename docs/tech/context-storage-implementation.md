# 上下文与存储 — 技术实现说明

> 对应规格：[context-and-memory.md](../specs/context-and-memory.md) v0.2.0

## 1. 数据库

- **文件**：项目根 `storage.db`（与 `src/mastra/index.ts` 中 `LibSQLStore` URL 一致）
- **客户端**：`@libsql/client`（`src/lib/db/client.ts`）
- **环境变量**：`BABATA_STORAGE_URL`，默认 `file:./storage.db`

### 1.1 应用表（L1）

```sql
CREATE TABLE IF NOT EXISTS babata_conversations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'chat',
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS babata_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL,
  parts TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  created_at TEXT,
  FOREIGN KEY (conversation_id) REFERENCES babata_conversations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_babata_messages_conversation
  ON babata_messages(conversation_id, sort_order);
```

`metadata` JSON（P3 HITL）：

```ts
type ConversationMetadata = {
  activeWorkflowRunId?: string
  pendingApproval?: { workflowId: string; payload: unknown }
}
```

### 1.2 迁移

`ensureSchema()` 在每次 API 访问前调用（幂等）。无需独立迁移 CLI（P1）。

## 2. 会话 API

| 方法 | 路径 | Body / 响应 |
|------|------|-------------|
| GET | `/api/conversations` | `{ conversations: StoredConversation[] }` |
| POST | `/api/conversations` | 新建 → `{ conversation }` |
| GET | `/api/conversations/[id]` | `{ conversation }` 含 messages |
| PATCH | `/api/conversations/[id]` | `{ title?, messages? }` |
| DELETE | `/api/conversations/[id]` | 204 |

消息 `parts` 存 JSON 字符串，与 `UIMessage.parts` 一致。

## 3. L1 / L2 协同（P1）

```text
打开会话: GET /api/conversations/:id → useChat.messages
发送:     PATCH 保存 user（可选 stream 前）→ POST /api/chat + memory.thread
完成:     PATCH 保存完整 messages（含 assistant）
```

- **展示真相源**：L1 `babata_*`
- **推理真相源**：L2 Mastra Memory（`@mastra/memory` + 同一 `storage.db`）

禁止再使用 `localStorage` 键 `babata:conversations`。

## 4. 前端改造要点

`src/lib/conversation-store.ts`：

- 所有读写改为 `fetch('/api/conversations...')`
- `getAllConversations` → `async listConversations()`
- `page.tsx` 在 `useEffect` 中加载列表；加载中显示占位

`ChatPanel`：

```ts
const transport = useMemo(
  () =>
    new DefaultChatTransport({
      api: '/api/chat',
      prepareSendMessagesRequest: ({ body }) => ({
        body: {
          ...body,
          id: conversationId,
          memory: {
            thread: conversationId,
            resource: 'babata-local-user',
          },
        },
      }),
    }),
  [conversationId],
)
```

## 5. P3 扩展（预留）

- `POST /api/workflow/resume`
- `workflow_suspended` 时 `POST /api/chat` 返回 409
- `PATCH` metadata 写入 `pendingApproval`

实现细节见 [multi-agent-think-tank.md §5.4](../specs/multi-agent-think-tank.md#54-hitl-与会话状态机)。
