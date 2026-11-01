# 定时任务台（task-runner）选型与设计

> 2026-11-02。一句话：把「重复该做的事」变成 Polaris 常驻代办的定时执行器——提醒 / HTTP 探测 / AI 提示词 / 命令行四类任务按计划自动执行，结果留痕三端可查，AI 对话式管理。

## 一、选型过程

### 1.1 硬约束过滤（用户 2026-11-01 定案）

台账/记录/复盘/CRUD/家庭生活类**一律不进候选池**。生态已有 69 个收录插件（另有 site-audit 并行会话在途），核心动作口诀：记录→淘汰；做成/变换/诊断/自动化→合格。

### 1.2 生态空白扫描（基于 index.json 全量 69 条 + plugins/ 71 目录）

开发/技术向能力已有归属（新插件不得重叠）：

| 能力 | 已有插件 |
|---|---|
| API 客户端 / JSON / SQL / 数据库管理 / 时间戳 | relay-devkit v1.5.1 |
| 接口压测 | api-bench |
| Webhook 入站捕获 | webhook-station |
| 日志透视（流式/过滤/聚类/tail） | log-lens |
| 密钥扫描 | keyscan |
| LLM 体检 | llm-probe |
| MCP 调试 | mcp-probe |
| 上下文打包 | context-pack |
| 磁盘 / 文件整理 / 备份 | disk-radar / file-flow / data-ark |
| 网络质量 / 主机监控 | net-sentinel / pocket-host |
| 网页变化 / 站点体检 / 书签体检 | page-sentinel / site-audit(在途) / bookmark-dig |
| PDF 两件套 / 图片变换 / 文档检索 | zhifang+pdf-tables / imgforge / weibian |
| 站点内提醒（仅提醒不执行） | sundial |
| 备份调度（仅自身备份） | data-ark |
| AI 供应商直连先例 | llm-probe（双协议引擎）、multichat（cap.ai.chat 面板直调） |

**结论：通用「定时自动化执行」为零覆盖**——没有任何插件能把任意动作按计划执行。data-ark 只调度自己的备份，sundial 只做提醒，feed-radar/page-sentinel 是固定用途轮询。宿主侧亦无调度能力上总线（needs/003 cap.scheduler 仍为 specd）。

### 1.3 候选池（≥10，硬约束过滤后）

| # | 候选 | 核心动作 | 淘汰/保留理由 |
|---|---|---|---|
| 1 | **定时自动化执行台** | 自动化执行 | ✅ **选定**。生态零覆盖 + 头部 AI 助手功能趋同验证 + 平台模式全部有先例 |
| 2 | HTTP Mock 服务器台 | 变换/仿真 | 生态缺第四象限，但 Mockoon 免费成熟，个人场景频次中低（64 分） |
| 3 | 本地 OCR 文字提取台 | 变换 | AI 视觉（image-recognition）+系统内置已覆盖大部分；tessdata 体积逼近 jsdelivr 20MB 限制（57 分） |
| 4 | 文件内容去重台 | 诊断 | dupeGuru 成熟；与 disk-radar 相邻（58 分） |
| 5 | 结构化数据变换台（CSV/JSON/YAML 管道） | 变换 | miller/在线工具成熟，relay-devkit JSON 工具相邻（61 分） |
| 6 | 编码/乱码修复台 | 变换 | 中文 Windows 真痛点但收益面窄，适合并入他插件而非独立（65 分） |
| 7 | OpenAPI 工作台 | 诊断 | 受众偏团队，个人助手场景频次低（53 分） |
| 8 | SQLite 文件工作台 | 诊断 | relay-devkit「数据库管理」相邻，撞域风险（≈55 分） |
| 9 | Git 仓库体检台 | 诊断 | 痛点分散，cap.git 宿主侧演进中（≈50 分） |
| 10 | 二维码工作台 | 变换 | commodity，单独立插件价值薄（≈45 分） |
| ❌ | HTTP 客户端 / 日志分析 / 网站体检 / 密钥扫描 | — | relay-devkit / log-lens / site-audit(在途) / keyscan 已覆盖，硬淘汰 |

### 1.4 加权评分（选中项详表，0-5 分）

