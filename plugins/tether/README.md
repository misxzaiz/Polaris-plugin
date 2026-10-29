# 人情账本（tether）

> 人脉与承诺账本：把「人」变成可对话的资产。

## 它解决什么

todo 管的是对自己的任务，管不了人际间的两样东西：**承诺**（答应别人的、等别人兑现的）和**关系**（多久没联系了、生日快到了、上次聊到哪）。通讯录取号码，CRM 把人当客户。人情账本是私人的：

- **人情账本档案**：关系（家人/伴侣/朋友/同事/客户/导师/同学/其他）、称呼、生日、联系渠道、怎么认识、标签、备注、各自的联系节奏（cadence）。
- **往来流水**：联系（见面/电话/微信/视频/邮件）、便签（喜好/要紧事）、人情往来（我帮了他 / 他帮了我）。
- **双向承诺**：我许的（iowe）/ 我等的（owedme），可带期限；逾期红、临期黄、闭环留痕、可重开。
- **失联预警**：每人按自己节奏算「N 天未联系 vs 节奏 M 天」，超节奏黄榜、超宽限红榜——可解释，不是黑盒分数。
- **生日预告**：未来 N 天（含今天），带年份算年龄。
- **见面简报**：见人前一份上下文包（档案 + 最近往来 + 未闭环承诺 + 人情天平）。

## 对 AI 说什么

12 个 `ren_*` MCP 工具，口语直达：

| 场景 | 说法 | 工具 |
|---|---|---|
| 建档 | 「帮我记一下张总，重要客户，微信 xxx」 | `ren_person_save` |
| 记往来 | 「昨天和张三吃了个饭，聊到孩子上学」 | `ren_log` |
| 立诺 | 「我答应小张周五前给方案」 | `ren_promises add` |
| 查 | 「上周和王总聊了啥」「我帮过他什么」 | `ren_journal` |
| 速览 | 「人情上有什么要办的」 | `ren_overview` |
| 预警 | 「谁好久没联系了」 | `ren_drift` |
| 生日 | 「最近谁过生日」 | `ren_birthdays` |
| 见人 | 「明天见张总，帮我准备一下」 | `ren_prep` |
| 透视 | 「我的人脉面怎么样」 | `ren_stats` |

工作流约定：提人先 `ren_person_list`（找不到再问是否建档）；模糊名命中多人会要求用 personId 澄清；删除档案必须显式 confirm（级联删其承诺与往来）。

## 架构

- **纯本地、零服务、零网络请求**：全部状态在 cap.kv `tether.*` 键空间（人脉是最私人的数据，不出设备）——浏览器跨域面为零，天然符合插件规范的无状态模式。
- **面板零直连 fetch**：宿主 `__POLARIS_HOST_INVOKE__` → `router_dispatch` → `cap.kv`；桌面与手机 Web 看到同一本账。
- **单一计算权威**：`shared/tether-core.js`（归一化/模糊找人/失联分级/生日推算/承诺分期/趋势/简报），面板（esbuild 打包进 bundle）与 MCP server require 同一份，口径不漂移。

### 键空间契约（权威）

| 键 | 写者 | 内容 |
|---|---|---|
| `tether.settings` | 面板/MCP | `{v:1, defaultCadenceDays, driftGraceDays, birthdayDays, dueWarnDays}` |
| `tether.people` | 面板/MCP（单对象原子换写） | `{v:1, order:[id], byId:{id:Person}}`，上限 500 人 |
| `tether.promises` | 面板/MCP（单对象原子换写） | `{v:1, byId:{id:Promise}}`，open≤200、闭环存档≤500 |
| `tether.journal` | 面板/MCP 追加（尽力而为） | `{v:1, events:[…]}`，FIFO cap 2000（保最新） |

### 已知边界（如实交代）

- 生日**仅阳历**（`MM-DD` 或 `YYYY-MM-DD`；平年 02-29 按 03-01 过），农历暂不支持。
- `journal` 为双端追加、读-改-写非加锁：同刻并发可能丢一条事件（与问灶 history 同级边界）；档案/承诺/设置为单对象换写，无 torn write。
- `tether.people.order` 仅作建卡顺序展示；列表排序以置顶 > 姓名拼音为准。

## 本地验证

```bash
npm run build        # esbuild 打包面板 → dist/panel.js
npm run typecheck    # tsc --noEmit
npm test             # node test/run-tests.mjs（core 单测 16 项）
node test/smoke-real.mjs  # 真实桥冒烟 24 项（需本机 Polaris 运行中，跑完自清场）
```
