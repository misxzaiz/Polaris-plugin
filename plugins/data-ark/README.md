# 数据方舟 data-ark

> 🛡️ Polaris 数据根的备份/恢复引擎——你的会话、记账、闪卡、哨兵配置、审计链，全都值得一份保险。

## 这是什么

Polaris 的一切状态都躺在数据根里（对话 JSONL、session-v2、cap.kv 的 SQLite、审计 JSONL、各插件数据、配置），目前没有任何备份机制。一次坏迁移、一次误删、一次磁盘事故就是不可挽回的损失。数据方舟把「备份」做成应用内的一等公民：

- **自动**：装好 90 秒后做第一份全量，之后按排期（每 N 小时 / 每天定时）自动增量，应用关机错过的调度启动后补跑一次。
- **省空间**：内容寻址去重存储（CAS）——每个文件按 sha256 存一份 gzip，不变的内容（语音克隆、历史会话、旧插件）在所有快照间共享；增量快照只记变化的文件。
- **可校验**：quick（对象存在性，秒级）/ deep（逐对象解压重算 sha256，全量核对）。
- **可恢复**：浏览任意快照的文件清单，按路径检索，勾选恢复到暂存目录。
- **AI 管家**：聊天里说「备份一下」「备份状态怎么样」「改成每天凌晨3点备份」「把上周三的 dialogs 恢复出来」。

## 生产级设计（本插件与玩具的分界线）

| 主题 | 设计 |
|---|---|
| 去重与增量 | 对象 `objects/<h2>/<sha256>.gz` 全库唯一；增量三级：manifest (size,mtime) 一致 → 不读文件直接继承哈希；需重读时先纯哈希（对象已存在即止）；仅新内容走 hash+gzip 单遍流式 |
| 热文件协议 | 单遍流式读 + 前后双 stat 比对；不一致重试 ≤3 次（退避），仍不稳定记 `skipped`（诚实标注），绝不炸整份快照 |
| 原子性 | 对象/manifest 一律 tmp+rename；manifest 最后写——崩溃最多留下孤儿对象（GC 回收），不会留下「看起来完整」的坏快照；启动清理 >1h 的 tmp 残留 |
| 单写者 | kv 租约（TTL 90s，30s tick 续约）；双 Polaris 实例共享 kv 时自动主备，备机不执行动作；服务退出主动释放租约 |
| 调度补偿 | `nextRunAt` 落 kv；错过任意多个周期只补跑一次（防风暴）；off/interval/daily 三种模式，本地时区 |
| 保留策略 | GFS（祖-父-孙）：日/周/月桶各留最新 + 永远保底最新两份；裁掉的快照连带 GC 无引用对象（>1 天护栏防竞态） |
| 容量治理 | 磁盘剩余空间预检（预估×1.2）；库占用超上限 → 先 GC，仍超 → degraded 暂停自动备份并明示原因 |
| 恢复安全 | 恢复只落 `<备份库>/restored/<stamp>/`，引擎**不存在任何覆盖数据根的代码路径**；替换回数据根由用户在应用关闭后手动完成 |
| 可观测 | 服务自落盘日志（512KB 轮转）、`/__health` 恒 200（degraded 用字段表达，不触发宿主重启循环）、kv 事件流（快照/校验/恢复/GC/降级/补偿，保留 50 条） |
| 安全 | manifest id 白名单校验防路径注入；恢复时 rel 路径防逃逸；对数据根全程只读 |

**一致性边界（诚实声明）**：快照是逐文件崩溃一致，不是跨文件事务。备份运行中的 SQLite（kv.db）按热文件协议处理（双 stat + 重试），能捕捉绝大多数稳定态，但极端并发写窗口仍可能拿到中间态。**恢复 SQLite 类活跃库前请先退出 Polaris**——这条已写进恢复页 UI 与 MCP 返回文案。

## 快速上手

### 面板（四 Tab）

