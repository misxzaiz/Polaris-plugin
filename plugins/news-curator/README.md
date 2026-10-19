# AI 每日刊物（news-curator）

偏好驱动的 AI 每日刊物：每天把**基金 / 技术 / 时事 / 创意 / 学习**整理成一份手机适配面板刊物，配合语音播报与阅读反馈回流，让 AI 越读越懂你。

> 详细方案见 [`docs/AI-每日刊物-规划方案.md`](../../docs/AI-每日刊物-规划方案.md)

## 一页架构

```
用户写偏好 → AI 读偏好 → AI 内置浏览器抓源 → news_publish_daily 写入 cap.kv → 面板阅读（≤2h）
    ↑                                                                               ↓
    └──── 阅读行为/收藏/测验（news_record_review）→ AI 学偏好 ←──────────────────────┘
```

- **零插件服务**：不自启 HTTP 端口、无进程生命周期。所有数据读写走宿主 `cap.kv`（SqliteStorage domain=kv）。
- **面板零外网**：只读 cap.kv 中 AI 已发布的日报；抓取由 AI 用**内置浏览器**完成（头条/微博/东财/HN/PH 等，见规划 §6 路线图）。
- **单一事实库**：面板与 MCP server 经 `router_dispatch`（target=cap.kv）读写同一份 `news.*` 键空间。

## 文件结构

```
plugins/news-curator/
├── plugin.json           # views(panel) + mcpServers + executors（零 services）
├── mcp/
│   └── server.js         # MCP stdio：9 个 news_* 工具 + resolveEndpoint 自发现
├── scripts/
│   └── fetch-daily.js    # 定时执行器（自检宿主 / --run 触发 chat 任务）
├── src/
│   ├── model.ts          # kvGet/kvSet + 宿主桥（__POLARIS_HOST_INVOKE__）+ 领域模型
│   ├── index.tsx         # 入口
│   ├── Panel.tsx         # 4 Tab 外壳 + 全部样式
│   ├── Today.tsx         # 今日：进度 + 板块卡片 + 打卡 + 双线学习入口
│   ├── Learn.tsx         # 学习：专业成长 L1-L4 / 通识漫游 24 主题 + 测验
│   ├── Voice.tsx         # 语音：章节播报列表（news_brief → mimo-tts）
│   └── Mine.tsx          # 我的：方向开关 / 基金池 / AI 改动日志 + 撤销
├── package.json / tsconfig.json
└── dist/panel.js         # 构建产物
```

## MCP 工具（AI 侧）

| 工具 | 方向 | 说明 |
|---|---|---|
| `news_get_profile` | 读 | 用户偏好画像（方向开关 / 基金池 / 目标 / 弱信号） |
| `news_set_prefs` | 写 | AI 回写偏好（**强制 reason**，记 prefsLog 可撤销） |
| `news_undo_prefs` | 写 | 撤销 AI 偏好改动 |
| `news_register_schedule` | 写 | 注册定时任务（透传 scheduler_create_task + chat 执行器） |
| `news_list_schedules` | 读 | 列出本插件定时任务 |
| `news_get_daily` | 读 | 读某天已发布日报 |
| `news_publish_daily` | 写 | **核心**：发布日报（schema 校验后写 `news.daily.<date>`） |
| `news_record_review` | 写 | 记录阅读反馈（收藏/打卡/测验）→ 回流偏好 |
| `news_brief` | 读+播 | 章节转播报稿（供 mimo-tts 合成音频） |

## cap.kv 键空间

```
news.prefs            # 用户偏好（面板写 + AI 回写）
news.prefsLog         # AI 改动日志（撤销依据）
news.progress         # 打卡/收藏/完读摘要
news.daily.<date>     # 日报（news_publish_daily 产物，面板只读）
news.reviews.<month>  # 阅读反馈归档
news.sources.last     # 各源最近抓取 hash（AI 去重）
```

## 构建与安装

```bash
npm install          # 安装 esbuild（仅构建用）
npm run build        # 产出 dist/panel.js
```

安装到 Polaris 后：
- 左侧 activityBar 出现「AI 刊物」面板（4 Tab）。
- 对话里说 **「生成今天的日报」** → AI 用内置浏览器抓源 → `news_publish_daily` 发布 → 面板「今日」展示。
- 面板「我的」可开关关注方向、增删基金池、查看并撤销 AI 改动。
- 语音：点「语音」页章节的 ✦，AI 用 `news_brief` + `mimo_tts_synthesize` 合成（data URL 内联，不落盘）。

## 设计取舍（P0）

- **学习为骨架**：专业成长 L1-L4 + 通识 24 主题静态展示，每日课程内容由 AI 对话生成（不建课件库）。
- **语音为单章播报**：不自动全量合成；需时说一句即可。
- **AI 改动可撤销**：`news_set_prefs` 强制 reason + 日志 + 面板一键撤销，建立信任。
- **定时（二期）**：`executors` 已声明，SchedulerDaemon 到期创建 AI 会话（浏览器抓取 + publish）自动完成。

## 参考实现

- 通信层 / MCP 自发现 / 零服务模式：`sim-paper-trading`
- 面板与配置读取：`mimo-tts`
- 占位符注入：`demo-mcp-plugin`（`{{pluginDir}}` / `{{appConfigDir}}`）
