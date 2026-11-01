# stream-desk（长连接调试台）选型与设计文档

> 2026-11-02 · 生产级插件交付选型记录。选型方法：先过方向硬闸（禁台账/记录/生活类），再以真实市场证据评分，最后以生态空白校验。

## 一、需求证据（可追溯）

### 1.1 方向：WebSocket/SSE 客户端调试

**痛点一（WS 自定义头）**：浏览器 WebSocket API 握手**不能带自定义头**是协议层面的结构性限制——`Authorization` 等头无法设置，开发者被迫用 query 参数/cookie/子协议 hack 传递凭证。

- aiohttp Issue #2053：协议完全支持自定义头，但「you cannot access them in webbrowser JS in any reasonable way」
- Stack Overflow（如何跨域鉴权 WS 连接 / 如何给后端 WS 服务传自定义 Authorization）反复出现，主流回答都是「浏览器做不到，换工具」
- LinkedIn《Essential guide to WebSocket authentication》：整篇文章围绕「浏览器发不了这个头」展开

**痛点二（SSE 调试）**：`EventSource` 只能 GET、不能带自定义头、不能带 body；而 AI 时代的流式接口（OpenAI/Anthropic/Ollama/vLLM 及一切 OpenAI 兼容 API）**全是 POST + Bearer + SSE**。

- daily.dev / Stack Overflow / danielcorin.com（LLM SSE streaming）：一致结论「EventSource 有局限，调 LLM 流式经常得绕道」
- 现状解决方案 = `curl -N`、Python `httpx_sse`、临时写 fetch 脚本——**没有一个像样的 GUI SSE 调试器**（搜索「SSE debugging tool」的直接证据：结果全是这些绕道方案）

**竞品格局**：

| 工具 | 缺陷（用户实证） |
|---|---|
| 浏览器 DevTools | 只能看「自己页面里」的连接；发起任意 WS/SSE 带自定义头不可能 |
| wscat / websocat（CLI） | 无 GUI、无时间线、无计时统计、无 transcript；npm/Rust 安装门槛 |
| Postman | WS 支持原生但社区实证「not quite mature」（Ministry of Testing）；重型+账号门槛；SSE 无专用支持 |
| llm-probe（本生态） | 是 LLM 健康体检（预置探针），不是任意端点调试器 |
| mcp-probe（本生态） | MCP 协议专用（stdio/streamable-HTTP） |
| webhook-station（本生态） | 入站 HTTP 捕获/重放，无 WS/SSE 客户端能力 |
| relay-devkit（本生态） | REST API 客户端（fetch），无 WS/SSE |

### 1.2 生态空白校验（79 插件全量盘点）

对 Polaris-plugin 全部 79 个插件 id/名称/描述全量盘点 + 全仓 grep `new WebSocket` / `require('ws')`：**零命中**（唯一 WS 引用是 flashforge 生成应用的禁用规则）。WS/SSE 客户端调试是生态内真实空白。

### 1.3 目标用户与场景

- **AI 应用开发者**（本机 Polaris 用户群即此画像：flashforge/插件工坊/MCP 开发者）：调试流式接口（为什么流断了/TTFT 多少/事件长什么样）
- **长连接后端开发者**：WS 握手鉴权失败排查、消息往返验证、保活/RTT 测量
- **集成调试**：第三方 WS/SSE 接口（行情推送、IoT、消息机器人）行为确认

## 二、候选池与评分（满分 100）

硬闸先行：台账/记录/CRUD/生活类一个不进（用户 2026-11-01 三次否决，生态 15+ 饱和）。初始候选 10+ 个中，`page-sentinel`（网页变更监测）、`domain-probe`（域名/证书诊断）、`mock-server`（Mock 接口）、`log-lens`（日志透视）、`relay-devkit`（开发者工具箱）、`keyscan`（密钥扫描）均已被既有插件占据，剩余候选评分：

| 候选 | 痛点20% | 频率15% | 缺口15% | 差异化15% | 收益15% | 适配10% | 可行5% | 成本5% | 总分 |
|---|---|---|---|---|---|---|---|---|---|
| **长连接调试台** | 4.5 | 4 | **5** | 4.5 | 4 | **5** | 4.5 | 4.5 | **89.5** |
| 视频工坊(ffmpeg) | 4 | 4 | 4 | 3.5 | 4 | 3 | 3.5 | 2.5 | 74 |
| 表格清洗变换台 | 3.5 | 3.5 | 3 | 3 | 3.5 | 4.5 | 4.5 | 4 | 72 |
| 依赖哨兵 | 3.5 | 3 | 3.5 | 2.5 | 3 | 4 | 4 | 4 | 66 |

