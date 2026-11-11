# ai-scheduler — AI 定时任务

> 主仓 Polaris「AI 定时任务」域的插件化迁移（core-slimdown B1-6，2026-11）。
> 与轻量动作台 **task-runner** 分工：本插件执行的是**宿主 AI 引擎会话**（执行过程呈现在宿主聊天界面，支持协议模式任务书），非一次性动作。到点由后台服务自动构建提示词并经 `cap.ai.chat` 驱动引擎执行。

## 功能

- **四种触发**：once（RFC3339）/ cron（6 字段，秒级，与主仓 cron crate 金标对拍）/ interval（30s/5m/2h/1d）/ after_completion（完成后间隔链式）
- **任务模式**：简单模式（提示词 + 可选模板变量 `{{prompt}} {{taskName}} {{date}} {{time}} {{datetime}} {{weekday}}`）；协议模式（`.polaris/tasks/<ts>/` 文档驱动：protocol.md / supplement.md / memory/index.md / memory/tasks.md，超 800 行自动备份）
- **三种执行器**：chat（宿主 AI 会话）/ command（CLI，超时击杀）/ http（状态码 <500 即成功）。plugin 型执行器 v1 不支持（随主仓出仓），存量任务标记跳过
- **AI 工具（MCP stdio 七件）**：list_tasks / get_task / create_task / update_task / delete_task / toggle_task / get_workspace_breakdown——契约与文案与原主仓 Scheduler MCP 逐字对齐
- **数据迁移**：首启自动从主仓 `<appConfigDir>/stores/scheduler.db` 只读导入（node:sqlite，需 Node ≥ 22.5），成功后重命名 `.migrated` 防重复
- **可靠性**：服务租约防多实例双跑；chat 任务 Running 30min（可配 timeoutMinutes）自愈重置；WS 断线指数退避重连；历史 25 条/块分块存储（上限 1000 条）

## 存储契约（cap.kv 键空间，权威）

| 键 | 写者 | 内容 |
|---|---|---|
| `aisched.task.<id>` | MCP / 面板 | 任务定义（mergeView 合并前形态） |
| `aisched.state.<id>` | 服务 | 运行态 lastRunAt/lastRunStatus/nextRunAt/runCount/retryCount |
| `aisched.hist.<n>` + `aisched.hist.idx` | 服务 | 执行历史块（25 条/块，seq 新→旧） |
| `aisched.cmd.run.<nonce>` → `aisched.result.<nonce>` | 面板 → 服务 | 手动执行命令信箱（先删后做幂等） |
| `aisched.cmd.proto.<nonce>` → `aisched.result.<nonce>` | 面板 → 服务 | 协议文档命令信箱（op ∈ readAll/updateProtocol/updateSupplement/updateMemoryIndex/updateMemoryTasks/clearSupplement/backupSupplement/backupDocument/extractUserContent/hasSupplementContent/needsBackup/createStructure） |
| `aisched.tmpl.<id>` / `aisched.ptmpl.<id>` | 面板 | 提示词模板 / 自定义协议模板（内置 5 条协议模板现算不入库） |
| `aisched.settings` / `aisched.meta` / `aisched.lease` | 面板·服务·服务 | 设置(enableMcpTools/tickSeconds/migratedAt) / 心跳(60s) / 租约 |

## 架构（触发链）

```
service tick(默认5s) → engine.isDue → 三态 prompt 构建（协议 buildProtocolPrompt /
模板 applyTemplate / 简单）→ cap.ai.chat {action:'start', contextId:'scheduler-<id>'}
→ kv 置 Running → WS 订阅 session_end/error 终态回收 → after_completion 重算
兜底：Running 超 timeoutMinutes(默认30min) 自愈重置 Failed
```

宿主 AI 事件经 `chat-event` WS 流广播，服务按 `scheduler-` contextId 前缀过滤终态——与主仓原前端 `schedulerStore.runTask` 订阅语义一致。**触发链不依赖面板打开**（修复了主仓存量断链：原自动路径裸 `start_chat` 命令已在后端摘除，自动触发必然失败）。

## 开发

```bash
npm test          # run-tests.mjs(46 金标对拍) + mcp-tests.mjs(18) + render-verify.mjs(SSR)
npm run build     # esbuild → dist/panel.js（react external，宿主 shim）
node scripts/pack.js plugins/ai-scheduler   # 仓根打包（.pluginignore 排除 src/test）
```

金标对拍来源：`test/run-tests.mjs` 的 PROBE_* 数据由主仓临时探针（cron crate 实测 next 值）与 Rust `#[cfg(test)]` 用例翻译；语义锚点见 `shared/engine.js` 文件头注释（含 cron 忽略入参 now 的金标行为）。

## 需求

- Node ≥ 18（服务/MCP 零依赖）；数据迁移与协议文档命令需 **Node ≥ 22.5**（node:sqlite）
- 权限：`appConfigRead`（迁移读 scheduler.db）+ `aiToolAccess`（AI 工具）
