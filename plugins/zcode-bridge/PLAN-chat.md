# zcode-bridge 对话功能规划（MVP）

> 状态：已确认 ZCode 面板会话列表打通；本文规划「开始对话 + 继续对话」。
> 目标：MVP 版本即可用 —— 真·流式对话（非阻塞转圈）、基础可用、布局良好。

## 一、现状盘点

| 组件 | 能力 | 缺口 |
|---|---|---|
| `mcp/zcode-core.js` ZCodeClient | NDJSON 协议、request/respawn、reverse request 应答、`session/create`/`session/send` | **不消费订阅流**（`_notifications` 只管收集不区分事件）；`request()` 只等一次性 result |
| `mcp/server.js` MCP | `zcode_list_sessions`/`zcode_create_session`/`zcode_send_message` | 只服务 AI（MCP），**面板无入口** |
| `server.js` HTTP | `/api/sessions` 只读 db.sqlite | **无对话端点** |
| `src/Panel.tsx` | 会话列表 + 刷新 | **无对话 UI**；`onSendToChat` 仅把消息塞回 Polaris 主聊天 |

**核心缺口**：面板没有对话能力。要对话，需要一条「面板 → server.js → ZCodeClient → 流式事件 → 面板」的链路。

## 二、目标（MVP 可用）

1. **开始对话**：在面板点「新对话」→ 建 ZCode 会话（`session/create`）→ 进入聊天视图
2. **继续对话**：点某个已列出的会话 → 进入聊天视图，**加载历史消息**（读 db.sqlite 的 message/part 表）+ 续接
3. **流式回复**：输入消息 → `session/send` → 订阅 `session/events` 事件流（`part.delta` 增量、`turn.started/completed/failed`、`message.upserted`、`model.streaming`、`tool.updated`）→ 逐字渲染到面板
4. **基础布局**：左列会话列表 / 右列聊天区，输入框、发送、流式气泡、加载态、错误态
5. **跨端**：桌面 + 移动（经 host-bridge → cap.http），与现有 `/api/sessions` 同构

## 三、协议依据（已核实）

- 订阅：`session/subscribe` `{ sessionId, deliveryKind, afterSeq?, includeSnapshot? }`
  - `deliveryKind`: `z.enum(["desktop-continuous", "web-remote-replayable"])` —— 跨端面板用 **`"web-remote-replayable"`**（可 afterSeq 断点续播）
- 事件流：`session/events` topic 推送 notification 帧：
  - `turn.started` / `turn.completed` / `turn.failed`
  - `message.upserted` / `message.removed`
  - `part.delta` `{ messageId, partId, field: "text|reasoning|input|output", delta }` —— 流式增量
  - `part.upserted` / `part.removed`
  - `model.streaming`、`tool.updated`、`permission.requested/resolved`、`checkpoint.created`、`rewind.triggered` 等
- 消息正文：db.sqlite `message`（元数据）+ `part` 表（正文 text/reasoning/tool/step-start/step-finish）

## 四、架构设计

### 4.1 通道：HTTP 服务加对话端点（面板经 cap.http 调）

```
Panel.tsx ── host-bridge router_dispatch → cap.http ──> server.js (127.0.0.1:9862)
                                                          │
                                                          ├─ GET  /api/sessions          (已存在)
                                                          ├─ GET  /api/session/:id/msgs  (新增：历史消息)
                                                          ├─ POST /api/chat/create       (新增：创建会话)
                                                          └─ POST /api/chat/send         (新增：发送+订阅，流式)
                                     ZCodeClient（server.js 内持有，常驻）
                                                          └─ spawn zcode.cjs app-server --stdio
```

### 4.2 流式复用：`session/events` 经 HTTP 推给面板

面板 POST `/api/chat/send` 后，server.js 发起 `session/send` + `session/subscribe`。模型轮事件经 **SSE（Server-Sent Events）** 推给面板：
- 响应 `Content-Type: text/event-stream`
- 每行 `data: {type, ...}\n\n`
- 面板用 `EventSource`（或 fetch + ReadableStream）接收

但 **cap.http 转发的是 reqwest 一次性请求**，不支持 SSE 长连接（reqwest 会等 body 全部返回）。两个方案：

