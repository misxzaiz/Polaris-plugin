/**
 * cap.git wire 契约类型 —— 与主仓 src-tauri/src/models/git.rs 逐字段对齐。
 *
 * 【纪律】serde 命名是逐结构体声明的，不是全仓统一 camelCase：
 * - rename_all = "camelCase"：GitRepositoryStatus / GitBranch / GitTag / GitCommit /
 *   GitCommitRef / GitLogPage / GitCommitDetails / GitIgnoreResult / GitDiscoveredRepo
 * - 无 rename（JSON 即 snake_case）：GitFileChange(old_path) / GitDiffEntry(file_path、
 *   change_type、old_content、new_content、is_binary、content_omitted、status_hint) /
 *   GitRemote(fetch_url、push_url) / GitStashEntry(commit_sha) / StageFailure(path、error)
 * 改动任何字段前先核对 models/git.rs 对应 struct 的 #[serde] 属性。
 */

// ── 状态 ────────────────────────────────────────────────────────────────────

export type GitFileStatusKind =
  | 'untracked'
  | 'modified'
  | 'added'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'unmerged';

/** GitFileChange（snake_case：old_path） */
export interface GitFileChange {
  path: string;
  status: GitFileStatusKind;
  old_path?: string;
  additions?: number;
  deletions?: number;
}

/** GitRepositoryStatus（camelCase） */
export interface GitRepositoryStatus {
  exists: boolean;
  branch: string;
  commit: string;
  shortCommit: string;
  ahead: number;
  behind: number;
  staged: GitFileChange[];
  unstaged: GitFileChange[];
  untracked: string[];
  conflicted: string[];
  isEmpty: boolean;
}

// ── Diff ────────────────────────────────────────────────────────────────────

export type DiffChangeType = 'added' | 'deleted' | 'modified' | 'renamed' | 'copied';

/** GitDiffStatusHint（snake_case） */
export interface GitDiffStatusHint {
  has_conflict: boolean;
  message?: string;
  current_view: string;
}

/** GitDiffEntry（snake_case） */
export interface GitDiffEntry {
  file_path: string;
  old_file_path?: string;
  change_type: DiffChangeType;
  old_content?: string;
  new_content?: string;
  additions?: number;
  deletions?: number;
  is_binary?: boolean;
  content_omitted?: boolean;
  status_hint?: GitDiffStatusHint;
}

// ── 历史 ────────────────────────────────────────────────────────────────────

/** GitCommitRef（camelCase；kind: HEAD / 本地分支 / 远程分支 / tag） */
export interface GitCommitRef {
  name: string;
  kind: string;
  target: string;
}

/** GitCommit（camelCase） */
export interface GitCommit {
  sha: string;
  shortSha: string;
  message: string;
  author: string;
  authorEmail: string;
  timestamp?: number;
  parents: string[];
  refs?: GitCommitRef[];
}

/** GitCommitDetails（camelCase；files 为完整 GitDiffEntry，含 old/new content） */
export interface GitCommitDetails {
  commit: GitCommit;
  files: GitDiffEntry[];
  totalAdditions: number;
  totalDeletions: number;
}

/** GitLogPage（camelCase；本轮面板只用 commits，rows 泳道数据暂不消费） */
export interface GitLogPage {
  commits: GitCommit[];
  rows: unknown[];
}

// ── 分支 / 标签 / 远程 / Stash / 其它 ────────────────────────────────────────

/** GitBranch（camelCase） */
export interface GitBranch {
  name: string;
  isCurrent: boolean;
  isRemote: boolean;
  commit: string;
  ahead?: number;
  behind?: number;
  lastCommitDate?: number;
}

/** GitTag（camelCase） */
export interface GitTag {
  name: string;
  isAnnotated: boolean;
  commitSha: string;
  shortSha: string;
  message?: string;
  tagger?: string;
  timestamp?: number;
}

/** GitRemote（snake_case：fetch_url / push_url） */
export interface GitRemote {
  name: string;
  fetch_url?: string;
  push_url?: string;
}

/** GitStashEntry（snake_case：commit_sha） */
export interface GitStashEntry {
  index: number;
  message: string;
  branch: string;
  commitSha?: never; // 防 camelCase 误用：真实字段是 commit_sha
  commit_sha: string;
  timestamp: number;
}

/** GitDiscoveredRepo（camelCase） */
export interface GitDiscoveredRepo {
  path: string;
  name: string;
  branch: string;
  shortCommit: string;
  isEmpty: boolean;
  hasChanges: boolean;
}

/** GitIgnoreResult（camelCase） */
export interface GitIgnoreResult {
  exists: boolean;
  content: string;
  path: string;
}

/** BatchStageResult（批量暂存：staged 为成功路径列表） */
export interface BatchStageResult {
  staged: string[];
  failed: StageFailure[];
  total: number;
}

/** BatchOpResult（批量取消暂存：ok 为成功路径列表） */
export interface BatchOpResult {
  ok: string[];
  failed: StageFailure[];
  total: number;
}

export interface StageFailure {
  path: string;
  error: string;
}

// ── cap.git 事件载荷 ────────────────────────────────────────────────────────

/** git-operation 事件载荷（GitOperationEntry，camelCase；写动作成败均广播） */
export interface GitOperationEvent {
  wsPath: string;
  action: string;
  label: string;
  ok: boolean;
  durationMs?: number;
  ts?: number;
}

/** git-undo-snapshot 事件载荷 */
export interface GitUndoSnapshotEvent {
  wsPath: string;
  snapshotRef: string;
  context?: Record<string, unknown>;
}
