# cap.git 历史缺口与补齐记录（R1 零降级）

> 本文记录架构方案 C 首版交付中曾以 `UNSUPPORTED: <原因>` 显式返回的 13 个动作，
> 以及 R1 阶段把它们**全部补齐为真实可用实现**的方案。
>
> **当前状态（R1 后）**：`KNOWN_ACTIONS` 77 个动作 **77/77 全部为真实实现**，
> **未实现 = 0**。运行时不再有任何动作返回 `UNSUPPORTED`。
>
> - `service/actions.js` 的 `UNSUPPORTED_REASONS` 已置为空对象 `{}`（保留常量供接口稳定）。
> - `service/engine.js` 有回归自检：若 `UNSUPPORTED_REASONS` 被误填非空，模块加载即抛错拒绝启动。
> - 唯一的「能力不可用」是 PR 动作在本机未安装 `gh` CLI 时返回**结构化错误**
>   `PR_CLI_UNAVAILABLE`（带安装提示），这是可判定的外部依赖缺失，**不是 UNSUPPORTED**，
>   详见第 4 节。
> - 逐条实现位置：`service/state.js`（状态类）、`service/engine.js`（算法 / CLI 编排类），
>   写动作接线在 `service/main.js`。

## 1. 首版为什么会有 UNSUPPORTED

首版交付严格遵守「不可等价的动作宁可明确 `UNSUPPORTED`，也不伪造空数据」。
当时判定 13 个动作依赖宿主私有状态、`git2` 专有算法或第三方凭据，插件 CLI 侧无法等价，
因此在 `UNSUPPORTED_REASONS` 中登记原因，`engine.js` 为它们注册 handler 并显式抛
`UNSUPPORTED: <原因>`。R1 的目标是把这些缺口按可行性逐条补成真实实现，达成零降级。

## 2. 分类与补齐结果总览

| 类别 | 首版动作数 | R1 结果 | 主要落点 |
| --- | --- | --- | --- |
| A 宿主私有状态 / 凭据 / 网络 | 7 | 状态改为插件自持久化；PR 走 `gh` CLI（缺失给结构化错误） | `state.js` / `engine.js` |
| B 宿主 git2 专有算法 / 结构 | 3 | 用 `git` CLI 输出重建等价结构（泳道 / 冲突态 / rebase 序列器） | `engine.js` |
| C 宿主启发式规则集 | 3 | 规则集移植为纯 JS 函数（确定性、可测） | `engine.js` |

**统计**：13 个补齐 + 首版已实现 64 个 = **77 个真实实现**；`WRITE_ACTIONS` 仍为 46 个。

## 3. 13 个动作逐条补齐记录

> 「首版原因」为历史记录（与旧 `UNSUPPORTED_REASONS` 字符串一致）；「R1 实现」为当前真实行为。

### A 类：宿主私有状态 / 凭据 / 网络（7）

#### 1. `undo_list` — 撤销快照列表

- **首版原因**：撤销快照 `refs/polaris-undo/*` 由宿主 `WRITE_GATE` 在危险动作前创建并留存，CLI 侧不存在该快照网络。
- **R1 实现**：`state.js:listUndoSnapshots()` 扫描 `<appConfigDir>/polaris-git/undo/*.json`，按 `createdAt` 倒序返回 `UndoSnapshotMeta[]`（`name / createdAt / context / hasChanges / branch`，camelCase）。
- **快照产生**：`main.js:runWrite()` 在危险写动作（`SNAPSHOT_ACTIONS`，`reset` 仅 `hard`）**执行前**调用 `state.js:createUndoSnapshot()` 落盘，与主仓「危险动作前建快照」语义一致。

#### 2. `undo_restore` — 撤销恢复

- **首版原因**：撤销恢复需读取宿主私有快照 ref 并 `stash apply` / 重建被删分支 ref，依赖宿主快照网络。
- **R1 实现**：`state.js:restoreUndoSnapshot()` 依次：重建被删分支 ref（`git update-ref`）→ 写回未跟踪文件内容副本 → `git stash apply <stashSha>`（主通道，含 index 状态）/ `git apply --binary <patch>`（兜底）→ 用 `git diff --diff-filter=U` 检测冲突，返回 `UndoRestoreOutcome`（`ok / conflictedFiles / conflictMessage`）。带 workspace 命名空间保护，禁止跨仓库恢复。

#### 3. `undo_drop` — 清理快照

- **首版原因**：撤销快照清理操作宿主私有 ref 命名空间，CLI 侧无对应快照，删除即误删。
- **R1 实现**：`state.js:dropUndoSnapshot()` 精确删除指定快照的 JSON 文件与 `git update-ref -d <name>`，仅在该快照属于当前 workspace 时允许，绝不批量删未知 ref。

#### 4. `get_operations` — 操作流水

