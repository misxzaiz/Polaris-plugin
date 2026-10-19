# AI 每日刊物（news-curator）插件 · 初版规划方案

> 状态：规划稿（不实施）｜日期：2026-10-17｜基于四版原型（v1 排版 / v2 深度阅读 / v3 内容扩容+学习 / v4 学习双线）
> 目标：交付一个「**对用户体验最优（读得久、读得值）且收益最大（AI 价值高频可见、插件粘性强）**」的初版。

---

## 0. 一页结论

**初版只做一件事：建立「用户偏好 → AI 日报 → 面板阅读 → 反馈回流」完整闭环**，其余（学习体系、语音日报、定时任务）全部搭好接口、留二期。

- **AI 侧（MCP）**：8 个工具，覆盖「读用户习惯 / 写每日内容 / 读回本插件数据 / 播报」。
- **用户侧（面板）**：4 个 Tab（今日 / 学习 / 语音 / 我的），其中「我的」承载**用户写入**（偏好开关、基金自选池、学习进度），今日 Tab 承载**查看日报**。
- **存储**：偏好/进度/日报全部走宿主 `cap.kv`（SqliteStorage，面板与 MCP 共享同一份事实库）；无插件自启服务、无本地 HTTP 端口。
- **数据源**：AI 用**内置浏览器**（agent 自带工具）实测访问头条/微博/东财/HN/PH 等（见 §6 路线图），结构化后经 `news_publish_daily` 写入；插件与面板零外网请求。
- **不做的（一期）**：定时抓取、自动推送、学习课程内容库、语音自动生成。二期按 §9 排期逐项接入。

---

## 1. 为什么是这个形态（产品逻辑）

### 1.1 用户痛点与原型验证
| 痛点 | v1-v4 已验证解法 |
|---|---|
| "一分钟看完" | 内容量扩到 ~120 分钟：基金 6 + 技术深度 4 + 时事 15 + 学习双线 60min + 语音 27min |
| 泛信息无获得感 | 学习双线（专业 Java+AI / 通识主题轮换）+ 概念卡 + 小测验 + 语音听讲 |
| 不知道 AI 在干嘛 | 每条卡片带「来源 badge + AI 解读 + 是否异常标记」（如 013835 净值异常 ⚠） |
| 记不住、不坚持 | 阅读进度条 + 连续打卡 + 「剩余 N 分钟」预期管理 |

### 1.2 收益闭环（为什么"收益最大"）
```
用户写偏好 → AI 读偏好 → 精准抓取/筛 → 生成日报 → 面板阅读（≤2h）
    ↑                                                        ↓
    └──── 阅读行为/收藏/测验 → AI 学偏好 ←─────────────────┘
```
- **AI 的价值每天被看见**（生成内容、解读、语音），不是一次性 Demo。
- **数据雪球**：收藏、打卡、测验、基金池，都回流成下一期日报的筛选权重 → 迁移成本高 → 粘性强。
- **二期收益自然长出**：有了偏好与日报文件，定时推送、语音日报、学习课程都是"接到同一条流水线"的增值，成本低。

### 1.3 初版范围决策（宁窄勿宽）
| 范围 | 决策 | 理由 |
|---|---|---|
| 抓取 | 手动触发（AI 对话里点/说「今天日报」） | 定时需要后台 worker + 状态机，一期不做 |
| 学习 | 只做双线骨架 + 静态/半静态今日课 | 课程内容由 AI 对话生成落盘，不建课件库 |
| 语音 | 只做"播报工具"输出音频 URL（面板 `<audio>` 可放） | 不自动合成全量；月流量可控 |
| 基金 | 自选池（用户写入）→ 拉净值排行 + 净额曲线 | 持仓画像/仓位建议二期 |

---

## 2. 总体架构

> **架构决策（2026-10-17 修订）：本插件不自启任何 HTTP 服务（零 services 声明）。**
> 读写全部走 Polaris 宿主 cap 能力（`router_dispatch` → `cap.kv` / `cap.ctx`），
> 与 sim-paper-trading 插件同款模式：面板经 `__TAURI_INTERNALS__.invoke`（Web 回退 IPC bridge）
> 直调 Tauri 命令，MCP server 经 IPC bridge `/api/<command>`（`POLARIS_HOST/PORT/TOKEN` 自发现）同写一份
> cap.kv（SqliteStorage domain=kv）。**无端口冲突、无进程生命周期、无路径穿越面。**

