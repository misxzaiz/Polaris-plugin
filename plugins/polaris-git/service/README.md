# polaris-git service —— 插件侧 Git 引擎 / HTTP 服务 / AI 工具链

> 架构方案 C：宿主删除 Rust `git2` 后端（`src-tauri/src/services/git/`、
> `router/git_capability.rs`、`models/git.rs`），改由本插件自带 Node 服务承接 `cap.git`。
> 宿主侧转发能力与前端接线由集成方负责；本文只描述插件侧交付物。
>
> **R1 零降级**：`KNOWN_ACTIONS` 77 个动作 **77/77 全部为真实实现**，未实现 0 个，
> 运行时不再有任何 `UNSUPPORTED` 返回。历史缺口与逐条补齐记录见 `UNSUPPORTED.md`。

## 1. 定位与边界

| 层 | 文件 | 职责 |
| --- | --- | --- |
| 动作清单 | `service/actions.js` | `KNOWN_ACTIONS`(77) / `WRITE_ACTIONS`(46) / `SNAPSHOT_ACTIONS`(8) / `ACTION_LABELS` / 别名；`UNSUPPORTED_REASONS` 已置空（R1） |
| 状态持久化 | `service/state.js` | 撤销快照（`<appConfigDir>/polaris-git/undo/*.json`）+ 操作流水（`operations.jsonl`），零依赖、按 ws 隔离 |
| Git 引擎 | `service/engine.js` | 零 npm 依赖，`execFile('git', args)` 实现全部 77 个 action，`dispatch()` 统一信封；含泳道 / 冲突 / rebase / 风险 / PR helpers |
| HTTP 服务 | `service/main.js` | `GET /__health` / `POST /dispatch`，写队列 FIFO（写动作前建 undo 快照 + 统一记流水），日志轮转，端口 0 自动分配，优雅关闭 |
| MCP server | `mcp/server.js` | stdio JSON-RPC 2.0（与 `ai-scheduler/mcp/server.js` 协议一致） |
| MCP 工具 | `mcp/tools.js` | 从 `KNOWN_ACTIONS` 自动派生 77 个 `git_<action>` 工具 + `git_dispatch`，经 HTTP 调 service，端口从参数/env/`.port` 文件发现 |
| 测试 | `test/service.test.mjs` | `node:test`，真实临时 git 仓库，覆盖 HTTP / 字段 / 安全 / 写队列 / R1 七类能力 |
| 文档 | `README.md`（本文）、`UNSUPPORTED.md` | 覆盖矩阵 / 历史缺口与补齐记录 |

**硬约束遵守情况**：仅使用 Node 内置模块（`node:http`/`node:child_process`/`node:fs`/`node:path`/`node:os` 等），零 npm 依赖；未修改主仓与插件已有文件（`src/*`、`package.json`、`plugin.json` 等一律未动）；未对交付仓库执行 `git add`/`git commit`；全部新建 `.js` 为 ESM（因 `package.json` 为 `"type": "module"`）；注释与文档用简体中文、字符串用 ASCII 直引号。

## 2. 新增文件清单

```
plugins/polaris-git/
├── service/
│   ├── actions.js         （新建）动作清单单一来源
│   ├── state.js           （新建）撤销快照 + 操作流水持久化
│   ├── engine.js          （新建）Git 引擎，全部 77 个真实 handler
│   ├── main.js            （新建）HTTP 服务 + 写动作生命周期接线
│   ├── README.md          （新建）本文
│   └── UNSUPPORTED.md     （新建）历史缺口与补齐记录（R1 后 0 未实现）
├── mcp/
│   ├── server.js          （新建）stdio MCP server
│   └── tools.js           （新建）MCP 工具面 + HTTP 转发
└── test/
    └── service.test.mjs   （新建）验收测试（test/ 目录此前已存在，未改动已有测试文件）
```

## 3. 外部依赖

- **主依赖是系统安装的 `git` 命令行**（需在 `PATH` 中，Node >= 18）。
  未找到时引擎返回 `未找到 git CLI：请确保系统已安装 git 且在 PATH 中`。
- **可选依赖 `gh` CLI**（仅 `create_pr` / `get_pr_status` 用）。未安装或 `gh --version`
  失败时返回结构化错误 `PR_CLI_UNAVAILABLE`（带 `installHint` 安装提示），**不是 UNSUPPORTED**；
  安装并 `gh auth login` 后两动作即为真实可用。插件不接触任何 token。
