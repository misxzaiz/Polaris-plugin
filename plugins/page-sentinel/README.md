# 网页哨兵（page-sentinel）

> 盯网页变化的后台哨兵：**价格 / 库存 / 补货 / 放号 / 考位 / 演出票 / GitHub release / 文档更新 / API changelog**——变化了、命中了、恢复了，才来找你。

- 面板（ActivityBar → 🎯 网页哨兵）：管理目标、看行级 diff、事件流、服务状态
- 后台服务：按间隔原生抓取 + 抽取 + diff + 条件评估（**唯一的抓取路径**）
- MCP 工具（7 个 `sentinel_*`）：在聊天里直接让 AI 登记目标、试抓、查事件、分析变化

## 为什么它能做浏览器做不了的事（跨域问题的解法）

插件的 UI（面板）跑在宿主 webview 里，受**同源策略**约束：直接 `fetch` 任意第三方网页会被 CORS 拦死。同时 Polaris 的 `cap.http` 对 Web/手机端（Remote 源）默认拒绝。所以本插件把**抓取整体下沉**：

```
┌──────────────┐   router_dispatch（宿主统一通道：桌面 IPC / Web+token）
│ 面板 Panel    │──────────────────────────────┐
│ 桌面 + 手机Web│                               ▼
└──────────────┘                    ┌─────────────────────┐
┌──────────────┐   stdio JSON-RPC   │      cap.kv         │ ←—— 唯一事实库
│ MCP Server   │───────────────────▶│  (sentinel.* 键空间) │     （SqliteStorage）
│ (AI 工具层)   │   router_dispatch  └──────────▲──────────┘
└──────────────┘                               │ 读目标/设置，写状态/快照/事件
                                               │
                                    ┌──────────┴──────────┐
                                    │  sentinel-service   │
                                    │  node 原生 fetch     │ ←—— 无 CORS、无 Remote 源限制
                                    │  调度/抽取/diff/事件  │
                                    └─────────────────────┘
```

三层含义：

1. **外网抓取**：只有后台服务做（Node 原生请求，无浏览器同源策略）。面板和 MCP **永不**直接抓外网——单一抓取路径，无第二条写法。
2. **面板 ↔ 宿主**：走 `window.__POLARIS_HOST_INVOKE__`（桌面直连 IPC；手机/Web 自动取服务地址并携带 token），面板零配置跨端可用。
3. **数据一致性**：所有状态走 `cap.kv`（Remote 源放行），桌面与手机看到同一份事实；AI 经 MCP 读写同一键空间。

## 使用

### 面板
1. 新建监控：填 URL，选抓取模式与告警条件，间隔最短 30 秒；「试抓预览」可先验证配置再保存。
2. 卡片上可立即检查 / 暂停 / 编辑 / 删除 / 展开最近行级差异。
3. 「动态」Tab 是事件流：变化（带 diff）、命中、解除、错误、恢复；未读角标 + 一键「发到聊天分析」。

### 让 AI 代劳（聊天示例）
- 「帮我盯着 https://github.com/x86-assembly/polaris/releases 页面，出现 v2.0 就告诉我」
  → AI 调 `sentinel_add_watch`（condition=contains, keyword=v2.0）
- 「先试抓一下这个接口的 `data.price` 字段看看长什么样」
  → AI 调 `sentinel_test_fetch`（mode=json, jsonPath=data.price）
- 「现在所有的监控里哪个出过错？」
  → AI 调 `sentinel_list_watch` / `sentinel_get_events`

MCP 工具：`sentinel_add_watch` / `sentinel_list_watch` / `sentinel_update_watch` / `sentinel_remove_watch` / `sentinel_check_now` / `sentinel_test_fetch` / `sentinel_get_events`。

### 抓取模式
| mode | 用法 | 典型场景 |
|---|---|---|
| `text` | 整页文本（去 script/style、空白归一） | 盯整页任意变化 |
| `selector` | CSS 选择器子集：`tag`/`.class`/`#id`/`[attr op v]`/后代/子代/逗号/`@attr` 后缀 | 只盯 `.price`、`a.item@href`，最准 |
| `regex` | 正则，捕获组 1 优先 | 接口 HTML 里抠数字 |
| `json` | 点路径 `data.items[0].price` | 盯 JSON 接口（SPA 首选） |
| `headers` | etag / last-modified / content-type 等 | 盯资源是否更新 |