- **方案 A（SSE）**：加一个 `/api/chat/sse` 独立端点，面板经 **cap.http** 转发——但 reqwest 对 SSE 会缓冲到连接关闭，**流式逐字失效**（变一次性返回）。不行。
- **方案 B（轮询）**：面板 POST send → 拿到 `turnId` → 轮询 `GET /api/chat/events?turnId=xxx` 拿未读事件增量。简单可靠，reqwest 兼容，跨端一致。**MVP 用 B**。
- **方案 C（WebSocket）**：cap.http 只有 request/ping，无 WS。需新增 Rust 能力，成本高，MVP 不做。

**结论：MVP 采用方案 B（轮询增量事件），事件在 server.js 内存缓冲，面板定时/递增拉取。**

### 4.3 ZCodeClient 升级：消费订阅流

- 新增 `subscribe(sessionId, { afterSeq?, includeSnapshot? })` → 记录 sessionId，`request('session/subscribe', ...)`
- 新增事件回调：`_handleNotification(msg)` 按 `msg.type` 分发（`onEvent` 回调，server.js 注册）
- `session/send` 后订阅流自动收到 `part.delta` 等 → server.js 缓冲为 `{seq, type, payload, ts}`
- 关键纪律：**订阅 topic 是 `session/events`，帧是 notification（无 id）**，与现在 `_notifications.push` 分离，走独立缓冲

### 4.4 历史消息读取

`server.js` 增 `GET /api/session/:id/msgs`：用 `node:sqlite` 读 db.sqlite：
```sql
SELECT m.id, m.role, m.time_created,
       p.id, p.type, p.text, p.reasoning, p.tokens, p.time_created
FROM message m JOIN part p ON p.message_id = m.id
WHERE m.session_id = ? ORDER BY m.time_created, p.time_created
```
返回结构化消息列表供面板渲染（含 role: user/assistant、text、reasoning、tool 摘要）。

### 4.5 面板 UI（重写 Panel.tsx）

```
┌──────────────────────────────────────────┐
│ ZCode 会话  [刷新] [+ 新对话]              │  ← 顶栏
├───────────────┬──────────────────────────┤
│ 会话列表       │  聊天区                   │
│ • 标题         │  [消息气泡流]             │
│   2小时前      │  …                       │
│ • (无标题)     │                          │
│               │  [输入框] [发送]           │  ← 底部
└───────────────┴──────────────────────────┘
```

- `ZSession` → 点列表项进入聊天视图（`activeSessionId`）
- 聊天视图：加载历史 msgs + 输入框 + 发送
- 发送后：POST `/api/chat/send` → 立即显示 user 气泡 → 轮询 `/api/chat/events` → 逐条渲染 assistant/reasoning/tool 增量
- 空态：无会话时提示可「新对话」
- 移动端友好：列表/聊天响应式堆叠

## 五、验收标准

- [ ] 面板「新对话」→ 创建 ZCode 会话 → 进入聊天视图
- [ ] 点已有会话 → 加载历史消息（含 role/正文/reasoning/tool）
- [ ] 发送消息 → 流式逐字显示（`part.delta` 累积）→ 完成后显示完整回复
- [ ] 会话可续接：再回列表点同一会话 → 历史含上一次对话
- [ ] 桌面、移动（host-bridge）双端一致可用
- [ ] 错误态：zcode.cjs 缺失 / 会话不可读 → 明确提示

## 六、风险与边界

- **reqwest 不支持 SSE** → 轮询方案 B，事件延迟 ≤ 500ms（可调），MVP 可接受
- **ZCodeClient 生命周期**：server.js 持有单例；多面板并发 send 需互斥（MVP 单会话聚焦，串行）
- **订阅断开**：app-server 退出 → 事件流中断 → 面板显示"已断开"，可重试
- **权限**：cap.http 已对 remote allow（前序修复），新增端点无需额外权限变更
- **`part.delta` 与 `part.upserted` 去重**：同 partId 增量累积，upserted 覆盖快照，避免双吐血

## 七、实施步骤

1. `zcode-core.js`：升级 ZCodeClient —— 订阅流事件缓冲 + `subscribe()` + 事件回调分层
2. `server.js`：加 `/api/session/:id/msgs`、`/api/chat/create`、`/api/chat/send`、`/api/chat/events?turnId=&cursor=`（事件轮询）
3. 重构 `src/Panel.tsx`：列表 + 聊天双视图、流式渲染、host-bridge 通道泛化
4. esbuild build → 同步安装实例
5. 移动验证 + 桌面验证
6. 更新 memory