# 数据库工作台（db-workbench）

把「连本机/远程 MySQL·PostgreSQL·Redis 查数据、看表结构、让 AI 帮我查」变成 30 秒内完成的事：连接 profile 一次配置，面板即查即导出，AI 经 MCP 七工具用一句话查库——**数据不出本机，护栏默认只读**。

## 能做什么

- **连接管理**：MySQL 5.7/8.x、PostgreSQL 12+、Redis 5-7；host/port/用户/库一次配置，支持测试连通、只读/可写开关、备注。
- **SQL 查询**（面板）：SQL 编辑器（Ctrl+Enter 执行）→ 结果表格 → 一键导出 CSV（带 BOM，Excel 直开）/JSON；查询历史可回填。
- **结构浏览**：库 → 表/视图（估算行数/占用空间）→ 列/索引/DDL + 数据预览（前 50 行）。
- **Redis 浏览**：SCAN 分页（强制 COUNT 防大库阻塞）、TTL、类型徽标、值预览（string/hash/list/set/zset/stream）；白名单命令行。
- **AI 对话查库**（MCP 七工具）：`dbw_connections / dbw_tables / dbw_describe / dbw_query / dbw_redis / dbw_history / dbw_selftest`。对 Polaris 说「orders 表上月金额前十的用户」即可拿到真实行并解读。

## 护栏（安全设计，面板/MCP/service 三方同源）

| 闸 | 行为 |
|---|---|
| 默认只读 | 连接默认只读；SELECT/SHOW/DESCRIBE/EXPLAIN 之外一律拒绝 |
| AI 永远只读 | MCP 通道 service 侧强制只读，与面板写模式无关 |
| 写模式双闸 | 连接 profile `allowWrite` + 面板临时开关，缺一不可 |
| 无 WHERE 不改 | UPDATE/DELETE 无 WHERE 拒绝（防全表改写） |
| 高危 DDL 确认 | DROP/TRUNCATE 需显式 confirm 重发 |
| 多语句拒绝 | 一次只跑一条（剥注释后判定，字符串内分号不误判） |
| 副作用伪装读拦截 | `SELECT ... INTO OUTFILE`、`FOR UPDATE`、`COPY TO` 等一律拦截 |
| LIMIT 注入 | 顶层 SELECT 无 LIMIT 自动补（1000 行上限 + 截断标记） |
| 超时 | 查询 15s（mysql timeout / pg statement_timeout / redis 断链防串包） |
| Redis 白名单 | 只读命令默认放行；写命令需 allowWrite；FLUSHALL/CONFIG/DEBUG 等服务器级命令永久拒绝；KEYS 刻意不进白名单（防阻塞） |
| 凭据隔离 | 密码只在勾选「记住」时写本机服务侧文件（`appConfigDir/db-workbench/credentials.json`），不进 kv、不进 AI 上下文、不进任何 API 返回值 |
| AI 无法探测内网 | MCP 无「添加连接/测试连接」工具，AI 只能使用面板已建立的连接 |
| 鉴权 | service 仅绑 127.0.0.1 + 随机 token（经 cap.kv 分发给面板/MCP，常量时间比较） |

## 架构

```
面板(React, dist/panel.js)
  ├─ 直连 127.0.0.1:<port> service（查询/表结构/Redis 流量；CORS 由 service 放行）
  └─ 经宿主 invoke → cap.kv 读 dbl.service（发现信息: port+token）
service(node http, 绑 127.0.0.1)
  ├─ drivers/mysql.js（mysql2, vendor 单文件）
  ├─ drivers/pg.js（pg, vendor 单文件）
  ├─ drivers/redis.js（RESP2 手写, 零依赖, 串行队列+超时断链）
  ├─ shared/core.js 护栏核心（三方同源）
  └─ store.js（profile 元数据→cap.kv；密码→本地文件；历史→cap.kv）
mcp/server.js（stdio JSON-RPC → 读 kv 发现 service → /mcp/* 强制只读通道）
```

## 运行测试

```bash
cd plugins/db-workbench
npm install
node build-vendor.js          # 打包 mysql2/pg → service/vendor/vendor.cjs
npm run build                 # 面板 esbuild bundle
npm run typecheck
node test/run-tests.mjs       # 护栏/RESP/CSV 离线单测（59 断言）
node test/service-tests.mjs   # service 集成（假宿主 bridge，25 断言）
node test/mcp-tests.mjs       # MCP 全链路（11 断言）
node test/smoke-real.mjs      # 真实三库 smoke（43 断言；需本机 13306/15432/16379 有测试库）
```

## 已知限制（v0.1）

- **手机/Web 远程端**：浏览器无法直连桌面 127.0.0.1 service，v0.1 移动端仅展示降级提示；完整功能请在桌面端使用（连接列表经 kv 三端可见，为后续中继形态留了数据基础）。
- 不含 SQL 补全/格式化（纯 textarea）、可视化建表、MongoDB/SQLServer、SSH 隧道、查询计划可视化。
- `information_schema` 估算行数非精确值（引擎统计），需要精确值请 `SELECT COUNT(*)`。
- MySQL 8 caching_sha2_password 已实测覆盖（空密码与带密码两条路径）；`sha256_password` 未覆盖。
- 密码以明文存本机服务侧文件（与 DBeaver 等客户端同级；文档明示，不做伪加密）。设备共享环境请勿勾选「记住密码」。

## 设计文档

见 `docs/db-workbench-plan.md`（选型证据、护栏模型、验收标准）。
