# 磁盘雷达（disk-radar）

把磁盘变成可对话的空间资产：快照式空间解剖 + 增量「谁偷了我的磁盘」+ 开发垃圾猎手。
AI 只读报告，删除永远是人手两步确认（移入隔离区 → 彻底删除）。

## 它解决什么

- **空间被谁吃了**：矩形树图 + Top 目录，点哪钻哪（实时细查任意目录）。
- **最近被谁吃掉的**：每根周期快照，两次完整快照之间按目录归因增减——WizTree 类工具没有的时间维度。
- **哪些能安全回收**：node_modules / target / dist / bin+obj / 各类缓存专项清点，**按兄弟文件锚定判定**（`target` 旁必须有 Cargo.toml、`bin/obj` 旁必须有 .sln/.csproj）——可解释、低误报；pnpm store 等全局缓存给专用建议。
- **删得放心**：隔离区 = 同卷 rename（瞬间完成、可恢复）；「彻底删除」需二次确认；**AI 工具全部只读，没有删除类工具**——AI 负责「报告+解释+建议」，按钮永远在人手里。
- **跨端**：数据全在 cap.kv，手机打开同一面板看到同一份磁盘状态与垃圾清单。

## 跨域/通道设计（为什么没有跨域问题）

| 层 | 方案 |
|---|---|
| 数据面 | 一切状态/快照/清单走 cap.kv（`diskrad.*`），面板/MCP/服务三方共享 |
| 面板 | **零直连 fetch**——唯一通道是宿主 `__POLARIS_HOST_INVOKE__` → router_dispatch（桌面 Tauri IPC / 手机 Remote 同契约） |
| 外网 | **零外网请求**——扫描是本地 fs 遍历（node 原生），不依赖 cap.http（避开 Remote 源 deny 陷阱） |

## 组成

- **后台服务**（`service/radar.js`，http 型 + `/__health`）：tick 消费命令键（先删后做）、执行扫描（预算+可取消+不中断降级）、快照/垃圾/state 持久化、隔离区机制、隔离区到期清理、保留清扫。零依赖。
- **MCP**（`mcp/server.js`，stdio）：`disk_overview / disk_top / disk_growth / disk_junk / disk_scan_start / disk_report` 六工具，全只读。
- **面板**（`src/` → `dist/panel.js`，React 18 零第三方库）：总览 / 空间地图（squarified 树图+下钻）/ 垃圾清理 / 历史（走势+归因）/ 设置五 Tab。

## 扫描语义

