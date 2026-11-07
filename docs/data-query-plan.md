# 数据查询台（data-query）—— 选型与 Spec

> 2026-11-02 立项。方向硬约束：工具/技术/数据管道类（「变换/诊断/自动化」，非记录台账）。

## 一、选型过程

### 1.1 候选池与硬约束过滤（69 个存量插件盘点后）

| 候选 | 判定 | 依据 |
|---|---|---|
| 进程/端口医生 | **淘汰（存量占用）** | pocket-host 已含本地端口 Tab + host_ports/host_kill 四层护栏 |
| 日志分析台 | 淘汰 | log-lens 已交付（流式/聚类/六 MCP 工具） |
| 密钥扫描台 | 淘汰 | keyscan 已交付 |
| API 客户端 / JSON / 时间戳工具箱 | 淘汰 | relay-devkit 已覆盖 |
| 通用文件整理/自动化 | 淘汰 | file-flow 已交付 |
| 数据变换（mini CyberChef） | 降权 | 竞品过密：CyberChef/C-Tools/DevOmniTools 等隐私优先网页工具已饱和 |
| DDL→ER 图/数据字典 | 降权 | dbdiagram.io/draw.io/Workbench 免费方案充分，缺口弱、频次低 |
| 正则工作台 | 淘汰 | regex101 免费且极成熟 |
| Mock 服务器 | 淘汰 | Mockoon 成熟 GUI，平台无独有优势 |
| **本地数据文件 SQL 查询 + AI 问数** | **选中** | 生态空白 + 需求证据充分 + 平台契合（见下） |

### 1.2 需求证据（外部，可追溯）

