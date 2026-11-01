# 长连接调试台（stream-desk）

把 WebSocket / SSE / 流式 HTTP 的调试变成 Polaris 里的一次点击或 AI 的一句话。解决浏览器调试长连接的两个**结构性限制**：

| 浏览器做不到的事 | 本插件的做法 |
|---|---|
| WebSocket 握手**不能带自定义头**（`Authorization` 等——浏览器 API 禁止） | 后台服务用 Node 原生客户端拨号，握手头全自定义，服务端真实收到 |
| `EventSource` **只能 GET、不能带头、不能带 body** | 后台 `fetch` 流式读取，POST+Bearer+body 随意配——AI 流式接口（OpenAI/Anthropic/Ollama/vLLM…）全是这个形态 |

## 功能

- **WS 控制台**：握手详情（状态码/延迟/响应头掩码）、帧时间线（方向/间隔/大小/二进制 HEX）、文本/二进制/PING 发送、主动关闭（自定义关闭码）、按原参数重连、导出 JSONL
- **SSE 抓取**：method/headers/body 全可控、逐事件计时（**TTFT**、首事件延迟、事件间隔 min/中位/均值/**p95**/max——流卡顿一眼可见）、心跳注释行计数（「服务器活着但没发事件」的诊断信号）、非 event-stream 响应自动按原始分块捕获
- **AI 联动（MCP 七工具）**：对 AI 说「连一下 `ws://…` 发条消息看回什么」「抓取这个 SSE 接口 30 秒看事件长什么样」，它会用 `ws_connect` → `ws_send` → `ws_wait_frame`（长轮询等回复）→ `ws_close` / `sse_capture`（同步抓完返回体检报告+事件样本）代劳
- **隐私**：数据不出本机（仅监听 127.0.0.1）；请求头离开服务进程（落库/AI 报告）一律掩码（`****`+尾 4），`cookie`/`authorization` 恒掩；token 随机生成持久化，API 全量鉴权

## 快速开始

1. 活动栏打开「长连接调试台」；
2. 「会话」Tab 新建：选 WebSocket 或 SSE/流式，填地址与请求头（`{"Authorization":"Bearer sk-…"}`），连接/开始抓取；
3. WS 在控制台发消息看往返；SSE 在抓取页看事件流与间隔统计；
4. 或直接在聊天里让 AI 代劳（需启用插件的 AI 工具）。

## 使用示例（AI 对话）

```
帮我用长连接调试台连 ws://127.0.0.1:8080/chat，握手带 Authorization: Bearer abc123，
发一条 {"type":"ping"}，等回复告诉我它回了什么、延迟多少。

抓取 https://api.xxx.com/v1/chat/stream 30 秒，POST，头带 Bearer test-key，
体 {"model":"x","stream":true}，告诉我 TTFT 和事件间隔 p95。
```

## 架构

```
面板(dist/panel.js) ── 127.0.0.1:9874 直连（Bearer token）──▶ service/main.js
   │  实时帧流：fetch-SSE 自解析（shared/core 解析器，与 service 同口径）      │
   │                                                            WS 引擎（vendor/ws.cjs）
MCP(mcp/server.js) ── kv 读 streamdesk.meta → 直连 ──────────────▶            SSE 引擎（fetch 流式）
                                                                │
service ── kvclient ──▶ 宿主 /api/router-dispatch ──▶ cap.kv（meta/索引/transcript/settings）
```

- 服务仅监听 `127.0.0.1`；`ws` 依赖经 esbuild 打成单文件 `service/vendor/ws.cjs`（125KB），**装完即用，无 node_modules 依赖**
- 进行中会话的帧只在内存（环形缓冲，默认 500 帧）；已结束会话的 transcript（掩码、截断、尾部 200 帧）落 `cap.kv`，服务重启后 MCP 仍可读
- 服务崩溃自动重启（maxRestarts=10）；kv 不可达进入降级模式（健康检查保持 200，历史不落库，如实标注）

## 已知限制

- Web(https) 部署模式下浏览器拦 `http://127.0.0.1` 混合内容，面板直连不可用（桌面/手机 WebView 正常）——与 api-bench/imgforge 等面板直连面同款边界
- 进行中会话不跨服务重启存活（索引标「已中断」）；帧体超 16KB 截断（可调）
- WS 客户端不协商 perMessageDeflate（调试要看原始帧；需要压缩协商的服务请知悉）
- `Sec-WebSocket-Key`/`Connection`/`Host` 等协议保留头不允许伪造（客户端库自管）
- MCP `sse_capture` 单次上限 120s、`ws_wait_frame` 单次上限 30s（防 AI 长阻塞）

## 本地开发

```bash
npm install          # 开发依赖
npm run build:vendor # 重建 service/vendor/ws.cjs（仅依赖升级时）
npm run typecheck    # tsc --noEmit
npm run build        # esbuild → dist/panel.js
npm test             # node --test（33 用例：core 单测 + REST/WS/SSE 夹具冒烟 + MCP stdio + mock-bridge 集成）
```
