# 口袋主机（pocket-host）

> 把运行 Polaris 的电脑装进口袋：手机上打开同一面板，看到的就是这台主机的实时状态——CPU / 内存 / 磁盘 / 监听端口 / 进程，还能让 AI 直接回答「9827 端口被谁占了」「把失控的 node 杀掉」。

- **面板**（ActivityBar → 📟 口袋主机）：概览（双仪表 + 走势 + 磁盘条）、进程、端口、动态、设置 五 Tab
- **后台服务**：本机指标的唯一采样权威（CPU/内存快采样、进程/端口慢采样、磁盘 statfs），阈值告警边沿触发
- **MCP 工具**（6 个 `host_*`）：聊天里直接「电脑现在什么状态」「释放 9827」「看看刚才是不是卡过」
- **跨端**：桌面 / Web / 手机打开同一面板看到同一份快照——数据只有 cap.kv 这一个事实库

## 为什么是它

| 场景 | 没有它 | 有了它 |
|---|---|---|
| 长构建挂机 | 人不在电脑前，构建卡没卡不知道 | 手机开面板看 CPU 走势，超阈值还有告警事件 |
| 端口冲突（9827/9829 被残留进程占着） | 开任务管理器翻半天下 | 端口 Tab 一眼定位占用者，一键释放 |
| AI 排障 | 让 AI「帮我把端口释放了」它做不到 | `host_ports` + `host_kill`，AI 亲自查并（经确认）动手 |

## 跨域 / 数据面架构（读这个再改代码）

本插件**零外网请求**，所有数据面都规避了浏览器跨域限制：

```
面板(桌面/Web/手机) ── window.__POLARIS_HOST_INVOKE__ ──► router_dispatch ──► cap.kv (hostmon.*)
                                                                             ▲ 唯一写者
后台服务 host.js ── 127.0.0.1 bridge(md5 token) ─────────────────────────────┘
MCP server.js    ── 同上（复用 service/kvclient.js 自发现）
```

- 面板**从不直接 fetch 任何地址**（本地或外网）——全部经宿主 invoke 通道走 router_dispatch，桌面（Bootstrap）/ 手机（Remote）同一条路，天然无 CORS；
- 服务与 MCP 对宿主的访问走 127.0.0.1 + `Bearer md5(web.token)`，端点自发现（env → anchor.json → config.json → 端口上扫 25 个），Polaris 不向插件服务注入环境变量；
- 若未来要加「外网探测」类功能，抓取必须下沉到后台服务原生执行（参照 page-sentinel），**不得**在面板里直接 fetch。

### 键空间契约（`hostmon.*`，三方一致：service / mcp / panel）

| 键 | 写者 | 读者 | 说明 |
|---|---|---|---|
| `hostmon.snapshot` | **服务**（每 snapshotMs） | 面板 / MCP | 主机快照（CPU/内存/磁盘/端口/进程/告警态/历史环） |
| `hostmon.meta` | **服务**（60s） | 面板 / MCP | 心跳 + 版本 + bridge + 降级状态 |
| `hostmon.settings` | 面板 / MCP | 服务（10s 轮读） | 阈值/节奏/paused，写入即生效 |
| `hostmon.event.<13位ts>` | **服务** | 面板 / MCP | 阈值告警事件，保留 100 条滚动清理 |
| `hostmon.cmd.kill.<nonce>` | 面板 / MCP | **服务**（消费后删） | kill 命令 |
| `hostmon.result.<nonce>` | **服务** | 面板 / MCP（取后删） | kill 结果，孤儿 10 分钟清理 |
| `hostmon.readAt` | 面板 | 面板 | 动态未读水位 |

**单写者原则**：快照/告警/kill 执行只发生在服务；MCP 永不自行采样（它读同一份快照），面板只写 settings 与命令键。

## kill 的安全设计（重点读）

结束进程是本插件唯一的破坏性能力，四层护栏：