- 一律通过 `child_process.execFile('git', args, { cwd, shell: false, windowsHide: true })`
  以**数组参数**执行，`workspacePath` 仅作 `cwd`，**绝不拼接 shell 字符串**（`gh` 同规则）。
- 提交类命令在仓库未配置 `user.name`/`user.email` 时用 `git -c user.name=... -c user.email=...`
  注入兜底身份，并设 `GIT_EDITOR=true`/`GIT_SEQUENCE_EDITOR=true` 避免交互式编辑器阻塞；
  `start_interactive_rebase` 用临时 Node `.cjs` 脚本作 sequence/editor（仍是 `execFile` 数组参数）。
- `push` / `pull` / `fetch` 依赖用户本机的远程凭据配置（SSH key / credential helper），
  插件不接管鉴权。
- Windows 下 `git` 可能输出 `LF will be replaced by CRLF` 行尾警告、文件被转成 CRLF，
  属环境噪声，不影响退出码与 `-z` 格式解析（测试对文本内容做兼容性断言）。

## 4. 启动与自检

### 4.1 启动 HTTP 服务

```bash
# port=0 时系统自动分配，实际端口写入 <appConfigDir>/polaris-git-service.port
node service/main.js 0 <appConfigDir>
```

- 日志：`<appConfigDir>/polaris-git-service.log`，累计超过 512KB 轮转为 `.old`。
- 状态落盘：`<appConfigDir>/polaris-git/undo/*.json`（撤销快照）、
  `<appConfigDir>/polaris-git/operations.jsonl`（操作流水）。R1 由 `main.js` 在启动时
  通过 `configureState({ appConfigDir })` 注入真实目录。
- 优雅关闭：`SIGTERM`/`SIGINT` 停止收新连接 → 等在途请求与写队列排空 → 删除 `.port` 文件 → 退出。

### 4.2 健康检查与动作自检（Windows Git Bash 可用）

```bash
PORT=$(cat <appConfigDir>/polaris-git-service.port)

curl -s http://127.0.0.1:$PORT/__health
# => {"ok":true,"service":"polaris-git","version":"1.0.0","port":...,"uptimeSec":...}

curl -s -X POST http://127.0.0.1:$PORT/dispatch \
  -H 'Content-Type: application/json' \
  -d '{"action":"get_status","params":{"workspacePath":"<仓库绝对路径>"}}'
# => {"ok":true,"data":{...}} 或 {"ok":false,"error":"..."}
```

### 4.3 启动 stdio MCP

```bash
# 只给 appConfigDir，靠 .port 文件发现端口（惰性解析，服务与 MCP 启动顺序不限）
node mcp/server.js <appConfigDir>

# 显式端口（第二参数）
node mcp/server.js <appConfigDir> <port>

# 环境变量
POLARIS_GIT_PORT=<port> node mcp/server.js <appConfigDir>
POLARIS_GIT_APP_CONFIG_DIR=<appConfigDir> node mcp/server.js
```

端口发现优先级：`参数 <port>` / `POLARIS_GIT_PORT` / `POLARIS_GIT_SERVICE_PORT`
> `<appConfigDir>/polaris-git-service.port` 文件 > 明确报错。

### 4.4 测试

```bash
node --test test/service.test.mjs
```

## 5. HTTP 协议

| 路由 | 方法 | 请求 | 响应 |
| --- | --- | --- | --- |
| `/__health` | GET | — | 恒 200：`{ ok:true, service, version, port, uptimeSec }` |
| `/dispatch` | POST | `{ action, params }` | `{ ok:true, data }` 或 `{ ok:false, error }`（可附结构化字段，见下） |

- `action` = 去 `git_` 前缀的原命令名（如 `git_get_status` → `get_status`），
  `params` 为 camelCase 参数对象原样透传（多数动作必填 `workspacePath`）。
- 别名：`get_stash_list` → `stash_list`（对齐主仓 cap.git）。
- 未知 action 返回明确错误并列出全部 77 个支持动作。
- **结构化错误**：PR 动作在 `gh` 未安装时返回
  `{ ok:false, error, code:'PR_CLI_UNAVAILABLE', action, requiredCli, installHint }`，
  带安装提示，可判定、非 UNSUPPORTED。
