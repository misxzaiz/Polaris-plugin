# 网哨（net-sentinel）

> 把「网络本身」变成可对话的资产：断网、劣化、DNS 慢、某个站点失联——事后不再无从查证。AI 能直接回答「现在网怎么样」「昨晚断过网吗」「github 这周延迟如何」。

- **面板**（ActivityBar → 🎯 网哨）：概览（在线大状态 + 目标卡片 + 15min spark）、历史（24h/72h/7d 热力 + 折线 + 聚合表）、动态、设置 四 Tab
- **后台服务**：网络探测的唯一权威——每 10s 对网关/DNS/站点做 TCP 握手（无需 ICMP/管理员），域名先测 DNS 解析再测链路，分钟聚合进小时桶（写前持久，重启续写），滚动保留 30 天
- **MCP 工具**（5 个 `net_*`）：聊天里直接「测下网速」「帮我盯一下 nas.local」「昨晚有没有断网」
- **跨端**：桌面 / Web / 手机打开同一面板看到同一份网络事实——数据只有 cap.kv 这一个事实库

## 它解决什么

网速慢/掉线是最高频的基础设施痛点，但没有任何工具能事后回答：

- 昨晚 11 点是不是断过网？（Windows 事件查看器不行、路由器日志没人看）
- 是 DNS 慢还是链路慢？（网哨对域名目标分离测量 `dnsMs` 与握手 `ms`）
- 是路由器的问题还是目标站的问题？（网关/锚点/站点三层目标对照归因）
- 我家网络这周整体质量如何？（24h 热力图 + P95/丢包聚合表）

## 探测语义（为什么被 RST 也算「通」）

网哨测的是**网络可达性**，不是服务可用性：TCP connect 收到 RST（ECONNREFUSED）说明 IP 已应答——链路和 DNS 都是通的，且 SYN→RST 往返仍是有效 RTT。只有超时/不可达/DNS 失败记丢包。这让网哨可以用纯 Node 实现（无需 ICMP/管理员权限），语义上最接近 ping。

**网关防抖加倍**：网关真掉线与防火墙静默过滤 80 端口都表现为 timeout，无法区分——网关类目标的失联判定需要 sustain×2 轮，事件文案会提示长期误报时改端口或停用。

## 在线判定

锚点目标（默认 4 个：223.5.5.5 / 119.29.29.29 / www.baidu.com / 1.1.1.1）中 **≥2 个可达才算在线**——单锚点失联不误报断网，但会记该锚点自己的 target_down 事件。锚点/站点/网关三类目标均可在设置中增删改（≤12 个）。

## 事件（边沿触发不轰炸）

| 事件 | 触发条件 |
|---|---|
| 断网 / 网络恢复 | 锚点在线判定翻转，连续 2 轮确认；恢复事件带断网时长 |
| 目标失联 / 恢复 | 单目标连续 sustainRounds 轮无应答（网关 ×2） |
| 延迟劣化 / 回落 | 近 sustainRounds 轮平均延迟 ≥ latencyMs（默认 400ms） |

同类事件至少间隔 30 分钟；恢复类事件带持续时长。全部事件可「问 AI」带着上下文进聊天。

## 按需测速

平时零大流量；测速走命令键（`confirm:true` + 下载上限 1-25MB + SSRF 守卫：默认拒绝本机/私网地址，局域网 NAS 测速需显式 `allowPrivate`）。默认走 Cloudflare speed 端点（支持 `{bytes}` 占位符），面板可改任意测速 URL。

## AI 工具（MCP）

| 工具 | 用途 |
|---|---|
| `net_status` | 当前在线状态 + 各目标延迟/丢包/DNS（「现在网怎么样」「是 DNS 慢还是网络慢」） |
| `net_history` | 回看最近 N 小时分目标聚合（默认 1h，上限 72h：「今天上午网怎么样」） |
| `net_events` | 断网/恢复/失联/劣化事件流（「昨晚有没有断网」） |
| `net_speedtest` | 按需测速（confirm:true；mb ≤25；SSRF 守卫） |
| `net_targets` | 目标管理 list/add/remove/enable/disable（「帮我盯一下 xyz.com:443」） |

## 架构与跨域

```
面板/MCP                     服务（探测引擎，唯一写者）
   │ cmd.speed / cmd.targets    │
   ├───────────────────────────▶│ tick 消费命令键（先删后做）
   │                            │ net.connect 探测 → 分钟聚合 → 小时桶
   │ 读 snapshot/meta/h.*/event │ 写 cap.kv（netmon.*）＋事件边沿评估
   │◀───────────────────────────┤
```

- **面板零直连 fetch**：全部数据走宿主 `__POLARIS_HOST_INVOKE__` → `router_dispatch` → cap.kv（桌面 Tauri 直连 IPC；Web/手机自动带 Bearer token）——浏览器 CORS 面为零
- **探测全部下沉原生服务**：`net.connect` / `dns.lookup` / 测速 `http.get` 都在后台 node 进程执行，三端行为一致
- **单写者纪律**：快照/桶/事件/测速只由服务写；`netmon.targets` 由服务独占写（面板/MCP 经命令键原子改）；面板写 settings 与 readAt

## 键空间契约（`netmon.*`，三方一致）

| 键 | 写者 |
|---|---|
| `netmon.snapshot`（每 tick） / `netmon.meta`（60s 心跳） | 服务 |
| `netmon.h.<YYYYMMDDHH>`（小时桶，`[minIdx, avgX10|null, max, loss, cnt]`） | 服务 |
| `netmon.event.*`（cap 200）/ `netmon.speed.*`（cap 50） | 服务 |
| `netmon.targets` | 服务独占（cmd.targets 原子改） |
| `netmon.settings` | 面板/MCP 写、服务读（10s） |
| `netmon.cmd.speed.*` / `netmon.cmd.targets.*` / `netmon.result.*` | 命令通道（先删后做，结果由消费方删除） |
| `netmon.readAt` | 面板 |

## 开发与测试

```bash
npm install && npm run typecheck && npm run build   # 面板类型检查 + 打包
node test/run-tests.mjs                              # 离线单测 42 项（纯逻辑全覆盖）
node test/smoke-real.mjs                             # 真实桥冒烟 13 项（需本机 Polaris 在跑）
```

冒烟覆盖：真实桥自发现 → 快照/小时桶/网关发现 → cmd.targets 闭环（含坏载荷拒绝）→ 测速 SSRF 守卫 + 本地 2MB 真测速闭环 → MCP tools/list 与 net_status/net_history 真读。

## 已知边界

- 探测语义是**网络可达性**：目标「端口拒绝」也算通（RTT 有效）；要测服务可用性请直接访问服务本身
- 网关目标若防火墙静默过滤探测端口，会持续 timeout——事件文案会提示改端口或停用（防抖已加倍至 sustain×2）
- 纯 IPv6 环境：IPv4 解析失败会自动回退任意族 lookup
- 面板历史范围上限 7 天（168 个小时桶并行拉取）；30 天数据保留给趋势与 AI 查询
