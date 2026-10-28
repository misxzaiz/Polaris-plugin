# 盘哨（quote-sentinel）

> 常驻工作台的 **A股 / ETF / 指数行情哨兵**：盘中自选实时行情、到价与涨跌幅提醒、持仓盈亏、当日分时——以及同类工具都没有的：**直接在聊天里用自然语言问行情**。

- 面板（ActivityBar → 📈 盘哨）：指数条 + 自选列表（红涨绿跌可配）+ 分时图 + 提醒管理 + 服务状态
- 后台服务：腾讯主源 → 东财备源 → 缓存兜底的**三级降级**行情轮询 + 提醒评估引擎（**唯一的抓取路径**）
- MCP 工具（10 个 `qs_*`）：在聊天里直接问「今天大盘怎么样」「茅台涨过 1350 提醒我」「我的自选整体如何」

> 行情数据来自公开接口（腾讯财经 / 东方财富），可能有延迟或错误，**仅供个人参考，非投资建议**。本插件无任何交易功能，不上传任何用户数据。

## 为什么它能做浏览器做不了的事（跨域问题的解法）

浏览器同源策略下，插件面板无法直接请求行情接口（不同源 + 无 CORS 头）。盘哨的解法与网页哨兵同构：**外网抓取全部下沉到后台 Node 服务原生 fetch 执行**，面板与 AI 经宿主 `router_dispatch → cap.kv` 读写同一份事实库（`qsent.*` 键空间）。桌面 Tauri 与手机 Web 看到一致状态，面板零外网请求。

## 功能

| 功能 | 说明 |
|---|---|
| 自选行情 | 沪/深/北场内股票、ETF/LOF、指数；盘中默认 20s 轮询（10–300s 可配），盘外自动降频（默认 300s） |
| 三级数据源 | 腾讯 qt.gtimg.cn（GBK 批量）→ 东财 push2（JSON，自动补缺）→ 两源全挂时保留最近缓存并在行情行标注 `cache`，不冒充实时 |
| 搜索添加 | smartbox 名称/代码搜索（「茅台」「510300」皆可）；港股/场外基金命中时明确提示暂不支持 |
| 到价/涨跌幅提醒 | `price_above/below`、`pct_above/below` 四类；每规则每交易日最多触发一次（触发历史保留 100 条）；只评估「行情时间为今天」的数据——节假日不误触 |
| 持仓盈亏 | 设置成本价 + 数量，列表与 AI 概览自动计算浮动盈亏 |
| 当日分时 | 腾讯 ifzq 分钟线，展开详情按需拉取，SVG 手绘（含昨收基线） |
| AI 集成 | 10 个 MCP 工具：概览 / 实时查 / 搜索 / 自选增删查 / 持仓 / 提醒增删改查 |

## 明确不支持（诚实边界）

- **场外基金实时估值**：监管已于 2026-07 彻底下线（fundgz 接口失效），本插件不做；场外基金净值模式为后续候选。
- **港股 / 美股**：腾讯字段布局不同，MVP 未覆盖；搜索命中会明确提示。
- **K 线历史 / 自动交易**：不做，后者永远不做。
- **系统级推送通知**：Polaris 插件平台当前无插件可用的通知 API（已核实 `src/plugin-system` 无此通道）；提醒通过面板未读徽标 + `qs_alert_list` AI 拉取触达。

## 使用

1. 安装后盘哨出现在 ActivityBar；后台服务自动启动（设置 → 插件 → 盘哨 可查看/重启）。
2. 行情页搜索「茅台」或输入 `600519` / `sh000001`（指数需带 sh 前缀消歧：000001 默认是平安银行）加自选。
3. 提醒页（或聊天里让 AI）建规则；触发后「提醒」Tab 出现未读徽标。
4. 聊天里直接问：「我的自选怎么样了」「510300 现在多少」「茅台到 1350 提醒我，备注减仓」。

## 架构与键空间契约（三方权威）

```
面板(React) ─┐
MCP(stdio) ──┼─→ 宿主 router_dispatch → cap.kv (qsent.*) ←─ 后台服务(唯一写状态者)
             └  命令模式: 写 qsent.cmd.* → 服务消费并回写 qsent.<result>.* → 轮询回读
```

| 键 | 写者 | 内容 |
|---|---|---|
| `qsent.settings` | 面板/MCP | `{pollSec, offHoursPollSec, redUp, indexes[]}` |
| `qsent.watch.<id>` | 面板/MCP | 自选定义 `{id(=sh600519), code, market, name, createdAt}` |
| `qsent.state.<id>` | 服务 | 最新行情 `{price, prevClose, open, high, low, chg, pct, volume(手), amount(万), turnover, time(yyyyMMddHHmmss), mktcap, source}` |
| `qsent.minute.<id>` | 服务 | 当日分时 `{ok, date, prevClose, points[{t,p,vol,amt}]}` |
| `qsent.cmd.quote.<n>` / `qsent.quote.<n>` | 面板/MCP → 服务 | 即时查命令/结果 |
| `qsent.cmd.search.<n>` / `qsent.search.<n>` | 面板/MCP → 服务 | 搜索命令/结果 |
| `qsent.cmd.minute.<id>` | 面板/MCP | 分时按需拉取命令 |
| `qsent.alert.<aid>` | 面板/MCP | 提醒规则 `{id, code, type, value, enabled, note, lastFiredDate}` |
| `qsent.alert.feed` | 服务 | 触发历史（cap 100） |
| `qsent.position.<id>` | 面板/MCP | 持仓 `{cost, shares}` |
| `qsent.meta` | 服务 | 心跳 `{version, lastPollAt, lastSource, lastError, watches, alerts, inSession, pollSec, bridge}` |
| `qsent.readAt` | 面板 | 提醒已读水位 |

代码规范化：显式前缀 `sh|sz|bj` 优先；裸 6 位按号段推断（60/68→sh，50/51/56/58→sh 基金，00/30→sz，12/15/16/18→sz 基金，43/83/87/92→bj）。

## 测试

```bash
node --test test/run-tests.mjs   # 21 用例：解析（真实接口字节夹具）/规范化/提醒引擎/端到端（内存 kv + 注入 fetch）
node test/mcp-verify.mjs         # 23 项：mock 桥 + stdio JSON-RPC 全流程（无需 Polaris 运行）
node test/smoke-real.mjs         # 14 项：本机 Polaris 运行中，真实桥 + 真实行情接口 + 真实 MCP，自清理
npm run typecheck && npm run build  # 面板 TS 检查 + esbuild bundle
```

测试夹具为 2026-10-28 收盘后录制的真实接口字节（腾讯 GBK / 东财 JSON / smartbox / 分时），解析断言与原始数值逐字段对齐。

## 已知限制与风险

- 行情接口为公开非官方接口：已用双源降级 + 缓存兜底 + 数据时间显式标注缓解；若腾讯字段布局变更，解析会退化为缺数据而非错数据（解析器对非法行跳过）。
- 北交所在东财备源无映射（secid 未确证），备源场景下北交所标的显示为缺数据，主源正常。
- 节假日不建模：靠「行情时间日期 == 今天」门控 + 盘外降频兜底，节假日轮询为空转（低频、无害）。
- 平台约束：插件服务无环境变量注入（端点自发现）、宿主不收集服务日志（自落盘 `quote-sentinel.log`）、无系统通知 API——均已按 page-sentinel 验证过的模式处理。
