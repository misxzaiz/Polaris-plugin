/**
 * repositoryStore —— 服务端快照唯一持有者（spec §5.1 D3/D7）。
 *
 * 一致性纪律（spec §5.2）：
 * - workspaceEpoch：工作区/仓库切换递增；旧 epoch 的响应一律丢弃，不写入新仓库状态。
 * - 请求序号：status / log 分别维护 seq，后发起的同键请求优先。
 * - 写操作完成后主动 reconcile（不依赖 watcher）；git-operation 事件再补一次去抖刷新。
 * - 禁固定轮询：刷新只由（a)显式刷新（b)写完成（c)git-operation/file-system-change 事件驱动。
 */

import { capGit, listenFileSystemChange, listenGitOperation, onWorkspaceChanged } from '../bridge.ts';
import type {
  GitBranch,
  GitCommit,
  GitCommitDetails,
  GitDiffEntry,
  GitDiscoveredRepo,
  GitFileChange,
  GitIgnoreResult,
  GitOperationEvent,
  GitRemote,
  GitRepositoryStatus,
  GitStashEntry,
  GitTag,
} from '../types.ts';

export type ListKey = 'branches' | 'remotes' | 'tags' | 'stashes' | 'gitignore';

export interface ListState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

export type Phase = 'no-workspace' | 'probing' | 'no-repo' | 'ready' | 'error';

export interface RepoStoreState {
  phase: Phase;
  /** ready 态下的全局错误（探测/状态加载失败） */
  error: string | null;
  wsPath: string | null;
  repoPath: string | null;
  /** 工作区非仓库时发现的嵌套仓库 */
  repos: GitDiscoveredRepo[];
  status: GitRepositoryStatus | null;
  statusLoading: boolean;
  refreshing: boolean;
  // 历史
  log: GitCommit[];
  logLoading: boolean;
  logLoadingMore: boolean;
  logError: string | null;
  logQuery: string;
  logEnd: boolean;
  // 懒加载列表
  branches: ListState<GitBranch[]>;
  remotes: ListState<GitRemote[]>;
  tags: ListState<GitTag[]>;
  stashes: ListState<GitStashEntry[]>;
  gitignore: ListState<GitIgnoreResult>;
  // 写操作
  writeBusy: string | null;
  writeError: string | null;
  /** 最近一次成功提交的 sha（用于成功反馈；组件展示后可消费） */
  lastCommitSha: string | null;
  /** 每次 status 快照更新递增（diff 缓存失效键） */
  statusVersion: number;
}

const LOG_PAGE = 50;

function emptyList<T>(): ListState<T> {
  return { data: null, loading: false, error: null };
}

