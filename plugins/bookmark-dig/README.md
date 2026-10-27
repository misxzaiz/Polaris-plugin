# 书签考古（bookmark-dig）

> 把积灰的浏览器书签变成可考古、可体检、可复活的活资产。核心循环：**导入 → 体检 → 去重/分类 → 死链清理 → 每日挖出重访**。

## 功能

- **导入**：浏览器书签管理器 → 导出书签（HTML，Chrome/Edge/Firefox 通用 Netscape 格式）→ 面板选文件或桌面端给绝对路径（AI 可用 `dig_import_path`）。解析含文件夹层级、秒级时间戳、HTML 实体；忽略 ICON。
- **体检**：后台服务并发检查每条链接（默认并发 6、超时 12s、GET 限读 64KB），状态分为存活/重定向/4xx/5xx/域名失效/超时/证书错误/内网拒检/非法 URL；单条失败重试计数，不堵队列；运行清单持久化，服务重启断点续跑。
- **去重**：URL 规范化（去跟踪参数 utm_*/fbclid/gclid/spm、去碎片/默认端口/尾斜杠、参数排序）后按 normKey 幂等合并；保最早收录时间、更完整标题。
- **分类**：域名启发式（代码仓库/技术社区/文档/视频/论文/…）；AI 可用 `dig_tag` 覆盖标签。
- **死链治理**：死链按域名聚合报告；「只重查死链」区分暂时抽风与真死；删除必须 confirm。
- **今天挖出**：从活书签按「沉睡时长 × 书龄」加权随机捞一条重访并记录——考古的意义不是清单，是重逢。
- **AI 考古**（MCP 8 工具 `dig_*`）：stats/search/dead/resurface/import_path/check/remove/tag。读路径不依赖服务在线（直接读 kv 分块）。

## 架构（跨域根治点）

```
面板（React bundle，宿主 invoke 通道；绝不直接 fetch 外网）
  └─ cap.kv bmd.* 分块存储 ←→ 后台服务（并发体检引擎，原生 fetch + SSRF 守卫）
                                  └─ MCP server（AI 工具层，stdio；读路径直连 kv）
```

## 键空间契约（权威表——三方一致，改动须同步）

| 键 | 写者 | 读者 | 说明 |
|---|---|---|---|
| `bmd.settings` | 面板/MCP | 服务 | 全局设置（30s 热读） |
| `bmd.meta` | 服务 | 面板/MCP | 心跳（60s）+ 库概况 |
| `bmd.rec.<n>` | **服务单写** | 面板/MCP | 记录分块（≤200 条/块；键数纪律见插件工坊） |
| `bmd.run` | 服务 | 面板/MCP | 当前运行清单（断点续跑） |
| `bmd.report.<runId>` | 服务 | 面板/MCP | 运行报告（保留 5 份） |
| `bmd.cmd.import.<seq>` | 面板 | 服务（先删后做） | 导入分批（≤400 条/批，按 seq 有序合并） |
| `bmd.cmd.<op>.<nonce>` | 面板/MCP | 服务（先删后做） | import_path/check/recheck_dead/recheck_ids/remove/tag/visit/wipe |
| `bmd.result.<nonce>` | 服务 | 面板/MCP | 命令结果 |

单写者纪律：`bmd.rec.*/bmd.run/bmd.report` 只由服务写；面板/MCP 的一切变更走命令键（先删后做，幂等）。

## 安全

- **SSRF 守卫**（`shared/dig-core.js isFetchableUrl`，单测覆盖）：只抓公网 http(s)；拒环回/10/172.16-31/192.168/169.254（云元数据）/0.0.0.0/100.64-127/CGNAT/IPv6 内网（fc/fd/fe80/::1）/localhost/.local/.internal/file:/javascript:/带凭证 URL。
- 抓取限响应体（64KB 后 cancel）、超时必设、UA 标识、并发 ≤12。
- 删除/清空双 confirm（MCP 侧 + 面板侧）。
- 数据全部本地 cap.kv，不出设备；体检只发 GET，不上传书签数据。

## 开发

```bash
npm install
npm run typecheck
npm run build
node test/run-tests.mjs     # 离线单测 22 条（解析/规范化/守卫/合并/计划/统计/复活）
node test/smoke-real.mjs    # 真实桥冒烟（需本机 Polaris 运行中 + 外网；自清理）
```

## 服务日志（排障入口）

`<appConfigDir>/bookmark-dig.log`（Windows 一般 `%APPDATA%/Polaris/`；512KB 轮转 `.old`）。

## 已知边界

- 体检用 GET 有限读取判定存活，不解析页面内容（体积与礼貌考虑）。
- 404 判死基于单次响应，个别站点对机器人返回 403/404 的会被误标——「只重查死链」可复核，状态含义见概览图例。
- 大书签库（>6000 条）未测：kv 单值护栏 256KB 量级，idx 免维护设计下应可扩展，但未验证。
- 手机端导出复制走「手动复制」回退（非安全上下文限制，与接力板同因）。
