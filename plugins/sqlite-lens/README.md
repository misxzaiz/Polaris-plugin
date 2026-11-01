# SQLite 检查台（sqlite-lens）

把散落在磁盘各处的 `.db / .sqlite / .sqlite3` 文件变成可打开、可对话的本地数据库检查台。

- **库雷达**：预算制扫描常见目录（或指定根），读文件头区分真 SQLite 库与碰巧同名的文件，按大小排序，一键打开。
- **数据浏览**：表清单 + 数据网格（分页 / WHERE 过滤 / 点列头排序），NULL 与 BLOB 显式标注——连接**永久只读**。
- **SQL 查询**：只读通道即跑即得；无 LIMIT 的 SELECT 自动包裹防全量倾泻；写语句被闸门拒绝并自动转两步写预览；查询历史跨端共享。
- **AI 八工具**（MCP）：`sqlite_radar / sqlite_open / sqlite_schema / sqlite_query / sqlite_stats / sqlite_write / sqlite_confirm / sqlite_export`——AI 可以对话式查库、按两步闸改库、导出 CSV/JSON。
- **维护**：页统计（空闲页 → VACUUM 可回收空间）、quick_check 完整性、手动备份、VACUUM（先强制备份）。

## 安全模型（针对 DB4S「Write Changes 丢工作」类事故的针对性设计）

1. **浏览连接永久只读**（`readOnly: true`）——翻表不可能改库；
2. **两步写**：预览（事务内执行→回滚验证，返回影响行数）→ 待确认单（10 分钟 TTL）→ 用户确认才提交；AI 的工具描述里明示「必须把预览给用户看，经同意才能 confirm」；
3. **UPDATE/DELETE 无 WHERE 直接拒绝**（确需全表写 `WHERE 1=1`）；多语句一律拒绝；
4. **写前自动整库备份**：每个文件每次服务生命周期备一次到 `<数据根>/sqlite-lens/backups/`（优先 `node:sqlite backup` API，回退文件复制）；
5. **审计全留痕**：`sqltl.audit`（打开/提交/失败/备份，cap.kv 跨端可见）；
6. **防倾泻**：无 LIMIT 自动包裹 + 行×列单元预算；
7. **零外网**：服务只监听 `127.0.0.1` + token（token 持久化在 `sqltl.meta`，重启不换）；不支持的 PRAGMA（`writable_schema`/`wal_checkpoint`/赋值类）一律拒绝。

## 架构

```
面板 ─┬─ cap.kv（sqltl.*：libs 清单/qhist/audit/pending 镜像）——跨端可见
      └─ 127.0.0.1:<meta.port> 直连（api-bench 双平面，桌面优先）
MCP  ── 同上直连；服务不在时经 cap.pluginServiceManager 自举启动
服务 ── node:sqlite（node ≥ 22.5 内置，零 npm 依赖）+ kvclient 自发现桥
```

- `shared/lens-core.js`：单一权威——SQL 闸门（`splitStatements` 先剥注释再按字符串感知分割 / 只读白名单 / 写类白名单 / WHERE 强制 / LIMIT 包裹）、行整形（BLOB/NULL/超长截断）、CSV(RFC4180+BOM)/JSON 序列化、已知应用签名（Chrome/Edge/Firefox/VS Code/微信/Steam 等 9 组，≥2 表命中才标注，不硬猜）。
- `service/lens.js`：HTTP 服务。浏览连接永久只读；写走短命 RW 连接；待确认单**内存权威 + kv 镜像**（桥抖动不断两步写，服务重启后镜像兜底可确认）；`node:sqlite` 不可用时健康端点仍 200 防误杀（meta 标 degraded）。
- `service/kvclient.js`：与 disk-radar 同款自发现（anchor.json → config.json → 端口上扫 25 个，Bearer md5）。
- `mcp/server.js`：stdio MCP（2024-11-05），协议数据只走 stdout。
- `src/`：React 面板五 Tab（库雷达/数据浏览/SQL 查询/维护/设置），esbuild external react（宿主 shim 注入）。

## 键空间契约（cap.kv，前缀 `sqltl.`）

| 键 | 内容 | 写者 |
|---|---|---|
| `sqltl.meta` | 心跳：version/port/token/startedAt/degraded | 服务（60s） |
| `sqltl.settings` | radarRoots/autoBackup/queryLimit/cellBudget | 服务（面板经 /api/settings 改） |
| `sqltl.libs` | 已打开库清单（LRU，≤30） | 服务 |
| `sqltl.qhist` | 查询历史（≤50） | 服务 |
| `sqltl.audit` | 写审计（≤100） | 服务 |
| `sqltl.pending.*` | 两步写待确认单镜像（10min TTL） | 服务（内存为权威） |

## 已知边界（如实）

- 需要 **node ≥ 22.5**（`node:sqlite` 内置）；低于此版本服务降级并在面板明示。
- 不支持加密库（SQLCipher）——魔数校验直接拒绝并说明。
- 查询结果列名来自对象键：**同名列的 JOIN 会丢失重复列**（别名即可规避）。
- WHERE/写 SQL 是自由文本（与 SQL 编辑器同等信任级）；排序列经白名单校验，防注入。
- 手机端面板可见库清单/历史/审计，但交互操作桌面优先（库文件在桌面）。
- 活跃库（如运行中的 Chrome）可能拒绝连接或只读到 WAL 快照——如实报错，不重试轰炸。

## 验证

```bash
node test/run-tests.mjs      # 离线单测 114 断言（含真 node:sqlite 服务集成）
npx tsc --noEmit             # 面板类型检查
npx esbuild src/index.tsx --bundle --format=esm --outfile=dist/panel.js --jsx=automatic --external:react --external:react/jsx-runtime
node test/smoke-real.mjs     # 真桥冒烟 12 步（需本机 Polaris 在跑；跑完自清理 sqltl.* 键）
```
