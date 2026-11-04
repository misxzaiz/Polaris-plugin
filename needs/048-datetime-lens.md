---
id: "048"
title: 时间与时区调试台（datetime-lens）：多格式解析 + 时区投影 + DST 坑检测
status: analyzed
priority: high
tags: [datetime, timezone, dst, debug, lens]
origin: zcode
created: 2026-11-04
updated: 2026-11-04
spec: ""
delivered: ""
---
## 一句话

面向开发者的日期时间与时区调试台：把任意格式的日期时间字符串（ISO 8601/RFC 2822/Unix 秒毫秒/HTTP 日期等）解析为权威解读，投影到多时区并标注偏移与 DST，提供「墙钟时间在指定时区的真实时刻」解析（自动识别 DST 空洞/歧义）、日历算术 vs 精确时长双口径运算、标准格式互转，并对 JS 日期处理的经典坑（date-only 按 UTC 解析、秒毫秒混淆、两位年、2038、ISO 周 53 周、越界滚动）做确定性检测——面板 + MCP 双端，AI 助手可代查代算。

## 目标（做什么）

- 提供确定性、零依赖的日期时间解析/时区投影/墙钟消解/算术/格式化能力与坑检测，面板可视化 + MCP 五工具（parse/convert/wall_resolve/arith/format），解析失败给原因，DST 空洞与歧义显式判定而非静默偏移。

## 边界（明确不做什么）

- 不做日历/待办/提醒等台账功能；不做 ICS 日历协议解析（sundial 已有）；不依赖 npm 时区库（zero-dep，用 Node 内置 Intl/ICU）；不修改 AIEvent 协议；不做时区历史变迁完整数据库（依赖 ICU 内置数据并如实标注）。

## 验收（怎么算完成）

- 冒烟：CLI harness 断言 ≥60 条（解析格式识别、时区投影偏移正确性、DST gap/ambiguous 判定、算术双口径、格式往返 round-trip、坑规则逐条触发）；与 Node Intl 差分对拍自证（自实现偏移采样 vs Intl.formatToParts 权威值全等）；MCP stdio JSON-RPC 喂包冒烟五工具全通；面板 esbuild 打包成功且渲染断言通过。

## 待澄清

（夜班分析时补写；空则留空）

## 决策记录

- 2026-11-04 由 zcode 记录。

- 2026-11-04 分析补全(夜班第13轮):①零依赖基座=Node 内置 Intl/ICU(实测本机 Node v24 ICU 全量 418 时区),自实现偏移采样(offset=Date.UTC(墙钟字段)-instant 差分法)与 Intl.formatToParts / longOffset 双源对拍;②墙钟消解用「双 offset 候选+反投影验证」标准算法,gap(墙钟不存在)/ambiguous(出现两次)显式判定而非静默偏移,跳变点秒级二分定位;③naive(无时区)串默认按 UTC 解读并显式标注假设+V8 行为对照(new Date 同串真跑,两端 V8 一致);④DST 生效判定用「与采样窗内最小 offset 比对」启发式,如实标注非完整时区历史库(依赖 ICU tzdata);⑤unix 时间戳口径按位数域判定(≤10位秒/11-14位毫秒)并给错误口径对照;⑥形态参照 yaml-lens:纯本地零 kv 零外联,MCP stdio 五工具(datetime_lens_parse/convert/wall_resolve/arith/format)+面板四视图。


- 2026-11-04 实施交付(夜班第13轮,承接上文分析):选型=需求库 47 条全扫,011-047 已 delivered,002-009/023/028 等或落主仓总线闸或落台账禁闸→触发降级热点发现,本条由本轮登记并就地实施。①解析自研严格语法(不信任 Date.parse 实现差异),JS Date.parse 真跑差分入报告(一致/分歧/NaN 如实);②时区唯一权威 Intl/ICU,投影差分对拍(24 zone×~62 instant≈1488 组 offsetMin 全等)+墙钟消解 vs 分钟步进暴力扫描 12 例同判;③墙钟消解=±24h 双 offset 探针+反投影 round-trip 校验,unique/ambiguous/gap 三态统一形状(同形空键,cron-lens TS 推断坑);④算术双口径:日历口径(月末钳制+DST 空洞/歧义如实标注)vs 精确口径(真实秒数),两口径差值显式提示;⑤unix 单位=惯用位数评分(秒10/毫秒13/微秒16/纳秒19)+年份合理性过滤+歧义列备选,大数 BigInt 精确除。
- 与上文分析的偏差:⑤由「≤10位秒/11-14位毫秒」细化为四单位惯用位数评分制(15-17 位微秒/18-20 位纳秒也在域内,19 位纳秒超 Number 安全整数须 BigInt);③由「naive 按 UTC」改为「按解读时区消解+JS 差分实况」——date-only 按 UTC 与 date-time 无偏移按本地正是 ES 规范两套规则并存,固定按 UTC 会掩盖这条坑;面板为此加独立「解读时区」下拉,DST 预设样本联动切换。
- 冒烟:141 断言全绿(core 94:含 1488 组时区投影差分+12 例墙钟暴力扫描对拍+round-trip 双通道;MCP stdio 33;SSR 14);bundle 60.1KB;typecheck 绿;icon 对照 Rust 单源白名单取 Clock。
