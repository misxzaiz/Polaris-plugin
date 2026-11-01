# 车辖（chexia）—— 家庭车辆养护与补能台账

> 辖者，车轴之键也（《左传》「抽其车辖」）；一枚小销钉管住全车大事小情。

把「车该保养了吗、保险年检什么时候到期、这车百公里多少钱」变成**可对话、会主动提醒、数据不出本机**的家庭车辆档案。

## 是什么

- **对话式记账**：加完油对 AI 说「刚加油 350 块 42.3 升，里程 45230」→ 自动重算期间油耗、刷新保养里程倒计时；车不存在时顺手建档（以首条里程为基线），充电自动判纯电。
- **期间口径能耗**：不要求「必须两次加满才能算油耗」——加满锚定法（两次加满之间教科书 full-to-full）为主，无两次加满时毛估退化并如实标注 `estimated`；里程跨度过小（<30km）拒绝出数，诚实不硬算。
- **里程驱动养护预测**：从补能/维保流水里程序列推日均里程（30 天窗口 → 全跨度 → 建档以来三级回落），把「机油每 5000 km」换算成「约 N 天后到」，双周期（km+月）取更紧者。
- **证件红黄榜**：交强险 / 商业险 / 年检 / 驾驶证 / 行驶证到期分层（expired / soon / ok）——交强险脱保上路罚 2 倍保费可扣车，年检逾期罚款，这是「忘一次就亏钱」的法定刚需。
- **家庭多车多成员**：一家多车 / 夫妻共车各加油时「账在我手机上」无解——手机浏览器打开同一面板互相代记，三端同读。
- **费用透视**：补能 + 维保按月分桶、按类小计、元/公里（与能耗同窗口口径）。
- **维保联动**：记保养时填养护项名 → 自动推进其周期锚点；面板「做到今天」一键打卡同理。

## 明确不做（边界）

- **不做**违章查询、车辆估值、OBD 硬件接入、云端同步、保养商家/产品推荐。
- 输出一律带「不构成维修/保险建议」口径；商家名仅作记录备注，不构成推荐。
- 零外网请求：纯本地 cap.kv，无账号、无上传、无遥测。

## 面板四 Tab

| Tab | 内容 |
|---|---|
| 概览 | 每车卡片（里程表/日均里程/期间能耗/元每公里）+ 养护进度条 + 证件红黄榜 + 个人证件段 + 红黄预警横幅 |
| 补能 | 记一笔（车/日期/里程/金额/量/是否加满/站点）+ 提交即回执期间口径 + 分车统计 + 流水列表（分车过滤、行内删） |
| 车务 | 养护项（周期+锚点+倒计时+「做到今天」）/ 维保记录（联动锚点）/ 证件（红黄榜+续保改期） |
| 设置 | 车辆档案（增改删，删车连带名下记录需确认）/ 提醒参数 / 导出 JSON / 后台服务状态 |

服务快照缺失或降级（>5 分钟）时，概览自动回落本地同源现算（`shared/core.familySnapshot`），不假装在线。

## MCP 工具（6 个，AI 对话式）

| 工具 | 语义 |
|---|---|
| `chexia_today` | 全家今日总览：每车里程/日均/能耗(元每公里)/养护红黄/证件红黄榜/近期费用 + 预警摘要 |
| `chexia_add` | kind=car 建车（车型/建档里程/车牌）；kind=item 立养护项（周期+锚点）；kind=doc 登记证件（carName 空=个人证件） |
| `chexia_log` | kind=energy 补能（odometer 必填——生命线护栏）；kind=svc 维保（type=maintenance+itemName 命中自动推进锚点） |
| `chexia_query` | scope=cars｜items｜svcs｜docs（红黄榜）｜energy｜cost（费用透视） |
| `chexia_update` | 改车辆/养护项/证件/补能/维保（patch 部分更新；改证件到期=续保后改日期） |
| `chexia_delete` | 删（confirm 门；删车名下有记录需 purge=true 连带删；删维保不自动回退锚点） |

对话式友好层：`carName` 按名 find-or-create；补能顺手建档时以本次里程表读数为建档基线；`energyKind=charge` 自动判纯电。

## 键空间契约（权威）