```
┌────────────────────────── 用户 ──────────────────────────┐
│  ① 面板「我的」写偏好/基金池     ③ 面板读日报/听语音        │
└──────────────┬───────────────────────────────┬───────────┘
               │ invoke（router_dispatch）      │ invoke / IPC bridge
┌──────────────▼───────────────────────────────▼───────────┐
│                Polaris 宿主能力总线（零插件服务）          │
│  ┌──────────┐  ┌──────────┐                              │
│  │ cap.kv   │  │ cap.ctx  │   AI 会话（内置浏览器抓源）    │
│  │ (存储)    │  │ (上下文) │   → news_publish_daily 写入    │
│  └────▲─────┘  └──────────┘                              │
└───────┼──────────────────────────────────────────────────┘
        │ router_dispatch                          │
┌───────▼─────────────────────────────────────────▼───────┐
│  面板 Panel.tsx（今日/学习/语音/我的）  │  MCP Server      │
│  kvGet/kvSet（同 simpt model.ts）       │  (mcp/server.js) │
│  写：偏好/基金池/进度 → cap.kv          │  ← AI 调用工具    │
│  读：日报 → cap.kv news.daily.<date>    │  → 抓取/筛/publish│
└──────────────────────────────────────────────────────────┘
```

- **存储**：全部 cap.kv（SqliteStorage domain=kv），键空间见 §5。面板与 MCP 共享同一份事实库。
- **抓取**：AI 对话触发 → AI 用**内置浏览器**（agent 自带工具）逐个访问数据源（头条/微博/东财/HN/PH 等）→ 结构化结果经 MCP `news_publish_daily` 写入 cap.kv。**插件与面板零外网请求、零反爬耦合**。
- **audio 播放**：P0 不落盘音频文件。`news_brief` 产出文本 → 宿主 AI 调 `mimo_tts_synthesize`（返回 data URL / 路径）→ 面板 `<audio>` 直接播放 data URL；音频文件存 cap.kv 亦可（小音频内联）。无本地音频服务。
- **定时（P2/P3）**：声明 `executors`（`{{pluginDir}}/scripts/fetch-daily.js`）+ SchedulerDaemon 调用，不经 services。
- **面板轻、数据一致**：面板只读 cap.kv 已落盘日报，不直连外网；AI 是唯一抓取入口。

### 2.0 宿主 IPC 复用清单（从 sim-paper-trading 实证拷贝）
| 能力 | 面板侧 | MCP 侧 |
|---|---|---|
| 调宿主 | `__TAURI_INTERNALS__.invoke('router_dispatch', {req})`，Web 回退 `ipcCall` | `http POST {host}:{port}/api/<command>`（resolveEndpoint 自发现，token md5 头） |
| 读写存储 | `kvGet/kvSet`（cap.kv get/set） | 同 `polarisIpc('router_dispatch', …)` |
| 抓外网 | AI 内置浏览器（agent 工具，会话内） | —（MCP 无外网代理职责） |
| 聊天推送 | `sendToChat`（`__POLARIS_HOST_PANEL__`） | demo-mcp 的 `polarisPort/token` 回连派发卡片（二期 chatCard） |

### 2.1 权限（plugin.json）
```json
"permissions": {
  "appConfigRead": true,
  "appConfigWrite": true,
  "network": true,
  "aiToolAccess": true
}
```

---

## 3. MCP 工具集（AI 侧读写）

> **架构决策（2026-10-17 二次修订）：插件不做抓取。**
> 抓取由 AI（宿主 LLM）用**内置浏览器（agent 自带工具）**完成；插件 MCP 只提供
> 「偏好读写 / 日报写入 / 定时任务规范 / 读回 / 反馈」写入层。**彻底移除 sources 适配器目录。**

| 工具 | 方向 | 说明 |
|---|---|---|
| `news_get_profile` | AI→读 | 读用户偏好画像：关注方向开关 + 弱信号（收藏/完读/打卡/自选池） |
| `news_set_prefs` | AI→写 | 写入/更新用户偏好（**AI 主动发现用户习惯后回写**，如"用户常收藏基金类→加权"） |
| `news_register_schedule` | AI→写 | **定时任务规范**：把「每天 08:30 用浏览器抓取并 publish」写成宿主 scheduler 任务（透传 `scheduler_create_task` + chat 执行器） |
| `news_list_schedules` | AI→读 | 列出本插件已注册的定时任务（透传 `scheduler_list_tasks`） |
| `news_get_daily` | AI→读 | 读某天已发布日报（含正文/进度/测验答案元数据） |
| `news_publish_daily` | AI→写 | **核心**：写每日日报（校验 schema 后写 cap.kv `news.daily.<date>`） |
| `news_record_review` | AI→写 | 记录阅读反馈（收藏/读完/跳读/测验得分）→ 回流偏好 |
| `news_brief` | AI→读+播 | 把日报某章转播报稿 → 调 mimo_tts_synthesize → 返回音频 URL 挂 `<audio>` |