落选理由：
- **视频工坊**：需求真实但 zip 体积（ffmpeg 二进制 ~30-40MB）逼近 jsdelivr 50MB/文件红线，长任务进度管线复杂，二进制维护成本高
- **表格清洗变换台**：外部竞品强（Excel/OpenRefine），且生态内 gephi/pdf-tables/duzhi 已占表格空间
- **依赖哨兵**：本质是 CLI 包装（npm outdated/audit），差异化薄

## 三、关键假设与 MVP 验证

| 假设 | MVP 验证方式 | 结果 |
|---|---|---|
| WS 自定义头是硬需求 | 冒烟夹具：无 `x-test` 头被服务端 1008 拒、有则开——证明头真实到达 | ✅ smoke.test.mjs |
| SSE POST+Bearer 抓取有价值 | 夹具 401 拦截错误 key、正确 key 流出 5 事件+计时 | ✅ smoke.test.mjs |
| AI「连上→发→等→解读」闭环成立 | MCP stdio 全链路：ws_connect/send/wait_frame/close + sse_capture 返回 TTFT/间隔统计/样本 | ✅ smoke.test.mjs |
| 间隔统计（p95）能诊断流卡顿 | gaps 统计真实产出（min/median/mean/p95/max） | ✅ smoke.test.mjs |

**止损线**：若真宿主验收发现服务模型不兼容（不太可能——与 net-sentinel/webhook-station 同范式），停在 commit 并如实报告。

## 四、技术设计

### 4.1 架构（与已交付调试类插件同范式）

- **service/main.js**（node，127.0.0.1:9874）：WS 引擎（vendor/ws.cjs）+ SSE 引擎（fetch 流式）+ REST API + fetch-SSE 实时帧推送（100ms 合帧）+ long-poll 等帧
- **mcp/server.js**（stdio JSON-RPC）：七工具薄层，kv 读 `streamdesk.meta` → 直连 service（mcp-probe 同款发现链）
- **面板**（esbuild external-react）：四 Tab（会话/WS 控制台/SSE 抓取/设置）；实时帧走 fetch-SSE 自解析（用 shared/core 解析器——与 service 同口径，正好自证产品定位）
- **持久化**（cap.kv）：`streamdesk.meta`（心跳 60s）/ `streamdesk.sessions`（索引 cap 60）/ `streamdesk.session.<id>`（掩码 transcript，cap 30，启动 sweep 孤儿）/ `streamdesk.settings`

### 4.2 安全设计

- 仅监听 127.0.0.1；除 `/__health` 外全量 Bearer token（timingSafeEqual）；token 128bit 随机持久化
- 出站掩码不变量：头离开服务进程必经 `maskHeaders`（`cookie`/`authorization` 恒掩，其余 secret/token/password/credential/signature 兜底正则）；落库路径有测试断言「不得含明文密钥」
- 请求头白名单化（48 个上限、值长上限、协议保留头拒传）；请求体 1MB 上限；会话 12 个上限
- MCP 工具时长护栏（sse_capture ≤120s、ws_wait_frame ≤30s）防 AI 长阻塞

### 4.3 关键取舍

- **perMessageDeflate 关闭**：调试要看原始帧，压缩毁掉可读性（ws 默认即关，显式声明）
- **面板直连而非 kv 信箱**：实时帧流低延迟需求（kv 轮询不适合流式）——api-bench/imgforge/mcp-probe 面板直连面同款威胁模型（ACAO:* + 128bit token）
- **进行中会话不持久化帧**：调试会话是短生命周期产物；transcript 只在收尾落盘，进程死亡如实标「已中断」——避免高频写 kv
- **浏览器 EventSource 不用于面板实时通道**（不能带 Authorization 头）：用 fetch 流 + shared/core 自解析——插件自身就是自己产品主张的第一个用户

## 五、验证记录（真实执行）

- `npm test`：**33/33 全绿**（约 5s）——core 单测 22 + smoke 8（REST/WS/SSE 夹具/MCP stdio）+ bridge 集成 2（mock bridge 契约对齐生产 kvclient：meta 落库、索引/transcript 掩码落库、MCP 完整生产发现链）
- `npx tsc --noEmit`：通过（strict）
- `npm run build`：dist/panel.js 65KB（external react）
- `npm run build:vendor`：service/vendor/ws.cjs 125KB 单文件（external bufferutil/utf-8-validate）
- 测试中抓到并修复的真 bug：baseSession 未把 url 写进 request（SSE 全断）、DELETE 正则分支 undefined≠''、MCP isError 放错层级（result 外→内）、SSE 解析器 flush 未处理残留行（WHATWG EOF 语义）、long-poll 超时/终结竞态双应答
- **未验证（如实）**：真实宿主（Polaris 主应用）内的端到端——宿主未在运行；kvclient 为生产同款逐字节拷贝、bridge 契约经 mock 验证，残余风险为主要商店（SqliteStorage）侧行为，需真宿主验收
