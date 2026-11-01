# 定时任务台（task-runner）

把「重复该做的事」变成 Polaris 常驻代办的定时执行器：**提醒 / HTTP 探测 / AI 提示词 / 命令行**四类任务按计划自动执行，运行历史留痕三端可查，AI 对话式管理。

## 它解决什么

- Windows 任务计划程序：UI 克难、无跨端可见、错误报告差、没有 AI
- Polaris 生态此前：sundial 只提醒不执行、data-ark 只调度自身备份、feed-radar/page-sentinel 是固定用途轮询——**通用定时执行为零覆盖**
- 定时 AI 任务是 ChatGPT Tasks / Claude Cowork 已验证的产品方向（选型证据见 `docs/task-runner-plan.md`）

## 快速上手

1. 面板「任务 → 新建任务」：选类型 → 配调度（每 N 分钟 / 每天 / 每周几 / cron 五字段）→ 保存
2. 或对 AI 说：「每天早上八点提醒我站会」「每 10 分钟探测一下 xx 接口」「每天 8 点让 AI 总结一句 xx」
3. 手机 / Web 打开同一面板：任务与运行历史三端一致（cap.kv 单事实库）

### 四类任务

| 类型 | 到点做什么 | 护栏 |
|---|---|---|
| notify 提醒 | 记录一条提醒（面板/历史/AI 可见） | 内容 ≤2000 字 |
| http 探测 | 真实请求一个 URL，记录状态/延迟/响应摘录 | 仅 http(s)；默认拒私网（防 SSRF），本机/内网目标需勾选「允许私网」 |
| ai 提示词 | 用已配置供应商跑一次非流式对话，记录回复摘录 | 提示词要自包含（定时任务没有对话上下文）；maxTokens ≤4096 |
| command 命令行 | 真实执行 PowerShell / cmd 命令，记录退出码与输出尾部 | **创建必须勾选确认 + MCP 需 confirm:true 双闸**；超时（默认 120s）击杀；输出截尾 8KB |

### 调度语义（如实）

- 分钟粒度；interval 下限 60 秒；执行为队列串行（并发=1）
- **宿主/机器关闭期间不执行**；错过只在下次启动补跑一次（标记「补跑」），不回放积压
- 手动「执行」不改变正常调度节奏
- 同机开多个 Polaris 实例时，调度租约保证只有一个实例触发（启动竞态窗口已用抖动+延时复核收窄，残余风险如实告知：同秒双开可能双跑一次）

## AI 六工具（MCP）

`task_list` / `task_add` / `task_run` / `task_history` / `task_set` / `task_remove`

- 危险闸：`task_add`（command 类）、`task_run`、`task_remove` 无 `confirm:true` 一律拒绝
- `task_list` 适合「我有哪些定时任务」「上次跑成功了吗」；`task_history` 适合「昨晚的任务跑了吗」「刚才那条命令输出了什么」

## 键空间契约（权威）

| 键 | 写者 | 内容 |
|---|---|---|
| `taskrun.settings` | 面板（低频，last-write-wins） | retentionRuns / timeoutCommandSec / timeoutHttpSec / timeoutAiSec |
| `taskrun.providers` | 面板（手填）/ 服务（宿主导入 importHost 命令） | AI 供应商数组 [{id,name,baseUrl,apiKey,model,wire,hostId?,source?}]；**一切出口掩码 `****后4`**；掩码占位 key 拒收 |
| `taskrun.jobs` | **服务单写者** | { jobs: [...] }，≤100 个任务 |
| `taskrun.run.<n>` | **服务单写者** | 历史分块（25 条/块，摘录 ≤4KB）+ `taskrun.runsIdx` {chunkCount,total} |
| `taskrun.cmd.<op>.<nonce>` | 面板/MCP 写 | 命令键（add/update/remove/runNow/setEnabled），服务**先删后做** |
| `taskrun.result.<nonce>` | 服务 | 命令回执（queued → 最终）；消费方轮询 ≤30s |
| `taskrun.meta` | 服务 | 60s 心跳 {version,pid,lastTickAt,degraded,leaseholder,jobCount,…} |
| `taskrun.lease` | 服务 | 调度租约 {holder,expiresAt}，TTL 90s / 30s 续 |

## AI 供应商接入

- 面板「设置 → AI 供应商 → 从宿主导入」：**服务进程读宿主 config.json**（与 kvclient 同文件同信任域）拿原始密钥，按宿主档案 id 幂等合并（重复导入整组替换，手填保留）；面板侧 cap.config 只有 `__POLARIS_*` 掩码占位，故不走面板路径（实测 2026-11-02）
- 手动新增：baseUrl（OpenAI 风格自动拼 `/chat/completions`；Anthropic 拼 `/v1/messages`）+ apiKey + 模型 + 协议
- 密钥只存本机 cap.kv（与模型体检台同信任域），面板与 AI 侧一律掩码显示

## 架构

```
面板(React) ──invoke→ router_dispatch ── cap.kv（taskrun.*，三端一致）
服务(node) ────────────┘ tick 2s：设置热更(30s) → 租约 → 命令键(先删后做)
                          → 到期扫描 → 顺序执行 → 历史分块/心跳(60s)
MCP(stdio) ── 命令键/读 kv → AI 六工具
```

服务仅绑 127.0.0.1（健康端点）、零外部服务；http/ai 任务的网络请求为任务本身的用户配置目标，经 SSRF 分级闸。

## 验证口径（四层，2026-11-02 全绿）

| 层 | 内容 | 结果 |
|---|---|---|
| 1 离线单测 | 调度边界（四调度×含当分钟/推进/防风暴）、SSRF 分类（私网全拒/公网放行/172 范围精确）、载荷校验、掩码、分块轮换 | 38/38 |
| 2 MCP 工具 | 六工具 schema、confirm 三闸、增删改查流程、queued→最终回执、超时降级 | 12/12 |
| 3 SSR 渲染 | 三 Tab、任务卡、命令行确认护栏、HTTP 私网开关、历史标记、设置掩码、空态 | 10/10 |
| 4 真桥冒烟 | 真实 kv 心跳/租约、命令键全链路、http/command/notify runNow、SSRF 拒绝不出网、错过补跑恰一次、MCP 真子进程（tools/list + confirm 闸） | 11/11 |

构建门：`tsc --noEmit` 通过；`esbuild` → dist/panel.js 49.8KB；zip 打包随发布链执行。

## 已知限制

- 秒级调度不支持（分钟粒度）；AI 任务非流式单轮（无工具调用/多轮）
- 服务→聊天通道未验证，提醒不主动弹宿主通知（历史与 AI 可查）
- 双实例同秒启动的调度竞态窗口（见上，已收窄非消除）
- 命令任务与任务计划程序同信任域（用户本机自己的任务），但默认超时+输出截尾+confirm 三闸