1. **显式确认**：命令载荷必须带 `confirm: true`（面板两段确认 UI；MCP 不带 confirm 直接拒绝并提示先核对 PID）；
2. **执行时重新解析**：按 `port` 释放时，服务在执行瞬间重新 netstat 解析占用者——防止命令排队期间 PID 复用导致误杀新进程（**推荐走 port 而不是 pid**）；
3. **guardKill 拒绝**：PID ≤ 4（System 等系统保留）、采样服务自身、其父进程（宿主后端）、名字匹配 `/^polaris/i` 的核心进程，全部拒绝并在 result 中说明原因；
4. **留痕**：每次执行写 result（含 taskkill 原始输出）+ 服务日志（`<appConfigDir>/pocket-host.log`）。

## 告警状态机

- **防抖**：CPU/内存需连续 N 个采样（默认 4 × 2.5s = 10s）超阈值才触发，单次尖峰不报；
- **边沿触发**：进入告警态报一次，回落（连续 2 采样低于阈值）发恢复事件，不轰炸；
- **磁盘按盘记忆**：C:/D: 各自独立边沿，互不吞并；
- **兜底限频**：同类型（磁盘含盘符）事件最小间隔 30 分钟；
- 阈值在面板「设置」调整（50-100% / 1-500GB），写入 `hostmon.settings` 约 10s 生效。

## 采集明细（全部零依赖，Node ≥ 18.15）

| 指标 | 手段 | 节奏 |
|---|---|---|
| CPU% | `os.cpus()` 两次快照差值 | 2.5s |
| 内存 | `os.totalmem/freemem` | 2.5s |
| 磁盘 | `fs.statfsSync` 逐盘符（无 spawn）；Node 不支持时回退 `wmic`（Win）/`df`（POSIX） | 60s |
| 进程 | `tasklist /fo csv /nh`（GBK 解码）/ `ps -axo pid,rss,comm`；快照含内存 Top25 | 15s |
| 端口 | `netstat -ano -p tcp` / `lsof`（macOS）/ `ss -tlnp`（Linux） | 15s |
| kill | `taskkill /PID x /T /F` / `kill -9` | 按需 |

限制（如实说明）：进程 CPU% 不采集（Windows 下需高开销采样器，只有内存维度）；进程表快照只含内存 Top25，冷门进程请用端口 Tab 或让 AI 按 PID 查。

## MCP 工具

| 工具 | 作用 |
|---|---|
| `host_status` | 当前状态一句话摘要（CPU/内存/磁盘/uptime/Top5/告警） |
| `host_processes` | 按内存排序的进程表（可按名字过滤） |
| `host_ports` | 监听端口 → 占用进程（可查单个端口） |
| `host_history` | 最近 15 分钟 CPU/内存均值与峰值 + 走势条 |
| `host_events` | 阈值告警事件流 |
| `host_kill` | 结束进程（必须 `confirm: true`；推荐按 `port`） |

## 排障

- **面板显示「服务未运行或无快照」**：设置 → 后台服务 → 启动；若启动失败看 `lastError` 与服务日志。
- **快照停滞**：服务在跑但 bridge 不可达（Polaris 重启中）——服务健康端点保持 200 不会被宿主误杀，桥恢复后自动续写；面板心跳变黄显示停滞时长。
- **手机上看不到数据**：确认手机连的是同一 Polaris 实例（同一 config）；数据面是 cap.kv，Remote 端放行。
- **磁盘没数据**：看 `hostmon.meta.disksVia`——`none` 表示 statfs/wmic/df 全失败（罕见）。

## 开发

```bash
cd plugins/pocket-host
npm install
npm run build        # esbuild → dist/panel.js（external react，宿主 blob shim 提供）
npm run typecheck    # tsc --noEmit
node test/run-tests.mjs    # 离线单测（解析器/告警机/守卫）
node test/smoke-real.mjs   # 真实桥冒烟（需本机 Polaris 在跑，跑完自清理）
node ../../scripts/pack.js plugins/pocket-host   # 打包 zip + sha256
```
