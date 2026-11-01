# Webhook 调试台（webhook-station）

把本机变成常驻的**回调接收工作站**：支付回调 / CI 钩子 / IoT 上报 / 机器人通知先落进本机捕获器（多桶分流、全量留痕、数据不出本机），再转发或一键重放到本地应用；配合任意内网穿透隧道稳定联调。AI 经 MCP 六工具直接排查回调内容。

核心动作是**捕获/检查/转发/重放/诊断**——留痕是调试手段而非目的。

## 解决什么问题

| 现状 | 痛点 | 本插件 |
|---|---|---|
| webhook.site / RequestBin | 临时 URL、payload 存第三方（含签名/PII/密钥的隐私风险）、过期即丢、不能转发到本地代码 | 本机捕获、留痕可控、数据不出机 |
| ngrok / natapp / cpolar | 只解决可达性；免费域名随机、掉线后回调丢失无记录 | 隧道只做管道；捕获器常驻本机端口，隧道换域名捕获器不动，回调全程留痕 |
| smee.io | 只转发不留存、不能重放 | 转发 + 镜像上游响应 + 一键重放 |
| 自写脚本 | 每个项目重写一遍 | 常驻、多桶分流、AI 对话排查 |

微信支付/支付宝官方文档明确 `notify_url` 必须公网可达——「隧道 + 本机捕获器」是支付集成的标准姿势，本插件补齐后一半。

## 快速开始

1. **启用插件**（服务 autoStart，端口固定 `9869`；被占用时服务诚实退出，释放后到面板设置页点启动）。
2. **拿捕获地址**：面板「桶与地址」页复制 `http://127.0.0.1:9869/hook/<secret>`（首次运行自动生成「默认桶」）。或直接问 AI：「给我 Webhook 调试台的回调地址」。
3. **三选一接入**：
   - 第三方回调 URL 直接填本机地址（限同网段设备/服务可达时）；
   - 局域网设备直连 `http://<LAN-IP>:9869/hook/<secret>`；
   - 公网第三方：把内网穿透隧道（ngrok/natapp/cpolar…）指向 `127.0.0.1:9869`，隧道公网地址 + `/hook/<secret>` 填给第三方。
4. **看回调**：面板「回调流」实时出现（方法/路径/头/体/来源/应答/转发结果）；或聊天里说「最近有什么回调」。
5. **转发**（可选）：桶编辑里切「转发」模式，填本地应用地址（如 `http://127.0.0.1:3000/api/pay/notify`）——捕获器收到后原样转给本地应用，并把**上游响应镜像回给调用方**；转发失败调用方收到 502（支付平台会自动重试，正好观察重试链路）。
6. **排查**：聊天里说「看看最近支付回调为什么失败」「搜 out_trade_no」——AI 经 MCP 直读留痕全文。

## 桶与应答模式

桶 = 一条专属捕获路径 `/hook/<secret>`（12 位 hex 随机，不可猜）。最多 20 个，各桶独立应答策略：

- **固定应答**（默认）：自定义状态码 + 应答体（如支付宝回调想答 `success` 就填 success；空体 = `{"received":true,"id":...}`）。
- **转发**：转发到 `forwardUrl` 并镜像上游响应。目标仅 http/https，允许 127.0.0.1/内网（本插件的意义所在），不跟随重定向，15s 超时，响应限 10MB。

## MCP 工具（AI 侧）

| 工具 | 适用句式 |
|---|---|
| `hook_overview` | 「webhook 服务在跑吗」「给我回调地址」 |
| `hook_recent` | 「最近有回调进来吗」「支付回调收到了吗」 |
| `hook_get` | 「看这条回调的内容」「验签需要哪些字段」（敏感头自动脱敏） |
| `hook_search` | 「找出所有失败的回调」「搜 out_trade_no」（全文检索留痕） |
| `hook_replay` | 「把这条回调重发一次」「重放到我本地 3000」（confirm 门） |
| `hook_clear` | 「清空测试桶」（confirm 门） |

## 键空间契约（权威）

cap.kv 共享键空间，前缀 `whs.`（三方：面板/服务/MCP 严格按此协作）：