> **MCP 与宿主连接**：`argsTemplate` 注入 `{{polarisPort}}`/`{{polarisToken}}`（宿主已支持，demo-mcp-plugin 实证），
> 同时保留 sim-paper-trading 的 `resolveEndpoint` 自发现（env > config.json web.port > 默认 3000 探测）——双保险。

> **AI 如何抓取（不依赖插件）**：宿主 agent 会话自带内置浏览器工具（browser_acquire/navigate/context…，
> 本会话即实证）。AI 直接访问头条热榜/微博/东财净值/HN 等，再把结构化结果经 `news_publish_daily` 写入。
> 面板只读 `news.daily.<date>` 展示，AI 只写、面板只读 → 单向写入层，零反爬耦合。

> **定时任务如何跑（不依赖插件服务）**：宿主内置 scheduler（`scheduler_create_task` IPC）+ 通用执行器
> `ExecutorRegistry` 的 `chat` 类型（创建 AI 会话执行 prompt）。`news_register_schedule` 就是把它封装成规范：
> `{ name:"每日刊物", triggerType:"cron", triggerValue:"0 30 8 * * *", executorType:"chat",
>   executorParams:{ prompt:"用内置浏览器抓取今日信息，按 news_* 工具规范写入日报" } }`。
> SchedulerDaemon 到期 → 创建静默 AI 会话 → AI 浏览器抓取 → 调本插件 MCP 写入 → 完成。

> 读写分离的设计理由：**AI 只能通过显式工具改写用户数据**。`news_set_prefs` 每次必须携带 `reason` 字段（如"近7日收藏 90% 为基金类"），面板"我的"页展示改动原因 → 用户可撤销。信任感 = 收益。

### 3.1 工具 schema 草案（news_publish_daily）
```jsonc
{
  "name": "news_publish_daily",
  "inputSchema": {
    "type": "object",
    "required": ["date", "sections"],
    "properties": {
      "date": { "type": "string", "description": "YYYY-MM-DD" },
      "sections": {
        "type": "array",
        "items": { "$ref": "#/$defs/section" }
      },
      "summary": { "type": "string", "description": "今日一句话总结（语音速览用）" },
      "estimatedMinutes": { "type": "number" }
    }
  }
}
// section: { id, type: fund|tech|news|learn|voice, title,
//            items: Item[], aiNote?, source?, updatedAt }
// Item（fund）: { code, name, nav, navDate, chg1d, chg1w, chg1m, chg1y, maxDrawdown, hold?, aiNote, flag?: 'anomaly' }
// Item（news）: { title, source, rank?, heat?, category?, aiNote?, url? }
// Item（learn）: { line: 'pro'|'gen', level?, module?, lessonId?, sections:[{n,title,body,durMin,audioUrl?}] }
```

---

## 4. 面板（用户侧读写）

### 4.1 Tab 结构（沿用 v4）
| Tab | 能力 | 用户写入 | 数据来源 |
|---|---|---|---|
| **今日** | L0/L1 速览：阅读进度 + 基金/技术/时事/学习入口 | 打卡（点"今已读"） | `cap.kv` `news.daily.<date>` |
| **学习** | 专业双线 + 通识双线 骨架、章节、AI 教练问答入口、小测验（本地可交互） | 答对收藏、进度标记 | 日报 learn section（cap.kv）+ `news.progress` |
| **语音** | 播放列表，逐章 `<audio>`（data URL 内联播放） | 收藏/下载 | `news.daily.<date>.voice`（内联 audio） |
| **我的** | **偏好写入区**：方向开关、基金自选池（增删代码）、学习计划（周目标/当前阶段）、语音设置（音色/语速） | 全部 | `cap.kv` `news.prefs`（面板直写） |

