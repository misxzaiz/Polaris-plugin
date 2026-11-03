# 数据查询台（data-query）

把本机散落的 CSV / TSV / JSON / JSONL / Parquet 文件导入为 DuckDB 本地表，真实 SQL（聚合 / JOIN / 窗口函数）即查即答；结果可导出（CSV 带 BOM，Excel 直开 / JSON / NDJSON）；AI 经 MCP 七工具问数。数据不出本机，引擎随包内置，全程离线。

## 形态

- **面板**：导入（填路径）/ 表列表（结构速览 + 预览）/ SQL 编辑（Ctrl+Enter 运行）/ 结果网格 / 导出。经宿主 `cap.http` 调本机服务，无 CORS。
- **服务**（`service/server.js`，127.0.0.1:9875）：查询 / 导入 / 导出的**单一路径权威**。引擎与工作区都在这里。
- **MCP**（`mcp/server.js`）：`dq_status` / `dq_tables` / `dq_schema` / `dq_import` / `dq_query` / `dq_export` / `dq_drop` 七工具，AI 直连本机服务。

## 关键语义

- **只读护栏**：查询必须以 SELECT/WITH 开头、单语句、写/装载关键词黑名单（注释 / 字符串字面量 / 标识符感知，防藏词也防误杀）。
- **编码探测**：BOM → 严格 UTF-8 试解码 → GBK 试解码；非 UTF-8 流式转码副本后导入（恒定内存）。
- **表名**：文件名主干清洗；CJK 转 `u+码点`（订单 → u8ba2u5355）防塌缩；同名再导入 = 覆盖刷新（幂等），异名自动去重。
- **工作区**：`<数据根>/plugins/data-query/workspace.duckdb` + `registry.json`。每次写操作后 CHECKPOINT 落盘——进程被 kill 重启数据不丢；重启后以 `duckdb_tables()` 对账恢复（日志即真相）。
- **导出护栏**：绝对路径 + 扩展名白名单 + 默认拒绝覆盖（`overwrite:true` 显式放行）+ 拒写插件内部文件 / 系统目录。
- **引擎**：`@duckdb/node-api` native binding（win32-x64 随包，`service/vendor/duckdb/`）。换版本：`npm install` 后 `npm run build:vendor` 重新同步。

## 已知边界（如实）

- v0.1 引擎仅随包 Windows x64；其他平台显式报错不静默。
- 查询不可中途取消（native connection 有 interrupt 能力，v0.1 未接）。
- 只读：不提供任何写路径（CREATE/INSERT/UPDATE 全被护栏拒）。
- `count(*)` 先于导出重复执行一次查询（v0.1 如实接受）。

## 本地验证

```
npm install
npm run typecheck        # tsc --noEmit
npm test                 # 离线纯逻辑单测（17）
npm run test:engine      # 引擎真测：导入/聚合/GBK/JOIN/幂等/导出/护栏/重启恢复（9）
npm run test:mcp         # MCP 全链路：真实 service + stdio 喂包（21）
node test/ssr-verify.mjs # 面板 SSR 渲染断言（6）
```