| 键 | 写者 | 内容 |
|---|---|---|
| `whs.settings` | 面板/MCP（服务仅键缺失时引导写默认桶） | `{version, buckets[], retention{maxPerBucket,bodyCapKb}, updatedAt}`；桶：`{id,name,secret,createdAt,responseMode:'fixed'\|'forward',fixedStatus,fixedBody,forwardUrl}` |
| `whs.meta` | 服务（唯一写者） | 心跳：`{version,pid,startedAt,lastTickAt,port,lanIp,lanUrls,degraded,storeDir,filePath,fileBytes,capturesTotal,lastCaptureAt,settings}` |
| `whs.rec.<n>` | 服务（唯一写者） | 最近捕获预览分块数组：rec.0 最新、每块 20 条、单条 body 预览 ≤10KB |
| `whs.idx` | 服务（唯一写者） | `{count,total,chunkCount,oldestAt,updatedAt}` |
| `whs.cmd.<op>.<nonce>` | 面板/MCP 写，服务**先删后做** | op：`replay{captureId,targetUrl?,bucketId?}` / `clear{bucketId,confirm}` / `drop_capture{captureId}` |
| `whs.result.<nonce>` | 服务写，消费方读后删 | 命令结果 |

## 数据与隐私

- **全量留痕**：服务端 `captures.jsonl`（dataRoot 兄弟目录 `polaris-webhook/`，8MB 自动轮转保留一代 `.old`）——完整头/体/转发结果，单条 body 存储上限 `bodyCapKb`（默认 256KB，超出截断标记）。
- **跨端投影**：面板读 `whs.rec.*` 预览（≤10KB/条），桌面/Web/手机一致；全文走 AI `hook_get` 或直接看留痕文件。
- **不出本机**：捕获内容只落本机（JSONL + 本机 sqlite kv）。服务对外**没有任何 CORS 开放的读 API**（攻击面仅 `/__health` + 捕获端点），防恶意网页经浏览器读取捕获内容。
- **敏感数据**：AI `hook_get` 对 `authorization/cookie/token/signature/key/password` 类头自动脱敏；**请求体原样可读**——共享屏幕或把日志发给他人时注意。
- 清理：面板设置页「清空全部留痕」；MCP `hook_clear`（confirm 门）；单条删除 `drop_capture`。

## 已知边界（如实）

- 本插件**不内置隧道**：公网第三方回调仍需用户自备 ngrok/natapp/cpolar 等；捕获器是隧道的稳定锚点（隧道换域名只需改隧道配置）。
- 端口固定 `9869`：被占用时服务退出并显式报错（换端口会导致回调地址漂移，违背常驻锚点定位）。
- 面板仅显示 body 预览（≤10KB/条）；全文在留痕文件（超大 body 截断上限 `bodyCapKb` ≤1MB）。
- 重放/转发不跟随重定向（观察重定向行为请看响应中的 Location 头）。
- 服务重启后 `whs.rec.*` 镜像从 JSONL 重建？——否：镜像仅保留内存 ring（重启后从零开始累计），**留痕文件不丢**；AI 的 `hook_search`/`hook_get` 跨全量文件查询不受影响。

## 开发

```bash
npm install
npm test                # 离线单测（shared/core 纯函数核心）
npm run typecheck       # tsc --noEmit
npm run build           # esbuild → dist/panel.js
node test/smoke-real.mjs  # 真实桥冒烟（需本机 Polaris 运行中；护栏：已有 whs.* 键拒跑；结束自清理）
```

架构与选型依据见 `docs/webhook-station-plan.md`（仓库 docs/ 目录）。

## 设计取舍

- **单写者纪律**：捕获数据唯一写者是服务进程（JSONL 权威 + kv 预览投影）；面板/MCP 只写 settings（用户意图，last-write-wins）与命令键（先删后做幂等）。
- **面板绝不直接 fetch**：跨端数据面全走 cap.kv（桌面/Web/手机一致）；服务 0.0.0.0 监听仅服务于捕获入口。
- **bridge 降级**：桥不可达时捕获/转发照常（健康端点保持 200，meta 标 degraded），60s 重试刷端点。
- 服务启动 settings 双读防竞态：绝不因读取瞬断用「默认桶」覆盖用户既有桶。
