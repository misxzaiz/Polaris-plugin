# 守闸 shouzha —— 订阅与续费管家

> 把散落在支付宝/微信/Apple/各 App 里的自动续费与会员订阅，变成一本可对话的**未来支出承诺账**。
> 口袋账本记「过去花掉的」，守闸盯「未来要扣的」——守住每一笔沉默扣费的闸门。

## 为什么需要它

- 自动续费扣费普遍到需要立法：《消费者权益保护法实施条例》（2024-07-01 施行）第十条要求经营者在自动续费日前以显著方式提醒消费者；央视报道过用户忘关自动续费被扣数千元、自查多出 15 个扣费项目的案例。
- 扣费入口分散：微信「钱包→支付设置→自动续费」、支付宝「设置→支付设置→免密支付/自动扣款」各自为政，只能逐个看、逐个关，无金额核算、无跨平台聚合、无历史沉淀。
- 守闸用四个机制盯住四个沉默扣费通道：

| 沉默扣费通道 | 守闸机制 |
|---|---|
| 免费试用转正忘关 | **试用红榜**：`trialEndsAt` 到期前红榜提醒 |
| 自动续费沉默扣款 | **对账闭环**：扣费日过境未确认 = 逾期待对账红榜，**不静默滚周期** |
| 涨价无感 | **价格史**：每次对账记实付金额，现价 ≠ 开通价自动浮出 |
| 僵尸订阅 | **年化排行 + 止损统计**：谁最贵一目了然；取消后「年化已省」正反馈 |

## 能力

- **AI 对话式**（8 个 MCP 工具 `sub_*`）：聊天里说「我订了 xx 年费 248」即登记、「下个月要扣多少」「视频会员一共花多少」「把 xx 取消掉」即操作。
- **面板四 Tab**：总览（三榜 + 成本速览 + 未来 12 个月现金流柱状）/ 订阅（全量列表 + 登记/编辑/对账/暂停/取消/恢复/删除）/ 透视（分类占比、年化排行、涨价监控、已取消止损、月度扣费分布）/ 设置（币种、提醒窗口、CSV 导入导出、清空）。
- **周期引擎**：月/年/季/周/自定义天数；月末钳制（1/31→2/28、闰年 2/29→平年 2/28）；月均/年化归一（周=52 期/年，自定义=365/n 天）。
- **提醒触达**：打开面板时的横幅 + 提示音（新增逾期/试用转正才响，首载不响）+ AI 随时可问的到期三榜。宿主暂无系统推送通道（与日晷一致）。

## 数据与隐私

- 纯本地：`cap.kv` `shouzha.*` 键空间，零后台服务、零外网请求、零跨域面。桌面与手机 Web 看到同一本账（同一事实库）。
- 不存任何支付凭据/密码；备注字段注明勿存敏感信息；管理链接仅接受 http(s)。
- 删除两段式：取消可逆（可恢复，计入止损统计）→ 彻底删除需二次确认。
- 数据导出：CSV（含引号转义与 BOM，Excel 直接打开不乱码）；导入按「名称+周期+金额+扣费日」去重。

## 键空间契约（cap.kv `shouzha.*`）

```
shouzha.sub.<id>  → Subscription（一订阅一键，低频写，读改写幂等）
shouzha.settings  → Settings { schemaVersion, currencySymbol, defaultRemindDays }
```

Subscription 字段（camelCase）：`id, name, category, vendor?, plan?, amount, cycle('month'|'year'|'quarter'|'week'|'custom'), customDays?, nextRenewalDate('YYYY-MM-DD'，权威下次扣费日), autoRenew, status('active'|'trial'|'paused'|'cancelled'), trialEndsAt?, paymentMethod?, manageUrl?, note?, remindDaysBefore, priceHistory[{date,amount}], events[{ts,kind,note?}], cancelledAt?, cancelReason?, createdAt, updatedAt`。

对账状态机（`renewState`，唯一定义在 `shared/core.js`）：
`overdue`（active 且扣费日已过境）→ 人工对账：`renew` 确认续费（推进一周期，实付≠现价记价格史）或 `skip` 转 cancelled；`dueSoon`（提醒窗口内）；`trialUrgent`/`trial`（试用转正红榜/观望）；暂停与取消不进榜单。

## 与其他插件/宿主能力的边界

- **口袋账本**：过去支出流水 vs 未来周期承诺——互补不重叠；守闸的现金流是「将扣」口径，不是账单记录。
- **日晷**：时间提醒无金钱语义；守闸的扣费日推进/价格史/年化/对账是日晷表达不了的。
- **宿主快捷片段**：无关。

## 架构

```
shouzha/
├── plugin.json          # manifest（ActivityBar 面板 + MCP stdio）
├── shared/core.js       # 单一权威：周期引擎/对账状态机/透视/CSV（MCP 与面板共用，口径不漂移）
├── shared/core.d.ts     # 面板严格类型
├── mcp/server.js        # 8 个 sub_* 工具（零依赖，自发现 anchor→config→端口扫描）
├── src/                 # 面板源码（React + esbuild → dist/panel.js）
└── test/
    ├── run-tests.mjs    # core 逻辑单测（node --test）
    ├── mcp-verify.mjs   # MCP 协议离线验证（无需宿主）
    └── smoke-real.mjs   # 真实桥端到端冒烟（快照→全链路→自清理）
```

## 开发与验证

```bash
cd plugins/shouzha
npm install
npm run build        # esbuild 打包面板 → dist/panel.js
npm run typecheck    # tsc --noEmit
node --test test/run-tests.mjs      # 核心逻辑单测
node test/mcp-verify.mjs            # MCP 协议离线验证
node test/smoke-real.mjs            # 真实桥冒烟（需本机 Polaris 运行中）
node ../../scripts/pack.js plugins/shouzha   # 打 zip
```

## 已知边界

- 无银行/支付平台对接（也不应有：凭据安全边界在插件沙箱之外）；登记是对话式/表单式手动+AI，首次登记成本约 10 秒/条。
- 提醒为应用内触达（面板横幅+提示音+AI 可见），依赖用户打开 Polaris；无系统级推送。
- 多币种仅符号显示，不做汇率换算（同账本内假设单币种口径）。
- `sub_renew` 对逾期单只推进一期（不静默滚多期）——多期逾期的订阅会持续留在红榜直到逐期对账或手工修正扣费日，这是设计而非缺陷。
