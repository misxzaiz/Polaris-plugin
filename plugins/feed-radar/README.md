# 订阅雷达 feed-radar

RSS/Atom 订阅雷达：订阅源交给后台服务按间隔抓取，文章入库 cap.kv 供桌面 / 手机 / Web 三端同读；AI 经 MCP 工具直接「读报」——看未读、拉正文、做总结。

## 架构（三方一库）

```
┌─ 面板 Panel.tsx ──┐   ┌─ MCP server.js ──┐
│  文章流/订阅源/设置 │   │  7 个 radar_* 工具 │
└────────┬─────────┘   └────────┬─────────┘
         │  宿主 invoke → router_dispatch → cap.kv（radar.* 键空间）
         ▼                      ▼
┌──────────────────────────────────────────┐
│  service/radar.js —— 唯一抓取/写状态权威    │
│  ETag 条件请求 · 退避 · 命令信箱 · 保留清扫  │
└──────────────────┬───────────────────────┘
                   ▼  原生 fetch（无同源策略）
              外网 RSS/Atom 与文章正文
```

- **跨域铁律**：全部外网抓取只发生在后台服务进程（Node 原生 fetch）。面板与 MCP 永不直接 fetch 外网——单一抓取路径，无第二条写法。
- **单事实库**：面板 / MCP / 服务三方读写同一份 cap.kv `radar.*` 键空间，桌面与手机 Web 看到一致状态。
- **命令信箱**：面板/MCP → 服务的唯一触发通道是写 `radar.cmd.*` 命令键，服务消费即删（refreshAll / refreshFeed / pull / forget / purge 五种）。
- **缓存失效信号**：feed.def 的 `rev`（任何写方递增）。面板靠「rev 变化 → 重读该源文章键」做增量加载，另有 90s 一次全量刷兜底。
- 服务生命周期由宿主 PluginServiceManager 管理（type=http + `/__health`；桥不可达时健康端点仍返回 200，避免误杀重启循环，降级状态见 `radar.meta`）。

## 键空间契约（权威描述，三方一致）

| 键 | 写者 | 内容 |
|---|---|---|
| `radar.feed.<fid>` | 面板/MCP 写定义；服务写运行态字段 | 订阅源定义（id 由 URL 的 sha256 前 10 位派生，重复添加幂等） |
| `radar.article.<fid>.<aid>` | 服务写新条目；面板/MCP 写 read/star 并 bump feed.rev | 文章元数据（aid 由 guid/link 派生，跨重复抓取去重） |
| `radar.content.<aid>` | 服务写 | 已抓取的正文（ok/text 或 error） |
| `radar.settings` | 面板/MCP 写，服务读 | 全局设置（pollMin/retentionDays/maxPerFeed/readKeepDays/contentKeepHours） |
| `radar.meta` | 服务写（60s 心跳） | 服务状态（version/pid/bridge/feeds/unreadSum…） |
| `radar.cmd.*` | 面板/MCP 写 → 服务消费即删 | 命令信箱（refreshAll.<n> / refreshFeed.<fid> / pull.<aid> / forget.<fid> / purge.<n>） |

`fid = 'f' + sha256(url 小写去空白).slice(0,10)`，`aid = 'a' + sha256(fid|guid或link).slice(0,12)`——面板、MCP、服务用同一份 `shared/sha256.js` 与同一规则，保证键名跨方一致。

## MCP 工具（AI 读报入口）

| 工具 | 用途 |
|---|---|
| `radar_add_feed` | 添加订阅源（同一 URL 幂等），可带显示名/分组/独立间隔 |
| `radar_list_feeds` | 列出全部订阅源（未读数/条数/抓取状态），可过滤 |
| `radar_remove_feed` | 删源并联动清理其全部文章与正文（星标也删——删除针对整个源） |
| `radar_refresh` | 触发立即抓取（全部或单源），可等待完成 |
| `radar_unread` | 读未读/最新文章流（默认最近 3 天未读，可过滤/加长摘要） |
| `radar_read_article` | 读某篇完整正文（缺失时写 pull 命令触发服务抓取并轮询） |
| `radar_mark` | 标记已读/未读/星标 |

## 抓取与保留策略

- 条件请求：ETag / If-Modified-Since，源未更新 304 零成本回跳；
- 礼貌间隔：同一主机两次抓取至少 10s（用户手动刷新 3s）；连续失败指数退避（×2 → 上限 ×4）；
- 保留清扫：文章天数上限 + 单源条数上限（**星标永留**）、正文按时数清理、孤儿正文回收、过期死命令回收（>1h）。

## 构建 / 测试 / 打包

```bash
npm install && npm run typecheck   # 面板类型检查（tsc --noEmit）
npm run build                      # 面板 bundle → dist/panel.js（esbuild，external react）
node test/run-tests.mjs            # 离线单测（零依赖，不需 Polaris 运行）
node test/smoke-real.mjs           # 真实桥冒烟（需本机 Polaris 在跑，自清理）
node ../../scripts/pack.js plugins/feed-radar   # 打 zip + sha256
```

## 已知边界

- 正文抽取是 readability-lite：JS 渲染的空壳页会诚实报错（提示盯它的 RSS/JSON 接口），不臆造内容。
- 全文抽取 < 400 字符时回退全文去噪兜底（含 `<title>` 文本）。
- 移动端面板经宿主统一 invoke 通道（自动取服务地址 + Bearer token），与桌面同份数据。