- 单次遍历同时产出：目录聚合树（记录 depth≤2）+ 开发垃圾清单（命中规则的目录作为垃圾帧，帧内不嵌套计条）+ 无权限/占用计数。
- 快扫预算 90s、深扫 10min、细查 ≤30s；超时落 `partial: true` 快照（增量归因只用完整快照）。
- 不跟随 symlink；junction 靠深度硬上限（40）兜底；Windows 旧版系统 junction 名单跳过；≥250 字符路径自动加 `\\?\` 前缀。
- EACCES/EPERM/EBUSY 降级为 `denied` 计数（面板显示「?」），绝不中断整树。
- 卷余量：`fs.statfs` 优先，失败退 `fsutil volume diskfree`，再失败置 null。
- 自动快照：每根每 `snapshotHours`（默认 24h）一次，错过只补最近一次。

## 垃圾识别规则（可解释）

| 目录名 | 类型 | 锚定（兄弟文件须存在其一） |
|---|---|---|
| node_modules | 依赖包 | package.json / 各 lock / pnpm-workspace.yaml |
| bower_components / .venv / venv | 依赖包 | 无 |
| target | 构建产物 | Cargo.toml / cargo.lock |
| dist / build / out | 构建产物 | package.json / tsconfig.json / Cargo.toml / pyproject.toml / setup.py / go.mod |
| bin / obj | 构建产物 | .csproj / .fsproj / .vbproj / .sln / .vcxproj（后缀） |
| .next .nuxt .turbo .parcel-cache .gradle .dart_tool cmake-build-* DerivedData | 构建产物 | 无 |
| __pycache__ .pytest_cache .mypy_cache .ruff_cache .ipynb_checkpoints | 缓存 | 无 |
| .pnpm-store pnpm-cache .npm-cache .yarn-cache | 缓存 | note：优先用包管理器自带 prune/clean |
| settings.extraJunkDirs | 自定义 | 无 |

设置里还可配「忽略目录名」（全深度不进入扫描与垃圾判定）。

## 删除安全模型

1. **移入隔离区**：`fs.renameSync(<root>/<rel>, <root>/.DiskRadarTrash/<itemId>)`——同卷原子、瞬间、可恢复。itemId = md5(relPath 小写) 前 12 位，重扫幂等。
2. **恢复**：rename 回原位；原位置已存在则报错不覆盖。
3. **彻底删除**：`rmSync(recursive, force, maxRetries)`，须显式 `confirm: true`（MCP 无此工具，只有面板按钮，双确认）；默认隔离 14 天后服务自动清理（可改 0=关闭）。
4. 路径守卫全部集中在 `shared/disk-core.js`（resolve 越界断言 / relPath 注入防线 / itemId 格式校验 / trashPathFor 唯一出口），单测覆盖越界样本。
5. 「文件被占用」（如开着 dev 服务的 target/）逐条报错不中断——关闭占用进程后重试；口袋主机可帮你定位占用者。
6. 移除扫描根**不删**盘上隔离区文件（先自行处理）。

## 键空间契约（权威）

前缀 `diskrad.`，服务是唯一写者（面板/MCP 经命令键表达意图）：

| 键 | 写者 | 内容 |
|---|---|---|
| `diskrad.settings` | 面板/MCP 写，服务读（30s 热载） | `{ autoSnapshot, snapshotHours, keepSnapshots, autoBudgetSec, deepBudgetMin, quarantineDays, extraJunkDirs[], excludeNames[] }` |
| `diskrad.roots` | 服务写（经 cmd.roots_add/roots_remove 原子改；清空即删键） | `{ roots: [{ id, path, label, addedAt }] }`，id = md5(resolve(path).toLowerCase()).slice(0,10) |
| `diskrad.scan` | 服务写（~1.5s 节流；空闲不存在） | 扫描进度 `{ id, path, kind, deep, bytes, files, currentPath, startedAt, updatedAt }` |
| `diskrad.state` | 服务写（每扫描后） | `{ roots: { [rid]: { total, files, lastScanAt, kind, deep, partial, prevTotal, prevAt, deltaBytes, junkBytes, junkCount, free, volumeTotal, lastError } }, updatedAt }` |
| `diskrad.snap.<rid>.<seq4>` | 服务写 | `{ seq, at, kind: auto/manual, deep, partial, total, files, dirs, junkCount, junkBytes, deniedFiles, deniedDirs, volume, elapsedMs }`；每根保留 `keepSnapshots` 份 |
| `diskrad.junk.<rid>` | 服务写 | `{ at, partial, rootPath, items: [{ id, relPath, name, kind, note?, bytes, files, lastWrite }] }`（≤500 条） |
| `diskrad.qman.<rid>` | 服务写 | `{ items: [{ id, relPath, name, kind, bytes, movedAt }] }` |
| `diskrad.cmd.<op>.<nonce>` | 面板/MCP 写，服务消费=**先删后做** | op：`scan / cancel / report / quarantine / restore / purge / roots_add / roots_remove` |
| `diskrad.result.<nonce>` | 服务写，请求方读后删（15min 兜底清扫） | `{ ok, at, payload?, error? }` |
| `diskrad.meta` | 服务写（60s） | 心跳 `{ version, pid, startedAt, lastTickAt, bridge, roots, scanning, queued, settings }` |

快照 `dirs` 树节点：`{ n: 名称, b: bytes, f: files, c?: 子节点, j?: 垃圾类型, d?: 1=无权限 }`，按 b 降序；节点预算 4000（超限每层保 top-64 并逐轮减半直到进预算）。

## 验证

```bash
npm install
npm run typecheck       # tsc --noEmit
npm run build           # esbuild → dist/panel.js（React external）
node test/run-tests.mjs # 离线单测（含真 fs 小树的 walkRoot 回归）
node test/smoke-real.mjs # 真实桥冒烟（须本机 Polaris 运行中；有护栏拒跑防误伤）
```

交付记录（2026-10-28）：单测 43/43、真实桥冒烟 22/22 全绿（扫描/快照/增量/垃圾/隔离→恢复→彻底删除全链路 + MCP 六工具闭环）。

## 已知边界（v1 不做）

- 不做重复文件查重（哈希成本高，留给 v2）。
- SVI/系统目录无权限如实计数为 denied（「?」），不做管理员提权深查。
- 不做自动/定时删除——一切删除人工两步。
- 隔离区不做跨卷移动（rename EXDEV 不支持）；扫描 OneDrive 占位文件时 lstat 尺寸可能为云上真实大小，仅影响数字不影响安全。