| 键 | 写者 | 读者 | 说明 |
|---|---|---|---|
| `chexia.car.<id>` | 面板/MCP | 面板/MCP/服务 | 车辆 `{id,name,kind:'fuel'\|'ev'\|'phev',plate?,initialOdometer,note,createdAt,updatedAt,rev}`；id=`sha256("car\|车名")[:12]` 按名幂等 |
| `chexia.energy.<id>` | 面板/MCP | 同左 | 补能 `{id,carId,kind:'fuel'\|'charge',date,odometer,amount,cost,filled,station?,note,…}`；**odometer 必填且 ≥ 建档里程**（normalizeEnergy 强制） |
| `chexia.item.<id>` | 面板/MCP | 同左 | 养护项 `{id,carId,name,cycle:{kmInterval?,monthInterval?},lastOdometer?,lastDate?,active,note,…}`；id=`sha256("item\|carId\|name")[:12]`；km 周期需 lastOdometer 锚、月周期需 lastDate 锚 |
| `chexia.svc.<id>` | 面板/MCP | 同左 | 维保 `{id,carId,type,date,odometer?,desc,cost?,vendor?,itemName?,note,…}` |
| `chexia.doc.<id>` | 面板/MCP | 同左 | 证件 `{id,carId(空=个人),type,expiry,remindDays?,note,…}`；id 按 carId+type+expiry 确定 |
| `chexia.settings` | 面板/MCP | 三方 | `{docWarnDays:30,itemWatchKm:500,itemWatchDays:14,costWindowDays:90}`（越界钳制回落缺省） |
| `chexia.snapshot` | **仅服务** | 面板/AI | 全家快照 `{at,cars:[{里程/日均/能耗/养护投影/证件榜/费用}],personalDocs}`（内容不变不写） |
| `chexia.meta` | **仅服务** | 面板 | 心跳 `{version,pid,startedAt,lastTickAt,bridge,degraded,counts}` |

派生口径全部在 `shared/core.js`（零依赖纯函数），面板 / MCP / 服务三方同源一致：
期间能耗（加满锚定 → 毛估退化 → 里程差过小拒绝）、日均里程（窗口 → 全跨度 → 建档回落 → none）、
养护投影（km 轴 daysLeft=kmLeft/日均、时间轴月加法月末钳制、双周期取紧、overdue/due/watch/ok）、
证件榜（remindDays 覆盖全局 docWarnDays）、费用透视（月度分桶 + 元/公里同窗口）。

## 数据与隐私

- 纯本地：cap.kv 单事实库，零网络权限、零账号、零上传、零遥测。
- 删除一律两击确认（面板 confirm）/ `confirm=true`（MCP）；删车连带名下记录需显式 purge。
- 导出 JSON 剥离 rev，带免责声明与 kind 标记。

## 开发

```bash
npm install
npm run typecheck        # tsc strict
npm run build            # esbuild → dist/panel.js（React external）
node test/run-tests.mjs  # 离线单测 31 组（日期/归一化/里程回落链/期间口径/养护投影/证件榜/费用/快照/导出）
node test/mcp-verify.mjs # 内存桥 + spawn 真实 MCP 全流程 42 项
node test/harness-run.mjs# jsdom 无头渲染四 Tab（补能写库/做到今天联动/建档）
node test/smoke-real.mjs # 真宿主冒烟（需 Polaris 运行中；快照式清场）
```

## 语义锚（与 core.js/工具描述一致）

- 补能 `date` = 加油/充电日；`odometer` = 该日里程表读数（油耗/养护倒计时生命线）
- 养护项锚点：`lastOdometer` = 上次保养时里程表读数；`lastDate` = 上次保养日期；维保联动仅当记录更新（≥ 原锚点）才推进
- 期间能耗窗口：近 90 天（`CONS_WINDOW_DAYS`）；日均里程窗口：近 30 天（`RATE_WINDOW_DAYS`）
- 证件 `expiry` = 到期日（年检/保险按行驶证/保单EndDate 口径登记）

## 已知边界（如实）

- 油耗精度依赖里程表读数的准确与连续；漏记里程会让窗口锚定偏粗（毛估口径已如实标注）。
- 电车「充到 80%」属未加满记录：期间口径天然支持，但满充锚定需两条 filled 才出教科书口径。
- 日均里程在刚建档（<2 条流水）时回落建档天数口径，早期倒计时天数偏保守。
- 快照由服务 15s 重算；服务未启动时面板本地现算（功能等价，仅少三端一跳缓存）。
- AI 侧工具列表更新后需重启应用/重连 MCP 才可见（宿主缓存）。
