# db-workbench · 数据库工作台 spec（v0.1.0）

日期：2026-11-03 ｜ 状态：已定案待实施 ｜ 方向硬约束：技术工具类（变换/诊断），非台账

## 一句话

把「连本机/远程 MySQL·PostgreSQL·Redis 查个数据、看个表结构、让 AI 帮我查」变成 Polaris 里 30 秒内完成的事：连接 profile 一次配置，面板即查即导出，AI 经 MCP 工具用一句话查库——数据不出本机，护栏默认只读。

## 为什么是它（证据摘要）

1. **品类活跃且正转向本插件形态**：「chat with your database」2025 年是活跃增长品类（Chat2DB / Vanna / DB-GPT / AskYourDatabase），趋势明确是「进入 IDE + MCP 集成」（Microsoft 2025-06 Azure SQL 博客、VSCode 数据库扩展生态繁荣）。
2. **现有方案缺口**：DBeaver 臃肿老旧（社区共识）、TablePlus 收费闭源、Beekeeper 功能浅；独立客户端=切应用+重启动；AI 客户端（Chat2DB）需单独配 key。
3. **生态零覆盖**：Polaris 商城 89 个插件无任何 SQL 数据库客户端（仅 sqlite-lens 覆盖单文件 SQLite；data-query 覆盖 CSV/JSON 文件），连接型数据库（MySQL/PG/Redis）是最大空白类目。
4. **平台能力已验证**：node service 进程出站 net/tls 有先例（net-sentinel TCP 探测、stream-desk WS 客户端）；面板直连自家 127.0.0.1 service + 服务端放行 CORS 有先例（pocket-drop）；MCP 经 cap.kv 发现 service 有先例（mock-server / api-bench 单槽信箱与 kvclient 端点自发现）。

淘汰对照：SSH 终端台 ~68 分（pty 流式链路未验证+口袋主机半覆盖）；AI 网关 ~61 分（LiteLLM/One API 赛道拥挤且运维面广）。

## 目标用户与场景

- 后端/全栈开发者：联调时查数据、看表结构、导出一批行给同事。
- AI 重度用户：对 Polaris 说「orders 表上个月金额前十的用户」→ AI 经 MCP 只读查询并解读。
- 运维/值班：手机上打开同一面板看库的状态（表大小/连接数/慢查询历史）。

## 架构（双进程 + 面板，全部 house 既有范式）

```
面板(React, dist/panel.js)
  ├─ 直连 127.0.0.1:<port> service（CORS 由 service 放行，Bearer token）
  └─ 经宿主 invoke → cap.kv 读 dbl.service（{port,token} 发现信息）
service(node http, 绑 127.0.0.1)
  ├─ drivers/mysql.js   (mysql2, vendor 打包)
  ├─ drivers/pg.js      (pg, vendor 打包)
  ├─ drivers/redis.js   (RESP2 手写, 零依赖)
  ├─ guard.js           (SQL 护栏: 分类/白名单/limit 注入/行数上限/超时)
  ├─ pool.js            (per-profile 连接池, 懒建/复用/空闲回收)
  └─ store.js           (profile 元数据→cap.kv; 密码→本地文件, 永不进 kv/AI)
mcp/server.js (stdio JSON-RPC)
  └─ 经 cap.kv 读 dbl.service 发现信息 → 直调 service 的 /mcp/* 只读端点
```

## 护栏模型（生产级安全核心，三方同源 shared/core.js）

1. **默认只读**：语句分类 read / write / ddl / admin / unknown；只读模式只放行 read。
2. **写模式显式开启**：profile `allowWrite` + 面板开关双闸；UPDATE/DELETE 无 WHERE 拒绝；DROP/TRUNCATE 需 `confirm:true`。
3. **多语句拒绝**：剥注释与尾分号后必须单条。
4. **LIMIT 注入**：顶层 SELECT 无 LIMIT 自动 append `LIMIT 1001`，>1000 行标记截断。
5. **行/单元格上限**：结果最多 1000 行、单元格 >4KB 截断标记。
6. **超时**：查询 15s 超时并取消（mysql query timeout / pg statement_timeout / redis socket destroy）。
7. **AI 永远只读**：MCP 走 `/mcp/*` 独立路由组，service 内强制只读，与面板写模式无关。
8. **Redis 命令白名单**：只读集合（GET/SCAN/TTL/TYPE/HGETALL/ZRANGE/INFO 等）默认放行；写命令需 allowWrite；SCAN 强制 COUNT 上限。
9. **凭据隔离**：profile 元数据（无密码）入 cap.kv 三端可见；密码仅在勾选「记住」时写 `appConfigDir/db-workbench/credentials.json`（仅 service 进程读写），kv/AI/面板返回值永不含密码；未记住密码的连接 MCP 调用时返回明确错误。
10. **AI 无法添加连接**：MCP 无 add/test 连接工具（防内网探测）；连接管理仅面板可操作（token 鉴权）。
11. **日志脱敏**：错误/历史/日志不含密码与完整连接串。

## MVP 范围

**做**：MySQL 5.7/8.x + PostgreSQL 12+ + Redis 5-7；连接 CRUD/测试/状态；schema 浏览（库→表→列→索引，行数用估算值）；SQL 查询+结果表格+CSV/JSON 导出+历史；Redis 键浏览（SCAN 分页/TTL/类型/值预览）+ 白名单命令；MCP 六工具（connections/tables/describe/query/redis/selftest + history）。

**不做**（v0.1 边界）：SQL 补全/格式化（仅行号 textarea）、可视化建表编辑、数据写回 UI（写模式仅 SQL）、MongoDB/SQLServer/Oracle、SSH 隧道连接、查询计划可视化、连接池指标监控。

## 验收标准

1. 离线单测全绿：护栏分类矩阵 ≥40 断言、RESP 编解码、CSV 转义、掩码逻辑。
2. service 测试：无 token 401、护栏拒绝矩阵 422、健康检查。
3. 真实连通 smoke：本机起 MySQL 8 + PostgreSQL 16 + Redis 5，建库表→插数→查询→导出→redis SET/GET/SCAN 全链路断言。
4. MCP 往返：tools/list 七工具、query 走真库返回行、写语句在 MCP 通道被拒。
5. typecheck + esbuild 构建通过；pack 产 zip + sha256。
6. 五步发布链：pack → update.json 同步 → index.json 条目（@main URL+实测 sha256）→ commit → push + purge CDN + 三 URL 200 实测。

## 已知风险

- mysql2/pg vendor 打包体积（估计 zip 后 <1MB，可接受；若超 3MB 再裁剪 charset 数据）。
- MySQL 8 caching_sha2_password 认证路径必须用真 MySQL 8 验证（MariaDB 不覆盖此路径）。
- 手机端面板经宿主 invoke 读 kv 发现 service——但手机浏览器无法直连桌面 127.0.0.1；v0.1 手机端仅支持读 kv 中的连接列表与查询历史（标注「桌面可用全部功能」），与 pocket-host「面板数据走 kv」不同源说明必须在 README 写清。