- **写类动作全局串行**：`WRITE_ACTIONS`(46) 经 FIFO Promise 链执行，同一时刻最多一个写操作；
  读类动作并发直接执行。队列内每个写动作依次：危险动作前建撤销快照 → `dispatch` →
  记操作流水；失败时在信封附 `undoSnapshot` 供 `undo_restore` 一键回滚。
- 响应形状与 `engine.dispatch()` 返回值一致，`/dispatch` 只是薄封装。

## 6. MCP 协议与工具名对齐

协议与 `plugins/ai-scheduler/mcp/server.js` 完全一致：JSON-RPC 2.0、newline-delimited
JSON、协议数据只走 stdout、日志只走 stderr，支持 `initialize` /
`notifications/initialized` / `tools/list` / `tools/call`，
`protocolVersion = 2024-11-05`，`serverInfo.name = polaris-git`。

**关于「对齐主仓 `bus_mcp_server.rs` 暴露的 git 工具名」的重要说明**：
回读主仓 `bus_mcp_server.rs` 的 `tools_list()`（约 243-255 行）可见，宿主 bus MCP **只暴露
4 个通用工具**（`bus_help` / `bus_dispatch` / `bus_mcp_status` / `bus_mcp_regenerate`），
**并不存在独立的 git 工具名数组**；git 域是通过 `bus_dispatch` 以 `target: cap.git` +
`payload: { action, ... }` 转发的。该文件 545-575 行是 `MODULE_DOMAINS` 域导航表
（git 域为 `("git", &["cap.git"], ...)`），也明确「动作协议从 `describe()` 派生、不手写、
避免幽灵动作漂移」。

据此，本插件 MCP 采用**自动派生、零手写、杜绝漂移**的工具面：

- `KNOWN_ACTIONS` 的 77 个 action 各暴露为一个工具，名称 = `git_<action>`，
  即主仓 `git_capability.rs` 文档所述「去 `git_` 前缀得到 action」的**原命令名**。
  例如 `git_get_status`、`git_commit_changes`、`git_undo_list`。
- 额外 1 个 `git_dispatch`（`{ action, params }`），对齐主仓
  `bus_dispatch` → `target=cap.git` 的转发语义，作为通用兜底。
- `tools/list` 共 78 个工具，覆盖全部 77 个 action，全部经 HTTP 调本插件 service 的 `/dispatch`。
- R1 后 77 个工具全部为真实实现，工具描述不再带任何 UNSUPPORTED 标注。

> 历史文档 `docs/git-plugin-extraction-plan.md` 曾记录早期外部插件 MCP 有 13 个
> git 工具（`status`/`diff`/`log`/...），但那是历史规划，不等同于当前
> `git_capability.rs` 的 77 action 契约。当前实现以 `KNOWN_ACTIONS` 自动派生为准。
> **工具名最终命名是待集成方确认项**，见第 9 节风险点。

## 7. action 覆盖矩阵

**统计（R1）**：`KNOWN_ACTIONS` = 77；`WRITE_ACTIONS` = 46；**已实现 = 77**；
**UNSUPPORTED = 0**（`UNSUPPORTED_REASONS = {}`）。已实现中写类 46 个、读类 31 个。

### 7.1 首版已实现 64 个（按功能域）

| 域 | 动作 | 数 |
| --- | --- | --- |
| 仓库 / 状态 / 发现 | `is_repository` `discover_repositories` `get_status` | 3 |
| Diff / 提交详情 / 文件历史 | `get_diffs` `get_commit_details` `get_file_history` `get_worktree_diff` `get_index_diff` `get_worktree_file_diff` `get_index_file_diff` | 7 |
| Log / 搜索 / Reflog / Blame | `get_log` `search_log` `get_reflog` `blame_file` | 4 |
| 提交 / 暂存 / 丢弃 / 分组 / amend | `init_repository` `commit_changes` `stage_file` `unstage_file` `discard_changes` `batch_stage` `batch_unstage` `batch_discard` `commit_group` `amend_commit` | 10 |
| 分支 | `get_branches` `create_branch` `checkout_branch` `delete_branch` `rename_branch` | 5 |
| 合并 / 变基 / cherry-pick / revert / reset / checkout | `merge_branch` `rebase_branch` `rebase_abort` `rebase_continue` `plan_interactive_rebase` `cherry_pick` `cherry_pick_abort` `cherry_pick_continue` `revert` `revert_abort` `revert_continue` `reset` `checkout_commit` | 13 |
| 标签 / 远程 / 主机 | `get_tags` `create_tag` `delete_tag` `get_remotes` `add_remote` `remove_remote` `detect_host` | 7 |
| Push / Pull / Fetch | `push_branch` `push_set_upstream` `pull` `fetch` | 4 |
| Stash | `stash_list` `stash_save` `stash_pop` `stash_drop` `stash_apply` `stash_show` | 6 |
| Gitignore | `get_gitignore` `save_gitignore` `add_to_gitignore` `get_gitignore_templates` | 4 |
| 冲突解决 | `resolve_conflict_file` | 1 |
| **小计** | | **64** |

