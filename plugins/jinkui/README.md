# 金匮（jinkui）—— 家庭保单与保障台账

> 匮者，柜也；《史记》「藏诸金匮石室」。保单正是一个家庭最该锁进金柜的纸。
>
> 把散落在各保司 App、邮箱附件、抽屉纸质单里的家庭保单，收进一个**可对话、会主动提醒、数据不出本机**的家庭保险柜。

## 是什么

- **对话式入柜**：聊天里说「给娃买了份 50 万的重疾，平安的，年缴 4000 缴 20 年，2023 年 5 月生效」→ 自动建成员档案 + 保单入柜（未知成员名自动建档）。
- **缴费红黄榜**：🟡 warnDays 内应缴/满期；🔴 宽限期（长期险逾期 60 天内，**保障仍有效**，尽快补缴）与中止期（其后 2 年内，**出险不赔**、可申请复效）。
- **法定口径状态机**：等待期 → 有效 → 宽限期 → 中止期 → 效力终止；一年期短险到期即满期、无宽限期（如实区分）。
- **四大件缺口矩阵**：成员 × 医疗/重疾/寿险/意外 的覆盖计数与保额合计，缺格高亮——确定性现状透视，不推荐任何产品。
- **12 个月保费现金流**：逐月应缴分桶 + 年合计（趸交不计入年缴口径）。
- **流水随记**：缴费确认推进台账、理赔/批改/退保/复效留痕；误记可删、进度自动重推。
- **家庭三端同读**：桌面 / 手机 / Web 打开同一面板看到同一本账。

## 明确不做（边界）

- **不做产品推荐、保费对比、理赔代办**——输出一律带「不构成投保建议」。
- **不解析、不上传保单文件**——「电子保单位置」只登记路径描述（如「邮箱 xx」「保司App-我的保单」）。
- **不对接任何保司接口**——零外网请求，纯本地 cap.kv。
- 车辆保险（交强险/商业险）归 **车辖（chexia）** 管；贷款归 **泉府（quanfu）**；订阅续费归 **常契/守闸**。

## MCP 工具（6 个，AI 对话式）

| 工具 | 语义 |
|---|---|
| `jinkui_today` | 缴费红黄榜 + 等待期 + 满期 + 家庭合计 + 缺口速览 |
| `jinkui_add` | entity=member 建成员 / entity=policy 建保单（insured 传成员名自动配档） |
| `jinkui_log` | 记事件：pay（缴费）/ claim（理赔）/ endorse（批改）/ reinstate（复效，仅宽限/中止期）/ surrender（退保）/ other |
| `jinkui_query` | scope=policies｜detail｜events｜calendar（未来 N 天）｜gap（缺口矩阵）｜stats（合计+现金流） |
| `jinkui_update` | 改保单/成员（产品名与被保人为判重锚点不可改） |
| `jinkui_delete` | 删保单（confirm 门，连带流水）/ 删成员（名下有保单拒删）/ 删单条流水 |

## 键空间契约（权威）

| 键 | 写者 | 读者 | 说明 |
|---|---|---|---|
| `jinkui.member.<id>` | 面板/MCP | 面板/MCP | 成员 `{id,name,relation,birthYear?,note,createdAt}`；id=`sha256("member\|名字")[:12]` |
| `jinkui.policy.<id>` | 面板/MCP | 面板/MCP | 保单 `{id,name,kind,insuredId,holderId?,company?,policyNo?,coverage?,coverageNote?,premium?,freq,payYears?,startDate,endDate?,waitingDays?,fileNote?,note?,endedAt?,endReason?,createdAt}`；id=`sha256("policy\|被保人\|险种\|公司\|产品名")[:12]` |
| `jinkui.ev.<occKey>` | 面板/MCP | 面板/MCP | 事件 `{occKey:"type\|policyId\|date",type:'pay'\|'claim'\|'endorse'\|'reinstate'\|'surrender'\|'other',policyId,date,amount?,note,at}`；同日同型幂等覆盖 |
| `jinkui.settings` | 面板 | 面板/MCP | `{graceDays:60,warnDays:30}`（非法值回落缺省） |

纯 kv 零服务：无后台进程、无快照键，全部派生量（缴费进度/状态/矩阵/现金流）由 `shared/core.js` 两方（面板 + MCP）同源现算。

## 数据与隐私

- 纯本地：cap.kv 单事实库，零网络权限、零账号、零上传。
- 枚举字段全部服务端白名单校验；金额/日期越界中文报错。
- 删除需两击确认（面板）/ `confirm=true`（MCP）；删成员前校验名下保单。

## 开发

```bash
npm install
npm run typecheck        # tsc strict
npm run build            # esbuild → dist/panel.js（React external）
node test/run-tests.mjs  # 离线单测 33 组（日期/规范化/状态机/投影）
node test/mcp-verify.mjs # 内存桥 + spawn 真实 MCP 全流程 57 项
node test/harness-run.mjs# jsdom 无头渲染四 Tab 26 项
node test/smoke-real.mjs # 真宿主冒烟（需 Polaris 运行中；快照式清场）
```

## 语义锚（与 core.js/工具描述一致）

- `policy.startDate` = 首期缴费日（=生效日；无缴费事件时视为已缴首期）
- pay 事件 `date` = 该次缴费对应的缴费日（缴到哪期填哪期的缴费日）
- reinstate 事件 `date` = 复效日（账面视同补缴至该日所在期）
- surrender 事件 `date` = 退保日；晚于最近 reinstate 即「已退保」
- 缴费进度：`paidUntil = max(pay/reinstate 事件日)` → 已缴期数按 freq 步进；`nextPayDate = paidUntil + freq 个月`（月末钳制 anniversary 语义）

## 已知边界

- 保额/保费为登记值，透视合计以合同为准；宽限期/复效规则以各产品条款为准（台账按行业通用口径投影）。
- 缴费年限未登记的非趸交保单，缴费提醒按「持续续缴」处理，补录 payYears 后自动收敛。
- AI 侧工具列表更新后需重启应用/重连 MCP 才可见（宿主缓存）。
