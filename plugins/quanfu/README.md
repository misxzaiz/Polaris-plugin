# 泉府 quanfu —— 贷款全生命周期台账

> 《周礼·地官》泉府掌市之征布与赊贷——泉者钱也，古之官办借贷机构；今之家庭负债台账。
>
> 把家庭「最大的一笔负债」变成可对话、可对账、会主动提醒的活资产：月供怎么构成、还剩多少本金、提前还一笔缩期还是减月供省、下次重定价日何时到。

## 是什么

- **对话式建档与记账**：聊天里说「我有一笔 100 万 30 年等额本息 3.6% 的房贷，2021 年 3 月开始还」→ 一句话建档；「这个月重定价了 3.3%」「提前还了 15 万选的缩期」「银行说我剩 65 万」→ 一句话记事件，账本自动重放。
- **提前还款三方案对比**：「提前还 20 万，缩期还是减月供？」→ 基准 / 缩期 / 减月供并列（剩余总利息、省息、月供变化、期限变化、新结清日）——基于**已建档的真实贷款**（含已记利率变更/提前还款流水）计算，不是无状态计算器。面板「测算」Tab 同引擎可交互。
- **对账**：把银行 App 显示的剩余本金记成对账点，账面 vs 银行的漂移一目了然；漂移超阈值会提示「可能漏记了利率变更/提前还款」。
- **临近提醒**：扣款日临近、重定价日倒数（2024-11 新政的 3/6/12 个月周期与 1/1 或放款对日都支持）、对账漂移，面板横幅 + AI 今日可见。
- **组合贷归组**：公积金 + 商贷两笔同 `groupId`，面板与合计同组呈现。
- **三种还款方式**：等额本息（annuity）/ 等额本金（linear）/ 先息后本（bullet，提前还款只减息不缩期，如实标注）。

## 安全与边界（硬约束）

- **纯本地零外网**：无后台服务进程；唯一网络行为是与本机 Polaris 桥（自发现 127.0.0.1）同步 cap.kv。数据不出设备，零账号。
- **只做记录与测算，不构成金融建议**：全部输出带口径声明；不算违约金（各行合同不同，请在贷款备注登记）；不抓取 LPR（利率一律以你的合同为准手工记录）；不做理财/银行推荐。
- **删除有确认门**：删贷款需显式 confirm 并连带清理其事件；单条事件可独立删除（误记纠正）。

## 引擎口径（与代码一致，测试守护）

- 逐期分级（2dp）舍入、末期本金补差——与银行逐期计息口径对齐，但与具体银行仍可能有分级出入。
- `startDate` = 第一期还款日；rate 事件 date = 新利率生效的第一期还款日（早于首期的事件在第一期生效）；prepay date = 生效基准日，实际在 date ≥ 该日的第一个扣款日生效（额外支出，不并入当期月供）。
- 缩期（term）= 保持月供解新期数（末期补差）；减月供（payment）= 保持期数重推月供；每次提前还款的 mode 即此后该贷款的调整模式。缩期月供不足以覆盖利息时回落减供（升息场景）。
- 全额结清不支持走提前还款（金额达到余额会被拒绝）——请在贷款详情「停用（结清/转出）」并备注。

## MCP 工具（7 个）

| 工具 | 用途 |
|---|---|
| `quanfu_today` | 全家贷款现状 + 临近事件（扣款/重定价/对账漂移）+ 家庭合计 |
| `quanfu_add` | 建贷款（金额支持 `principalWan` 万，防 AI 换算错） |
| `quanfu_whatif` | 提前还款三方案对比（不落库） |
| `quanfu_log` | 记事件：rate / prepay（mode 必填）/ checkpoint |
| `quanfu_query` | scope=loans / detail / events / schedule / yearly |
| `quanfu_update` | 改参数（初始参数改动=整表如实重放，历史利率调整请用 log rate） |
| `quanfu_delete` | 删贷款（confirm，连带事件）/ 删单条事件 |

## 键空间契约（cap.kv `quanfu.*`）

| 键 | 写者 | 内容 |
|---|---|---|
| `quanfu.loan.<id>` | 面板/MCP | 贷款实体 `{id,name,lender,kind,method,principal,annualRate,startDate,termMonths,repricing,groupId,note,active,createdAt}` |
| `quanfu.ev.<occKey>` | 面板/MCP | 事件 `{occKey,type:'rate'\|'prepay'\|'checkpoint',loanId,date,rate?,amount?,mode?,note,at}`；occKey=`type\|loanId\|date`（同日同型覆盖=幂等） |
| `quanfu.settings` | 面板 | `{warnDays,repricingWarnDays,driftWarn}` |

无服务进程、无快照键：还款表/状态/三方案由面板与 MCP 各自经 `shared/core.js` 现算（两方同源同口径）。

## 验证（四层，全部真实执行）

```
node test/run-tests.mjs    # 离线单测 39 项：金标准手算例/守恒/分段重放/whatif/重定价/对账
node test/mcp-verify.mjs   # 内存桥 stdio 全流程 40 项（无需宿主运行）
node test/harness-run.mjs  # jsdom 无头渲染 29 项（四 Tab/测算三方案/记事件写库）
node test/smoke-real.mjs   # 真实宿主桥 17 项（Polaris 运行时；快照式清理）
```

## 开发

```
npm install && npm run typecheck && npm run build   # tsc strict + esbuild → dist/panel.js
```
