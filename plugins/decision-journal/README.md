# 谋定（decision-journal）· 决策日记

> 谋定而后动，知止而有得。

把「决定」本身变成可复盘、可校准的资产：

- **立此存照**：决定做出来的那一刻，记下背景、选项、所选项，以及一条**可检验的预期**（「X 在 N 天内发生」）+ **真实把握**（0-100%）。
- **到期复盘**：到期清单提醒，对照预期打分——兑现(1) / 部分兑现(0.5) / 落空(0) / 作废（不计分），沉淀「意外」与「教训」。
- **判断力校准**：把握分 4 桶，每桶实际命中率 vs 自称把握画成曲线（对角线=完美校准）；Brier 分数（0 完美 / 0.25 瞎猜）量化直觉靠不靠谱；bias 告诉你系统性过度自信还是保守。
- **经验卡**：复盘写下的教训沉淀成卡，AI 做新决定时可引用（`decision_stats` 返回最近教训）。

## 入口

- **面板**：ActivityBar「谋定」——总览（到期清单+速览）/ 决策（列表/详情/新建/复盘）/ 校准（曲线+经验卡）/ 设置。
- **AI（MCP，9 工具）**：`decision_create` / `decision_settle` / `decision_resolve` / `decision_list` / `decision_get` / `decision_update` / `decision_shelve` / `decision_stats` / `decision_delete`。

对话示例：

- 「帮我立此存照：迁移方案我选 B，预期三个月内完成且零数据丢失，把握八成」
- 「有什么决定快到期该复盘了？」（→ `decision_list {status:'due'}`）
- 「复盘一下上周那个缓存决定」
- 「我最近的判断准不准？」（→ `decision_stats`）

方法论内嵌在工具描述里：AI 会在你立照时逼出**可检验的预期**（拒绝「会更好」式空话），并把模糊表述（「挺有把握」）追问成数字。

## 数据契约（cap.kv `decision.*` 键空间）

| 键 | 写者 | 内容 |
|---|---|---|
| `decision.settings` | 面板/MCP 写 | `{ schemaVersion: 1, reviewDefaultDays: 90 }` |
| `decision.d.<id>` | 面板/MCP 写（按 id 幂等） | Decision 完整对象（schema 见 `shared/decision-core.js` 头注释） |

Decision（v1）关键字段：

- `status`: `open`（纠结中：只记问题与选项）→ `decided`（已定案：chosen + 可检验预期 + 把握 + 复盘期限）→ `resolved`（已复盘：outcome/score/note/surprise/lesson）；旁路 `shelved`（搁置，不计分校准）。
- `expected`: `{ text, confidence }` —— **decided 态必填**（接口即方法论约束，缺了报错）。
- `resolution.outcome`: `hit`/`partial`/`miss`/`void`，score 映射 1/0.5/0/null；void 只计数不计分。
- `reviewAt`: epoch；`null` = 不定期。到期判定 `reviewAt <= now`（含边界）。

## 架构

零服务型插件（同口袋账本范式）：

- **计算权威**：`shared/decision-core.js`（归一化/状态机守卫/到期判定/校准数学），面板与 MCP 只做 IO，口径不漂移。
- **数据面**：一切状态走 cap.kv，跨端同一份台账；面板零直连 fetch（宿主 invoke → router_dispatch），**无 CORS 面、零外网请求**。
- **AI 面**：宿主 AI 经 stdio MCP 读写（自发现：anchor.json → config.json → 端口扫描，md5 Bearer）。

校准数学：Brier = mean((score − p)²)，p = confidence/100；分桶 [0,50) [50,70) [70,85) [85,100]；bias = 命中率 − 平均把握（≤ −0.1 提示过度自信，≥ 0.1 提示保守；样本 <5 提示不足）。

## 测试

```bash
node --test test/run-tests.mjs   # 核心逻辑单测（无需宿主）
node test/mcp-verify.mjs         # MCP 握手/工具清单/全链路（mock kv，无需宿主）
node test/smoke-real.mjs         # 真实桥冒烟（需本机 Polaris 运行中，跑完自清理）
```
