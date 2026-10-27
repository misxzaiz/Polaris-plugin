# 刻漏（time-trail）

> 把「这台机器的时间流向」变成可对话的资产。

后台服务驱动 PowerShell 原生采集器（user32 `GetForegroundWindow` / `GetLastInputInfo`，内存调用微秒级开销）记录前台应用与输入空闲状态，按天/小时/应用归集成时间账本，滚动保留 90 天；分类规则引擎（改规则对全部历史即时生效）把应用映射到七类；AI 经 MCP 回答「我今天干了啥」「这周写代码多久了」「帮我归类这些新应用」，面板给出实时当前应用、分类条、24 小时带与 14 天趋势。

- **spec（权威）**：主仓 `plans/time-trail-plugin-spec.md`
- **键空间契约**：`timetrail.*`（settings / snapshot / meta / day.<date> / cats / cmd / result），见 spec §4

## 它解决什么

日晷管「将要发生什么」、拾光机管「AI 会话里说过什么」、算盘管「AI token 花在哪」——**没有任何插件回答「我的时间实际流去了哪」**。刻漏把运行 Polaris 的电脑变成一台轻量时间计步器，手机打开同一面板看到同一账本（数据全在 cap.kv，跨端一致）。

## 隐私设计（默认最保守）

- 默认**只记进程名**，不记窗口标题；标题需在设置里显式开启（开启后截断 80 字符、每应用每日 top 40）
- 空闲（默认 180s 无键鼠输入）单独记入 idle 桶，不算到应用头上
- 一键暂停（隐私模式）：暂停期间行在落盘前即被丢弃，什么都不留
- 全部数据只存本机 Polaris 数据根（cap.kv / SqliteStorage），不上传任何服务器
- 「删除某应用的全部记录」「清空全部账本」随时可用

## 五个 MCP 工具

| 工具 | 用途 |
|---|---|
| `timetrail_today` | 今日实况：当前应用 / 分类耗时 / 时段分布 / 焦点指标 |
| `timetrail_query` | 区间查询（最近 N 天或指定日期），可按应用/分类过滤 |
| `timetrail_apps` | 应用清单 + 未分类清单（AI 归类的工作面） |
| `timetrail_set_categories` | 把应用归入七类（dev/create/meet/browse/media/play/other） |
| `timetrail_control` | 暂停 / 恢复 / 状态（隐私模式） |

## 归因口径（诚实边界）

- 两条采集线之间的间隙归给**起点**应用、上限 90s（休眠/断流不产生幽灵时间）
- 空闲时间单独记，不混入应用耗时
- 跨小时心跳归给起始小时（≤60s 偏差）；跨零点的 ≤90s 迟到归集直写对应天
- 天账本为服务内存权威副本，flush=读-合-写全量覆写（双缓冲换出，失败回滚重试）——崩溃/桥断重启不双记
- 不采集浏览器内的具体网址（侵入性高）；开启标题后 AI 可从窗口标题推断

## 架构

```
面板/MCP                     服务（归集引擎，唯一写者）           采集器（PowerShell 子进程）
   │ cmd.* / settings / cats    │                                    │ 每 tick 读前台窗口
   ├───────────────────────────▶│ 消费命令键（先删后做）               │ JSONL{t,app,title,idle}
   │ 读 snapshot/meta/day.*     │──── spawn( collector.ps1 ) ────────▶│ 仅变化/心跳时输出一行
   │◀───────────────────────────┤◀────────── stdout JSONL ────────────│ 父死一 tick 内自杀
        （全部经宿主 router_dispatch → cap.kv；面板零直连 fetch，
          桌面/Web/手机三端同源无跨域问题）
```

- 面板通道与 net-sentinel/page-sentinel 同款：宿主 `__POLARIS_HOST_INVOKE__` → `router_dispatch` → cap.kv
- 分类是**视图不是数据**：落库原始 appKey，规则读取时套用——改规则历史即时生效，无需重算
- 采集器冷启动（Add-Type 编译）约 30s，服务常驻故为一次性成本；暂停/恢复不重启采集器（行丢弃在服务侧）

## 面板四 Tab

- **今日**：实时当前应用（含空闲秒数）、汇总 chips、分类条、Top 应用、24 小时带（颜色=主分类、亮度=时长）
- **历史**：7/14/30 天分类堆叠条 + 日均/合计 + 日明细（点行看单日 Top 应用）
- **分类**：七类图例、未分类应用快归（下拉即改）、自定义规则（精确/前缀）、「让 AI 批量归类」发到聊天
- **设置**：隐私开关（暂停/标题采集）、采样参数（tick 2-15s / 空闲阈值 / 保留天数）、服务管理、数据清理

## 平台说明

- 采集仅 Windows（PowerShell 5.1 自带，无需管理员）；非 Windows 平台服务可读历史数据但 collector=unsupported
- 浏览器/UWP 说明：UWP 应用（`ApplicationFrameHost` 宿主）以窗口标题前 24 字符作 appKey
- 服务与采集器之间的行超时上限 90s：休眠恢复后的首段时间会被丢弃而非错记

## 开发

```bash
npm install && npm run build        # 面板 dist/panel.js
npx tsc --noEmit                    # 类型检查
node test/run-tests.mjs             # 纯函数单测（26 项）
node test/smoke-real.mjs            # 真桥全链路冒烟（24 项；需 Polaris 运行中，
                                    #   经 TIMETRAIL_COLLECTOR_CMD 注入脚本化采集器）
```