- **快照**：立即备份 / 快速校验 / 深度校验 / 回收空间；快照清单（全量/增量徽章、文件数/变更数、逻辑大小/实存大小、耗时），展开看详情与单份校验。
- **恢复**：选快照 → 按路径检索 → 勾选/全部恢复 → 得到暂存目录路径 + 替换指引。
- **服务**：后台服务角色/租约/心跳/备份库占用，启动/重启/停止，事件流实时滚动。
- **设置**：备份库位置（建议另一个盘）、保护范围（一级条目开关 + 三种预设 + 额外 glob）、GFS 保留份数、调度模式、库上限、状态重置。

### 聊天（AI 侧，MCP 工具）

| 你说 | AI 做 |
|---|---|
| 「备份一下」 | `ark_backup_now`（异步触发）→ `ark_status` 查结果 |
| 「备份状态怎么样」 | `ark_status`（上次/下次/库占用/降级/事件） |
| 「有几份快照？都多大？」 | `ark_list_snapshots` |
| 「上周三的 dialogs 还在吗」 | `ark_list_files` + `ark_restore` → 暂存目录 |
| 「改成每天凌晨 3 点备份」 | `ark_settings set schedule:{mode:'daily',at:'03:30'}` |
| 「库快满了」 | `ark_settings` 收紧保留 + `ark_backup_now` 前先自动 GC |

## 备份库布局

```
<targetDir>/                          # 缺省 <数据根>/../polaris-ark
  objects/<h2>/<sha256>.gz            # 内容寻址对象（gzip level 1）
  snapshots/<snapId>.manifest.json    # 快照清单 {arkVersion, id, root, baseId, files[{p,h,s,m,c}], skipped, stats}
  restored/<stamp>/…                  # 恢复暂存（引擎唯一的写出口之一，绝不指向数据根）
```

默认排除：`logs/`、`cache/`、`plugins/`（可再下载/无价值）+ 内建恒排除（`*.lock`、`*.tmp`、`~$*` 等）。默认保护其余全部——在你这台机器上约 1.4GB 逻辑量（dialogs 267MB、session-v2 538MB、voice 357MB…），首份全量 gzip 后通常显著更小，之后每天增量只有变化的字节。

## 数据契约（cap.kv `dataark.*`）

| 键 | 值 | 说明 |
|---|---|---|
| `dataark.settings` | Settings | targetDir/excludeTop/extraExcludeGlobs/retention/schedule/maxStoreBytes（normalizeSettings 权威校验） |
| `dataark.state` | State | lease/nextRunAt/lastSnapshotAt/lastResult/lastVerify/degraded/resolvedTarget/storeBytes/objectsTotal |
| `dataark.snapshot.<id>` | SnapshotIdx | 快照索引摘要（manifest 本体在备份库磁盘） |
| `dataark.event.<ts>.<rand>` | Event | 事件流，滚动保留 50 条 |
| `dataark.cmd.*` / `dataark.cmd.result.<nonce>` | Cmd | 面板/AI → 服务的命令通道（先删后做，杜绝双跑；结果键读取后自删） |

面板与手机 Web 经 cap.kv 看到一致状态；快照/校验/恢复等磁盘动作只能由运行中的服务执行（手机上发起的命令会在桌面服务下一次 tick 被消费）。

## 开发

```bash
cd plugins/data-ark
npm install
npm run build         # 面板 → dist/panel.js
npm run typecheck     # tsc --noEmit
npm test              # ark-core 离线单测（glob/GFS/调度/摘要）
node test/smoke-real.mjs  # 真实环境全链路冒烟（需 Polaris 在跑；备份到临时目录，跑完自清理）
```

## 隐私与边界

- 备份库与数据根同机（默认同盘隔壁目录），不出设备、不上传——要不要异地同步由你自己决定（把 targetDir 指到网盘同步目录也可）。
- 快照内容即数据根内容（含全部聊天记录），请把 targetDir 放在有访问控制的位置。
- 服务对数据根只读；唯一的写动作发生在备份库目录内。
