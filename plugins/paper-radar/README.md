# 论文雷达（paper-radar）

> 每天 100 篇 arXiv 新论文，你只该读 10 篇。配置关注主题，雷达自动生成「今日值得读」——**AI 帮你筛，AI 帮你想理由**。

- 面板（ActivityBar → 📚 论文雷达）：今日榜单 / 收藏夹 / 主题与抓取设置
- 后台服务：按间隔原生抓取 arXiv API → 关键词相关性评分 → 生成每日榜单
- MCP 工具（9 个 `paper_*`）：在聊天里直接检索 arXiv、精读论文、收藏、管理主题

## 为什么它能做浏览器做不了的事（跨域问题的解法）

插件面板跑在宿主 webview 里，受**同源策略**约束；同时 Polaris 的 `cap.http` 对 Web/手机端（Remote 源）默认拒绝。所以本插件把外网访问**拆分到两条安全路径**：

```
┌──────────────┐   router_dispatch（宿主统一通道：桌面 IPC / Web+token）
│ 面板 Panel    │──────────────────────────────┐
│ 桌面 + 手机Web│                               ▼
└──────────────┘                    ┌─────────────────────┐
┌──────────────┐                    │      cap.kv         │ ←—— 唯一事实库
│ MCP Server   │                    │  (paper.* 键空间)   │     （SqliteStorage）
│  · cap.kv    │───────────────────▶│                     │
│  · cap.http  │                    └──────────▲──────────┘
└──────────────┘         经宿主转发 arXiv，   │ 读主题/设置，写榜单/收藏
        │           无浏览器跨域，可审计        │
        ▼                                       │
┌──────────────┐  原生 fetch arXiv API（服务端）│
│  paper-      │──────────────────────────────┘
│  service     │   调度/抓取/评分/生成榜单
└──────────────┘
```

三层含义：

1. **抓 arXiv 有两条出口，都不走浏览器**：
   - 后台服务：Node 原生 `https` 请求，**调度路径**（定时、批量、多主题）。
   - MCP 的 `paper_search`：经 **`cap.http` 转发**，由宿主统一出口访问 arXiv。无浏览器同源策略，无 Remote 源拒绝，且**请求可审计**。
   - 面板**永不**直接抓外网——只读 `cap.kv`。
2. **面板 ↔ 宿主**：走 `window.__POLARIS_HOST_INVOKE__`（桌面直连 IPC；手机/Web 自动取服务地址并携带 token），面板零配置跨端可用。
3. **数据一致性**：所有状态走 `cap.kv`，桌面与手机看到同一份榜单与收藏；AI 经 MCP 读写同一键空间。

## 评分逻辑（为什么这篇值得读）

相关性评分是确定性的关键词匹配，**不是黑盒**，用户可解释、可调整：

- 关键词命中**标题** → +3 分
- 关键词命中**摘要** → +1 分
- 一篇论文命中多个主题时分数累加；标题命中会优先出现在解读里
- 解读分两档：标题命中 → 「建议列入精读」；仅摘要命中 → 「值得泛读」；无命中 → 不入选

主题关键词大小写不敏感，支持短语（如 `chain-of-thought`、`vision language model`），用逗号在面板分隔。

## 使用

### 面板
1. **主题** Tab：添加关注主题（名称 + 关键词逗号分隔），可启停/删除。默认内置 3 个主题：LLM Agent / 推理与思维链 / 代码生成。
2. **今日** Tab：榜单按 `#rank rel <score>` 排序，展示标题（可点击跳转 arXiv）、作者、分类、命中关键词、一句话解读。展示近 5 天历史榜单。
3. **收藏** Tab：AI 或面板写入的收藏，含笔记与已读标记。
4. 设置区：每主题拉取数（1–50）、每日上榜数（1–30）、扫描间隔（1–24 小时）。

### 让 AI 代劳（聊天示例）
- 「帮我看看最近 LLM agent 相关的论文」 → AI 调 `paper_search`（经 cap.http）
- 「读一下这篇 2610.35160」 → AI 调 `paper_get`，返回完整摘要 + 相关性解读
- 「今天有什么值得读的？」 → AI 调 `paper_today` 拉当日榜单
- 「把这篇收藏起来，记个备注 RLHF 相关」 → AI 调 `paper_favorite`
- 「添加一个『diffusion』主题」 → AI 调 `paper_add_topic`
- 「看看我的收藏」 → AI 调 `paper_list_favs`

MCP 工具：`paper_search` / `paper_get` / `paper_today` / `paper_list_topics` / `paper_add_topic` / `paper_remove_topic` / `paper_favorite` / `paper_unfavorite` / `paper_list_favs`。

## 数据契约（cap.kv `paper.*` 键空间）

三个组件（面板 / MCP / 服务）共用；**键即协议**。共享契约权威实现见 `shared/contract.js`：

| 键 | 写者 | 读者 | 内容 |
|---|---|---|---|
| `paper.settings` | 面板 / MCP | 服务 | 全局设置（perTopic / dailyTop / scanIntervalHours …） |
| `paper.topics` | 面板 / MCP | 服务 | 关注主题数组（id / name / keywords / enabled / createdAt） |
| `paper.feed.<YYYY-MM-DD>` | 服务 | 面板 / MCP | 当日榜单：`{ date, generatedAt, topicNames, count, items: Paper[] }` |
| `paper.fav.<arXivId>` | 面板 / MCP | 面板 / MCP | 收藏：`{ id, note, read, favoritedAt, updatedAt }` |
| `paper.meta` | 服务 | 面板 | 服务心跳：`{ version, pid, lastTickAt, lastScanAt, status }` |

`Paper` 模型字段：`id`（已剥离版本号后缀，如 `2610.35160`）、`title`、`url`、`pdfUrl`、`abstract`、`authors[]`、`categories[]`、`published`、`score`、`topMatches[]`、`verdict`。

## 服务行为

- **启动即扫描**：若今天尚无 `paper.feed.<today>`，立即抓一轮。
- **周期扫描**：默认每 8 小时一次（受设置影响）。
- **维护窗口避让**：本地 2–4 点（arXiv 常见维护）跳过本次周期。
- **健康检查**：`GET /__health` 返回 `{"ok":true}`；面板读 `paper.meta.lastTickAt` 判定心跳（3 小时内为在线）。
- **HTTP API**：`GET /api/feed?date=` / `POST /api/scan` / `GET|POST /api/topics`，主要供面板近身读取与调试。

## 开发与测试

```bash
cd plugins/paper-radar
npm install
npm run build        # esbuild 打包面板 → dist/panel.js
npm run typecheck    # tsc --noEmit
node test/contract.test.js   # 12 项共享契约单测（评分/去重/解读）
node test/smoke-real.js      # 10 项端到端冒烟（真实 arXiv 抓取 + 评分）
node test/mcp-smoke.js       # 5 项 MCP 协议冒烟（initialize/tools/list/call）
```

零外部依赖：服务与 MCP 只用 Node 内置模块；面板仅 React + esbuild 构建产物。

## 打包

```bash
cd plugins/paper-radar
node ../../scripts/pack.js .    # → paper-radar.zip
```

`.pluginignore` 已排除 `node_modules/`、`package.json`、`src/`、`test/`、`README.md`、`*.zip`，zip 根目录直接含 `plugin.json` 与构建产物 `dist/panel.js`。