- **首版原因**：操作流水是宿主会话内内存环形缓冲（每 ws 上限 50），跨进程不共享。
- **R1 实现**：`state.js:listOperations()` 读 `<appConfigDir>/polaris-git/operations.jsonl`，倒序、每 ws 上限 50 条，字段对齐 `GitOperationEntry`（`wsPath / action / label / ok / durationMs / source / ts / gitTaskId`，camelCase）。`main.js:runWrite()` 对**所有写动作**统一追加（成败都留痕）。

#### 5. `clear_operations` — 清空操作流水

- **首版原因**：操作流水是宿主会话内内存状态，插件服务无该状态，无法清空宿主内存。
- **R1 实现**：`state.js:clearOperations()` 重写 `operations.jsonl`，仅剔除目标 ws 的行、保留其他 ws。语义对齐主仓：因 `clear_operations` 自身也是写动作，清空后仍会留下它自己一条流水（主仓 `is_destructive` 收口记录同款行为），历史记录已清空。

#### 6. `create_pr` — 创建 PR

- **首版原因**：创建 PR 依赖 `gh` CLI / 平台 API 与 token、宿主网络凭据，插件不承接第三方鉴权与网络写。
- **R1 实现**：`engine.js` 的 `ghJson()` 探测并执行 `gh pr create --json ...`（`execFile` 数组参数），`prFromGh()` 把结果映射为 `PullRequest`（`number / url / title / state / head_branch / base_branch / created_at / ...`，字段名原名）。插件不接触任何 token，凭据由用户本机 `gh auth login` 管理。

#### 7. `get_pr_status` — PR 状态

- **首版原因**：查询 PR 状态依赖 `gh` CLI / 平台 API 与 token、宿主网络读。
- **R1 实现**：同 `create_pr`，执行 `gh pr view <n> --json ...` 并映射为 `PullRequest`（含 `review_status`）。

### B 类：宿主 git2 专有算法 / 结构（3）

#### 8. `get_log_with_lanes` — 泳道日志

- **首版原因**：`GitLaneRow`/`GitLaneSemantic` 由 `git2` revwalk + `lane_cache` 布局算法生成，`git log --graph` 无法产出等价结构化 `cells`/`edges`/`semantic`。
- **R1 实现**：`engine.js` 三个 helper：`collectCommitRefs()`（`git for-each-ref` 聚合 HEAD/本地/远程/tag → `GitCommitRef[]`，同时补进 `GitCommit.refs`）、`computeLanes()`（按 parents 做确定性泳道分配，产出 `GitLaneRow[]` 含 `cells { lane,node,edgeDown,edgeUp }`）、`laneSemantics()`（`git rev-list refs/remotes` 判定 `local`/`unpushed`）。返回 `GitLogPage`（`commits / rows / semantic`，camelCase）。

#### 9. `start_interactive_rebase` — 面板化 Interactive Rebase

- **首版原因**：依赖注入 `GIT_SEQUENCE_EDITOR` 与 `GIT_EDITOR` 脚本按序改写 todo / reword 消息，属宿主序列器编排。
- **R1 实现**：`engine.js` 生成临时 Node `.cjs` 编辑器脚本，`GIT_SEQUENCE_EDITOR` 把面板 `todos` 覆盖到 git 的 todo 文件，`GIT_EDITOR` 用按序消费的消息文件回放 `reword`；执行 `git rebase -i [--autosquash] <base>`，成功返回 `GitRebaseResult`，冲突返回带 `GitConflictEntry[]` 的未完结结果。全程 `execFile` 数组参数、无 shell 拼接；`plan_interactive_rebase` / `validateTodos` / `renderTodoLine` 提供可编辑计划与校验。

#### 10. `get_conflict_state` — 冲突 / 序列状态

- **首版原因**：归一序列状态含三方 stage 内容与 `kind`（`binary`/`deleted_by_us`/`rename_delete` 等）分类，需 `git2` index 三方 stage 遍历。
- **R1 实现**：`engine.js` 的 `detectSequence()`（读 `.git/rebase-merge`、`MERGE_HEAD`、`CHERRY_PICK_HEAD` 等归一 `kind` + rebase 步数）与 `conflictEntriesV2()`（`git ls-files -u -z` 聚合三方 stage，`git cat-file blob` 读内容，按 stage 存在性判 `text/binary/deleted_by_us/deleted_by_them`），返回 `GitSequenceState`（`kind / has_conflicts / conflicts / current_step / total_steps`，字段名原名）。

### C 类：启发式规则集（3，优先补齐）

#### 11. `suggest_rebase_todos` — fixup!/squash! 整理建议（AI-8）

- **首版原因**：fixup!/squash! 目标匹配与连段重排是宿主本地启发式规则集，非 git CLI 原生能力。
- **R1 实现**：`engine.js:assembleSuggestions()`（纯函数）：以 `base..HEAD` 应用序 plan 为输入，`fixup!`/`squash!` 前缀按 subject 大小写不敏感匹配最近的 pick 连段尾部并插入，找不到目标则保持原位 `pick` 并如实记入 `unmatched`。返回 `GitRebaseSuggestion`（`baseCommitish / commits / movedCount / unmatched`）。规则可读、确定性、无随机打分。

#### 12. `predict_conflicts` — 冲突预测

