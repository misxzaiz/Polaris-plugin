# 日晷（sundial）

个人日程 / 提醒 / 倒计时插件。对话式入口 + 外部日历（ICS）订阅 + 三端同读。

- **聊天即记账**：「周五下午3点提醒我取快递」「每天晚上10点提醒背单词并打卡」「距离高考还有几天」——AI 经 MCP 工具直接落库。
- **外部日历**：ICS/Webcal 订阅（Google 公开日历、课表、排班表），后台服务按间隔抓取同步。
- **提醒**：到期提醒 → 面板横幅 + 提示音 + AI 的 `sundial_today` 可见。
- **习惯打卡**：重复事件标记完成，连击 🔥 统计（今天未打卡不打断昨日连击）。
- **三端同读**：桌面面板 / 手机 Web 打开同一面板看到同一份日程（cap.kv 数据面）。

## 进程与职责

| 进程 | 职责 | 跨域路径 |
|---|---|---|
| 面板 | 今日时间轴 / 月视图 / 事件管理 / ICS 管理 / 设置 | **零外网请求**，全走 `__POLARIS_HOST_INVOKE__('router_dispatch')` |
| 后台服务 | ICS 订阅抓取同步、提醒投影计算、保留清扫、心跳 | **唯一外网抓取点**：原生 fetch + SSRF 守卫 + ETag 条件请求 |
| MCP server | 7 个 AI 工具 | 不抓外网，ICS 动作经命令信箱委托服务 |

## 键空间契约（权威，三方一致）

前缀 `sundial.`，逐键唯一写者（cap.kv 全局共享，勿污染他人前缀）：

| 键 | 内容 | 写者 | 读者 |
|---|---|---|---|
| `sundial.ev.<id>` | 事件（含 done/skip 发生标记） | manual：面板/MCP 直写（rev 失效信号）；ics：仅服务同步 | 三方 |
| `sundial.ics.<id>` | ICS 订阅定义 | 面板/MCP 写定义；服务写运行态（etag/lastFetchAt/…） | 三方 |
| `sundial.settings` | `{ icsIntervalHours, retentionDays, reminderGraceMin }` | 面板/MCP | 服务 |
| `sundial.reminders` | `{ at, items: ReminderItem[] }` 到期提醒投影 | **仅服务** | 面板/AI |
| `sundial.ui.acked` | `{ rId: ack 时间 }` 提醒确认 | **仅面板** | 服务 |
| `sundial.meta` | 服务心跳（60s） | **仅服务** | 面板 |
| `sundial.cmd.ics.add.<n>` / `.refresh.<cid>` / `.refreshAll.<n>` / `.remove.<cid>` | 命令信箱（消费即删，先删后做） | 面板/MCP → 服务 | — |
| `sundial.smoke.*` | 冒烟专用子前缀 | 冒烟脚本 | 100% 清理 |

## MCP 工具（7 个）

`sundial_add` / `sundial_query` / `sundial_update` / `sundial_delete`（confirm）/ `sundial_done`（打卡/跳过/撤销）/ `sundial_ics`（add/list/remove/refresh）/ `sundial_today`。

## 数据模型

```
Event { id('e'+hash12), title, notes, kind:'event'|'habit'|'countdown',
        start(epoch ms；allDay=当日 UTC 零点), allDay, durationMin(全天按天×1440),
        rrule('FREQ=…' canonical，''=一次性), remind: number[](提前分钟 ≤3),
        tags[], source:'manual'|'ics', icsId?, uid?, rid?(例外实例),
        enabled, done: { occKey:'done'|'skip' }, createdAt, updatedAt, rev }
```

- **occKey**：时刻事件 = epoch ms 串；全天 = `dYYYYMMDD`（UTC 日期，跨时区稳定）。
- **提醒投影**（服务每 10s 重算）：`remindAt = 开始 - 提前分钟`（全天锚定当天本地 09:00）；
  到期窗口 `[remindAt, 开始 + reminderGraceMin]`；被发生 done/skip、面板 ack 抑制；服务重启确定性重算。
- **习惯连击**：`computeStreak` 从最近已排期发生往回数连续 done（今天未打卡宽限不打断）。

## 如实边界

- **提醒是应用内触达**：面板横幅 + 提示音 + AI 问答可见。主应用暂未提供插件可用的系统通知通道；面板关着时提醒不会弹系统通知（服务投影仍在，AI 问「今天安排」能看到，打开面板也能补看）。
- **ICS 时区**：内嵌 VTIMEZONE 的日历正确换算（含 DST 规则）；无 VTIMEZONE 的 DST 时区按内置固定偏移表（标准时）回落，夏半年可能偏差 1 小时。
- **RRULE 子集**：`FREQ=DAILY/WEEKLY/MONTHLY/YEARLY`、`INTERVAL`、`BYDAY`（周几/月内第 n 个周几）、`BYMONTHDAY`（含负数月末）、`BYMONTH`、`UNTIL`、`COUNT`。不支持 `BYSETPOS/BYWEEKNO/BYYEARDAY/RDATE`——含不支持参数的 ICS 事件降级为单次并在备注标注，绝不静默丢标题。
- **RECURRENCE-ID** 例外实例按独立单次事件入库，并在主事件上抑制原时刻（occKey=skip）。
- **ICS 事件的定义字段**（标题/时间）会被下次同步覆盖，只建议自定义提醒（remind）与打卡；manual 事件不受影响。
- 数据纯本地（cap.kv），不出设备；ICS 订阅 URL 是唯一出网流量（服务进程抓取）。

## 验证

```
node test/run-tests.mjs      # 64 项离线单测（rrule/ICS/提醒/streak/SSRF/规范化）
npm run typecheck && npm run build
node test/smoke-real.mjs     # 真实桥冒烟（需本机 Polaris 运行中；自清理）
```

排障：服务日志 `<appConfigDir>/sundial.log`（512KB 轮转）。
