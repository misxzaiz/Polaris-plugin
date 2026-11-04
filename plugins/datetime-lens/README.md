# datetime-lens · 时间与时区调试台

多格式日期时间解析 + 时区投影 + DST 空洞/歧义判定 + 双口径算术。纯本地零外联零 kv，面板与 MCP 同一引擎（`shared/datetime-core.js`）。

## 形态

- **面板**：输入任意日期时间原文 → 解读（形态/权威瞬间/JS Date.parse 差分）→ 全格式输出（ISO/RFC 2822/HTTP/Unix/ISO 周）→ 多时区投影表（勾选时区）→ 墙钟消解判定卡 → 双口径算术卡。
- **MCP 五工具**（前缀 `datetime_lens_`）：
  - `parse`：权威解读 + 坑检测
  - `convert`：多时区投影表
  - `wall_resolve`：`date + time + zone` → unique / ambiguous（两次瞬间+切换点）/ gap（切换瞬间+跳变量）
  - `arith`：日历口径 vs 精确口径双结果（DST 边界差值显式提示）
  - `format`：全格式输出 + round-trip 自证

## 支持格式

`now`；Unix 时间戳（秒/毫秒/微秒/纳秒按位数猜单位，歧义列备选）；ISO 8601 / RFC 3339（`YYYY-MM-DD[T ]HH:MM[:SS][.f][Z|±HH:MM|±HHMM]`）；`YYYY-MM`；`YYYY`；RFC 2822 邮件日期；HTTP 日期（IMF-fixdate）。

## 坑检测（14 条）

date-only 按 UTC 零点、无偏移 date-time 按本地时区（同语言两套规则）、DST 空洞、DST 歧义、unix 单位歧义、两位年（RFC 2822 过时规则）、2038 溢出、闰秒、ISO 周年错位、月末钳制 vs JS setMonth 回卷、偏移越界（|±|>14）、星期名与日期不符、未知时区名、JS Date.parse 差分/拒收实况。

## 权威与边界

- 时区换算唯一权威 = 宿主运行时 Intl/ICU（与宿主同源数据）。
- 自研语法与时区逻辑由 `test/run-tests.mjs` 差分对拍守护（投影 vs `Intl longOffset` 全 zone 矩阵、墙钟消解 vs 分钟步进暴力扫描、ISO 周规范向量）。
- 时区历史变迁完整库不在范围：1970 前含 LMT 秒级偏移时代，分钟粒度结果可能失真（会如实标注）。