### 7.2 R1 补齐 13 个（首版 UNSUPPORTED → 真实实现）

| 类别 | 动作 | 实现方式（一句话） | 落点 |
| --- | --- | --- | --- |
| A 状态 / 凭据 / 网络 | `undo_list` | 读 `undo/*.json` 返回 `UndoSnapshotMeta[]`（倒序） | `state.js` |
| A | `undo_restore` | 重建 ref + 写回未跟踪文件 + `git stash apply`/`git apply` 恢复 | `state.js` |
| A | `undo_drop` | 精确删 JSON + `git update-ref -d`，带命名空间保护 | `state.js` |
| A | `get_operations` | 读 `operations.jsonl` 返回 `GitOperationEntry[]`（倒序、每 ws 50） | `state.js` |
| A | `clear_operations` | 重写文件剔除该 ws 行 | `state.js` |
| A | `create_pr` | `gh pr create --json` + 映射 `PullRequest`；缺 `gh` → `PR_CLI_UNAVAILABLE` | `engine.js` |
| A | `get_pr_status` | `gh pr view --json` + 映射 `PullRequest`；缺 `gh` → `PR_CLI_UNAVAILABLE` | `engine.js` |
| B git2 算法 / 结构 | `get_log_with_lanes` | `git for-each-ref` + parents 泳道分配 + 语义色，输出 `GitLogPage` | `engine.js` |
| B | `start_interactive_rebase` | `GIT_SEQUENCE_EDITOR`/`GIT_EDITOR` 注入脚本改写 todo/reword，`git rebase -i` | `engine.js` |
| B | `get_conflict_state` | `git ls-files -u -z` 三方 stage + 序列探测，输出 `GitSequenceState` | `engine.js` |
| C 启发式规则 | `suggest_rebase_todos` | `fixup!`/`squash!` 前缀匹配移到 pick 连段尾，输出 `GitRebaseSuggestion` | `engine.js` |
| C | `predict_conflicts` | `incoming_files ∩ local_modified` 确定性交集，输出 `GitConflictPrediction` | `engine.js` |
| C | `scan_commit_risk` | 6 密钥正则 + 冲突 marker + >1MiB 大文件，输出 `GitCommitRiskReport` | `engine.js` |
| **小计** | | | **13** |

逐条首版原因、字段、补齐建议见 `UNSUPPORTED.md`。

## 8. 字段兼容说明（与 `repoStore` / `cap.git` 对齐）

主仓 `models/git.rs` 的 serde 命名是**逐结构体声明**，不是全仓统一 camelCase。
前端 `src/types.ts` 已镜像此规则，`engine.js` / `state.js` 按同样规则返回。

### 8.1 首版结构体（repoStore 主要消费）

| 结构体 | 命名 | 关键字段 | 是否对齐 |
| --- | --- | --- | --- |
| `GitRepositoryStatus` | camelCase | `exists` `branch` `commit` `shortCommit` `ahead` `behind` `staged` `unstaged` `untracked` `conflicted` `isEmpty` | 是 |
| `GitCommit` | camelCase | `sha` `shortSha` `message` `author` `authorEmail` `timestamp` `parents` `refs` | 是（R1 起 `refs` 由 `collectCommitRefs` 补齐） |
| `GitBranch` | camelCase | `name` `isCurrent` `isRemote` `commit` `lastCommitDate` | 是 |
| `GitTag` | camelCase | `name` `isAnnotated` `commitSha` `shortSha` | 是（可选字段未产出） |
| `GitFileChange` | 无 rename（原名） | `path` `status`（可选 `old_path` `additions` `deletions`） | 是（可选字段未产出） |
| `GitDiffEntry` | 无 rename（原名） | `file_path` `change_type` `old_content` `new_content` `is_binary` `content_omitted` `status_hint` `additions` `deletions` | 是 |
| `GitDiffStatusHint` | 无 rename（原名） | `has_conflict` `current_view` `message` | 是 |
| `GitRemote` | 无 rename（原名） | `name` `fetch_url` `push_url` | 是 |
| `GitStashEntry` | 无 rename（原名） | `commit_sha`（**不是** `commitSha`） | 是 |
| `GitReflogEntry` | 无 rename（原名） | `short_sha` 等 | 是 |
| `GitPullResult`/`GitMergeResult`/`GitRebaseResult` 等 | 无 rename（原名） | `success` `has_conflicts` `conflicts` `commit_sha` `finished` | 是 |

