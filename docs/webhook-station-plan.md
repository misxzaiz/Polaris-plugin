# Webhook 调试台（webhook-station）设计与实施计划

> 2026-11-01。选型结论与市场证据摘要 + 生产级实现契约。
> 候选池 15+ 方向经方向硬约束（禁台账/记录/生活类）与八维评分筛选，本方向 87.5/100 居首。

## 一、问题与证据

**痛点**：集成支付回调 / CI 钩子 / IoT 上报 / SaaS 通知时，开发者需要「一个第三方服务器可达的本机接收端」来查看与排查入站 HTTP 回调。现状四分裂：

1. **公网捕获站**（webhook.site / RequestBin）：临时 URL、payload 存在第三方（含签名/PII/密钥的隐私风险）、过期即丢、不能转发到本地代码。
2. **隧道工具**（ngrok / natapp / cpolar）：只解决可达性，免费域名随机、掉线后回调丢失无记录、排查要在终端翻日志。微信/支付宝官方文档明确 notify_url 必须公网可达——「隧道 + 无本地捕获」是支付集成的日常。
3. **转发工具**（smee.io）：只转发不留存、不能重放、无检查界面。
4. **自写脚本**：每个项目重写一遍。

**证据来源**：微信支付/支付宝官方文档与开发者社区排查帖（回调不可达是高频问题）；Cloudflare/Front 社区「本地 webhook 测试怎么办」的持续吐槽；GitHub 上 "capture + inspect + replay + forward without tunnels" 工具的出现本身即缺口证明；webhook.site 隐私风险的公开警示。

**生态空白**：Polaris 59 个插件全部是「请求发出方」（客户端/抓取/监控出站），无任何「请求接收方」。relay-devkit 的 API 客户端是出站调试，与本插件（入站调试）互补不重叠。

## 二、产品定位

- **名称**：Webhook 调试台（id: `webhook-station`）
- **一句话**：把本机变成常驻的回调接收工作站——第三方回调先落进本机捕获器（多桶分流、全量留痕），再转发/重放到本地应用；配合任意隧道稳定联调，数据不出本机；AI 经 MCP 工具直接排查回调内容。
- **核心动作**：捕获/检查/转发/重放/诊断（变换与诊断类，非记录类——留痕是调试手段而非目的）。
- **目标用户**：集成支付回调、企业微信/钉钉机器人、GitHub/CI webhook、IoT 设备上报、本地微服务联调的开发者。
- **MVP 范围**：多桶（secret 路径分流）、全方法捕获、转发模式（镜像上游响应）、重放、面板四 Tab、MCP 六工具、真实桥冒烟。
- **明确不做**：内置隧道（ngrok/natapp 等外部工具自配，捕获器是隧道的稳定锚点）、公网中继服务、签名自动校验规则引擎（AI 辅助排查覆盖）、多用户。

## 三、架构（三类进程 + 数据面）

```
第三方服务器 / 隧道(ngrok等) / 局域网设备
        │  ANY /hook/<bucketSecret>
        ▼
服务进程（单写者，0.0.0.0:<port 9869>）
  ├─ 捕获 → 全量落 JSONL（dataRoot 兄弟目录 polaris-webhook/captures.jsonl，8MB 轮转）
  ├─ 预览镜像 → cap.kv whs.rec.<n> 分块（面板跨端读）
  ├─ 转发模式 → http(s) 转发到 bucket.forwardUrl（可指向 127.0.0.1 本地应用），镜像上游响应
  └─ 消费命令键（先删后做）：replay / clear / drop_capture
面板（宿主同窗 React）──读 whs.rec/meta/settings，写 settings 与命令键──▶ cap.kv
MCP（stdio）──hook_recent/overview 读 kv；hook_get/search 直读 JSONL 全文；replay/clear 走命令键
```

- **单写者**：捕获数据的唯一写者是服务进程（JSONL + rec 分块 + meta）。面板/MCP 只写 settings（用户意图，last-write-wins）与命令键。
- **跨端**：面板读数据面 cap.kv，桌面/Web/手机一致；服务 0.0.0.0 监听供局域网设备直连（pocket-drop 先例）。
- **隐私**：payload 只落本机（JSONL + 本机 sqlite kv），无任何外发路径；服务不提供任何 CORS 开放的读 API（攻击面仅 `/__health` + 捕获端点），防恶意网页经浏览器读取捕获内容。

## 四、键空间契约（权威）

| 键 | 写者 | 内容 |
|---|---|---|
| `whs.settings` | 面板/MCP（服务仅首次引导写默认桶） | `{version, buckets:[{id,name,secret,createdAt,forwardUrl,responseMode,fixedStatus,fixedBody}], retention:{maxPerBucket,bodyCapKb}, updatedAt}` |
| `whs.meta` | 服务 | 心跳：`{version,pid,startedAt,lastTickAt,port,lanUrls,degraded,filePath,fileBytes,capturesTotal,lastCaptureAt,settings}` |
| `whs.rec.<n>` | 服务（唯一写者） | 最近捕获分块数组（每块 20 条，rec.0 最新；预览 body ≤10KB） |
| `whs.idx` | 服务 | `{count,total,chunkCount,updatedAt,oldestAt}` |
| `whs.cmd.<op>.<nonce>` | 面板/MCP 写，服务先删后做 | op: `replay{captureId,targetUrl?}` / `clear{bucketId,confirm}` / `drop_capture{captureId}` |
| `whs.result.<nonce>` | 服务 | 命令结果，消费方读取后删除 |

## 五、安全边界

- 捕获端点凭 secret 路径分流（12 hex 随机，不可猜）；无 secret 的路径 404。
- 请求体上限 10MB（超出 413）；存储体上限 `retention.bodyCapKb`（默认 256KB，超出截断标记）。
- 转发/重放目标仅 http/https（URL 解析校验），允许 127.0.0.1/内网（本插件存在的意义），不跟随重定向，响应上限 10MB，超时 15s。
- 日志不落 payload 内容；只记方法/路径/来源/结果。
- 清空/删除类操作 MCP 侧强制 confirm 门，面板侧红色二次确认。

## 六、验收标准（三层）

1. 离线单测：settings 归一化、body 分类与截断、hop-by-hop 过滤、环形缓冲与分块计划、cURL 生成、统计聚合、搜索过滤——行为级全绿。
2. 构建：`tsc --noEmit` + esbuild 产出 dist/panel.js。
3. 真实桥冒烟：护栏拒跑 → spawn 真服务 → /__health → 默认桶引导 → 伪造微信支付回调捕获（JSON+GET+大 body 截断）→ 转发模式镜像上游（本地 mock）→ MCP 六工具闭环（含 confirm 门）→ meta 心跳 → 清场 100% → N/N。
4. 生产级清单（data-ark 标准）逐条过：原子写/单写者/幂等/诚实降级/日志自落盘/护栏。
