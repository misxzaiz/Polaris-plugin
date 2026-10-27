# 记忆熔炉 memoryforge

> 把读过的、聊过的、学过的，炼成记得住的。
> AI 对话式制卡 + SM-2 间隔重复复习 + 跨端同步的本地记忆卡库。

## 这是什么

大部分知识学过就忘——不是没学会，是从来没有「在快忘的时候被再考一次」。记忆熔炉把「记住」变成一个每天两分钟的闭环：

1. **制卡**：把任何内容丢给 AI——聊天里刚讨论完的 OAuth 流程、一篇文档 URL、一段单词表——AI 提炼成「一卡一原子知识点」的问答卡（`memoryforge_import_cards`）。
2. **复习**：面板「复习」页每天给出当日队列（到期卡在前、新卡在后，受每日限额约束）。看正面 → 回忆 → 翻面 → 按回忆质量评分（重来/困难/良好/轻松）。
3. **排期**：SM-2 算法自动安排下一张的出现时间——「重来」10 分钟后回队，答得越稳间隔拉得越长（×ease），不稳定的卡会一直回来找你。
4. **见证**：7 天到期预报、30 天留存率、连击天数、分牌组进度——努力看得见。

## 快速上手

### 在聊天里（AI 侧，MCP 工具）

| 你说 | AI 做 |
|---|---|
| 「把这段做成卡片，放进『Rust 所有权』牌组」 | 提炼问答卡 → `memoryforge_import_cards` |
| 「https://xxx 这篇文章提炼 15 张卡」 | `memoryforge_extract_url` 抓正文（原生 fetch，无跨域问题）→ 制卡入库 |
| 「今天该复习什么？」 | `memoryforge_list_due` 出题，你作答后逐张 `memoryforge_grade_card` |
| 「我有哪些 HTTP 状态码的卡？」 | `memoryforge_search_cards` |
| 「我学得怎么样？」 | `memoryforge_stats`（到期/留存/连击/预报） |

制卡原则（AI 会遵守，你也可以提醒它）：**一卡一原子知识点；front 是能独立成立的问题，back 是精炼答案；问答题优先于是否题。**

### 在面板（复习侧）

- **复习**：当日队列逐卡过。快捷键：空格/回车翻面（再按=良好），1-4 评分。按钮上会预显示「选这个评分 → 下次间隔」。
- **卡库**：搜索/牌组/标签/状态过滤，逐卡编辑、暂停（不进队列）、删除；也可手动＋新卡。
- **统计**：总览、7 天预报、30 天活动热区、牌组进度。
- **设置**：每日新卡/复习限额、牌组管理、JSON/CSV 导出（剪贴板）、JSON 导入、清空。

## 跨端与跨域设计（为什么它能工作）

- **面板零外网请求**：浏览器面板受同源策略限制，任何直接抓外部网页的想法都会被 CORS 挡死。本插件的 URL 抓取全部下沉到 MCP 进程（node 原生 `fetch`，无同源概念），并提供内网地址（SSRF）防护——面板从头到尾只和宿主 `router_dispatch` 说话。
- **跨端同一副牌**：全部状态存 cap.kv（`memoryforge.*` 键空间，全局共享 domain），桌面 Tauri 与手机 Web 经同一通道读写；cap.kv 对 Remote 源放行，**手机上可以直接复习**。
- **双端幂等**：「今日已复习/已学新卡/留存率」全部从 `card.history` 派生（滚动窗口 200 条），不设独立计数器——两端并发评分不会算重或算丢；唯一落 `meta` 的状态是连击（同日幂等）。
- **单一计算权威**：SM-2 调度、队列限额、统计全部在 `shared/srs-core.js`（零依赖纯函数），面板（esbuild 打包）与 MCP（CJS require）共用同一份，口径永不漂移（同 pocket-ledger 的 ledger-core 模式）。

## 调度规则（简化 SM-2 + Anki 学习步）

| 评分 | 学习/新卡 | 复习卡 |
|---|---|---|
| 重来 | 进学习步 0（10 分钟后回队） | 记 lapse、ease−0.20、回学习步 |
| 困难 | 重复当前步 | 间隔 ×1.2、ease−0.15 |
| 良好 | 前进一步（步尽毕业，间隔 1 天） | 间隔 ×ease |
| 轻松 | 直接毕业（4 天）、ease+0.15 | 间隔 ×ease×1.3、ease+0.15 |

学习步 `[10 分钟, 1 天]`；间隔上限 365 天；ease 下限 1.3。所有间隔内部统一以**分钟**存储（`intervalMin`），杜绝双单位换算错。

## 数据契约（cap.kv `memoryforge.*`）

| 键 | 值 | 说明 |
|---|---|---|
| `memoryforge.settings` | `{ schemaVersion, dailyNewLimit, dailyReviewLimit }` | 每日限额（0=复习不限/新卡停发） |
| `memoryforge.deck.<id>` | `{ id, name, createdAt }` | 牌组；默认牌组 id 固定 `default` |
| `memoryforge.card.<id>` | Card | front/back/tags/status/ease/intervalMin/due/reps/lapses/createdAt/history[] |
| `memoryforge.meta` | `{ streak: { count, lastDay, best } }` | 唯一的派生外状态（连击） |

Card.status：`new`（未学，按每日新卡限额进队）→ `learning`（学习步中）→ `review`（毕业，按 due 出现）；`suspended` 不进队列（恢复后按新卡重新计）。`history` 为 `{t: 评分时间, g: 评分, iv: 当时间隔}` 滚动窗口（200 条），是今日计数与留存率的唯一数据源。

规模说明：卡片读取按「kv list 全键 → 前缀过滤 → 并行 get」，数百张卡内体验流畅；若未来上万张，应给 cap.kv 加前缀查询（平台侧能力，非本插件可解）。

## 开发

```bash
cd plugins/memoryforge
npm install              # esbuild + typescript + @types/react
npm run build            # 面板 → dist/panel.js（esbuild，react external 由宿主提供）
npm run typecheck        # tsc --noEmit
npm test                 # srs-core 离线单元测试（无需 Polaris 在跑）
node test/smoke-real.mjs # 真实环境全链路冒烟（需本机 Polaris 在跑；跑完自清理 memoryforge.* 测试键）
```

## 隐私

卡片内容、调度状态、统计全部只存本机（cap.kv / 数据根），不出设备。唯一的网络行为是「你主动让 AI 抓某个 URL」时 MCP 进程对该地址的一次原生请求。