### 8.2 R1 新增结构体

| 结构体 | 命名 | 关键字段 | 产出动作 |
| --- | --- | --- | --- |
| `UndoSnapshotMeta` | camelCase | `name` `createdAt` `context` `hasChanges` `branch` | `undo_list` |
| `UndoRestoreOutcome` | camelCase | `ok` `conflictedFiles` `conflictMessage` | `undo_restore` |
| `GitOperationEntry` | camelCase | `wsPath` `action` `label` `ok` `durationMs` `source` `ts` `gitTaskId` | `get_operations` |
| `GitLogPage` / `GitLaneRow` / `GitLaneCell` / `GitLaneSemantic` / `GitCommitRef` | camelCase | `commits` `rows` `semantic`；`cells { lane,node,edgeDown,edgeUp }`；`refs { name,kind,target }` | `get_log_with_lanes` |
| `GitSequenceState` / `GitConflictEntry` | 字段名原名（snake_case） | `kind` `has_conflicts` `conflicts` `current_step` `total_steps`；`path` `kind` `base` `ours` `theirs` | `get_conflict_state` |
| `GitRebasePlan` / `GitRebaseTodoItem` / `GitRebaseSuggestion` | camelCase | `baseCommitish` `commits` `firstLocked`；`sha` `subject` `action` `newMessage`；`movedCount` `unmatched` | `plan_interactive_rebase` / `suggest_rebase_todos` |
| `GitRebaseResult` | 字段名原名（snake_case） | `success` `has_conflicts` `conflicts` `rebased_commits` `current_step` `total_steps` `finished` | `start_interactive_rebase` |
| `GitConflictPrediction` / `GitIncomingCommitPreview` | camelCase | `branch` `upstream` `behind` `incoming` `localModified` `incomingFiles` `riskFiles` `advice` | `predict_conflicts` |
| `GitCommitRiskReport` / `GitCommitRiskFinding` | camelCase | `findings` `truncated`；`file` `line` `category` `pattern` `excerpt` | `scan_commit_risk` |
| `PullRequest` / `CreatePROptions` | 字段名原名（snake_case） | `number` `url` `state` `head_branch` `base_branch` `created_at` `review_status` 等 | `create_pr` / `get_pr_status` |

**`repoStore.ts` 实际消费的 action 全部落在已实现集合内且字段对齐**：
`is_repository` `discover_repositories` `get_status` `get_log` `search_log`
`get_branches` `get_remotes` `get_tags` `stash_list` `get_gitignore`
`stage_file` `unstage_file` `batch_stage` `batch_unstage` `commit_changes`
`get_worktree_file_diff` `get_index_file_diff` `get_commit_details` `stash_show`。

特别核对（易错点）：
- `get_status` 的 `untracked` / `conflicted` 是**字符串数组**，不是 `GitFileChange[]`。
- `get_status` 的 `staged` / `unstaged` 是 `{ path, status }[]`。
- diff 相关一律 snake_case；二进制返回 `is_binary:true` + `content_omitted:true`，**不伪造**内容。
- stash 是 `commit_sha`，不是 `commitSha`。
- R1 结构体严格区分 camelCase（undo / operations / lanes / prediction / risk / rebase plan）
  与原名 snake_case（sequence state / conflict entry / rebase result / PullRequest）。

## 9. 集成风险点（重点）