### 4.2 面板写入区（v4 "我的"页 → 增强）
1. **关注方向**：创意项目 / 基金投资 / AI 技术 / 时事 / 学习(专业+通识) —— 开关 + 每日目标条数
2. **基金自选池**：增删代码（输入框 + 实时校验"天天基金 6 位代码"）；首启给默认 6 只实测池
3. **学习计划**：专业线当前阶段（L1-L4，默认 L2 并发进阶）+ 每周天数目标（默认 5/7）；通识主题清单勾选
4. **语音设置**：音色（复用 mimo 预置） / 语速 / 是否自动生成（二期）
5. **AI 改动日志**：展示 `news_set_prefs` 最近 N 次改动（`news.prefsLog`）+「撤销」按钮 —— 用户对 AI 写入的掌控

### 4.3 面板组件复用
- **复用 sim-paper-trading 的 model.ts 通信层**：`kvGet/kvSet`（cap.kv）、`tauriInvoke`+`ipcCall` 双通道 —— 全部零服务、零外网。
- **复用 mimo-tts 的 `<audio>` 播放模式**（data URL / URL 均可）。
- 面板样式按 v4 深色手机风（430px 容器），在 host 面板内自适应宽度。

---

## 5. 数据模型与存储

> 存储从「插件目录文件 + HTTP 服务」改为 **cap.kv 键空间（SqliteStorage domain=kv）**，
> 与 sim-paper-trading 同款：面板 `kvSet` 写、MCP `polarisIpc` 写同一份。
> 键前缀 `news.`；MCP 与面板共享，AI 改偏好走 `news_set_prefs`（写 `news.prefs` + append `news.prefsLog`）。

```
cap.kv 键空间（前缀 news.）
├── news.prefs           // 用户偏好（面板直写 + AI news_set_prefs 写）
│      { directions:{fund:{on:true,count:6}, tech:{on:true,count:4}, news:{on:true,count:15}, learn:{on:true}},
│        watchlist:["005844","017811","002910","013835","011369","013840"],
│        learn:{proStage:"L2",genDone:["hist","sci"],daysPerWeek:5},
│        voice:{voice:"白桦",speed:1,autoAudio:false} }
├── news.prefsLog        // AI 改动日志（撤销依据）
│      [ {ts, tool:"news_set_prefs", what:"watchlist+fav", reason:"…", undone:false} ]
├── news.progress        // 用户进度/反馈（面板写，AI 读）
│      { streak:3, lastRead:"2026-10-18", learned:{pro:["l2-3"],gen:["macro-3"]}, favorites:["hn-xyz",...] }
├── news.daily.<date>    // 日报（news_publish_daily 产物，面板读）
├── news.daily.<date>.voice  // 该日语音章节对象（audio data URL/url 列表）
├── news.sources.last    // 各源最近抓取时间/条目 hash（去重）
└── news.reviews.<yyyy-mm>  // 阅读反馈归档（收藏/打卡/测验）
```

- 日报 **保留近 30 天**（面板历史、语音节流去重、用户回看），过期由 AI 调用清理（Simpt 模式：SqliteStorage 本身无自动 TTL，交由 MCP 归档工具）。
- **一致性**：cap.kv 天然事务性（Sqlite 单写者 + 原子写），无半截文件问题；面板与 MCP 永远同一份事实库。

---

## 6. 数据源（AI 内置浏览器抓取，已实测可访问）

> **插件零适配器**：抓取由 AI 直接驱动内置浏览器完成。下表是 AI 的"抓取路线图"（实测可访问），
> 产出经 `news_publish_daily` 写入 cap.kv，面板只读展示。

| 方向 | 源（URL） | 抓取注意 | 产出字段 |
|---|---|---|---|
| 基金 | 天天基金排行、`fundf10.../jjjz_<code>.html` 净值 | 老 API `fundgz` 已下线 ❌，用页面/新接口 | code/name/nav 序列/涨跌 |
| 技术 | Hacker News、GitHub Trending、HuggingFace Trending、36氪科技 | 直接 `browser_navigate` + context | title/score/评论/url |
| 时事 | 头条热榜、微博热搜、百度新闻、澎湃 | 微博直连 403，浏览器可绕（已实测 12 条+热度） | title/rank/heat/category |
| 创意 | Product Hunt Top10、Hugging Face、GitHub | — | name/一句话/评分 |
| 学习 | 无独立源：AI 以当日时事/技术为素材生成"今日课" | — | learn section |

- 面板/服务不直连外网，只读 AI 写入 cap.kv 的日报 → **单点抓取（AI）、多点消费（面板）**。
- 抓取频控：定时任务里 prompt 注明「只抓 3-4 个源、去重、限 30 条内」，控制 token 与耗时。

---

## 7. 数据流（核心闭环时序）

