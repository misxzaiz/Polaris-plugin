# 执行计划透视台（query-plan-lens）

把「这条 SQL 为什么慢」从 **跑 EXPLAIN → 复制 → 贴网页 → 肉眼对照** 变成一次点击。

## 它解决什么

- EXPLAIN 输出晦涩：估行/实行/成本/循环次数散在原始文本里，人眼逐行对照太慢；
- 现成可视化工具全是「贴文本」型（explain.dalibo.com / explain.depesz.com）——计划数据离开本机，MySQL 更没有一等公民的可视化；
- 生产库连不上工作站时，「贴文本」是唯一路径，但没有解析就等于没有诊断；
- 看懂了计划还要「到处问人怎么优化」。

## 核心能力

| 能力 | 说明 |
|---|---|
| 一键执行计划 | 连接 MySQL / PostgreSQL，一键出 EXPLAIN 计划树；每节点显示估行→实行、自耗时条、成本、循环次数 |
| 中文诊断规则 | 全表扫描、行数估算偏差（统计信息过期）、排序/聚合外排磁盘、大比例过滤/连接条件丢弃、Using filesort / temporary、Join Buffer 兜底、候选索引未用、热点节点定位——每条带建议动作 |
| 粘贴解析（离线） | PG 经典文本 EXPLAIN 输出、任一引擎 FORMAT=JSON 输出，不连库直接解析+诊断 |
| 实际执行（ANALYZE） | PG 支持真实执行拿实际耗时/行数；双重护栏：默认关 + 仅 SELECT/WITH 放行 |
| AI 解读 | MCP 五工具（`qpl_connections / qpl_explain / qpl_parse / qpl_history / qpl_history_get`）；面板一键「发到聊天让 AI 解读」 |
| 历史留痕 | 每次成功分析自动留痕（最多 30 条），可回读、可让 AI 深挖 |

## 安全边界

- **写语句永久拒绝**：字符串/注释感知的只读护栏（`--`、`/* */`、`#`、引号转义都绕不过）；MySQL 的 `REPLACE()` 函数与 `ORDER BY x DESC` 不误杀。
- **EXPLAIN ANALYZE（真实执行）**：仅 PG、仅只读语句通过时放行；MySQL 返回估算计划并明确说明。
- **凭据不外流**：密码只存本机服务侧文件（AES-256-GCM 混淆落盘），不进 kv、不进日志、不进 AI 上下文；接口层只返回 `hasPassword` 布尔。
- **服务面收紧**：仅绑 `127.0.0.1`、无 CORS 头、Bearer token 鉴权（token 经 cap.kv `qpl.service` 分发）。
- AI 通道只能引用已保存连接名，SQL 在服务端过同一道护栏。

## 使用

1. 「连接」页新增 MySQL / PostgreSQL 连接（本地或远程均可）；
2. 「分析」页选连接、贴 SQL，点「出执行计划」；
3. 看树、看发现；需要精确耗时时勾「实际执行」（PG）；
4. 生产库连不上？「粘贴解析」里贴 EXPLAIN 原始输出；
5. 「发到聊天让 AI 解读」一键直送对话。

对 AI 说：`用 xxx 连接解释这条 SQL 为什么慢：SELECT ...` 或 `帮我解析这段 EXPLAIN 输出：...`。

## 架构

```
面板(React) ──router_dispatch──▶ cap.http ──▶ 127.0.0.1:<port> 本地服务
                                              ├─ core.js   纯逻辑（护栏/解析/诊断，可离线单测）
                                              ├─ db.js     mysql2/pg（vendor.cjs 单文件）
                                              ├─ store.js  连接配置（AES 落盘）
                                              └─ main.js   HTTP 编排（单一路径权威）
AI(MCP stdio) ────────────────────────────────▶ 同一服务（薄透传，无独立逻辑）
```

- 统一计划树：PG JSON / MySQL JSON / PG 文本三种输入 → 同一种节点模型 → 同一套诊断规则。
- 解析失败永不丢信息：未知形状回退展示原始输出。

## 开发

```bash
pnpm install          # 安装 devDeps（esbuild/react/typescript + mysql2/pg 供打包）
pnpm build:vendor     # 生成 service/vendor/vendor.cjs（mysql2/pg 单文件）
pnpm build:panel      # 生成 dist/panel.js（react external，宿主提供）
pnpm typecheck        # tsc --noEmit
pnpm test             # node --test：core 单测 + hermetic 服务冒烟 + MCP stdio 冒烟
node test/render-verify.mjs            # 面板 SSR + 数据层冒烟
PG_SMOKE_DIR=<dir> node test/smoke-real-pg.mjs    # 真库冒烟（embedded-postgres，另装）
MY_SMOKE_DIR=<dir> node test/smoke-real-mysql.mjs # 真库冒烟（mysql-memory-server，另装）
```

## 已知边界

- MySQL 仅估算计划（`EXPLAIN FORMAT=JSON`）；MySQL 8.0 的 `EXPLAIN ANALYZE`（TREE 文本）解析为下版候选。
- 其他数据库（Redis 无查询计划；SQLServer/Oracle）未支持。
- 密码落盘加密为混淆强度（密钥派生自本机路径），防误同步泄露，不防本机 root。
- `plan.parse` 的 MySQL 文本（表格/Tree）格式未支持，请贴 FORMAT=JSON。

## 验证状态（2026-11-03）

- 离线单测 32/32 绿（core 19 + 服务 hermetic 8 + MCP stdio 5）
- 面板 SSR 渲染 + 数据层冒烟 5/5 绿
- 真实 PostgreSQL 17.4 全链路 19 项绿（embedded-postgres）
- 真实 MySQL 8.4 全链路 13 项绿（mysql-memory-server）
- `tsc --noEmit` + esbuild 构建绿；面板 bundle 23KB