1. **写类动作权限 gate 归属（最重要）**：主仓 `git_capability.rs` 对
   `Source::Plugin` 的写类 / 破坏性动作有权限 gate（默认 deny）。本插件 service
   直接监听 `127.0.0.1` 并暴露写操作，**自身不鉴权**；`main.js` 的写队列只保证串行、
   不保证权限。宿主转发层（集成方负责）必须保留写动作 gate / 审批 / 操作流水审计语义，
   否则等于把写权限下放给任何能访问本机回环端口的进程。
2. **`repoStore` 字段：核心字段完全兼容，可选字段缺失（非破坏性）**。已核实的缺失：
   - `GitFileChange.old_path`（重命名条目）、`additions`/`deletions`：`staged`/`unstaged` 只给 `{ path, status }`。
   - `GitTag.message`/`tagger` 等附注标签可选字段未产出。
   R1 已补齐 `GitCommit.refs`（泳道装饰）。前端用可选字段 `?.` 读取不会崩。
3. **`is_repository` 严格度**：要求 `workspacePath/.git` 为直接子项且
   `git rev-parse --git-dir` 成功，比 `git2::Repository::open(path)` 在子目录 /
   worktree 发现上更严格。
4. **`get_worktree_diff` 语义**：用 `git diff HEAD`（HEAD vs 工作区），含已暂存与未暂存的
   **综合**差异；宿主原实现同为综合差异。若 UI 文案强调「未暂存」需复核。
5. **`commit_group` 实现差异**：用 `git commit -m <msg> -- <paths>`；宿主是更复杂的
   index 清空 / 恢复流程，对「组外已暂存内容」的保持可能有差异。
6. **静态动作不校验 `workspacePath`**：`get_gitignore_templates()` 无 `workspacePath`；
   `detect_host` 使用 `remoteUrl`。二者属预期语义。
7. **MCP 工具名歧义（待确认）**：如第 6 节所述，主仓 `bus_mcp_server.rs` 实际没有
   独立 git 工具名。本插件用 `git_<action>` 自动派生 + `git_dispatch` 兜底（78 工具覆盖 77 action）。
   若集成方期望历史文档里的 13 个短名或 `bus_dispatch` 同款命名，需调整 `mcp/tools.js` 映射——
   这是**唯一需要集成方拍板的命名点**。
8. **网络动作凭据**：`push`/`pull`/`fetch` 取决于用户本机 git 凭据；PR 取决于 `gh` 登录态。
   插件不接管鉴权，失败如实返回 stderr 或 `PR_CLI_UNAVAILABLE`，不伪造成功。
9. **R1 结构性简化（非功能缺失，详见 `UNSUPPORTED.md` 第 6 节）**：
   - 泳道 `edgeUp` 恒 `null`、不做列收缩，语义色仅 `local`/`unpushed` 两态（主仓四态）。
   - 冲突 `kind` 按三方 stage 存在性分类，未逐一还原 `rename_delete` 等更细类别。
   - Interactive Rebase 的 `reword` 回放与 `rebased_commits` 计数为基于 todo 的确定性估算。
   - `predict_conflicts` 无上游返回空预测（对齐主仓 `empty_prediction`）；
     测试需构造有 upstream 的仓库才能验证 `riskFiles` 交集。
   - `clear_operations` 自身留 1 条流水（与主仓 `is_destructive` 收口一致），历史记录已清除。
   - 撤销快照主通道 `git stash create` + `git update-ref`，未跟踪文件以内容副本写回，
     每 ws 保留最近 5 个快照。
10. **PR 平台限定**：仅支持 `gh`（GitHub）；非 GitHub 托管平台的 PR 需扩展。

## 10. 安全与健壮性小结

- 路径安全：`workspacePath` 必须为字符串、存在、且为目录；仓库类动作再经
  `git rev-parse --is-inside-work-tree` 确认可打开；`shell:false` + 数组参数杜绝命令注入
  （`test/service.test.mjs` 有专门的注入串用例）。
- R1 零降级：77 个 action 全部真实实现，`UNSUPPORTED_REASONS` 为空且 `engine.js`
  初始化即回归自检；唯一的 `PR_CLI_UNAVAILABLE` 是可判定、带安装提示的外部依赖缺失。
- 未知 action：明确错误 + 列出 77 个支持动作。
- 写队列：全局 FIFO 串行；危险写动作执行前自动建撤销快照，所有写动作统一记流水，
  失败时附 `undoSnapshot` 供回滚。
- 引擎初始化自检：77 个 `KNOWN_ACTIONS` 任一缺 handler 即抛错，防止漏登。