function initialState(): RepoStoreState {
  return {
    phase: 'probing',
    error: null,
    wsPath: null,
    repoPath: null,
    repos: [],
    status: null,
    statusLoading: false,
    refreshing: false,
    log: [],
    logLoading: false,
    logLoadingMore: false,
    logError: null,
    logQuery: '',
    logEnd: false,
    branches: emptyList(),
    remotes: emptyList(),
    tags: emptyList(),
    stashes: emptyList(),
    gitignore: emptyList(),
    writeBusy: null,
    writeError: null,
    lastCommitSha: null,
    statusVersion: 0,
  };
}

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export class GitRepoStore {
  private state: RepoStoreState = initialState();
  private listeners = new Set<() => void>();
  private epoch = 0;
  private statusSeq = 0;
  private logSeq = 0;
  private listSeq: Record<ListKey, number> = {
    branches: 0,
    remotes: 0,
    tags: 0,
    stashes: 0,
    gitignore: 0,
  };
  private initialized = false;
  private operationTimer: ReturnType<typeof setTimeout> | null = null;
  private fsTimer: ReturnType<typeof setTimeout> | null = null;
  private currentQuery = '';

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = (): RepoStoreState => this.state;

  private set(patch: Partial<RepoStoreState>): void {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn();
  }

  /** 面板挂载时调用一次（幂等）：绑定工作区订阅与宿主事件 */
  init(): void {
    if (this.initialized) return;
    this.initialized = true;
    onWorkspaceChanged((path) => this.setWorkspace(path));
    listenGitOperation((payload) => {
      const ev = payload as Partial<GitOperationEvent> | null;
      if (!ev || typeof ev.wsPath !== 'string') return;
      if (ev.wsPath !== this.state.repoPath) return;
      // 任意来源（含 AI/其他面板）的写动作 → 去抖 reconcile
      if (this.operationTimer) clearTimeout(this.operationTimer);
      this.operationTimer = setTimeout(() => {
        this.operationTimer = null;
        void this.refreshStatus(true);
      }, 300);
    });
    listenFileSystemChange((payload) => {
      const p = payload as { path?: string; paths?: string[] } | null;
      if (p && (p.path || p.paths)) {
        const paths = p.paths ?? [p.path ?? ''];
        const repo = this.state.repoPath;
        if (repo && !paths.some((x) => typeof x === 'string' && x.startsWith(repo))) return;
      }
      if (this.fsTimer) clearTimeout(this.fsTimer);
      this.fsTimer = setTimeout(() => {
        this.fsTimer = null;
        if (this.state.phase === 'ready') void this.refreshStatus(true);
      }, 1500);
    });
    // 冷启动快照（subscribe 注册即回调一次，由 onWorkspaceChanged 内实现）
  }

  // ── 工作区 / 仓库绑定 ──────────────────────────────────────────────────────

  setWorkspace(wsPath: string | null): void {
    this.epoch++;
    this.statusSeq++;
    this.logSeq++;
    this.currentQuery = '';
    const base = initialState();
    base.wsPath = wsPath;
    base.phase = wsPath ? 'probing' : 'no-workspace';
    this.set(base);
    if (!wsPath) return;
    void this.probeRepo(wsPath);
  }

  private async probeRepo(wsPath: string): Promise<void> {
    const epoch = this.epoch;
    try {
      const isRepo = await capGit<boolean>('is_repository', { workspacePath: wsPath });
      if (epoch !== this.epoch) return;
      if (isRepo) {
        this.set({ phase: 'ready', repoPath: wsPath, repos: [] });
        void this.refreshStatus(false);
        return;
      }
      const repos = await capGit<GitDiscoveredRepo[]>('discover_repositories', {
        workspacePath: wsPath,
        maxDepth: 3,
      });
      if (epoch !== this.epoch) return;
      if (!Array.isArray(repos) || repos.length === 0) {
        this.set({ phase: 'no-repo', repos: [] });
        return;
      }
      this.set({ phase: 'ready', repos, repoPath: repos[0].path });
      void this.refreshStatus(false);
    } catch (e) {
      if (epoch !== this.epoch) return;
      this.set({ phase: 'error', error: errMessage(e) });
    }
  }

  selectRepo(repoPath: string): void {
    if (repoPath === this.state.repoPath) return;
    this.epoch++;
    this.statusSeq++;
    this.logSeq++;
    this.currentQuery = '';
    const base = initialState();
    base.wsPath = this.state.wsPath;
    base.repos = this.state.repos;
    base.phase = 'ready';
    base.repoPath = repoPath;
    this.set(base);
    void this.refreshStatus(false);
  }

  // ── status（唯一服务端真相）────────────────────────────────────────────────

  async refreshStatus(background: boolean): Promise<void> {
    const repoPath = this.state.repoPath;
    if (!repoPath || this.state.phase !== 'ready') return;
    const seq = ++this.statusSeq;
    const epoch = this.epoch;
    const hasSnapshot = this.state.status !== null;
    if (!hasSnapshot) this.set({ statusLoading: true });
    else this.set({ refreshing: true });
    try {
      const status = await capGit<GitRepositoryStatus>('get_status', { workspacePath: repoPath });
      if (epoch !== this.epoch || seq !== this.statusSeq) return;
      this.set({
        status,
        statusLoading: false,
        refreshing: false,
        error: null,
        statusVersion: this.state.statusVersion + 1,
      });
    } catch (e) {
      if (epoch !== this.epoch || seq !== this.statusSeq) return;
      this.set({ statusLoading: false, refreshing: false, error: errMessage(e) });
    }
  }

  // ── 历史 ───────────────────────────────────────────────────────────────────

  setSearchQuery(q: string): void {
    this.currentQuery = q;
    this.set({ logQuery: q });
  }

  async loadLog(reset: boolean): Promise<void> {
    const repoPath = this.state.repoPath;
    if (!repoPath || this.state.phase !== 'ready') return;
    if (!reset && (this.state.logLoadingMore || this.state.logEnd)) return;
    const seq = ++this.logSeq;
    const epoch = this.epoch;
    const skip = reset ? 0 : this.state.log.length;
    const q = this.currentQuery.trim();
    this.set(
      reset
        ? { logLoading: true, logError: null }
        : { logLoadingMore: true, logError: null },
    );
    try {
      const commits = q
        ? await capGit<GitCommit[]>('search_log', {
            workspacePath: repoPath,
            filter: { grep: q, fixedStrings: false },
            limit: LOG_PAGE,
            skip,
          })
        : await capGit<GitCommit[]>('get_log', { workspacePath: repoPath, limit: LOG_PAGE, skip });
      if (epoch !== this.epoch || seq !== this.logSeq) return;
      const prev = reset ? [] : this.state.log;
      this.set({
        log: skip === 0 ? commits : [...prev, ...commits],
        logLoading: false,
        logLoadingMore: false,
        logEnd: commits.length < LOG_PAGE,
        logError: null,
      });
    } catch (e) {
      if (epoch !== this.epoch || seq !== this.logSeq) return;
      this.set({
        logLoading: false,
        logLoadingMore: false,
        logError: errMessage(e),
        logEnd: false,
      });
    }
  }

  // ── 懒加载列表 ─────────────────────────────────────────────────────────────

  async loadList(key: ListKey, force: boolean = false): Promise<void> {
    const repoPath = this.state.repoPath;
    if (!repoPath || this.state.phase !== 'ready') return;
    const cur = this.state[key];
    if (cur.loading) return;
    if (!force && cur.data !== null) return;
    const seq = ++this.listSeq[key];
    const epoch = this.epoch;
    this.set({ [key]: { ...cur, loading: true, error: null } } as Partial<RepoStoreState>);
    try {
      let data: unknown;
      switch (key) {
        case 'branches':
          data = await capGit<GitBranch[]>('get_branches', { workspacePath: repoPath });
          break;
        case 'remotes':
          data = await capGit<GitRemote[]>('get_remotes', { workspacePath: repoPath });
          break;
        case 'tags':
          data = await capGit<GitTag[]>('get_tags', { workspacePath: repoPath });
          break;
        case 'stashes':
          data = await capGit<GitStashEntry[]>('stash_list', { workspacePath: repoPath });
          break;
        case 'gitignore':
          data = await capGit<GitIgnoreResult>('get_gitignore', { workspacePath: repoPath });
          break;
      }
      if (epoch !== this.epoch || seq !== this.listSeq[key]) return;
      this.set({ [key]: { data, loading: false, error: null } } as Partial<RepoStoreState>);
    } catch (e) {
      if (epoch !== this.epoch || seq !== this.listSeq[key]) return;
      this.set({
        [key]: { data: null, loading: false, error: errMessage(e) },
      } as Partial<RepoStoreState>);
    }
  }

  // ── 写操作（经 cap.git：权限 gate / 审计 / WRITE_GATE 写串行在宿主侧）────────

  private async write(label: string, run: () => Promise<unknown>): Promise<boolean> {
    if (this.state.writeBusy) return false;
    const repoPath = this.state.repoPath;
    if (!repoPath) return false;
    const epoch = this.epoch;
    this.set({ writeBusy: label, writeError: null, lastCommitSha: null });
    try {
      await run();
      if (epoch !== this.epoch) return true;
      this.set({ writeBusy: null });
      return true;
    } catch (e) {
      if (epoch !== this.epoch) return false;
      this.set({ writeBusy: null, writeError: `${label}失败：${errMessage(e)}` });
      return false;
    } finally {
      if (epoch === this.epoch) void this.refreshStatus(true);
    }
  }

  stageFile(filePath: string): Promise<boolean> {
    const repoPath = this.state.repoPath;
    if (!repoPath) return Promise.resolve(false);
    return this.write('暂存', () =>
      capGit('stage_file', { workspacePath: repoPath, filePath }),
    );
  }

  unstageFile(filePath: string): Promise<boolean> {
    const repoPath = this.state.repoPath;
    if (!repoPath) return Promise.resolve(false);
    return this.write('取消暂存', () =>
      capGit('unstage_file', { workspacePath: repoPath, filePath }),
    );
  }

  batchStage(filePaths: string[]): Promise<boolean> {
    const repoPath = this.state.repoPath;
    if (!repoPath) return Promise.resolve(false);
    return this.write(`暂存 ${filePaths.length} 个文件`, () =>
      capGit('batch_stage', { workspacePath: repoPath, filePaths }),
    );
  }

  batchUnstage(filePaths: string[]): Promise<boolean> {
    const repoPath = this.state.repoPath;
    if (!repoPath) return Promise.resolve(false);
    return this.write(`取消暂存 ${filePaths.length} 个文件`, () =>
      capGit('batch_unstage', { workspacePath: repoPath, filePaths }),
    );
  }

  /**
   * 提交。scope 语义与请求参数一致（spec GP-04）：
   * - selectedStagedPaths 非空 → selectedFiles 定向提交
   * - 否则提交整个 index
   * 返回新提交 sha（失败/空信息返回 null）。
   */
  async commit(message: string, selectedStagedPaths: string[]): Promise<string | null> {
    const repoPath = this.state.repoPath;
    if (!repoPath || this.state.writeBusy) return null;
    const trimmed = message.trim();
    if (!trimmed) return null;
    const useSelection = selectedStagedPaths.length > 0;
    const label = useSelection ? `提交已选 ${selectedStagedPaths.length} 个文件` : '提交';
    const epoch = this.epoch;
    this.set({ writeBusy: label, writeError: null, lastCommitSha: null });
    try {
      const sha = useSelection
        ? await capGit<string>('commit_changes', {
            workspacePath: repoPath,
            message: trimmed,
            selectedFiles: selectedStagedPaths,
          })
        : await capGit<string>('commit_changes', { workspacePath: repoPath, message: trimmed });
      if (epoch !== this.epoch) return null;
      this.set({ writeBusy: null, lastCommitSha: typeof sha === 'string' ? sha : null });
      return typeof sha === 'string' ? sha : null;
    } catch (e) {
      if (epoch !== this.epoch) return null;
      this.set({ writeBusy: null, writeError: `${label}失败：${errMessage(e)}` });
      return null;
    } finally {
      if (epoch === this.epoch) void this.refreshStatus(true);
    }
  }

  // ── diff（组件层缓存的取数入口）────────────────────────────────────────────

  async worktreeFileDiff(filePath: string): Promise<GitDiffEntry> {
    const repoPath = this.state.repoPath;
    if (!repoPath) throw new Error('未绑定仓库');
    return capGit<GitDiffEntry>('get_worktree_file_diff', { workspacePath: repoPath, filePath });
  }

  async indexFileDiff(filePath: string): Promise<GitDiffEntry> {
    const repoPath = this.state.repoPath;
    if (!repoPath) throw new Error('未绑定仓库');
    return capGit<GitDiffEntry>('get_index_file_diff', { workspacePath: repoPath, filePath });
  }

  async commitDetails(commitSha: string): Promise<GitCommitDetails> {
    const repoPath = this.state.repoPath;
    if (!repoPath) throw new Error('未绑定仓库');
    return capGit<GitCommitDetails>('get_commit_details', { workspacePath: repoPath, commitSha });
  }

  async stashShow(index: number): Promise<string> {
    const repoPath = this.state.repoPath;
    if (!repoPath) throw new Error('未绑定仓库');
    return capGit<string>('stash_show', { workspacePath: repoPath, index });
  }

  /** 未跟踪文件的 diff：无 GitDiffEntry 通道，渲染层用 added 全量伪 diff */
  untrackedAsDiff(path: string): GitDiffEntry {
    return {
      file_path: path,
      change_type: 'added',
      old_content: '',
      new_content: '',
      is_binary: false,
    };
  }

  // ── G1 写路径承接（2026-11-12 第二批：discard/分支/远程/stash/标签/gitignore）──
  // 全部经 cap.git 写类动作（权限 gate / 审计 / WRITE_GATE 串行在宿主侧）；
  // 成功后 reconcile status + 强刷关联列表（不依赖 watcher）。

  private async writeWithLists(label: string, lists: ListKey[], run: () => Promise<unknown>): Promise<boolean> {
    const ok = await this.write(label, run);
    if (ok) {
      for (const key of lists) void this.loadList(key, true);
    }
    return ok;
  }

  // 丢弃（危险：未跟踪文件删除不可恢复，确认框由组件层列明）
  discardFile(filePath: string): Promise<boolean> {
    const repoPath = this.state.repoPath;
    if (!repoPath) return Promise.resolve(false);
    return this.write(`丢弃 ${filePath}`, () =>
      capGit('discard_changes', { workspacePath: repoPath, filePath }),
    );
  }

  batchDiscard(filePaths: string[]): Promise<boolean> {
    const repoPath = this.state.repoPath;
    if (!repoPath) return Promise.resolve(false);
    return this.write(`丢弃 ${filePaths.length} 个文件`, () =>
      capGit('batch_discard', { workspacePath: repoPath, filePaths }),
    );
  }

  // 分支
  createBranch(name: string, checkout: boolean): Promise<boolean> {
    const repoPath = this.state.repoPath;
    if (!repoPath) return Promise.resolve(false);
    return this.writeWithLists(`创建分支 ${name}`, ['branches'], () =>
      capGit('create_branch', { workspacePath: repoPath, name, checkout }),
    );
  }

  checkoutBranch(name: string): Promise<boolean> {
    const repoPath = this.state.repoPath;
    if (!repoPath) return Promise.resolve(false);
    return this.write(`切换到 ${name}`, () =>
      capGit('checkout_branch', { workspacePath: repoPath, name }),
    );
  }

  deleteBranch(name: string, force: boolean): Promise<boolean> {
    const repoPath = this.state.repoPath;
    if (!repoPath) return Promise.resolve(false);
    return this.writeWithLists(`删除分支 ${name}`, ['branches'], () =>
      capGit('delete_branch', { workspacePath: repoPath, name, force }),
    );
  }

  renameBranch(oldName: string, newName: string): Promise<boolean> {
    const repoPath = this.state.repoPath;
    if (!repoPath) return Promise.resolve(false);
    return this.writeWithLists(`重命名分支`, ['branches'], () =>
      capGit('rename_branch', { workspacePath: repoPath, oldName, newName }),
    );
  }

  mergeBranch(sourceBranch: string): Promise<boolean> {
    const repoPath = this.state.repoPath;
    if (!repoPath) return Promise.resolve(false);
    return this.write(`合并 ${sourceBranch}`, () =>
      capGit('merge_branch', { workspacePath: repoPath, sourceBranch }),
    );
  }

  // 远程（网络长任务；WRITE_GATE 串行；冲突/失败经 writeError 呈现）
  fetchRemote(remoteName?: string): Promise<boolean> {
    const repoPath = this.state.repoPath;
    if (!repoPath) return Promise.resolve(false);
    return this.writeWithLists(remoteName ? `拉取远端 ${remoteName}` : 'fetch', ['remotes', 'branches'], () =>
      capGit('fetch', { workspacePath: repoPath, ...(remoteName ? { remoteName } : {}) }),
    );
  }

  pullBranch(remoteName?: string, branchName?: string): Promise<boolean> {
    const repoPath = this.state.repoPath;
    if (!repoPath) return Promise.resolve(false);
    return this.write('pull', () =>
      capGit('pull', { workspacePath: repoPath, ...(remoteName ? { remoteName } : {}), ...(branchName ? { branchName } : {}) }),
    );
  }

  pushBranch(branchName: string, remoteName?: string): Promise<boolean> {
    const repoPath = this.state.repoPath;
    if (!repoPath) return Promise.resolve(false);
    return this.writeWithLists(`推送 ${branchName}`, ['remotes', 'branches'], () =>
      // push_branch 缺省非 force；后端 force-with-lease 语义按 remote-tracking 自动对照
      capGit('push_branch', {
        workspacePath: repoPath,
        branchName,
        ...(remoteName ? { remoteName } : {}),
      }),
    );
  }

  pushSetUpstream(branchName: string, remoteName?: string): Promise<boolean> {
    const repoPath = this.state.repoPath;
    if (!repoPath) return Promise.resolve(false);
    return this.writeWithLists(`推送并设上游 ${branchName}`, ['remotes', 'branches'], () =>
      capGit('push_set_upstream', { workspacePath: repoPath, branchName, ...(remoteName ? { remoteName } : {}) }),
    );
  }

  // Stash
  stashSave(message?: string, includeUntracked?: boolean): Promise<boolean> {
    const repoPath = this.state.repoPath;
    if (!repoPath) return Promise.resolve(false);
    return this.writeWithLists('stash 保存', ['stashes'], () =>
      capGit('stash_save', {
        workspacePath: repoPath,
        ...(message ? { message } : {}),
        ...(includeUntracked ? { includeUntracked } : {}),
      }),
    );
  }

  stashApply(index?: number): Promise<boolean> {
    const repoPath = this.state.repoPath;
    if (!repoPath) return Promise.resolve(false);
    return this.write(`stash 应用 ${index ?? '最新'}`, () =>
      capGit('stash_apply', { workspacePath: repoPath, ...(index === undefined ? {} : { index }) }),
    );
  }

  stashPop(index?: number): Promise<boolean> {
    const repoPath = this.state.repoPath;
    if (!repoPath) return Promise.resolve(false);
    return this.writeWithLists(`stash 弹出 ${index ?? '最新'}`, ['stashes'], () =>
      capGit('stash_pop', { workspacePath: repoPath, ...(index === undefined ? {} : { index }) }),
    );
  }

  stashDrop(index: number): Promise<boolean> {
    const repoPath = this.state.repoPath;
    if (!repoPath) return Promise.resolve(false);
    return this.writeWithLists(`stash 删除 ${index}`, ['stashes'], () =>
      capGit('stash_drop', { workspacePath: repoPath, index }),
    );
  }

  // 标签
  createTag(name: string, commitish?: string, message?: string): Promise<boolean> {
    const repoPath = this.state.repoPath;
    if (!repoPath) return Promise.resolve(false);
    return this.writeWithLists(`创建标签 ${name}`, ['tags'], () =>
      capGit('create_tag', {
        workspacePath: repoPath,
        name,
        ...(commitish ? { commitish } : {}),
        ...(message ? { message } : {}),
      }),
    );
  }

  deleteTag(name: string): Promise<boolean> {
    const repoPath = this.state.repoPath;
    if (!repoPath) return Promise.resolve(false);
    return this.writeWithLists(`删除标签 ${name}`, ['tags'], () =>
      capGit('delete_tag', { workspacePath: repoPath, name }),
    );
  }

  // gitignore
  saveGitignore(content: string): Promise<boolean> {
    const repoPath = this.state.repoPath;
    if (!repoPath) return Promise.resolve(false);
    return this.writeWithLists('保存 .gitignore', ['gitignore'], () =>
      capGit('save_gitignore', { workspacePath: repoPath, content }),
    );
  }

  addToGitignore(rules: string[]): Promise<boolean> {
    const repoPath = this.state.repoPath;
    if (!repoPath) return Promise.resolve(false);
    return this.writeWithLists('加入 .gitignore', ['gitignore'], () =>
      capGit('add_to_gitignore', { workspacePath: repoPath, rules }),
    );
  }

  // 历史/提交上下文动作
  cherryPick(commitSha: string): Promise<boolean> {
    const repoPath = this.state.repoPath;
    if (!repoPath) return Promise.resolve(false);
    return this.write(`拣选 ${commitSha.slice(0, 7)}`, () =>
      capGit('cherry_pick', { workspacePath: repoPath, commitSha }),
    );
  }

  revertCommit(commitSha: string): Promise<boolean> {
    const repoPath = this.state.repoPath;
    if (!repoPath) return Promise.resolve(false);
    return this.write(`还原 ${commitSha.slice(0, 7)}`, () =>
      capGit('revert', { workspacePath: repoPath, commitSha }),
    );
  }
}

/** 面板单例 store（blob 每次加载一个实例；保活面板不重复 init） */
export const repoStore = new GitRepoStore();

export type { GitFileChange };
