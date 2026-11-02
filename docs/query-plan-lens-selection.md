# 选型文档：执行计划透视台（query-plan-lens）

> 2026-11-03 · 按《核心使命》硬闸筛选：台账/记录/生活类全部不进候选池。

## 一、候选池（过硬闸后）

| 候选 | 核心动作 | 淘汰/保留 |
|---|---|---|
| 数据脱敏台 | 变换 | ❌ 已被 `data-mask` 占位 |
| Mock 服务 | 造数据 | ❌ 已被 `mock-server` 占位 |
| 双环境 API 对比 | 诊断 | ❌ 已被 `diff-desk`（双 URL 对比）覆盖 |
| 密钥/env 体检 | 诊断 | ❌ 已被 `keyscan` 占位 |
| 本地数据 SQL 查询 | 变换 | ❌ 已被 `data-query` 占位 |
| **SQL 执行计划透视台** | 诊断+变换 | ✅ 生态空位，入选 |
| 正则工作台 | 变换 | 保留备选（regex101 强竞品，差异仅在本地批量） |
| OpenAPI 契约 diff/体检 | 诊断 | 保留备选（mock-server 已吃掉导入场景，剩余面较窄） |
| i18n 键值体检台 | 诊断 | 保留备选（受众多语言项目才需要） |

## 二、加权评分（满分 100）

| 维度 | 权重 | 执行计划透视台 | 正则工作台 | OpenAPI 契约体检 |
|---|---:|---:|---:|---:|
| 用户痛点强度 | 20 | 5 → **20** | 3 → 12 | 3 → 12 |
| 需求频率与覆盖 | 15 | 4 → **12** | 4 → 12 | 3 → 9 |
| 现有方案缺口 | 15 | 5 → **15** | 3.5 → 10.5 | 4 → 12 |
| 可验证差异化 | 15 | 4 → **12** | 3 → 9 | 4 → 12 |
| 用户收益 | 15 | 4 → **12** | 3 → 9 | 3.5 → 10.5 |
| Polaris 形态适配 | 10 | 5 → **10** | 5 → 10 | 4 → 8 |
| 技术可行性 | 5 | 5 → **5** | 5 → 5 | 4 → 4 |
| 开发/维护成本 | 5 | 4 → **4** | 4 → 4 | 4 → 4 |
| **合计** | 100 | **90** | 71.5 | 71.5 |

## 三、需求证据（外部，可追溯）

1. **pev2 / explain.dalibo.com 是 PG 生态事实标准**：开源 Vue 组件（github.com/dalibo/pev2），被 PostgreSQL 官方 wiki「Performance Analysis Tools」页收录，并被 pganalyze、GreptimeDB 等产品内嵌，社区反复出现「用 EXPLAIN + pev2 治慢查询」的实战帖——可视化看执行计划是刚需且已被验证。
2. **MySQL 侧工具缺口更明显**：官方 Blog（dev.mysql.com/blog-archive/new-json-format-for-explain）专门解释 EXPLAIN FORMAT=JSON/ANALYZE；Reddit r/mysql 有「I've built a tool to visualize the EXPLAIN output」这类用户自造轮子帖——现有工具（Workbench 重型桌面、dbvis 商业）不好用，用户在重复发明。
3. **所有现成工具都是「贴文本」型**：dalibo/depesz/pgexplain 都要用户先在 psql/mysql 里跑 EXPLAIN、手工复制输出再粘到网页——查询与库结构信息离开本机（隐私顾虑是 dalibo 提供「不想上传计划」选项的直接证据）；MySQL 无一等公民网页可视化。
4. **Polaris 生态内**：db-workbench 只做查询（只读护栏、schema 浏览），无执行计划；data-query 只管本地文件；sqlite-lens 只管 SQLite。MySQL/PG 的「连接→EXPLAIN→可视化→AI 解读」链路完全空白。

## 四、为什么是插件形态、为什么现有方案不够

- 现有方案的核心缺陷：**贴文本→切窗口→肉眼对照→再切回来**，且生产库凭据/计划外传第三方网页。
- 插件形态的价值：连接配置常驻本地、一次点击完成 EXPLAIN 并渲染、发现列表给出中文诊断与建议动作、AI 经 MCP 一句话解读（计划文本可经 IAB 直发聊天）；全程计划不出本机（除非用户主动发 AI）。
- 与 db-workbench 互补而非重叠：一个查数据，一个看「为什么慢」——同一用户群、同一连接习惯、零功能冲突。

## 五、MVP 范围

**做**：PostgreSQL + MySQL 两种连接；`EXPLAIN (FORMAT JSON, VERBOSE[, ANALYZE])`（PG）/ `EXPLAIN FORMAT=JSON`（MySQL）；PG 经典文本 EXPLAIN 粘贴解析（生产库连不上时的贴文本路径，dalibo 的核心场景）；统一计划树 + 耗时/成本/行数标注；诊断规则引擎（全表扫/行数误估/外排落盘/Using filesort·temporary/大过滤丢弃等）；历史记录；MCP 四工具；AI 直发。
**不做**：MySQL EXPLAIN ANALYZE TREE 文本解析（8.0 专属格式，列为实验性）、SQL 改写建议自动执行、其他数据库（Redis/Mongo 无查询计划；SQLServer/Oracle 后续看需求）、写语句执行（永久只读）。

## 六、最大不确定性与止损

- 不确定性①：本机无 MySQL 实例，MySQL 实连冒烟受限——用真实格式 fixture + embedded-postgres 实跑 PG 补齐；MySQL 实连列为待验证项，如实标注。
- 不确定性②：MySQL JSON 计划结构版本差异（5.7/8.0）——解析器按「已知字段优先、未知字段进 detail」宽容策略，解析失败时回退原文展示，不丢信息。
- 止损：若解析器在真实库上大面积误判（冒烟通过率 <90%），收缩为「PG-only + MySQL 贴 JSON」，仍是一个完整产品。

## 七、安全边界

密码只存服务侧本地文件（不进 kv/日志/AI 上下文，对齐 db-workbench）；写语句永久拒绝（字符串/注释感知）；`ANALYZE`（会真实执行）双重闸：默认关 + 仅 SELECT/WITH 放行；服务仅绑 127.0.0.1、无 CORS 头；AI 返回中凭据零出现。