| 维度 | 权重 | 分 | 依据 |
|---|---|---|---|
| 用户痛点强度 | 20% | 4 | 重复动作（巡检/归档/提醒自己做/定时拉数据）高频存在；Task Scheduler 痛点实锤但「能用」故非 5 |
| 频率与覆盖人群 | 15% | 5 | 自动化是 AI 助手核心承诺；每天多处触发场景；n8n 一年 100K→196K 星 |
| 现有方案缺口 | 15% | 5 | 生态 69 插件零覆盖；宿主无 cap.scheduler；Task Scheduler 无 AI/无跨端/错误报告差 |
| 可验证差异化 | 15% | 5 | AI 供应商直连任务 + 手机三端看结果 + 对话式增删查——Task Scheduler/cron 全没有 |
| 用户收益 | 15% | 4 | 每次自动执行省一次手工操作；结果可回看可追责（run history） |
| 平台适配 | 10% | 5 | 常驻服务 tick / kv 单写者 / 命令键 / MCP confirm / 提醒投影——全部有已交付先例 |
| 技术可行性 | 5% | 4 | 调度引擎纯 JS 可测；AI 直连有 llm-probe 双协议先例；唯一不确定项=宿主存活时段（诚实标注） |
| 开发维护成本 | 5% | 4 | 零第三方依赖（引擎/HTTP/spawn 全 node 内置），zip 预计 <100KB |

**加权得分 = 91/100**（次优候选 65 分，断层领先）。

### 1.5 外部市场证据（2026-11-02 检索）

- **头部 AI 助手功能趋同**：ChatGPT 2025-01 上线 Tasks（定时提醒+循环任务，免费用户也可每日一次）；Claude Cowork 随后上线 recurring tasks——「定时 AI 任务」成为 AI 助手标配方向。
  - https://help.openai.com/en/articles/10291617-scheduled-tasks-in-chatgpt
  - https://support.claude.com/en/articles/13854387-schedule-recurring-tasks-in-claude-cowork
- **自托管自动化需求爆发**：n8n 2025-05 破 100K star、年内翻倍至 ~196K，2025-10 完成 $180M C 轮——本地优先自动化是被资本与社区双重验证的需求。
  - https://opsily.com/blog/is-n8n-still-relevant
- **本机调度器痛点实锤**：r/sysadmin「notoriously not reliable」「clunky UI」「错误报告差」多帖反复；XDA 2025-08 专文推荐替代品。
  - https://www.reddit.com/r/sysadmin/comments/1ff79b3/reliable_alternative_to_windows_task_scheduler
  - https://www.xda-developers.com/apps-should-use-instead-windows-task-scheduler
- **「cron + prompt」成为公认模式**：Hermes Agent 官方 cron 指南、OpenClaw 定时 AI 工作流、社区热帖「AI agents is just a cron + prompt + webhook」；同时社区提醒「AI 自动化要可审查（run, review）」——支持本设计把运行历史做成一等公民。
  - https://github.com/NousResearch/hermes-agent/blob/main/website/docs/guides/automate-with-cron.md

### 1.6 关键假设与止损

- **假设 1**：用户希望任务结果跨端可见（手机看昨晚跑了没）——由 pocket-host/page-sentinel 同模式已交付先例支撑；若不需要，历史仅本机可见也不损失核心价值。
- **假设 2**：AI 任务直连供应商可用——llm-probe 双协议引擎先例；不可用时降级为三任务类型，插件仍成立。
- **假设 3**：宿主运行时段足以覆盖典型调度窗口（早晚/每小时）；关机错过只补一次（data-ark 语义），如实标注。
- **止损**：若服务 tick 在宿主侧不可靠（频繁判死重启），保留面板手动「立即执行」+ 运行历史的核心可用性，调度能力如实降级。

## 二、产品定义

- **名称**：定时任务台（id `task-runner`，icon `Clock`，order 69）
- **目标用户**：把 Polaris 常驻桌面的个人用户（含手机/Web 三端查看）
- **核心场景**：每天 8 点让 AI 总结昨夜日志；每 10 分钟探测接口是否恢复；每晚 23 点提醒归档下载夹；周一 9 点跑一条巡检命令
- **MVP 范围**：四任务类型（notify/http/ai/command）× 四调度（interval/daily/weekly/cron 五字段）+ 运行历史 + 手动执行 + MCP 六工具 + 面板三 Tab
- **暂不做**：秒级 cron、多步工作流编排、任务间依赖、跨任务传参、秒级精度、面板推消息进聊天流（服务→聊天通道未验证，不臆造）
- **成功指标**：调度正确率（单测覆盖四调度全边界）；补跑语义正确（错过只补一次）；冒烟全链路绿；用户可对话式完成「建任务→问结果→删任务」闭环

## 三、技术设计

### 3.1 架构（三类进程，同一 cap.kv 事实库）