- 「SQL over 本地文件」需求被多个独立工具反复验证：[dsq](https://github.com/multiprocessio/dsq)（HN/r编程热帖）、[sqlite-utils memory](https://til.simonwillison.net/sqlite/one-line-csv-operations)、[TextQuery](https://www.reddit.com/r/programming/comments/1bx2j2j/textquery_run_sql_on_your_csv_files)、[命令行 SQL 工具对比](https://www.datafold.com/blog/sql-tools-on-the-command-line)。
- [DuckDB](https://duckdb.org) 成为 2025 本地分析主导方案（CSV/Parquet 直查免入库），连 [浏览器内 Web Shell](https://technology.amis.nl/database/sql-in-your-browser-duckdb-web-shell-for-purely-local-data-analytics) 都有人做——纯本地即卖点。
- 「数据给 ChatGPT 分析」存在真实隐私缺口：企业/个人敏感 CSV 不愿上传，社区共识即「本地跑、不上传」。
- 生态内查重：relay-devkit 的 SQL 工具面向 MySQL **服务器**连接（mysql2 vendor），无本地文件分析路径；pdf-tables 从 PDF 提表；gezhi 生成 Excel；data-ark 备份。**无重叠**。

### 1.3 评分（满分 100）

| 维度 | 权重 | 得分 | 理由 |
|---|---:|---:|---|
| 用户痛点强度 | 20% | 16 | 非技术用户用 Excel 卡死、技术用户为查个 CSV 装 Python/DuckDB CLI；账单/订单/导出数据查询是高频刚需 |
| 频率与覆盖 | 15% | 11 | 开发者+数据使用者+普通用户三方覆盖；单用户周频～日频 |
| 现有方案缺口 | 15% | 12 | CLI 要装环境、网页工具无 AI 且不便携、SaaS 要上传；生态内空白 |
| 可验证差异化 | 15% | 13 | 零安装 + 本地隐私 + 对话问数（MCP）+ 跨文件 JOIN，四点均可在 1 分钟内演示验证 |
| 用户收益 | 15% | 12 | 「30 秒回答一个数据问题」替代「装环境/写脚本/上传网盘」 |
| 平台适配 | 10% | 9 | 面板+服务+MCP 全是 house 范式；AI 问数直接放大 Polaris 主场景 |
| 技术可行性 | 5% | 5 | duckdb-wasm Node 尖峰全绿（CSV 中文/GBK/JSONL/持久化/性能 51ms@15MB） |
| 开发维护成本 | 5% | 4 | 单引擎单工作区，wasm 钉版惰性下载；无外部服务依赖 |
| **合计** | | **82** | |

### 1.4 关键假设与止损

- **假设 1**：用户愿意在面板里写/让 AI 写 SQL 而不是开 Excel。MVP 验证：真桥冒烟 + 自用。
- **假设 2**：sql.js/duckdb-wasm 引擎在用户机器上首启下载 35.9MB 可接受。缓解：进度可见、哈希钉版、一次永久缓存；不可接受则用户可手动放置文件。
- **止损**：若引擎初始化失败率过高（CDN 不可达且无法手动放置），保留纯「预览+路径导入」降级路径并在 README 明示。

## 二、Spec

### 2.1 定位

**一句话**：把本机散落的 CSV/TSV/JSON/JSONL/Parquet 变成一张张可 SQL 查询、可 JOIN、可导出、可对 AI 提问的本地表——数据不出本机，零环境安装。

**核心动作**：变换/查询/诊断（合格口诀 ✓，无记录台账成分）。

- 目标用户：有数据文件要查的开发者/分析师/普通用户（账单、订单导出、实验数据、日志样本）。
- 用户现在的方式：Excel 打开卡死、装 Python/DuckDB CLI、把数据上传网页工具（隐私风险）。
- 独特价值：①零安装（引擎自动就位）②本地隐私 ③AI 对话问数 ④多文件 SQL JOIN。
- MVP 不做：图表（roadmap）、Excel 读写（roadmap，SheetJS）、写入数据源、多工作区。

### 2.2 架构

```
面板(React, dist/panel.js)                MCP(stdio, 零依赖)
   │ cap.http（house 范式，无 CORS 依赖）      │ 127.0.0.1 直连
   ▼                                        ▼
服务(service/server.js, 127.0.0.1:9875) ← 单一权威（引擎/工作区/导入/查询/导出）
   │ vendor: duckdb-node.cjs(35KB) + duckdb-node-eh.worker.cjs(1.2MB)
   │ 惰性下载: duckdb-eh.wasm(35.9MB, 钉版 1.33.1-dev57.0 + sha256 校验)
   ▼
duckdb-wasm（Worker shim 复刻官方 Node 适配器）→ 工作区 <dataRoot>/plugins/data-query/workspace.duckdb
```

- 端口 **9875**（69 插件实测未占用；9873 已被占）。
- 端口发现：kv `dq.meta`（服务写）→ MCP/测试回退 manifest 端口；MCP 支持 env `DATAQUERY_PORT` 测试钩子。
- 服务不依赖宿主即可查询/导出；宿主桥（kvclient，log-lens 同款样板）仅用于写 dq.meta 与读 dataRoot。
- 工作区模型：**单库多表**（所有导入进同一 workspace.duckdb → 天然支持跨文件 JOIN）；导入注册表 JSON 与 duckdb_tables() 启动对账。

### 2.3 接口（服务 HTTP，全部 JSON）

| 路由 | 方法 | 入参 | 出参 |
|---|---|---|---|
| /__health | GET | - | {ok, version, engine, tables:n} |
| /status | GET | - | 引擎状态（absent/downloading{pct}/ready）、工作区、注册表 |
| /tables | GET | - | [{table,source,rows,sizeBytes}] |
| /preview | GET | table, n≤50 | {columns, rows} |
| /schema | GET | table | {columns:[{name,type}]}, sample 3 行 |
| /import | POST | {path, table?} | {table, rows, elapsedMs}；编码探测 GBK/UTF-16/UTF-8 转码 |
| /import/upload | POST | ?name= + raw body ≤8MB | 同上（面板小文件便捷通道） |
| /query | POST | {sql, maxRows≤5000} | {columns, rows≤maxRows(默认500), rowCount, elapsedMs} |
| /export | POST | {sql, path, format:csv/json/ndjson, overwrite?} | {path, rows, bytes} |
| /drop | POST | {table} | {dropped} |
| /workspace/reset | POST | {confirm:true} | 删除工作区重建 |

### 2.4 安全与护栏（如实在案，不做虚假沙箱声明）

1. **SQL 写护**（/query）：剥注释后必须 `^(select|with)`；单语句（≤1 个分号）；黑名单关键词（insert/update/delete/drop/alter/create/attach/detach/copy/pragma/install/load/export/import/call/set/reset/begin/commit/rollback/vacuum/checkpoint…）。INSTALL/LOAD 被禁 ⇒ httpfs 装不上 ⇒ SQL 内无法读网络 URL（顺带闭合远程读）。
2. **不沙箱 read_csv_auto('任意路径')**：本服务是同机进程，非特权边界（AI 本就有 cap.bash）；写路径全部收口到 /import 与 /export 受控路由，README 明示此边界。
3. **导出护栏**：绝对路径、扩展名白名单（csv/json/ndjson/txt）、父目录必须存在、默认拒绝覆盖、禁止指向工作区/引擎文件本身。
4. **引擎完整性**：wasm 下载后 sha256 对钉版值强校验，不符即拒载删除；官方 jsdelivr + unpkg 双源重试。
5. **服务边界**：仅绑 127.0.0.1；**不带 CORS 头**（house 安全惯例：浏览器页面不可读响应；面板一律走宿主 cap.http）；导入大小护栏（上传 8MB、路径导入默认 512MB 拒绝可配）。
6. **MCP 输出限额**：markdown 表 ≤60 行/6KB 截断；错误原文透传不吞。
7. **幂等**：同名再导入 = CREATE OR REPLACE（表名稳定）；workspace/reset 需 confirm:true 二次确认。

### 2.5 MCP 工具（7 个，适用句式 description）

dq_status / dq_tables / dq_schema / dq_import / dq_query / dq_export / dq_drop。
AI 问数典型句式：「下载目录里 sales.csv 按月汇总金额前十」「把这两个表的差异查出来导出到桌面」。

### 2.6 验收（三层 + 发布链）

1. 离线单测（node:test）：SQL guard 全矩阵（注释绕过/多语句/关键词）、表名清洗、编码探测、导出护栏、markdown 截断。
2. 引擎测试（真实 wasm，无引擎自动 skip）：导入 utf8/GBK/JSONL → 查询 → JOIN → 导出 → drop → reset → 重启恢复。
3. MCP verify：假服务 + 真 mcp/server.js spawn（api-bench 假桥范式），握手/工具表/透传/超时引导。
4. `tsc --noEmit` + esbuild 构建。
5. 真桥冒烟（宿主运行时）：服务健康 → 面板 cap.http 查询 → MCP 实调（27+ 断言风格）。
6. 五步发布链（pack → update.json → index.json → commit → push + purge CDN 实测 200）。
