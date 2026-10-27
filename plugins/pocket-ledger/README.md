# 口袋账本（pocket-ledger）

> 对话式记账：聊天里说「午饭 35」就入账，「上月咖啡花了多少」就能查，「这个月哪个分类超预算了」就有答案。

- 面板（ActivityBar → 📋 口袋账本）：记账 / 明细 / 统计 / 设置 四 Tab
- AI 工具（MCP 5 个 `ledger_*`）：AI 从对话提取金额/分类/备注直接入账与查账
- **纯本地**：数据只在 cap.kv（`ledger.*`），零后台服务、零网络请求、不出设备

## 设计取舍（与 page-sentinel 互补）

page-sentinel 是"重服务"插件（抓取必须下沉后台）；口袋账本是插件规范推荐的**零进程无状态**模式的样板——所有计算在 `shared/ledger-core.js`（面板与 MCP 共用的单一权威），宿主 cap.kv 承担全部存储。

## 数据契约（cap.kv `ledger.*` 键空间）

| 键 | 写者 | 内容 |
|---|---|---|
| `ledger.day.<YYYY-MM-DD>` | 面板 / MCP | Bill[]：`{id, ts, type:'expense'\|'income', amount(>0), category, note, source}`。日期按设备本地时区归属 |
| `ledger.settings` | 面板 / MCP | `{categories, incomeCategories, budgets: {分类: 月预算}, monthlyTotalBudget, currencySymbol}` |

**写入协议**：追加 = 读日键 → 按 id 去重合并 → 写回。因此写重试幂等；桌面+手机同时记账的合并也按 id 去重（理论丢失窗口仅为"两端同一毫秒各记一笔"，已文档化）。全部计算（统计/预算/CSV）在 `shared/ledger-core.js`，面板与 AI 口径永远一致。

## 使用

### 面板
- **记账**：金额大输入框 → 支出/收入 → 分类 chips → 备注 → 今天/昨天/选日期（补记）；下方今日列表即时小计可删。
- **明细**：按月翻页、按日分组净额、分类/类型筛选、逐笔删除、CSV 导出（复制到剪贴板）。
- **统计**：支出/收入/结余卡、总预算进度条、分类排行（每类预算使用率）、逐日柱状图。
- **设置**：自定义分类增删、分类月预算、月度总预算、导出全部 JSON、清空账本。

### 让 AI 代劳（聊天示例）
- 「午饭 35 块，还有杯咖啡 22」→ AI 调 `ledger_add` ×2（自动选分类「餐饮」）
- 「昨天打车花了 48 补记一下」→ `ledger_add {date:'yesterday'}`
- 「上个月咖啡花了多少？」→ `ledger_query {month:'last', keyword:'咖啡'}`
- 「这个月花得怎么样？」→ `ledger_stats`
- 「刚才记错了，删掉」→ AI 从 `ledger_query` 拿 id 后 `ledger_delete`
- 「加一个『宠物』分类」→ `ledger_categories {action:'add'}`

MCP 工具：`ledger_add` / `ledger_query` / `ledger_stats` / `ledger_delete` / `ledger_categories`。
入账响应会自动带上**预算提醒**（总预算 ≥90% 提醒、超支警告）。

### 预算
在设置里给分类设月预算（如 餐饮 2000）+ 月度总预算；统计页显示进度条（>90% 黄、超支红）；AI 入账时即时收到同样口径的提醒。

## 运行与排查

- 无服务、无端口；插件启用即用（首次打开面板/调用 AI 工具时自动建默认分类）。
- 端点自发现与鉴权：同 page-sentinel（env → anchor.json → config.json → 端口扫描，Bearer md5）。
- 测试：`node --test test/run-tests.mjs`（core 计算/去重/统计/CSV）；`node test/mcp-verify.mjs`（MCP stdio 全流程）。

## 已知边界

- 双端**同一毫秒**并发记两笔理论上可能丢一笔（cap.kv 无原子 append；同 id 幂等去重已覆盖重试场景）。日常使用影响可忽略。
- 日期按设备本地时区归属；跨时区使用时"昨天"以当前设备为准。
- 金额精度 2 位小数，上限 1e9（防误输入）。

## License

MIT
