# SQLite 检查台（sqlite-lens）设计方案

> 2026-11-02 定案。方向闸通过（技术工具/诊断/变换，非台账记录类）；生态查重通过（74 插件中无本地 SQLite 文件工具，relay-devkit 的 db.js 仅覆盖在线 MySQL/Supabase）。

## 一、产品定位

- **名称**：SQLite 检查台（id `sqlite-lens`，直白功能名）
- **一句话**：把散落在磁盘各处的 `.db/.sqlite/.sqlite3` 文件变成可打开、可对话的本地数据库检查台——雷达自动发现库文件、浏览器翻表看数据、SQL 即跑即得、AI 经 8 个 MCP 工具对话式查库/两步安全写/导出、维护页看清文件膨胀与完整性。全程零外网、默认只读、写前自动备份。
- **目标用户**：开发者（调试应用数据库）、AI 重度用户（让 AI 直接查库取证）、高级用户（查看/清理浏览器与桌面应用数据）。
- **核心痛点**：
  1. SQLite 文件无处不在（全球部署量第一的数据库引擎），但没有一个「在工作台里顺手就能开」的检查工具——DB4S 是独立应用，装了还得切窗口；
  2. 现有工具有实证的丢工作/锁库困惑（r/KeePass 警告「几小时的查询没点 Write Changes 就全没了」、SO「库被 DB4S 锁住」）；
  3. AI 查库要单独配 MCP 服务器（PulseMCP 收录 263 个 SQLite MCP 服务器——需求真实且大），每个客户端都要配置一遍。
- **差异化**：面板浏览器 + 库文件雷达 + AI 对话查库 + 两步安全写 + 写前备份 + 跨端清单，六合一装进 Polaris，零外部依赖（node:sqlite 内置）。

## 二、MVP 边界

**做**：雷达扫描发现库文件（预算制遍历 + 已知应用签名标注）；只读浏览（schema/数据分页/过滤）；SQL 查询（SELECT/WITH/EXPLAIN/只读 PRAGMA，无 LIMIT 自动包裹防全量倾泻）；两步写（预览→确认，UPDATE/DELETE 强制 WHERE，写前自动备份文件）；导出 CSV/JSON；维护（页统计/快速完整性检查/备份/VACUUM）；AI 8 工具；审计日志；跨端清单（cap.kv）。

**不做**（明确排除）：加密库（SQLCipher）——检测到非 SQLite 魔数即报错；多语句脚本执行；数据库在线连接（MySQL/PG——relay-devkit 已覆盖）；图表可视化；自动定时扫描；文件监听实时刷新；SQL 编辑器智能补全（仅基础关键词提示不做）。

## 三、架构（复用 house 模式）

```
面板 ──(meta: 端口+token, cap.kv sqltl.meta)──► 直连 127.0.0.1:<port> HTTP（api-bench 模式，交互低延迟）
      └─ cap.kv（清单/历史/审计/待写确认——跨端可见）
MCP  ──同上直连服务；服务不在时经 cap.pluginServiceManager 自举启动
服务 ── node:sqlite（node>=22.5 内置，零 npm 依赖）+ kvclient（disk-radar 同款自发现）
```

- `shared/lens-core.js`：纯逻辑——SQL 闸门（单语句检测/WHERE 强制/语句分类）、行整形（BLOB/NULL）、CSV 序列化、已知签名表、KV 键名。服务/MCP/测试共用，单一权威。
- `service/lens.js`：HTTP 服务。浏览连接永久只读（`readOnly:true`）；写操作走独立短命 RW 连接 + 事务；预览=BEGIN 后执行取影响行数再 ROLLBACK；确认=先备份文件再真正 COMMIT。健康端点在 node:sqlite 不可用时仍 200（防误杀，disk-radar 同款），meta 标 degraded。
- `service/kvclient.js`：disk-radar 同款（anchor→config→扫端口 25 个，Bearer md5）。
- `mcp/server.js`：stdio MCP 2024-11-05，8 工具，直连服务 HTTP；带服务自举。
- `src/`：React 面板五 Tab（库雷达/数据浏览/SQL 查询/维护/设置），esbuild external react（house 标准三坑规避）。

## 四、安全模型（对 DB4S 实证缺陷的针对性修复）

1. **浏览连接只读**——不可能意外改库（修复「误改」）；
2. **两步写**——AI/面板写 SQL 先出预览（影响行数+抽样+回滚验证），确认才提交（修复「Write Changes 丢工作」）；
3. **UPDATE/DELETE 无 WHERE 拒绝**；DROP TABLE 走同一两步闸；
4. **写前自动备份**——首次对某文件写之前复制整个 .db 到 `<数据根>/sqlite-lens/backups/`，可恢复；
5. **审计**——每次写留 `sqltl.audit`（时间/文件/SQL/结果/影响行数），面板可查；
6. **防倾泻**——无 LIMIT 的 SELECT 自动包裹 `LIMIT`；行×列单元预算封顶；
7. **零外网**——服务只监听 127.0.0.1 + token；全部数据面走宿主通道或本机直连。

## 五、验收（三层验证 + 发布链）

1. 离线单测：SQL 闸门全分支/CSV 转义/签名匹配/待写过期/雷达过滤，≥80 断言全绿；
2. typecheck + esbuild 构建出 dist/panel.js；
3. 真宿主冒烟：health→雷达发现夹具库→open→schema→query→两步写（预览回滚+确认提交+备份存在）→导出→审计，全绿自动清理；
4. 五步发布链：pack/update.json/index.json(@main+sha256)/commit/push/purge(GET)/三验 200。