```
面板(React) ──invoke→ router_dispatch(cap.kv 读 / 命令键写)
                  │ 6s 轮询：jobs/meta/runs
                  ▼
             cap.kv（taskrun.* 键空间，单事实库，三端一致）
                  ▲
服务(node) ───────┘ tick 2s：读设置(30s) → 消费命令键(先删后做)
    │              → due 任务顺序执行(并发=1) → 历史/心跳
    ├─ executors：notify(纯记录) / http(原生 fetch+SSRF 分级)
    │              / ai(供应商直连非流式) / command(spawn+截尾)
    └─ 错过补跑：启动后首个 tick 发现 overdue → 只补一次 → 从当前重排
MCP(stdio) ─ task_list/add/run/history/set/remove → 命令键/结果键
```

### 3.2 调度引擎（shared/engine.js，纯函数零依赖）

- `nextRunAt(job, fromMs)`：interval=from+everyMs；daily/weekly=本地时分逐分钟推进；cron=五字段（`* , - /` 数字）逐分钟扫描（上限 366 天，分钟粒度）。
- `advance(job, firedAtMs)`：interval 防风暴——`next = max(now, firedAt + everyMs)`，长期宕机后不回放积压。
- `dueJobs(jobs, now)` / `catchUpOnce(jobs, now)`：补跑标记 `missed:true`。
- 逐分钟扫描用 Date 本地分量，无时区库依赖（中国无 DST；文档注明）。

### 3.3 键空间契约（权威）

| 键 | 写者 | 内容 |
|---|---|---|
| `taskrun.settings` | 面板（last-write-wins，低频低冲突） | retention/超时/上限 |
| `taskrun.providers` | 面板（手填）/ 服务（importHost 宿主导入） | AI 供应商 [{id,name,baseUrl,apiKey,model,wire,hostId?}]，**出口全掩码**；掩码占位 key 拒收 |
| `taskrun.jobs` | **服务单写者** | { jobs:[{id,name,type,schedule,payload,enabled,nextRunAt,createdAt,...}] } |
| `taskrun.run.<n>` | 服务单写者 | 历史分块（25/块）+ `taskrun.runsIdx` 索引，默认保留 200 条 |
| `taskrun.cmd.<op>.<nonce>` | 面板/MCP | add/update/remove/runNow/setEnabled/importHost |
| `taskrun.result.<nonce>` | 服务 | 命令回执（面板 1200ms 轮询 ≤30s） |
| `taskrun.meta` | 服务 | 心跳 {version,pid,degraded,lastTickAt,...} |

### 3.4 安全设计

> 供应商导入路径（2026-11-02 实测定案）：面板侧 `cap.config get` 的 apiKey 是宿主脱敏占位（`__POLARIS_*`），直接入库会让 AI 任务鉴权失败——导入下沉服务进程读宿主 config.json（kvclient 同文件同信任域，llm-probe `import_host` 同款先例），按宿主档案 id 幂等合并，`dryRun` 只算不写（冒烟/预览）。

- **command**：创建与手动执行均需 confirm（面板勾选 + MCP `confirm:true` 双闸）；`powershell -NoProfile -Command` / `cmd /c`；超时（默认 120s 上限 600s）+ 输出截尾 8KB + 退出码记录；不自动重试。
- **http**：仅 http/https；默认拒私网（127/10/172.16-31/192.168/169.254/0.0.0.0/localhost/.local），`allowPrivate:true` 显式放行（本机服务心跳是合法场景，与公网抓取类插件的硬拒绝语义不同，理由记录于此）。
- **ai**：apiKey 存本插件 kv（与 llm-probe 同信任域）；一切返回（面板/MCP/历史）掩码 `****后4`；非流式单次调用，maxTokens 默认 1024 上限 4096。
- **数量/体积护栏**：任务数 ≤100；运行摘录 ≤8KB；历史轮换防 kv 膨胀。
- **MCP 危险闸**：remove 与 command 类 add/run 无 confirm 直接 `isError` 提示。

### 3.5 验证计划（四层，对齐 api-bench 口径）

1. **core 单测**（零依赖 node:assert）：四调度 nextRunAt 全边界（月末/闰年/周几列表/cron 步长）、advance 防风暴、补跑一次语义、SSRF 私网分类、payload 校验、掩码、历史分块轮换、设置归一。
2. **MCP 协议**：stdio spawn → initialize/tools/list 全 schema；confirm 拒绝路径（handler 注入 kv stub）。
3. **SSR 渲染**：react-dom/server 渲染面板（invoke stub），断言四 Tab/护栏文案/空态。
4. **真桥冒烟**（含 importHost dryRun 不落盘用例）：护栏（已有 taskrun.jobs 拒跑）→ 命令键建 notify+command+http(本地 allowPrivate mock) 三任务 → 起真服务进程 waitFor 运行记录 → MCP 全闭环 → 补跑注入验证 → finally 清场。
