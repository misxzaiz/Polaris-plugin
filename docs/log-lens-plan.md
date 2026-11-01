# 日志透视台（log-lens）产品与技术方案

> 2026-11-01 立项。方向硬约束自查：核心动作是「读取 / 过滤 / 聚类 / 诊断 / 取证」——诊断与变换类，非记录台账类，合规。
> 命名纪律自查：显示名「日志透视台」为直白功能名，id `log-lens`。

## 一、产品定位

**一句话**：把本机散落的日志文件（服务日志/构建输出/插件运行日志）变成可对话、可透视、可取证的诊断资产——流式读取不整载、级别/关键词/正则三维过滤、错误聚类、实时 tail，AI 经 MCP 直接取证（「看看今天的日志哪里不对劲」），数据不出本机。

**目标用户**：
1. 本机跑着多个服务/构建/插件的开发者（Windows 上尤其缺顺手的日志工具）；
2. Polaris 用户/插件开发者——宿主与插件服务本身持续产日志（实测本机数据根 955MB），排障全靠手动 grep；
3. AI 重度用户——让 AI 代劳「翻日志找根因」这种最费眼的活。

**现有解决方式与缺口**：
- 文本编辑器（Notepad++/VS Code）：多 GB 日志整载崩溃或极慢，无级别语义，无聚类。
- grep/tail（CLI）：Windows 无原生 grep，PowerShell `Select-String` 语法繁琐；多文件交叉取证全靠手敲。
- [lnav](https://lnav.org)：最强开源日志工具，但 [Windows 支持仍是实验性](https://github.com/tstack/lnav/discussions/1026)（需 WSL），终端门槛高，无 AI。
- [LogViewPlus](https://www.logviewplus.com/large-log-files.html)：Windows GUI 商业软件 **$93/用户**——付费意愿实证；无 AI 取证。
- 企业级（Graylog 等）：AI 日志分析年费万刀级，面向集群，个人本地场景错配。
- 本生态 66 插件无一做日志面（已占域核对：relay-devkit 是 API/JSON/SQL 工具箱，time-trail 是屏幕时间记录，weibian 是文档全文检索，disk-radar 是磁盘空间——日志分析零占位）。

**证据（外部）**：
- 排查/过滤日志被开发者称为「最费力的日常工作之一」（[Stack Overflow 高票讨论](https://stackoverflow.com/questions/4039344/searching-huge-log-files)）；
- 多 GB 日志打不开/吃内存是反复出现的求助主题（softwarerecs/superuser 多帖）；
- LogViewPlus 以「秒开 GB 级日志」为核心卖点收费 $93（付费意愿）；11 款桌面日志查看器对比（[LogoRRR](https://www.logorrr.app/desktop-log-viewers)）说明品类成立且各有缺口；
- AI 日志分析目前只存在于企业级平台（Graylog Enterprise ~$15k/年），本地个人级 AI 取证是空白。

**证据（内部，本机可查）**：
- `%APPDATA%/Polaris/logs` 实测 **955MB**（tracing 标准格式，逐日 0.3–4.5MB），`Polaris-dev/logs` 26MB，数据根另有各插件服务散落 `*.log`——安装即有真实语料；
- 本仓排障史（audit_sink 3GB 扫描 16 秒根因、detect_claude 风暴 11.3万条/天、mcp_tool_gates 挂起）全部靠人工挖日志定位——每次都是一次性脚本，没有沉淀工具。

## 二、候选池与评分（0-5 分 × 权重，满分 100）

| # | 候选 | 痛点20% | 频率15% | 缺口15% | 差异15% | 收益15% | 适配10% | 可行5% | 成本5% | 加权 |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **日志透视台** | 5 | 4 | 4 | 5 | 5 | 5 | 5 | 4 | **93.0** |
| 2 | WebSocket/SSE 调试台 | 4 | 3 | 3 | 3 | 3 | 5 | 4 | 4 | 74.0 |
| 3 | HTTP Mock 服务台 | 4 | 4 | 2 | 3 | 3 | 4 | 4 | 3 | 67.0 |
| 4 | 文件管道（watch→规则→动作） | 3 | 4 | 3 | 3 | 4 | 3 | 3 | 2 | 65.0 |
| 5 | SQLite 检查台 | 3 | 3 | 3 | 3 | 3 | 4 | 3 | 3 | 62.0 |
| 6 | 证书哨兵（TLS 到期） | 3 | 2 | 4 | 3 | 3 | 4 | 4 | 4 | 62.5 |
| 7 | 数据变换管道（jq 型） | 3 | 3 | 2 | 3 | 3 | 4 | 4 | 3 | 61.0 |
| 8 | 批量重命名台 | 3 | 3 | 2 | 2 | 3 | 4 | 5 | 4 | 59.5 |
| 9 | 正则工作台 | 3 | 3 | 3 | 2 | 3 | 4 | 5 | 5 | 59.5 |
| 10 | 压测小针（本地接口） | 3 | 2 | 3 | 3 | 3 | 4 | 4 | 3 | 60.5 |
| 11 | Cron 工作台 | 2 | 2 | 3 | 2 | 2 | 4 | 5 | 5 | 54.5 |
| 12 | QR 工坊 | 2 | 2 | 2 | 2 | 2 | 4 | 5 | 5 | 51.5 |

已占域剔除：API 客户端/JSON/SQL/MySQL（relay-devkit）、MCP 调试（mcp-probe）、Webhook 接收（webhook-station）、网络质量（net-sentinel）、主机监控/进程/端口（pocket-host）、磁盘空间（disk-radar）、文档全文检索（weibian）、屏幕时间（time-trail）、密钥扫描（keyscan）、上下文打包（context-pack）。

**选 #1 的理由**：唯一同时满足「付费竞品在卖（需求实证）+ 免费 GUI×Windows×AI 三缺口 + AI 取证是插件形态独占差异化 + 服务原生 fs 流式读零跨域面 + 安装即有真实语料（宿主自身日志）」的候选。
**最大不确定性**：真实用户是否用 Polaris 承载日志分析工作流。对冲：默认源自动发现数据根日志（装完即有价值，零配置）；AI 取证句式直击既有排障习惯。
**止损线**：>1GB 文件 tail 首屏 >2s 或内存超 150MB → 降级为「仅 tail+过滤」并如实标注；若实现中发现平台限制（服务 fs 权限等）→ 转 report-only。

## 三、MVP 范围

**做**：
1. **源管理**：默认源=数据根 `logs/`（app.log.*）+ 数据根散落 `*.log` 自动发现；用户可添加任意目录/文件（存 `lls.settings`）。
2. **读取**：流式（offset/chunk，绝不整载）；tail（从文件尾反读）；分页 read（offset+limit+过滤）；实时 tail（轮询 watch，间隔可调）。
3. **过滤**：级别（TRACE/DEBUG/INFO/WARN/ERROR/FATAL 多选）+ 关键词（子串）+ 正则三维度，服务端执行。
4. **透视**：级别直方图、按小时时间线、错误聚类 Top N（数字/UUID/引号串/十六进制/IP 归一化分组）、点击聚类→带过滤跳回。
5. **详情**：行上下文展开（前后 N 行）、复制单行/片段、格式感知（tracing/通用时间戳/JSONL/纯文本四级解析）。
6. **字符集**：BOM（UTF-8/UTF-16LE）→ UTF-8 校验 → GBK 回退（中文 Windows PowerShell 日志实证坑）。
7. **AI 六工具**：log_overview / log_tail / log_search / log_stats / log_errors / log_context（全只读）。
8. **安全**：服务仅绑 127.0.0.1、零 CORS 头（面板经 cap.http 宿主通道）、响应行数/字节双上限、全程只读不写日志文件。

**不做（明确出界）**：日志采集器/SDK（不改宿主日志管线）、写操作（删除/轮转/隔离区——后续版本再议）、远程主机日志（pocket-host 领域）、结构化查询语言（类 SQL over logs——过度设计）、告警推送、跨机器汇总、日志脱敏改写（只读原样，AI 摘要时自行脱敏）。

## 四、架构（三件套 + 双通道）

```
┌─ 面板 React (dist/panel.js) ─────────────────────────────┐
│  文件树/过滤条/虚拟列表/详情抽屉/透视面板/设置             │
└──────┬───────────────────────────────────────────────────┘
       │ window.__POLARIS_HOST_INVOKE__ → router_dispatch
       ▼
   cap.http（宿主后端 reqwest，no_proxy 回环直连，无 CORS 面）
       │ GET http://127.0.0.1:9870/api/*
       ▼
┌─ 服务 node (service/main.js，type=http，manifest port 9870) ─┐
│  reader.js 流式读取（tail 反读 / read 窗口 / watch 增量）      │
│  parser.js 格式解析（tracing/通用/JSONL/纯文本 + 多行归并）    │
│  analyze.js 统计聚类（直方图/时间线/归一化聚类）               │
│  charset.js 字符集（BOM/UTF-8/GBK）                           │
│  心跳 → cap.kv lls.meta { port, dataRoot, version }           │
└──────┬───────────────────────────────────────────────────────┘
       │ ①直接 http.request 127.0.0.1:9870（MCP→服务，同机零跨域）
       │ ②cap.kv lls.* 键空间（设置持久化 + 心跳）
       ▼
┌─ MCP stdio (mcp/server.js) ─────────────────────────────────┐
│  六工具 → 服务 HTTP（单一读路径权威；服务未起→明确报错引导）  │
└─────────────────────────────────────────────────────────────┘
```

- **单一读路径权威**：所有文件解析/统计只在服务进程发生；MCP 与面板都是服务的客户端，杜绝双写路径与解析口径漂移。
- **跨端边界（如实）**：日志在本机磁盘，Web/手机端 cap.http 对 Remote 默认 deny → 面板检测到后显式提示「日志透视台仅桌面端可用」，不假装修可用。
- **kv 键空间**（前缀 `lls.`，全局 domain 里不冲突）：`lls.settings`（源列表/轮询间隔）、`lls.meta`（心跳/端口/版本）。数据面不经 kv（大文本不走宿主总线）。
- **端口**：manifest `9870`（全仓已占 9860/9861/9862/9867/9869/9872，实测无冲突）；服务心跳把实际端口写进 `lls.meta`，面板/MCP 读 meta 回退 manifest 端口。

## 五、接口设计

**服务 HTTP（全部 GET，除 sources 外只读）**：
| 端点 | 参数 | 返回 |
|---|---|---|
| `GET /__health` | — | `{ok,version}` |
| `GET /api/sources` | — | `{dataRoot, files:[{path,size,mtimeMs,source}], settings}` |
| `POST /api/sources/add` `POST /api/sources/remove` | `{path}` | 更新 `lls.settings` 并重扫 |
| `GET /api/tail` | `file,maxLines(≤500),level?,q?` | `{entries,nextOffset,encoding,format,truncated}` |
| `GET /api/read` | `file,offset,limit(≤500),level?,q?,regex?` | 同上 + `scannedBytes` |
| `GET /api/watch` | `file,offset` | `{grown,newEntries,newOffset}`（面板 1.5s 轮询） |
| `GET /api/stats` | `file` | `{levels,hourly,clusters,approximate?,sampledBytes}` |
| `GET /api/context` | `file,offset,before(≤50),after(≤50)` | `{entries}` |

行数/字节双闸：每响应 ≤500 行且 ≤2MB；`stats` 对 >100MB 文件采样（头/中/尾三段各 ≤30MB）并标 `approximate:true`。

**MCP 六工具**（description 写「适用句式」）：
1. `log_overview` — 服务状态 + 数据根日志清单（文件/大小/今日 ERROR 数概览）。适用：「日志在哪」「今天有没有报错」
2. `log_tail` — 某文件最后 N 行（可级别过滤）。适用：「看最新日志」「服务起来了吗」
3. `log_search` — 关键词/正则跨文件搜索。适用：「找出所有 timeout」「搜连接被拒绝」
4. `log_stats` — 级别直方图 + 小时时间线 + 错误聚类 Top N。适用：「日志哪里不对劲」「错误分布」
5. `log_errors` — 最近 ERROR/WARN 聚类分组（取证主力）。适用：「为什么失败」「把报错归个类」
6. `log_context` — 某行前后上下文。适用：「这条报错前后发生了什么」

工具描述统一提示：日志可能含密钥/PII，AI 摘要时对敏感字段脱敏；全只读无副作用。

## 六、解析与性能预算

- **tracing 主格式**：`^(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)\s+(LEVEL)\s+([target:]+):\s?(.*)$`；不匹配头的连续行归并进上一条（span/pretty JSON 场景）。
- **格式探测**：首 200 行采样，tracing → 通用时间戳（`YYYY-MM-DD HH:mm:ss` + level 关键词）→ JSONL → 纯文本（关键词推断级别），≥60% 命中即定格式，响应带 `format` 字段。
- **性能预算**（验收硬指标，4.5MB 实测文件）：tail 500 行 <100ms；关键词搜索全文件 <1s；stats 全量 <3s；tail 内存增量 ≤8MB/请求。>1GB 文件 tail 仍走尾部分块反读，首屏 <2s（止损线）。
- **反读实现**：从 EOF 起按 64KB 块前跳，凑够行数或到 BOF 即止；`watch` 增量用 `fstat.size - offset` 差值读，文件截断（轮转）检测 size<offset → 重置。

## 七、安全与隐私

- 只读：服务代码零 `writeFile/unlink/rename` 路径（测试断言守护）。
- 仅绑 `127.0.0.1`，响应不带任何 CORS 头（浏览器直连一律拒；面板走 cap.http 宿主面）。
- 响应行数/字节双上限 + 单请求扫描字节上限（512MB 硬顶）。
- 不采集不外发：服务零外部网络调用（测试断言守护）。
- 日志内容敏感：MCP 描述内嵌脱敏提示；面板详情抽屉提供一键「复制时脱敏」（token/key/password 键值掩码）。

## 八、测试与验收（三层验证 + 发布链）

1. **离线单测**（`node test/run-tests.mjs`，零依赖）：parser 四格式+多行归并、reader 反读/增量/轮转检测、analyze 聚类归一化、charset 三分支、sources 校验、只读断言（服务源码无写调用）。
2. **typecheck + 构建**：`tsc --noEmit` + esbuild 产 dist/panel.js。
3. **真桥冒烟**（`node test/smoke-real.mjs`）：起真实服务（node service/main.js）对本机真实 Polaris 日志跑 tail/search/stats/context/断言预算；spawn MCP stdio 全握手 + 六工具逐个真调；cap.kv 心跳桥验证（需宿主在跑）。
4. **发布链**：pack.js → update.json 同步 → index.json 条目（@main URL + 实测 sha256，随 commit 入库）→ commit → push + purge CDN + 三 200 实测。

## 九、风险与止损

| 风险 | 概率 | 对策 |
|---|---|---|
| 大文件性能不达标 | 中 | 采样模式 + 硬字节顶；降级路径已写明 |
| 服务端口被占 | 低 | 心跳 meta 报实际端口；面板/MCP 以 meta 为准 |
| Remote 端（手机）不可用 | 确定（cap.http deny） | 面板显式提示，不假装修可用 |
| GBK/混合编码误判 | 中 | 采样置信检查 + 响应带 encoding 字段供 UI 标注 |
| 用户无此工作流 | 低（内部排障史反证） | 默认源零配置上手；工具代码本身可独立当 CLI 用 |