### 告警条件（边沿触发，不重复轰炸）
`any` 内容变化 · `contains` 出现关键词 · `notContains` 关键词消失 · `lt` 数值低于阈值 · `gt` 高于阈值。
另有独立于条件的状态事件：检查失败（限频 1 次/小时/目标）与恢复。

## 数据契约（cap.kv `sentinel.*` 键空间）

三个组件（面板 / MCP / 服务）共用；**键即协议**：

| 键 | 写者 | 内容 |
|---|---|---|
| `sentinel.target.<id>` | 面板 / MCP | 目标定义（url/mode/selector/intervalSec/condition/…） |
| `sentinel.state.<id>` | 服务 | 运行状态（status/lastCheckedAt/nextCheckAt/contentHash/conditionState/…） |
| `sentinel.snap.<id>` | 服务 | 最近抽取快照（≤256KB） |
| `sentinel.event.<id>.<ts>` | 服务 | 事件（change/match/unmatch/error/recovered + diff） |
| `sentinel.cmd.check.<id>` | 面板 / MCP → 服务消费 | 立即检查命令（消费即删） |
| `sentinel.cmd.test.<nonce>` | 面板 / MCP → 服务消费 | 试抓命令（消费即删） |
| `sentinel.test.<nonce>` | 服务 | 试抓结果 |
| `sentinel.settings` | 面板 / MCP | 全局设置（pausedAll/maxConcurrency/retentionDays/maxEventsPerTarget/userAgent） |
| `sentinel.meta` | 服务 | 心跳（version/pid/bridge/lastTickAt/…，60s 一拍） |
| `sentinel.readAt` | 面板 | 已读水位（跨端未读角标） |

设计要点：
- **每目标一键**：目标按 `target.<id>` 分键存储，天然避免多写者（面板/MCP 并发登记）读改写竞争。
- **命令信箱**：面板/MCP 写命令键、服务消费删除——跨端触发检查不需要服务暴露端口。
- **单写者**：状态/快照/事件只由服务写；`settings`/`readAt` 允许面板/MCP 少量写（last-write-wins，可接受）。
- 保留策略：每目标默认留 50 条事件 / 30 天，孤儿键（目标已删）由服务 15 分钟一轮清理。

## 运行与排查

- 服务由宿主 PluginServiceManager 托管（type=http，健康检查 `/__health`，失败自动重启，上限 10 次）。桥不可达时健康端点仍返回 200（避免误杀重启循环），降级状态写入 `sentinel.meta` 供面板展示。
- 服务日志：`<数据根>/page-sentinel.log`（512KB 轮转；宿主不收集插件服务 stdout，自行落盘）。
- 端点自发现：`POLARIS_HOST/PORT/TOKEN` 环境变量（若宿主未来注入）→ `anchor.json` → `config.json`（web.port/token，Bearer md5）→ 端口向上扫描 25 个。
- 测试：`node --test test/run-tests.mjs`（抽取/diff/校验单测 + mock 网站与 mock IPC bridge 的服务端到端）；`node test/mcp-verify.mjs`（MCP stdio 全流程）；`node test/smoke-real.mjs`（真实环境冒烟：需本机 Polaris 运行中，验证真实桥闭环后自动清理）。

## 已知边界

- 无 JS 渲染：SPA 页面请盯其 XHR 的 JSON 接口（mode=json），或页面上服务端直出的片段。
- 选择器为子集引擎（零依赖打包约束），覆盖常用用法；`@attr` 后缀取属性值。
- 抓取礼貌策略：同一主机至少间隔 15 秒（手动「立即检查」不受此限）；间隔最小 30 秒。
- 请遵守目标站点的服务条款；本插件不提供绕过反爬（验证码/登录墙）的能力。

## License

MIT