- **首版原因**：宿主基于 `git2` tree-to-tree diff 的确定性风险清单（incoming ∩ local_modified）。
- **R1 实现**：`engine.js` 取 `HEAD..<upstream>` 的 incoming 提交与涉及文件（`git log` + `git diff-tree --name-only`），与本地已修改路径（`git status --porcelain=v1 -z -uall`）求交集为 `riskFiles`，返回 `GitConflictPrediction`（`branch / upstream / behind / incoming / localModified / incomingFiles / riskFiles / advice`）。无上游返回空预测（对齐主仓 `empty_prediction`）；`advice` 仅 `none` / `commitOrStash` 两态规则。

#### 13. `scan_commit_risk` — 提交前风险扫描（Review 门）

- **首版原因**：密钥模式集 / 冲突标记 / 大文件启发式规则由宿主 `git2` diff 遍历实现，CLI 无法保证等价判定。
- **R1 实现**：`engine.js:secretPatterns()`（6 条正则：`aws-access-key` / `openai-key` / `github-token` / `slack-token` / `private-key-block` / `kv-secret`）+ 冲突 marker（`<<<<<<<`/`>>>>>>>`）+ `>1MiB` 大文件；只看 `git diff --cached` 的新增行（`parseAddedLines`），上限 120 条 `truncated`。返回 `GitCommitRiskReport`（`findings / truncated`），`GitCommitRiskFinding` 为 `file / line / category / pattern / excerpt`（camelCase）。逐条对齐主仓 `risk_scan.rs`，无随机性。

## 4. 唯一的「能力不可用」：`PR_CLI_UNAVAILABLE`（非 UNSUPPORTED）

`create_pr` / `get_pr_status` 依赖外部 `gh` CLI。当本机未安装 `gh`（`execFile` 返回 `ENOENT`、
或 `gh --version` 失败）时，`engine.js:ghJson()` 抛 `StructuredError('PR_CLI_UNAVAILABLE', ...)`，
`dispatch()` 透传为结构化信封：

```json
{
  "ok": false,
  "error": "PR_CLI_UNAVAILABLE: 未检测到 GitHub CLI (gh)，无法执行 PR 操作",
  "code": "PR_CLI_UNAVAILABLE",
  "action": "create_pr",
  "requiredCli": "gh",
  "installHint": "请安装 GitHub CLI (gh)，并在终端执行 gh auth login 完成认证后重试"
}
```

这是**可判定的外部依赖缺失**，带安装提示，且 `gh` 一旦安装动作即为真实可用；它**不是**
「功能未实现」，因此不计入未实现数。测试可通过环境变量 `POLARIS_GIT_GH_CLI`
注入一个不存在的命令名，稳定验证该分支。

## 5. 校验方式

```bash
# 1) 动作清单：77/77 全部实现，0 个 UNSUPPORTED
node --input-type=module -e "
import { KNOWN_ACTIONS, UNSUPPORTED_REASONS } from './service/actions.js';
console.log('KNOWN=', KNOWN_ACTIONS.length, 'UNSUPPORTED=', Object.keys(UNSUPPORTED_REASONS).length);
"

# 2) 引擎初始化自检：任一 action 缺 handler 即抛错；UNSUPPORTED_REASONS 非空即拒绝启动
node --input-type=module -e "import('./service/engine.js').then(() => console.log('engine OK'))"

# 3) 完整验收（含 13 个动作的真实仓库断言）
node --test test/service.test.mjs
```

期望：`KNOWN= 77 UNSUPPORTED= 0`；`engine OK`；测试全绿。

## 6. 仍存在的语义差异（非功能缺失）

R1 用 `git` CLI 重建了宿主 `git2` 能力，以下为**结构性简化**，不影响「动作可用、字段对齐」，
集成方可按需进一步移植宿主算法：

1. **泳道布局**：`computeLanes()` 是主仓 `lane_cache` 的确定性可读简化版，`edgeUp` 恒为 `null`、
   不做列收缩；`semantic` 只产 `local`/`unpushed` 两态（主仓有 `merged`/`dim` 四态）。
2. **冲突 `kind`**：按 `git ls-files -u` 三方 stage 存在性判 `text/binary/deleted_by_us/deleted_by_them`；
   主仓 `rename_delete` 等更细分类未逐一还原。
3. **Interactive Rebase**：`reword` 消息回放、`squash/fixup` 折叠后的 `rebased_commits` 计数为
   基于 todo 的确定性估算；断点续跑沿用已实现的 `rebase_abort/continue`。
4. **PR 平台**：仅支持 `gh`（GitHub）；非 GitHub 托管平台或非 `gh` 管理凭据的 PR 需扩展。
5. **操作流水清空**：`clear_operations` 自身留 1 条流水（与主仓 `is_destructive` 收口一致），
   历史记录已清除。
6. **撤销快照通道**：主通道 `git stash create` + `git update-ref` 对齐主仓 `undo.rs`；
   未跟踪文件以内容副本写回，`pruneSnapshots` 每 ws 保留最近 5 个。