```
[用户对话] "生成今天的日报，基金多放点"
  → AI: news_get_profile（读偏好：基金权重高）
  → AI: 内置浏览器逐个抓源（天天基金/HN/微博/PH 等，按 §6 路线图）
  → AI: 筛选去重（对比 news.sources.last hash）→ 按偏好排序
  → AI: news_publish_daily(date, sections, summary)
  → AI: news_brief(基金章) → mimo_tts_synthesize → inline audio data URL
  → AI: 对话内简报（chatCard 可含音频）
[用户] 打开面板 → kvGet('news.daily.<date>') → 今日 Tab 展示
[用户] 读、点收藏、答测验 → 面板 kvSet('news.progress') / kvSet('news.reviews.<month>')
[AI next day] news_get_profile 读到 favorites/完读率 → 调整权重 → reason 记录进 prefsLog
```

**一致性**：面板与 AI 共享 cap.kv（SqliteStorage）同一份事实库，无 HTTP 中间层、无缓存一致性风险；面板只读不写日报，AI 只写日报不读用户 progress 之外的数据。

---

## 8. 安全与限制

| 项 | 措施 |
|---|---|
| 服务面 | **零插件服务**：无 HTTP 端口、无进程、无路径穿越面（cap.kv 由宿主托管） |
| 连接认证 | MCP 经 IPC bridge token（md5 头）或 `{{polarisToken}}`；面板经宿主 invoke（沙箱内） |
| AI 写权限 | 仅限白名单工具；`news_set_prefs` 强制 `reason`；可撤销 |
| 数据校验 | publish 前 JSON Schema 校验（date/required/section type 枚举） |
| 外网 | 仅 AI 内置浏览器抓取；插件与面板零外网请求 |
| 审计 | `news.prefsLog` + `news.reviews.*` 记录写操作（谁/何时/写什么） |

---

## 9. 收益与排期（推荐实施顺序）

| 阶段 | 内容 | 周期 | 收益 |
|---|---|---|---|
| **P0（初版核心）** | MCP 8 工具 + 面板 4 Tab + 偏好写入（cap.kv）+ 日报落盘（cap.kv）+ 阅读展示 | 2-3 周 | 闭环成立；AI 价值每天可见；粘性起点 |
| **P1（体验放大）** | 学习双线内容接入（AI 生成今日课 + 概念卡 + 测验）、打卡/进度、阅读行为回流 | 1-2 周 | 2h 阅读目标达成；留存提升 |
| **P2（语音）** | 全量语音播报自动生成（分章 TTS + 音频列表 + 后台连播） | 1 周 | 通勤场景 + 内容消耗翻倍 |
| **P3（自动化）** | 定时抓取（`executors` + SchedulerDaemon，仿 fetch-nav）+ 推送（chatCard 主动卡片）+ 历史归档 | 1-2 周 | 免打扰自动日报 → 日活稳定 |

**"收益最大"的取舍**：P0 先砸闭环而非课程库/语音量——闭环是后续所有收益的杠杆；任何增值功能都能挂在同一条偏好→日报→反馈流水线上。

---

## 10. 待用户拍板（进入开发前）

1. ~~抓取触发~~：**已定**——P0 仅 AI 对话手动（定时 P3 executors）
2. ~~面板通道~~：**已定**——零插件服务，全走 cap.kv（simpt 模式实证）
3. **基金池初始值**：默认塞入 005844/017811/002910/013835/011369/013840（实测池）？还是留空由用户加？
4. **学习双线 P0 还是 P1**：P0 只做骨架占位，P1 接内容（推荐）？
5. **AI 写偏好是否需要"撤销"交互**（我建议要有，成本低收益高）？
6. **语音**：P0 只做单章"播报"（推荐）还是直接全量生成？
7. **分享形态**：日报是否需要导出/分享卡片（社交传播）？还是纯本地自用？

---

## 附：与现有插件关系
- **mimo-tts**：`news_brief` 依赖其 MCP 工具（宿主 AI 可同时调用两个插件工具）；音频 data URL 内联展示，无本地服务。
- **sim-paper-trading**：**本方案的主要参考实现**——复用其 model.ts 通信层（kvGet/kvSet/tauriInvoke+ipcCall）、MCP resolveEndpoint 自发现、executors 定时模式。
- **marketplace**：发布渠道（P3 后按 PUBLISHING.md 打包上传）。

---

## 附 B：P0 实施清单（文件级，可直接开工）

> 目录：`plugins/news-curator/`（新建）。**全程零 services 声明、零本地 HTTP 服务。**

