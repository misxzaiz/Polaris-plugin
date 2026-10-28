# 问津 wenjin —— 求职投递与面试作战台账

> 使子路问津（《论语·微子》）。津者，渡口也；求职就是找渡口——「无人问津」的反面，是每一份投递都有账可查。

把「投了哪些公司、谁有回音、简历哪个版本有效、offer 怎么比」变成**可对话、会提醒跟进**的求职作战台账。纯本地存储（cap.kv）数据不出设备，面板与 AI 共用同一计算核心（`shared/core.js`），桌面与手机 Web 看到同一本账。

## 它解决什么问题

- **海投失序**：投递一多，公司/岗位/JD/简历版本/面试进度全混在一起，表格忘记更新、难以复盘（知乎/牛客/r/jobsearch 长期高频吐槽）。
- **已读不回无解**：跟进全凭脑子，「投了多久没信」从没被量化过——问津按「N 天无进展」自动点名。
- **简历版本黑箱**：改了简历到底有没有用？渠道漏斗 × 简历版本漏斗给出回复率归因。
- **offer 比较草率**：月薪×月数×年终奖×通勤的结构化年化对比，期权只记文本不计价（不假装精确）。
- **云端隐私顾虑**：在职找工作把投递记录放到别人服务器上是真实风险。问津全部数据在本机，零账号、零外网请求。

## 组成

| 部分 | 说明 |
|---|---|
| 面板（四 Tab） | **今日**：状态分布 / 跟进到期（就地记跟进）/ 近期日程与提醒 / 渠道一句话 / offer 概况；**投递**：过滤列表 + 展开详情（时间线 / 记进展 / 改状态 / 录 offer / JD 存档 / 级联删除）；**洞察**：渠道漏斗 / 简历版本漏斗 / 复盘问题库 / offer 对比；**设置**：简历版本库 / 参数 / CSV 导出导入 / JSON 备份还原 |
| MCP（7 工具） | `wenjin_today` / `wenjin_add_app` / `wenjin_log_event` / `wenjin_add_offer` / `wenjin_query` / `wenjin_update` / `wenjin_delete`——对话式记账：「投了字节的前端岗」「二面过了」「投了 60 份有多少回音」 |
| 后台服务 | **无**（零服务零外联）。跟进与日程是打开面板/调用 today 时的投影，没有推送通道就不需要常驻进程（同 changqi/guanzhi 范式） |

## 数据与口径

- 键空间 `wenjin.*`（一条一键，id = sha256 种子派生，按名 find-or-create 幂等）：`company.<id>` / `app.<id>` / `resume.<id>` / `event.<id>` / `offer.<id>` / `settings` / `meta`。
- **状态机**：`wish 想投 → applied 已投 → screening 沟通中 → written 笔试 → interview 面试中 → offered 已有 offer → accepted 已接受`；终态 `rejected 被拒 / withdrawn 主动放弃`。事件联动推进（offer 事件→offered；result:fail→rejected），面板可手改。**「无回音」不是状态**——由跟进检测派生，避免双写语义。
- **跟进到期**：状态 ∈ {已投, 沟通中, 笔试} 且最后事件距今 ≥ followUpDays（默认 5，含恰好第 N 天）；无事件回退 appliedAt/createdAt。
- **漏斗**：submitted → responded → interviewed → offered 逐级转化；被拒也算「有回音」；样本 <5 只出计数不出百分比（样本会撒谎，问津选择诚实）。
- **offer 年化**：`baseMonthly × (months + bonusMonths)`；年通勤 = 单程分钟 × 2 × 250 ÷ 60；期权/股票只记文本。
- **CSV 导入**：按 公司+职位 判重跳过；未知渠道→其他、未知状态→已投并在结果中明示（不静默吞）。「最新进展」列转 note 事件，不伪造回复率。

## 安全边界

只做记录、派生与提醒：**不抓取招聘平台、不自动投递、不承诺「ATS 通过率」**。跟进提醒与 offer 对比基于你自己的记录，不构成职业建议。

## 开发与验证

```bash
npm install          # 面板依赖（esbuild/react/typescript）
npm run typecheck    # tsc --noEmit strict
npm run build        # esbuild → dist/panel.js
node test/run-tests.mjs    # 离线单测 38 组（normalize/跟进/漏斗/offer/CSV）
node test/mcp-verify.mjs   # 内存桥 + stdio MCP 全流程（10 组）
node test/smoke-real.mjs   # 真实宿主冒烟（需 Polaris 运行中；快照式清理）
node test/harness-serve.mjs 9833  # 面板 harness（test/harness.html）
```

发布：仓库根 `node scripts/publish-plugin.mjs wenjin [--push]`（打 zip + 更新 index.json 的 version/sha256/downloadUrl）。

## 已知限制

- 提醒只在面板打开（或 AI 调 `wenjin_today`）时可见——平台无系统通知推送通道。
- 简历版本归因依赖投递时标注 `resumeId`，未标注的进 `(未标注)` 桶。
- offer 的期权/股权不计价；年通勤按 250 个工作日静态估算。