### B.1 插件清单
```
plugins/news-curator/
├── plugin.json              # views(panel) + mcpServers + chatCards(二期) + configSchema
├── mcp/
│   ├── server.js            # MCP stdio：8 工具；resolveEndpoint 自发现 + {{polarisPort}} 注入
│   └── ipc.js               # polarisIpc('router_dispatch', …) → cap.kv（从 simpt server.js 抽取）
├── src/
│   ├── model.ts             # kvGet/kvSet/tauriInvoke+ipcCall（从 simpt model.ts 拷贝改造，去 capHttp）
│   ├── Panel.tsx            # 4 Tab：今日/学习/语音/我的
│   ├── Today.tsx            # L0 进度条 + 基金/技术/时事卡片（读 news.daily.<date>）
│   ├── Learn.tsx            # 双线骨架（pro/gen 子 Tab，章节可交互，测验本地判定）
│   ├── Voice.tsx            # 播放列表（data URL `<audio>`）
│   └── Mine.tsx             # 偏好写入 + 基金池增删 + AI 改动日志(撤销)
├── scripts/                 # 二期：fetch-daily.js（executors 定时 → chat 执行器抓取）
└── package.json / tsconfig.json
```

### B.2 plugin.json 关键段
```jsonc
{
  "id": "news-curator",
  "name": "AI 每日刊物",
  "version": "0.1.0",
  "contributes": {
    "views": [{ "id": "news-curator.panel", "area": "activityBar", "panelType": "newsCurator",
                "icon": "BookOpen", "labelKey": "plugins.newsCurator", "labelDefault": "AI 刊物", "order": 68 }],
    "panel": { "entry": "./dist/panel.js", "supportsFullscreen": true },
    "mcpServers": [{
      "id": "news-curator", "transport": "stdio", "command": "node",
      "argsTemplate": ["{{pluginDir}}/mcp/server.js", "{{appConfigDir}}", "{{polarisPort}}", "{{polarisToken}}"]
    }],
    "chatCards": [/* 二期 */]
  },
  "permissions": { "appConfigRead": true, "appConfigWrite": true, "network": true, "aiToolAccess": true }
  // 注意：无 services、无需 workspaceRead/Write（存储走 cap.kv）
}
```

### B.3 实施顺序（每步可验证）
1. **stub MCP server**（server.js + ipc.js + 8 工具空实现）→ 验证宿主识别工具（`tools/list` 出现 news_*）。
2. **cap.kv 读写打通**：`news_get_profile` 读 `news.prefs`（缺省给默认结构）；面板 `Mine.tsx` kvSet 写通 → 互相可见。
3. **AI 手动抓取演练**：对话中 AI 用内置浏览器抓天天基金（排行 + 1 只净值）→ 产出结构样例，验证 publish 的 schema 与写入路径（**无适配器，这是 AI 工作流验证**）。
4. **news_publish_daily**：schema 校验 → 写 `news.daily.<date>`；`news_get_daily` 读回。
5. **面板 Today.tsx**：读 `news.daily.<date>` 渲染 v4 卡片（进度条 + 基金/技术/时事/学习入口）。
6. **Mine.tsx 写入区**：偏好开关 / 基金池增删 / AI 改动日志 + 撤销。
7. **语音 P0**：`news_brief` → 宿主 AI 调 mimo_tts_synthesize → 面板 `<audio>` 内联播放。
8. **学习骨架 P1 占位**：Learn.tsx 双线 Tab + 章节 + 本地测验。
9. 打包发布（P3 后按 PUBLISHING.md）。

### B.4 风险与缓解（P0 即时生效）
| 风险 | 缓解 |
|---|---|
| 内置浏览器抓取依赖宿主 agent 会话（定时任务里 AI 会话需有浏览器权限） | `news_register_schedule` 的 chat 执行器 prompt 中显式声明「使用内置浏览器工具抓取」；宿主导航栏已实测可访问各源；如某会话缺浏览器工具则降级为对话内手动生成 |
| cap.kv 存大 JSON（全量日报）性能 | 日报拆 `news.daily.<date>` 单键（<100KB 单日无压力）；音频不落 kv，data URL 会话级 |
| 面板 Web 模式无法 invoke | 复用 simpt `ipcCall` 回退（POST /api/router-dispatch） |
| 微博等源反爬（浏览器内也可能要求登录） | AI 抓取时容忍降级：抓不到的源跳过并在日报标注「源暂不可用」，不阻断 publish |