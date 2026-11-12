// src/components/Panel.tsx
import { useEffect as useEffect6, useState as useState7 } from "react";

// src/bridge.ts
function globals() {
  return typeof window !== "undefined" ? window : {};
}
function hasHostBridge() {
  return typeof globals().__POLARIS_HOST_INVOKE__ === "function";
}
function getHostInvoke() {
  const fn = globals().__POLARIS_HOST_INVOKE__;
  if (!fn) {
    throw new Error("\u5BBF\u4E3B invoke \u4E0D\u53EF\u7528\uFF1A\u9700\u8981\u4E3B\u5E94\u7528\u63D0\u4F9B __POLARIS_HOST_INVOKE__\uFF08\u8BF7\u5347\u7EA7 Polaris \u4E3B\u5E94\u7528\uFF09");
  }
  return fn;
}
var SERVICE_ID = "polaris-git-service";
var SERVICE_RETRY_MS = 400;
var SERVICE_RETRY_MAX = 8;
function isServiceWarmingUp(err) {
  const msg = err instanceof Error ? err.message : String(err);
  return /未运行或无端口|插件服务请求失败|ECONNREFUSED|connection refused|socket hang up/i.test(msg);
}
function envelopeErrorMessage(err, fallback) {
  if (typeof err === "string" && err.trim()) return err;
  if (err && typeof err === "object") {
    const m = err.message;
    if (typeof m === "string" && m.trim()) return m;
  }
  return fallback;
}
async function dispatchOnce(action, params) {
  const invoke = getHostInvoke();
  const res = await invoke("router_dispatch", {
    req: {
      target: "cap.pluginServiceManager",
      payload: {
        action: "request",
        serviceId: SERVICE_ID,
        path: "/dispatch",
        body: { action, params }
      }
    }
  });
  if (!res.ok) {
    throw new Error(envelopeErrorMessage(res.error, `Git \u5F15\u64CE ${action} \u8C03\u7528\u5931\u8D25`));
  }
  const env = res.result;
  if (!env || typeof env !== "object") {
    throw new Error(`Git \u5F15\u64CE ${action} \u8FD4\u56DE\u7A7A\u54CD\u5E94`);
  }
  if (!env.ok) {
    throw new Error(env.error || `Git \u5F15\u64CE ${action} \u6267\u884C\u5931\u8D25`);
  }
  return env.data;
}
async function capGit(action, params = {}) {
  let lastErr = null;
  for (let attempt = 0; attempt < SERVICE_RETRY_MAX; attempt += 1) {
    try {
      return await dispatchOnce(action, params);
    } catch (err) {
      lastErr = err;
      if (!isServiceWarmingUp(err) || attempt === SERVICE_RETRY_MAX - 1) break;
      await new Promise((resolve) => setTimeout(resolve, SERVICE_RETRY_MS));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
function subscribeHostEvent(event, handler) {
  const listen = globals().__POLARIS_HOST_LISTEN__;
  if (!listen) return () => {
  };
  let unlisten = null;
  let cancelled = false;
  void listen(event, handler).then((fn) => {
    if (cancelled) fn();
    else unlisten = fn;
  }).catch(() => {
  });
  return () => {
    cancelled = true;
    try {
      unlisten?.();
    } catch {
    }
    unlisten = null;
  };
}
function listenGitOperation(handler) {
  return subscribeHostEvent("git-operation", handler);
}
function listenFileSystemChange(handler) {
  return subscribeHostEvent("file-system-change", handler);
}
function currentWorkspacePath() {
  const api = globals().__POLARIS_WORKSPACE_API__;
  if (api) {
    const id = api.currentId();
    if (id) {
      const ws = api.list().find((w) => w.id === id);
      if (ws?.path) return ws.path;
    }
  }
  const direct = globals().__POLARIS_HOST_WORKSPACE__;
  return typeof direct === "string" && direct ? direct : null;
}
function onWorkspaceChanged(handler) {
  let last = currentWorkspacePath();
  handler(last);
  const api = globals().__POLARIS_WORKSPACE_API__;
  if (!api) return () => {
  };
  return api.subscribe(() => {
    const next = currentWorkspacePath();
    if (next !== last) {
      last = next;
      handler(next);
    }
  });
}

// src/model/repoStore.ts
var LOG_PAGE = 50;
function emptyList() {
  return { data: null, loading: false, error: null };
}
function initialState() {
  return {
    phase: "probing",
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
    logQuery: "",
    logEnd: false,
    branches: emptyList(),
    remotes: emptyList(),
    tags: emptyList(),
    stashes: emptyList(),
    gitignore: emptyList(),
    writeBusy: null,
    writeError: null,
    lastCommitSha: null,
    statusVersion: 0
  };
}
function errMessage(e) {
  return e instanceof Error ? e.message : String(e);
}
var GitRepoStore = class {
  constructor() {
    this.state = initialState();
    this.listeners = /* @__PURE__ */ new Set();
    this.epoch = 0;
    this.statusSeq = 0;
    this.logSeq = 0;
    this.listSeq = {
      branches: 0,
      remotes: 0,
      tags: 0,
      stashes: 0,
      gitignore: 0
    };
    this.initialized = false;
    this.operationTimer = null;
    this.fsTimer = null;
    this.currentQuery = "";
    this.subscribe = (fn) => {
      this.listeners.add(fn);
      return () => this.listeners.delete(fn);
    };
    this.getSnapshot = () => this.state;
  }
  set(patch) {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn();
  }
  /** 面板挂载时调用一次（幂等）：绑定工作区订阅与宿主事件 */
  init() {
    if (this.initialized) return;
    this.initialized = true;
    onWorkspaceChanged((path) => this.setWorkspace(path));
    listenGitOperation((payload) => {
      const ev = payload;
      if (!ev || typeof ev.wsPath !== "string") return;
      if (ev.wsPath !== this.state.repoPath) return;
      if (this.operationTimer) clearTimeout(this.operationTimer);
      this.operationTimer = setTimeout(() => {
        this.operationTimer = null;
        void this.refreshStatus(true);
      }, 300);
    });
    listenFileSystemChange((payload) => {
      const p = payload;
      if (p && (p.path || p.paths)) {
        const paths = p.paths ?? [p.path ?? ""];
        const repo = this.state.repoPath;
        if (repo && !paths.some((x) => typeof x === "string" && x.startsWith(repo))) return;
      }
      if (this.fsTimer) clearTimeout(this.fsTimer);
      this.fsTimer = setTimeout(() => {
        this.fsTimer = null;
        if (this.state.phase === "ready") void this.refreshStatus(true);
      }, 1500);
    });
  }
  // ── 工作区 / 仓库绑定 ──────────────────────────────────────────────────────
  setWorkspace(wsPath) {
    this.epoch++;
    this.statusSeq++;
    this.logSeq++;
    this.currentQuery = "";
    const base = initialState();
    base.wsPath = wsPath;
    base.phase = wsPath ? "probing" : "no-workspace";
    this.set(base);
    if (!wsPath) return;
    void this.probeRepo(wsPath);
  }
  async probeRepo(wsPath) {
    const epoch = this.epoch;
    try {
      const isRepo = await capGit("is_repository", { workspacePath: wsPath });
      if (epoch !== this.epoch) return;
      if (isRepo) {
        this.set({ phase: "ready", repoPath: wsPath, repos: [] });
        void this.refreshStatus(false);
        return;
      }
      const repos = await capGit("discover_repositories", {
        workspacePath: wsPath,
        maxDepth: 3
      });
      if (epoch !== this.epoch) return;
      if (!Array.isArray(repos) || repos.length === 0) {
        this.set({ phase: "no-repo", repos: [] });
        return;
      }
      this.set({ phase: "ready", repos, repoPath: repos[0].path });
      void this.refreshStatus(false);
    } catch (e) {
      if (epoch !== this.epoch) return;
      this.set({ phase: "error", error: errMessage(e) });
    }
  }
  selectRepo(repoPath) {
    if (repoPath === this.state.repoPath) return;
    this.epoch++;
    this.statusSeq++;
    this.logSeq++;
    this.currentQuery = "";
    const base = initialState();
    base.wsPath = this.state.wsPath;
    base.repos = this.state.repos;
    base.phase = "ready";
    base.repoPath = repoPath;
    this.set(base);
    void this.refreshStatus(false);
  }
  // ── status（唯一服务端真相）────────────────────────────────────────────────
  async refreshStatus(background) {
    const repoPath = this.state.repoPath;
    if (!repoPath || this.state.phase !== "ready") return;
    const seq = ++this.statusSeq;
    const epoch = this.epoch;
    const hasSnapshot = this.state.status !== null;
    if (!hasSnapshot) this.set({ statusLoading: true });
    else this.set({ refreshing: true });
    try {
      const status = await capGit("get_status", { workspacePath: repoPath });
      if (epoch !== this.epoch || seq !== this.statusSeq) return;
      this.set({
        status,
        statusLoading: false,
        refreshing: false,
        error: null,
        statusVersion: this.state.statusVersion + 1
      });
    } catch (e) {
      if (epoch !== this.epoch || seq !== this.statusSeq) return;
      this.set({ statusLoading: false, refreshing: false, error: errMessage(e) });
    }
  }
  // ── 历史 ───────────────────────────────────────────────────────────────────
  setSearchQuery(q) {
    this.currentQuery = q;
    this.set({ logQuery: q });
  }
  async loadLog(reset) {
    const repoPath = this.state.repoPath;
    if (!repoPath || this.state.phase !== "ready") return;
    if (!reset && (this.state.logLoadingMore || this.state.logEnd)) return;
    const seq = ++this.logSeq;
    const epoch = this.epoch;
    const skip = reset ? 0 : this.state.log.length;
    const q = this.currentQuery.trim();
    this.set(
      reset ? { logLoading: true, logError: null } : { logLoadingMore: true, logError: null }
    );
    try {
      const commits = q ? await capGit("search_log", {
        workspacePath: repoPath,
        filter: { grep: q, fixedStrings: false },
        limit: LOG_PAGE,
        skip
      }) : await capGit("get_log", { workspacePath: repoPath, limit: LOG_PAGE, skip });
      if (epoch !== this.epoch || seq !== this.logSeq) return;
      const prev = reset ? [] : this.state.log;
      this.set({
        log: skip === 0 ? commits : [...prev, ...commits],
        logLoading: false,
        logLoadingMore: false,
        logEnd: commits.length < LOG_PAGE,
        logError: null
      });
    } catch (e) {
      if (epoch !== this.epoch || seq !== this.logSeq) return;
      this.set({
        logLoading: false,
        logLoadingMore: false,
        logError: errMessage(e),
        logEnd: false
      });
    }
  }
  // ── 懒加载列表 ─────────────────────────────────────────────────────────────
  async loadList(key, force = false) {
    const repoPath = this.state.repoPath;
    if (!repoPath || this.state.phase !== "ready") return;
    const cur = this.state[key];
    if (cur.loading) return;
    if (!force && cur.data !== null) return;
    const seq = ++this.listSeq[key];
    const epoch = this.epoch;
    this.set({ [key]: { ...cur, loading: true, error: null } });
    try {
      let data;
      switch (key) {
        case "branches":
          data = await capGit("get_branches", { workspacePath: repoPath });
          break;
        case "remotes":
          data = await capGit("get_remotes", { workspacePath: repoPath });
          break;
        case "tags":
          data = await capGit("get_tags", { workspacePath: repoPath });
          break;
        case "stashes":
          data = await capGit("stash_list", { workspacePath: repoPath });
          break;
        case "gitignore":
          data = await capGit("get_gitignore", { workspacePath: repoPath });
          break;
      }
      if (epoch !== this.epoch || seq !== this.listSeq[key]) return;
      this.set({ [key]: { data, loading: false, error: null } });
    } catch (e) {
      if (epoch !== this.epoch || seq !== this.listSeq[key]) return;
      this.set({
        [key]: { data: null, loading: false, error: errMessage(e) }
      });
    }
  }
  // ── 写操作（经 cap.git：权限 gate / 审计 / WRITE_GATE 写串行在宿主侧）────────
  async write(label, run) {
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
      this.set({ writeBusy: null, writeError: `${label}\u5931\u8D25\uFF1A${errMessage(e)}` });
      return false;
    } finally {
      if (epoch === this.epoch) void this.refreshStatus(true);
    }
  }
  stageFile(filePath) {
    const repoPath = this.state.repoPath;
    if (!repoPath) return Promise.resolve(false);
    return this.write(
      "\u6682\u5B58",
      () => capGit("stage_file", { workspacePath: repoPath, filePath })
    );
  }
  unstageFile(filePath) {
    const repoPath = this.state.repoPath;
    if (!repoPath) return Promise.resolve(false);
    return this.write(
      "\u53D6\u6D88\u6682\u5B58",
      () => capGit("unstage_file", { workspacePath: repoPath, filePath })
    );
  }
  batchStage(filePaths) {
    const repoPath = this.state.repoPath;
    if (!repoPath) return Promise.resolve(false);
    return this.write(
      `\u6682\u5B58 ${filePaths.length} \u4E2A\u6587\u4EF6`,
      () => capGit("batch_stage", { workspacePath: repoPath, filePaths })
    );
  }
  batchUnstage(filePaths) {
    const repoPath = this.state.repoPath;
    if (!repoPath) return Promise.resolve(false);
    return this.write(
      `\u53D6\u6D88\u6682\u5B58 ${filePaths.length} \u4E2A\u6587\u4EF6`,
      () => capGit("batch_unstage", { workspacePath: repoPath, filePaths })
    );
  }
  /**
   * 提交。scope 语义与请求参数一致（spec GP-04）：
   * - selectedStagedPaths 非空 → selectedFiles 定向提交
   * - 否则提交整个 index
   * 返回新提交 sha（失败/空信息返回 null）。
   */
  async commit(message, selectedStagedPaths) {
    const repoPath = this.state.repoPath;
    if (!repoPath || this.state.writeBusy) return null;
    const trimmed = message.trim();
    if (!trimmed) return null;
    const useSelection = selectedStagedPaths.length > 0;
    const label = useSelection ? `\u63D0\u4EA4\u5DF2\u9009 ${selectedStagedPaths.length} \u4E2A\u6587\u4EF6` : "\u63D0\u4EA4";
    const epoch = this.epoch;
    this.set({ writeBusy: label, writeError: null, lastCommitSha: null });
    try {
      const sha = useSelection ? await capGit("commit_changes", {
        workspacePath: repoPath,
        message: trimmed,
        selectedFiles: selectedStagedPaths
      }) : await capGit("commit_changes", { workspacePath: repoPath, message: trimmed });
      if (epoch !== this.epoch) return null;
      this.set({ writeBusy: null, lastCommitSha: typeof sha === "string" ? sha : null });
      return typeof sha === "string" ? sha : null;
    } catch (e) {
      if (epoch !== this.epoch) return null;
      this.set({ writeBusy: null, writeError: `${label}\u5931\u8D25\uFF1A${errMessage(e)}` });
      return null;
    } finally {
      if (epoch === this.epoch) void this.refreshStatus(true);
    }
  }
  // ── diff（组件层缓存的取数入口）────────────────────────────────────────────
  async worktreeFileDiff(filePath) {
    const repoPath = this.state.repoPath;
    if (!repoPath) throw new Error("\u672A\u7ED1\u5B9A\u4ED3\u5E93");
    return capGit("get_worktree_file_diff", { workspacePath: repoPath, filePath });
  }
  async indexFileDiff(filePath) {
    const repoPath = this.state.repoPath;
    if (!repoPath) throw new Error("\u672A\u7ED1\u5B9A\u4ED3\u5E93");
    return capGit("get_index_file_diff", { workspacePath: repoPath, filePath });
  }
  async commitDetails(commitSha) {
    const repoPath = this.state.repoPath;
    if (!repoPath) throw new Error("\u672A\u7ED1\u5B9A\u4ED3\u5E93");
    return capGit("get_commit_details", { workspacePath: repoPath, commitSha });
  }
  async stashShow(index) {
    const repoPath = this.state.repoPath;
    if (!repoPath) throw new Error("\u672A\u7ED1\u5B9A\u4ED3\u5E93");
    return capGit("stash_show", { workspacePath: repoPath, index });
  }
  /** 未跟踪文件的 diff：无 GitDiffEntry 通道，渲染层用 added 全量伪 diff */
  untrackedAsDiff(path) {
    return {
      file_path: path,
      change_type: "added",
      old_content: "",
      new_content: "",
      is_binary: false
    };
  }
};
var repoStore = new GitRepoStore();

// src/hooks.ts
import { useEffect, useState } from "react";
function useRepoState() {
  const [state, setState] = useState(() => repoStore.getSnapshot());
  useEffect(
    () => repoStore.subscribe(() => {
      setState(repoStore.getSnapshot());
    }),
    []
  );
  return state;
}
function useEnsureList(key, enabled) {
  useEffect(() => {
    if (enabled) void repoStore.loadList(key);
  }, [key, enabled]);
}

// src/model/format.ts
var STATUS_LETTER = {
  untracked: "U",
  modified: "M",
  added: "A",
  deleted: "D",
  renamed: "R",
  copied: "C",
  unmerged: "U"
};
var STATUS_LABEL = {
  untracked: "\u672A\u8DDF\u8E2A",
  modified: "\u5DF2\u4FEE\u6539",
  added: "\u5DF2\u6DFB\u52A0",
  deleted: "\u5DF2\u5220\u9664",
  renamed: "\u91CD\u547D\u540D",
  copied: "\u590D\u5236",
  unmerged: "\u51B2\u7A81"
};
var STATUS_TONE = {
  untracked: "danger",
  modified: "danger",
  added: "success",
  deleted: "danger",
  renamed: "primary",
  copied: "primary",
  unmerged: "danger"
};
function statusLetterOf(change) {
  return STATUS_LETTER[change.status] ?? "?";
}
function relativeTime(timestampSec) {
  if (!timestampSec || timestampSec <= 0) return "";
  const ms = timestampSec * 1e3;
  const diff = Date.now() - ms;
  if (diff < 0) return new Date(ms).toLocaleDateString();
  const min = Math.floor(diff / 6e4);
  if (min < 1) return "\u521A\u521A";
  if (min < 60) return `${min} \u5206\u949F\u524D`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} \u5C0F\u65F6\u524D`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} \u5929\u524D`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo} \u4E2A\u6708\u524D`;
  return `${Math.floor(mo / 12)} \u5E74\u524D`;
}
function firstLine(message) {
  const idx = message.indexOf("\n");
  return idx === -1 ? message : message.slice(0, idx);
}
function dirOf(path) {
  const norm = path.replace(/\\/g, "/");
  const idx = norm.lastIndexOf("/");
  return idx === -1 ? "" : norm.slice(0, idx);
}
function baseName(path) {
  const norm = path.replace(/\\/g, "/");
  const idx = norm.lastIndexOf("/");
  return idx === -1 ? norm : norm.slice(idx + 1);
}
function totalChangeCount(status) {
  return status.staged.length + status.unstaged.length + status.untracked.length + status.conflicted.length;
}

// src/components/width.ts
import { useEffect as useEffect2, useRef, useState as useState2 } from "react";
function widthMode(px) {
  if (px < 280) return "narrow";
  if (px < 420) return "regular";
  return "wide";
}
function useContainerWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState2(0);
  useEffect2(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) setWidth(entry.contentRect.width);
    });
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);
  return { ref, width, mode: width === 0 ? "regular" : widthMode(width) };
}

// src/components/ChangesTab.tsx
import { useEffect as useEffect3, useMemo as useMemo2, useRef as useRef2, useState as useState4 } from "react";

// src/components/DiffView.tsx
import { useMemo } from "react";

// src/model/diffEngine.ts
var CONTEXT = 3;
var MAX_DIFF_LINES = 2e4;
function diffLines(a, b) {
  const n = a.length;
  const m = b.length;
  let start = 0;
  while (start < n && start < m && a[start] === b[start]) start++;
  let endA = n - 1;
  let endB = m - 1;
  while (endA >= start && endB >= start && a[endA] === b[endB]) {
    endA--;
    endB--;
  }
  const ops = [];
  for (let i = 0; i < start; i++) ops.push({ type: "ctx", text: a[i] });
  const midA = a.slice(start, endA + 1);
  const midB = b.slice(start, endB + 1);
  if (midA.length === 0 && midB.length === 0) {
  } else if (midA.length === 0) {
    for (const t of midB) ops.push({ type: "add", text: t });
  } else if (midB.length === 0) {
    for (const t of midA) ops.push({ type: "del", text: t });
  } else {
    ops.push(...myersMid(midA, midB));
  }
  for (let i = endA + 1; i < n; i++) ops.push({ type: "ctx", text: a[i] });
  return ops;
}
function myersMid(a, b) {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  if (max > MAX_DIFF_LINES * 2) {
    return [
      ...a.map((t) => ({ type: "del", text: t })),
      ...b.map((t) => ({ type: "add", text: t }))
    ];
  }
  const offset = max;
  const size = max * 2 + 1;
  const trace = [];
  const v = new Int32Array(size);
  v[offset] = 0;
  outer: for (let d = 0; d <= max; d++) {
    trace.push(Int32Array.from(v));
    for (let k = -d; k <= d; k += 2) {
      let x2;
      if (k === -d || k !== d && v[offset + k - 1] < v[offset + k + 1]) {
        x2 = v[offset + k + 1];
      } else {
        x2 = v[offset + k - 1] + 1;
      }
      let y2 = x2 - k;
      while (x2 < n && y2 < m && a[x2] === b[y2]) {
        x2++;
        y2++;
      }
      v[offset + k] = x2;
      if (x2 >= n && y2 >= m) break outer;
    }
  }
  const path = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d > 0; d--) {
    const vv = trace[d];
    const k = x - y;
    let prevK;
    if (k === -d || k !== d && vv[offset + k - 1] < vv[offset + k + 1]) {
      prevK = k + 1;
    } else {
      prevK = k - 1;
    }
    const prevX = vv[offset + prevK];
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      path.push({ type: "ctx", text: a[x - 1] });
      x--;
      y--;
    }
    if (x === prevX) {
      path.push({ type: "add", text: b[prevY] });
      y--;
    } else {
      path.push({ type: "del", text: a[prevX] });
      x--;
    }
  }
  while (x > 0 && y > 0 && a[x - 1] === b[y - 1]) {
    path.push({ type: "ctx", text: a[x - 1] });
    x--;
    y--;
  }
  path.reverse();
  return path;
}
function buildHunks(ops, context = CONTEXT) {
  const changedIdx = [];
  for (let i = 0; i < ops.length; i++) {
    if (ops[i].type !== "ctx") changedIdx.push(i);
  }
  if (changedIdx.length === 0) return [];
  const ranges = [];
  let rs = Math.max(0, changedIdx[0] - context);
  let re = Math.min(ops.length - 1, changedIdx[0] + context);
  for (let i = 1; i < changedIdx.length; i++) {
    const s = Math.max(0, changedIdx[i] - context);
    const e = Math.min(ops.length - 1, changedIdx[i] + context);
    if (s <= re + 1) {
      re = e;
    } else {
      ranges.push([rs, re]);
      rs = s;
      re = e;
    }
  }
  ranges.push([rs, re]);
  let aLine = 1;
  let bLine = 1;
  const lineNo = ops.map((op) => {
    const cur = { a: void 0, b: void 0 };
    if (op.type === "ctx") {
      cur.a = aLine++;
      cur.b = bLine++;
    } else if (op.type === "del") {
      cur.a = aLine++;
    } else {
      cur.b = bLine++;
    }
    return cur;
  });
  return ranges.map(([s, e]) => {
    const lines = [];
    for (let i = s; i <= e; i++) {
      const op = ops[i];
      lines.push({
        type: op.type,
        aLine: lineNo[i].a,
        bLine: lineNo[i].b,
        text: op.text
      });
    }
    const first = lines[0];
    const hunk = {
      aStart: first.aLine ?? 1,
      bStart: first.bLine ?? 1,
      lines
    };
    return hunk;
  });
}
var WORD_RE = /(\s+|[A-Za-z0-9_$]+|.)/g;
function wordSegments(delText, addText) {
  const delWords = delText.match(WORD_RE) ?? [];
  const addWords = addText.match(WORD_RE) ?? [];
  const ops = diffLines(delWords, addWords);
  const del = [];
  const add = [];
  for (const op of ops) {
    if (op.type === "ctx") {
      del.push({ text: op.text, changed: false });
      add.push({ text: op.text, changed: false });
    } else if (op.type === "del") {
      del.push({ text: op.text, changed: true });
    } else {
      add.push({ text: op.text, changed: true });
    }
  }
  return { del, add };
}
function splitLines(text) {
  if (text === "") return [];
  const lines = text.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}
function computeLineDiff(oldText, newText, context = CONTEXT) {
  const a = splitLines(oldText ?? "");
  const b = splitLines(newText ?? "");
  const total = a.length + b.length;
  if (total > MAX_DIFF_LINES) {
    return {
      hunks: [],
      additions: b.length,
      deletions: a.length,
      truncated: true
    };
  }
  const ops = diffLines(a, b);
  const hunks = buildHunks(ops, context);
  let additions = 0;
  let deletions = 0;
  for (const op of ops) {
    if (op.type === "add") additions++;
    else if (op.type === "del") deletions++;
  }
  for (const hunk of hunks) {
    let i = 0;
    while (i < hunk.lines.length) {
      const line = hunk.lines[i];
      if (line.type === "del" && i + 1 < hunk.lines.length && hunk.lines[i + 1].type === "add") {
        const addLine = hunk.lines[i + 1];
        const delLen = line.text.length + addLine.text.length;
        if (delLen <= 400) {
          const seg = wordSegments(line.text, addLine.text);
          line.segments = seg.del;
          addLine.segments = seg.add;
        }
        i += 2;
      } else {
        i += 1;
      }
    }
  }
  return { hunks, additions, deletions, truncated: false };
}
function parseUnifiedPatch(text) {
  const rows = text.split("\n");
  const hunks = [];
  let additions = 0;
  let deletions = 0;
  let cur = null;
  let aLine = 0;
  let bLine = 0;
  for (const row of rows) {
    const hunkHead = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(row);
    if (hunkHead) {
      aLine = parseInt(hunkHead[1], 10);
      bLine = parseInt(hunkHead[3], 10);
      cur = { aStart: aLine, bStart: bLine, lines: [] };
      hunks.push(cur);
      continue;
    }
    if (!cur) continue;
    if (row.startsWith("diff ") || row.startsWith("index ") || row.startsWith("--- ") || row.startsWith("+++ ")) {
      continue;
    }
    if (row.startsWith("+")) {
      cur.lines.push({ type: "add", bLine: bLine++, text: row.slice(1) });
      additions++;
    } else if (row.startsWith("-")) {
      cur.lines.push({ type: "del", aLine: aLine++, text: row.slice(1) });
      deletions++;
    } else if (row.startsWith("\\")) {
    } else if (row.startsWith(" ") || row === "") {
      cur.lines.push({ type: "ctx", aLine: aLine++, bLine: bLine++, text: row.startsWith(" ") ? row.slice(1) : row });
    }
  }
  return { hunks, additions, deletions, truncated: false };
}

// src/components/states.tsx
import { jsx, jsxs } from "react/jsx-runtime";
function LoadingSkeleton({ rows = 6 }) {
  return /* @__PURE__ */ jsx("div", { className: "pg-skeleton", role: "status", "aria-label": "\u52A0\u8F7D\u4E2D", children: Array.from({ length: rows }, (_, i) => /* @__PURE__ */ jsx("div", { className: "pg-skeleton-row", style: { width: `${92 - i % 4 * 14}%` } }, i)) });
}
function ErrorNote({
  message,
  onRetry,
  retryLabel = "\u91CD\u8BD5"
}) {
  return /* @__PURE__ */ jsxs("div", { className: "pg-errorbar", role: "alert", children: [
    /* @__PURE__ */ jsx("span", { className: "pg-errorbar-text", children: message }),
    onRetry && /* @__PURE__ */ jsx("button", { type: "button", className: "pg-mini", onClick: onRetry, children: retryLabel })
  ] });
}
function EmptyBlock({
  title,
  hint,
  action
}) {
  return /* @__PURE__ */ jsxs("div", { className: "pg-empty", children: [
    /* @__PURE__ */ jsx("div", { className: "pg-empty-title", children: title }),
    hint && /* @__PURE__ */ jsx("div", { className: "pg-empty-hint", children: hint }),
    action && /* @__PURE__ */ jsx("div", { className: "pg-empty-action", children: action })
  ] });
}
function NoWorkspaceBlock() {
  return /* @__PURE__ */ jsx(
    EmptyBlock,
    {
      title: "\u5C1A\u672A\u9009\u62E9\u5DE5\u4F5C\u533A",
      hint: "\u5728\u5BBF\u4E3B\u4E2D\u6253\u5F00\u4E00\u4E2A\u5DE5\u4F5C\u533A\u540E\uFF0C\u6B64\u5904\u81EA\u52A8\u7ED1\u5B9A\u5E76\u663E\u793A\u4ED3\u5E93\u72B6\u6001\u3002"
    }
  );
}
function NoRepoBlock({ wsPath }) {
  return /* @__PURE__ */ jsx(
    EmptyBlock,
    {
      title: "\u5F53\u524D\u5DE5\u4F5C\u533A\u4E0D\u662F Git \u4ED3\u5E93",
      hint: wsPath ? `${wsPath} \u4E0B\u672A\u53D1\u73B0\u5D4C\u5957\u4ED3\u5E93\uFF08\u626B\u63CF\u6DF1\u5EA6 3\uFF09\u3002` : void 0
    }
  );
}

// src/components/DiffView.tsx
import { Fragment, jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
var EMPTY_DIFF = { hunks: [], additions: 0, deletions: 0, truncated: false };
function DiffView({
  entry,
  patchText,
  loading,
  error,
  filePath
}) {
  const parsedPatch = useMemo(
    () => patchText !== void 0 && patchText !== null ? parseUnifiedPatch(patchText) : null,
    [patchText]
  );
  const entryDiff = useMemo(
    () => entry && !entry.is_binary && !entry.content_omitted ? computeLineDiff(entry.old_content, entry.new_content) : null,
    [entry]
  );
  if (loading) return /* @__PURE__ */ jsx2(LoadingSkeleton, { rows: 4 });
  if (error) return /* @__PURE__ */ jsx2(ErrorNote, { message: `diff \u52A0\u8F7D\u5931\u8D25\uFF1A${error}` });
  if (parsedPatch) return /* @__PURE__ */ jsx2(HunkTable, { filePath, result: parsedPatch });
  if (!entry) return /* @__PURE__ */ jsx2("div", { className: "pg-diff-missing", children: "\u65E0 diff \u6570\u636E" });
  if (entry.is_binary) {
    return /* @__PURE__ */ jsx2("div", { className: "pg-diff-special", children: "\u4E8C\u8FDB\u5236\u6587\u4EF6\uFF0C\u4E0D\u6E32\u67D3\u5185\u5BB9\u5DEE\u5F02\u3002" });
  }
  if (entry.content_omitted) {
    return /* @__PURE__ */ jsxs2("div", { className: "pg-diff-special", children: [
      "\u6587\u4EF6\u8FC7\u5927\uFF0C\u5BBF\u4E3B\u5DF2\u7701\u7565\u5185\u5BB9\uFF08+",
      entry.additions ?? "?",
      " / -",
      entry.deletions ?? "?",
      "\uFF09\u3002"
    ] });
  }
  return /* @__PURE__ */ jsx2(HunkTable, { filePath, result: entryDiff ?? EMPTY_DIFF });
}
function HunkTable({ filePath, result }) {
  if (result.truncated) {
    return /* @__PURE__ */ jsxs2("div", { className: "pg-diff-special", children: [
      "\u6587\u4EF6\u5DEE\u5F02\u8FC7\u5927\uFF08",
      result.additions,
      " \u589E / ",
      result.deletions,
      " \u5220\uFF09\uFF0C\u5DF2\u8DF3\u8FC7\u9010\u884C\u6E32\u67D3\u3002"
    ] });
  }
  if (result.hunks.length === 0) {
    return /* @__PURE__ */ jsx2("div", { className: "pg-diff-special", children: "\u65E0\u5185\u5BB9\u5DEE\u5F02\u3002" });
  }
  return /* @__PURE__ */ jsxs2("div", { className: "pg-diff", children: [
    filePath && /* @__PURE__ */ jsx2("div", { className: "pg-diff-file", title: filePath, children: baseName(filePath) }),
    /* @__PURE__ */ jsx2("div", { className: "pg-diff-scroll", children: /* @__PURE__ */ jsx2("table", { className: "pg-diff-table", children: /* @__PURE__ */ jsx2("tbody", { children: result.hunks.map((hunk, hi) => /* @__PURE__ */ jsx2(HunkRows, { lines: hunk.lines }, hi)) }) }) })
  ] });
}
function HunkRows({ lines }) {
  return /* @__PURE__ */ jsx2(Fragment, { children: lines.map((line, i) => /* @__PURE__ */ jsxs2("tr", { className: `pg-dl pg-dl-${line.type}`, children: [
    /* @__PURE__ */ jsx2("td", { className: "pg-dl-no", children: line.aLine ?? "" }),
    /* @__PURE__ */ jsx2("td", { className: "pg-dl-no", children: line.bLine ?? "" }),
    /* @__PURE__ */ jsx2("td", { className: "pg-dl-sign", children: line.type === "add" ? "+" : line.type === "del" ? "-" : " " }),
    /* @__PURE__ */ jsx2("td", { className: "pg-dl-text", children: line.segments ? line.segments.map(
      (seg, si) => seg.changed ? /* @__PURE__ */ jsx2("span", { className: "pg-dl-word", children: seg.text }, si) : /* @__PURE__ */ jsx2("span", { children: seg.text }, si)
    ) : line.text })
  ] }, i)) });
}

// src/components/CommitBar.tsx
import { useState as useState3 } from "react";
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
function CommitBar({
  draft,
  onDraftChange,
  stagedCount,
  selectedStagedPaths,
  onCommitted
}) {
  const state = useRepoState();
  const [notice, setNotice] = useState3(null);
  const busy = state.writeBusy !== null;
  const useSelection = selectedStagedPaths.length > 0;
  const scopeCount = useSelection ? selectedStagedPaths.length : stagedCount;
  const canCommit = !busy && draft.trim().length > 0 && scopeCount > 0;
  const scopeText = scopeCount === 0 ? "\u6682\u65E0\u5DF2\u6682\u5B58\u53D8\u66F4" : useSelection ? `\u63D0\u4EA4\u5DF2\u9009 ${selectedStagedPaths.length} \u4E2A\u6587\u4EF6` : `\u63D0\u4EA4 ${stagedCount} \u4E2A\u5DF2\u6682\u5B58\u6587\u4EF6`;
  const submit = () => {
    if (!canCommit) return;
    void (async () => {
      const sha = await repoStore.commit(draft, selectedStagedPaths);
      if (sha) {
        onDraftChange("");
        onCommitted();
        setNotice({ kind: "ok", text: `\u5DF2\u63D0\u4EA4 ${sha.slice(0, 7)}` });
      } else if (!state.writeError) {
        setNotice({ kind: "err", text: "\u63D0\u4EA4\u672A\u5B8C\u6210" });
        return;
      } else {
        return;
      }
      window.setTimeout(() => setNotice(null), 6e3);
    })();
  };
  return /* @__PURE__ */ jsxs3("div", { className: "pg-commitbar", children: [
    notice && /* @__PURE__ */ jsx3("div", { className: notice.kind === "ok" ? "pg-okbar" : "pg-errorbar", role: "status", children: notice.text }),
    /* @__PURE__ */ jsx3(
      "textarea",
      {
        className: "pg-commit-input",
        rows: 2,
        placeholder: `${scopeText}\uFF08Ctrl+Enter \u63D0\u4EA4\uFF09`,
        value: draft,
        disabled: busy,
        "aria-label": "\u63D0\u4EA4\u4FE1\u606F",
        onChange: (e) => onDraftChange(e.target.value),
        onKeyDown: (e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }
      }
    ),
    /* @__PURE__ */ jsxs3("div", { className: "pg-commitbar-row", children: [
      /* @__PURE__ */ jsx3("span", { className: "pg-commit-scope", children: scopeText }),
      /* @__PURE__ */ jsx3(
        "button",
        {
          type: "button",
          className: "pg-primary-btn",
          disabled: !canCommit,
          title: !canCommit ? stagedCount === 0 && selectedStagedPaths.length === 0 ? "\u5148\u6682\u5B58\u8981\u63D0\u4EA4\u7684\u6587\u4EF6" : draft.trim() ? busy ? "\u6B63\u5728\u6267\u884C\u5176\u4ED6\u64CD\u4F5C" : "\u65E0\u53EF\u63D0\u4EA4\u5185\u5BB9" : "\u8BF7\u8F93\u5165\u63D0\u4EA4\u4FE1\u606F" : void 0,
          onClick: submit,
          children: busy ? "\u63D0\u4EA4\u4E2D\u2026" : "\u63D0\u4EA4"
        }
      )
    ] })
  ] });
}

// src/components/ChangesTab.tsx
import { jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
var drafts = /* @__PURE__ */ new Map();
function ChangesTab({ mode }) {
  const state = useRepoState();
  const status = state.status;
  const repoPath = state.repoPath ?? "";
  const [selected, setSelected] = useState4(/* @__PURE__ */ new Set());
  const [expanded, setExpanded] = useState4(null);
  const [draft, setDraft] = useState4(() => drafts.get(repoPath) ?? "");
  const changeDraft = (v) => {
    setDraft(v);
    drafts.set(repoPath, v);
  };
  useEffect3(() => {
    setDraft(drafts.get(repoPath) ?? "");
  }, [repoPath]);
  const anchorRef = useRef2(null);
  const rows = useMemo2(() => {
    const build = (area) => (path, change) => ({
      key: `${area}:${path}`,
      area,
      path,
      oldPath: change?.old_path,
      change
    });
    return {
      conflicted: (status?.conflicted ?? []).map((p) => build("conflicted")(p)),
      staged: (status?.staged ?? []).map((c) => build("staged")(c.path, c)),
      unstaged: (status?.unstaged ?? []).map((c) => build("unstaged")(c.path, c)),
      untracked: (status?.untracked ?? []).map((p) => build("untracked")(p))
    };
  }, [status]);
  useEffect3(() => {
    setSelected((prev) => {
      const all = /* @__PURE__ */ new Set();
      for (const list of Object.values(rows)) for (const r of list) all.add(r.key);
      const next = new Set([...prev].filter((k) => all.has(k)));
      return next.size === prev.size ? prev : next;
    });
  }, [rows]);
  if (!status) return state.statusLoading ? /* @__PURE__ */ jsx4(LoadingSkeleton, { rows: 8 }) : null;
  const busy = state.writeBusy !== null;
  const toggle = (key, shift, list) => {
    if (busy) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (shift && anchorRef.current !== null && anchorRef.current !== key) {
        const keys = list.map((r) => r.key);
        const a = keys.indexOf(anchorRef.current);
        const b = keys.indexOf(key);
        if (a !== -1 && b !== -1) {
          const [s, e] = a < b ? [a, b] : [b, a];
          for (let i = s; i <= e; i++) next.add(keys[i]);
          return next;
        }
      }
      if (next.has(key)) next.delete(key);
      else next.add(key);
      anchorRef.current = key;
      return next;
    });
  };
  const selectedRows = Object.values(rows).flat().filter((r) => selected.has(r.key));
  const selectedStaged = selectedRows.filter((r) => r.area === "staged");
  const selectedUnstaged = selectedRows.filter((r) => r.area === "unstaged" || r.area === "untracked");
  const allGroups = [
    { area: "conflicted", title: "\u51B2\u7A81", list: rows.conflicted },
    { area: "staged", title: "\u5DF2\u6682\u5B58", list: rows.staged },
    { area: "unstaged", title: "\u672A\u6682\u5B58", list: rows.unstaged },
    { area: "untracked", title: "\u672A\u8DDF\u8E2A", list: rows.untracked }
  ];
  const groups = allGroups.filter((g) => g.list.length > 0);
  return /* @__PURE__ */ jsxs4("div", { className: "pg-changes", children: [
    state.writeError && /* @__PURE__ */ jsx4(ErrorNote, { message: state.writeError }),
    selectedRows.length > 0 && /* @__PURE__ */ jsxs4("div", { className: "pg-batchbar", role: "toolbar", "aria-label": "\u6279\u91CF\u64CD\u4F5C", children: [
      /* @__PURE__ */ jsxs4("span", { className: "pg-batchbar-count", children: [
        "\u5DF2\u9009 ",
        selectedRows.length,
        " \u9879"
      ] }),
      /* @__PURE__ */ jsxs4(
        "button",
        {
          type: "button",
          className: "pg-mini",
          disabled: busy || selectedUnstaged.length === 0,
          title: selectedUnstaged.length === 0 ? "\u9009\u62E9\u96C6\u4E2D\u6CA1\u6709\u53EF\u6682\u5B58\u7684\u672A\u6682\u5B58/\u672A\u8DDF\u8E2A\u6587\u4EF6" : void 0,
          onClick: () => {
            void repoStore.batchStage(selectedUnstaged.map((r) => r.path)).then(() => setSelected(/* @__PURE__ */ new Set()));
          },
          children: [
            "\u6682\u5B58",
            selectedUnstaged.length > 0 ? ` ${selectedUnstaged.length}` : ""
          ]
        }
      ),
      /* @__PURE__ */ jsxs4(
        "button",
        {
          type: "button",
          className: "pg-mini",
          disabled: busy || selectedStaged.length === 0,
          title: selectedStaged.length === 0 ? "\u9009\u62E9\u96C6\u4E2D\u6CA1\u6709\u5DF2\u6682\u5B58\u6587\u4EF6" : void 0,
          onClick: () => {
            void repoStore.batchUnstage(selectedStaged.map((r) => r.path)).then(() => setSelected(/* @__PURE__ */ new Set()));
          },
          children: [
            "\u53D6\u6D88\u6682\u5B58",
            selectedStaged.length > 0 ? ` ${selectedStaged.length}` : ""
          ]
        }
      ),
      /* @__PURE__ */ jsx4("button", { type: "button", className: "pg-mini", onClick: () => setSelected(/* @__PURE__ */ new Set()), children: "\u6E05\u9664" })
    ] }),
    /* @__PURE__ */ jsxs4("div", { className: "pg-filelist", role: "listbox", "aria-multiselectable": "true", "aria-label": "\u53D8\u66F4\u6587\u4EF6", children: [
      groups.map((g) => /* @__PURE__ */ jsxs4("div", { className: "pg-group", children: [
        /* @__PURE__ */ jsxs4("div", { className: "pg-group-title", children: [
          g.title,
          " \xB7 ",
          g.list.length
        ] }),
        g.list.map((row) => /* @__PURE__ */ jsx4(
          FileRow,
          {
            row,
            mode,
            busy,
            selected: selected.has(row.key),
            expanded: expanded === row.key,
            statusVersion: state.statusVersion,
            onToggleSelect: (shift) => toggle(row.key, shift, g.list),
            onExpand: () => setExpanded((cur) => cur === row.key ? null : row.key)
          },
          row.key
        ))
      ] }, g.area)),
      groups.length === 0 && /* @__PURE__ */ jsx4("div", { className: "pg-clean", children: "\u6CA1\u6709\u672A\u63D0\u4EA4\u6539\u52A8" })
    ] }),
    /* @__PURE__ */ jsx4(
      CommitBar,
      {
        draft,
        onDraftChange: changeDraft,
        stagedCount: rows.staged.length,
        selectedStagedPaths: selectedStaged.map((r) => r.path),
        onCommitted: () => {
          setSelected(/* @__PURE__ */ new Set());
          setDraft("");
          drafts.delete(repoPath);
        }
      }
    )
  ] });
}
function FileRow({
  row,
  mode,
  busy,
  selected,
  expanded,
  statusVersion,
  onToggleSelect,
  onExpand
}) {
  const letter = row.change ? statusLetterOf(row.change) : "U";
  const tone = row.change ? STATUS_TONE[row.change.status] : "danger";
  const label = row.change ? STATUS_LABEL[row.change.status] : row.area === "conflicted" ? "\u51B2\u7A81" : "\u672A\u8DDF\u8E2A";
  const isStagedArea = row.area === "staged";
  const dir = mode === "narrow" ? "" : dirOf(row.path);
  return /* @__PURE__ */ jsxs4("div", { className: "pg-fileitem-wrap", children: [
    /* @__PURE__ */ jsxs4("div", { className: `pg-fileitem${expanded ? " pg-fileitem-on" : ""}`, children: [
      /* @__PURE__ */ jsx4(
        "input",
        {
          type: "checkbox",
          className: "pg-fileitem-check",
          checked: selected,
          disabled: busy,
          "aria-label": `\u9009\u62E9 ${row.path}`,
          onClick: (e) => {
            e.stopPropagation();
            onToggleSelect(e.shiftKey);
          },
          onChange: () => {
          }
        }
      ),
      /* @__PURE__ */ jsx4("span", { className: `pg-badge pg-badge-${tone}`, title: label, "aria-label": label, children: letter }),
      /* @__PURE__ */ jsxs4(
        "button",
        {
          type: "button",
          className: "pg-fileitem-name",
          title: row.path,
          onClick: onExpand,
          "aria-expanded": expanded,
          children: [
            /* @__PURE__ */ jsx4("span", { className: "pg-fileitem-base", children: baseName(row.oldPath ?? row.path) }),
            dir && /* @__PURE__ */ jsxs4("span", { className: "pg-fileitem-dir", children: [
              " ",
              dir
            ] }),
            row.oldPath && /* @__PURE__ */ jsxs4("span", { className: "pg-fileitem-dir", children: [
              " \u2190 ",
              baseName(row.oldPath)
            ] })
          ]
        }
      ),
      row.area === "conflicted" && /* @__PURE__ */ jsx4("span", { className: "pg-conflict-hint", children: "\u89E3\u51B3\u540E\u6682\u5B58" }),
      row.area === "staged" ? /* @__PURE__ */ jsx4(
        "button",
        {
          type: "button",
          className: "pg-mini",
          disabled: busy,
          "aria-label": `\u53D6\u6D88\u6682\u5B58 ${row.path}`,
          onClick: () => void repoStore.unstageFile(row.path),
          children: "\u53D6\u6D88\u6682\u5B58"
        }
      ) : /* @__PURE__ */ jsx4(
        "button",
        {
          type: "button",
          className: "pg-mini",
          disabled: busy,
          "aria-label": `\u6682\u5B58 ${row.path}`,
          onClick: () => void repoStore.stageFile(row.path),
          children: "\u6682\u5B58"
        }
      )
    ] }),
    expanded && /* @__PURE__ */ jsx4(InlineDiff, { row, statusVersion })
  ] });
}
var diffCache = /* @__PURE__ */ new Map();
function InlineDiff({ row, statusVersion }) {
  const [data, setData] = useState4(
    () => diffCache.get(`${statusVersion}:${row.key}`) ?? null
  );
  useEffect3(() => {
    const cacheKey = `${statusVersion}:${row.key}`;
    const hit = diffCache.get(cacheKey);
    if (hit) {
      setData(hit);
      return;
    }
    let alive = true;
    diffCache.clear();
    setData(null);
    const load = async () => {
      try {
        let entry;
        if (row.area === "staged") {
          entry = await repoStore.indexFileDiff(row.path);
        } else if (row.area === "untracked") {
          entry = await repoStore.worktreeFileDiff(row.path).catch(() => null) ?? {
            file_path: row.path,
            change_type: "added",
            old_content: "",
            new_content: ""
          };
          if (!entry.new_content && !entry.old_content && entry.change_type === "added") {
            entry = { ...entry, new_content: void 0 };
          }
        } else {
          entry = await repoStore.worktreeFileDiff(row.path);
        }
        const value = { entry, error: null };
        diffCache.set(cacheKey, value);
        if (alive) setData(value);
      } catch (e) {
        const value = { entry: null, error: e instanceof Error ? e.message : String(e) };
        diffCache.set(cacheKey, value);
        if (alive) setData(value);
      }
    };
    void load();
    return () => {
      alive = false;
    };
  }, [statusVersion, row.key, row.area, row.path]);
  return /* @__PURE__ */ jsx4("div", { className: "pg-inline-diff", children: /* @__PURE__ */ jsx4(
    DiffView,
    {
      entry: data?.entry ?? null,
      error: data?.error ?? void 0,
      loading: data === null,
      filePath: row.path
    }
  ) });
}

// src/components/HistoryTab.tsx
import { useEffect as useEffect4, useState as useState5 } from "react";
import { jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
function HistoryTab({ searchRef }) {
  const state = useRepoState();
  const [input, setInput] = useState5(state.logQuery);
  const [detailSha, setDetailSha] = useState5(null);
  useEffect4(() => {
    if (state.phase === "ready" && state.log.length === 0 && !state.logLoading && !state.logError) {
      void repoStore.loadLog(true);
    }
  }, [state.phase, state.log.length, state.logLoading, state.logError]);
  const runSearch = () => {
    repoStore.setSearchQuery(input);
    void repoStore.loadLog(true);
  };
  return /* @__PURE__ */ jsxs5("div", { className: "pg-history", children: [
    /* @__PURE__ */ jsxs5("div", { className: "pg-searchrow", children: [
      /* @__PURE__ */ jsx5(
        "input",
        {
          ref: searchRef,
          className: "pg-input pg-input-grow",
          placeholder: "\u641C\u7D22\u63D0\u4EA4\u4FE1\u606F / SHA\uFF08Enter \u641C\u7D22\uFF09",
          value: input,
          "aria-label": "\u641C\u7D22\u63D0\u4EA4",
          onChange: (e) => setInput(e.target.value),
          onKeyDown: (e) => {
            if (e.key === "Enter") runSearch();
            if (e.key === "Escape") {
              setInput("");
              repoStore.setSearchQuery("");
              void repoStore.loadLog(true);
            }
          }
        }
      ),
      input && /* @__PURE__ */ jsx5(
        "button",
        {
          type: "button",
          className: "pg-mini",
          "aria-label": "\u6E05\u9664\u641C\u7D22",
          onClick: () => {
            setInput("");
            repoStore.setSearchQuery("");
            void repoStore.loadLog(true);
          },
          children: "\u6E05\u9664"
        }
      )
    ] }),
    state.logError && /* @__PURE__ */ jsx5(ErrorNote, { message: `\u5386\u53F2\u52A0\u8F7D\u5931\u8D25\uFF1A${state.logError}`, onRetry: () => void repoStore.loadLog(true) }),
    state.logLoading ? /* @__PURE__ */ jsx5(LoadingSkeleton, { rows: 8 }) : state.log.length === 0 ? /* @__PURE__ */ jsx5(
      EmptyBlock,
      {
        title: state.logQuery ? "\u65E0\u5339\u914D\u63D0\u4EA4" : "\u6682\u65E0\u63D0\u4EA4",
        hint: state.logQuery ? "\u8C03\u6574\u5173\u952E\u8BCD\u540E\u91CD\u8BD5\uFF0C\u6216\u6E05\u9664\u7B5B\u9009\u3002" : state.status?.isEmpty ? "\u7A7A\u4ED3\u5E93\uFF1A\u63D0\u4EA4\u9996\u4E2A\u53D8\u66F4\u540E\u51FA\u73B0\u5728\u8FD9\u91CC\u3002" : void 0
      }
    ) : /* @__PURE__ */ jsxs5("div", { className: "pg-loglist", role: "list", children: [
      state.log.map((c) => /* @__PURE__ */ jsx5(
        LogRow,
        {
          sha: c.sha,
          shortSha: c.shortSha,
          message: c.message,
          author: c.author,
          timestamp: c.timestamp,
          refs: c.refs ?? [],
          expanded: detailSha === c.sha,
          onToggle: () => setDetailSha((cur) => cur === c.sha ? null : c.sha)
        },
        c.sha
      )),
      !state.logEnd && /* @__PURE__ */ jsx5(
        "button",
        {
          type: "button",
          className: "pg-more-btn",
          disabled: state.logLoadingMore,
          onClick: () => void repoStore.loadLog(false),
          children: state.logLoadingMore ? "\u52A0\u8F7D\u4E2D\u2026" : "\u52A0\u8F7D\u66F4\u591A"
        }
      )
    ] })
  ] });
}
function LogRow({
  sha,
  shortSha,
  message,
  author,
  timestamp,
  refs,
  expanded,
  onToggle
}) {
  return /* @__PURE__ */ jsxs5("div", { className: "pg-logitem-wrap", children: [
    /* @__PURE__ */ jsxs5(
      "button",
      {
        type: "button",
        className: `pg-logitem${expanded ? " pg-logitem-on" : ""}`,
        role: "listitem",
        "aria-expanded": expanded,
        onClick: onToggle,
        title: message,
        children: [
          /* @__PURE__ */ jsx5("span", { className: "pg-logitem-sha", children: shortSha }),
          /* @__PURE__ */ jsx5("span", { className: "pg-logitem-msg", children: firstLine(message) }),
          /* @__PURE__ */ jsxs5("span", { className: "pg-logitem-meta", children: [
            refs.slice(0, 2).map((r) => /* @__PURE__ */ jsx5("span", { className: `pg-ref pg-ref-${r.kind === "tag" ? "tag" : "branch"}`, children: r.name }, r.name)),
            /* @__PURE__ */ jsx5("span", { className: "pg-logitem-author", children: author }),
            /* @__PURE__ */ jsx5("span", { className: "pg-logitem-time", children: relativeTime(timestamp) })
          ] })
        ]
      }
    ),
    expanded && /* @__PURE__ */ jsx5(CommitDetail, { sha })
  ] });
}
function CommitDetail({ sha }) {
  const [data, setData] = useState5(null);
  const [error, setError] = useState5(null);
  const [openFile, setOpenFile] = useState5(null);
  useEffect4(() => {
    let alive = true;
    setData(null);
    setError(null);
    setOpenFile(null);
    void repoStore.commitDetails(sha).then((d) => {
      if (alive) setData(d);
    }).catch((e) => {
      if (alive) setError(e instanceof Error ? e.message : String(e));
    });
    return () => {
      alive = false;
    };
  }, [sha]);
  if (error) return /* @__PURE__ */ jsx5(ErrorNote, { message: `\u63D0\u4EA4\u8BE6\u60C5\u52A0\u8F7D\u5931\u8D25\uFF1A${error}` });
  if (!data) return /* @__PURE__ */ jsx5(LoadingSkeleton, { rows: 4 });
  return /* @__PURE__ */ jsxs5("div", { className: "pg-commitdetail", children: [
    /* @__PURE__ */ jsxs5("div", { className: "pg-commitdetail-head", children: [
      /* @__PURE__ */ jsx5("pre", { className: "pg-commitdetail-msg", children: data.commit.message }),
      /* @__PURE__ */ jsxs5("div", { className: "pg-commitdetail-meta", children: [
        data.commit.author,
        " <",
        data.commit.authorEmail,
        "> \xB7 ",
        relativeTime(data.commit.timestamp),
        " \xB7",
        " ",
        data.totalAdditions,
        " \u589E / ",
        data.totalDeletions,
        " \u5220"
      ] })
    ] }),
    /* @__PURE__ */ jsx5("div", { className: "pg-commitdetail-files", children: data.files.map((f) => /* @__PURE__ */ jsxs5("div", { className: "pg-commitdetail-file", children: [
      /* @__PURE__ */ jsxs5(
        "button",
        {
          type: "button",
          className: `pg-fileitem-name pg-fileitem-name-btn${openFile === f.file_path ? " pg-fileitem-on" : ""}`,
          title: f.file_path,
          "aria-expanded": openFile === f.file_path,
          onClick: () => setOpenFile((cur) => cur === f.file_path ? null : f.file_path),
          children: [
            /* @__PURE__ */ jsx5("span", { className: "pg-fileitem-base", children: f.file_path }),
            /* @__PURE__ */ jsxs5("span", { className: "pg-diffcount", children: [
              /* @__PURE__ */ jsxs5("span", { className: "pg-addcount", children: [
                "+",
                f.additions ?? 0
              ] }),
              " ",
              /* @__PURE__ */ jsxs5("span", { className: "pg-delcount", children: [
                "-",
                f.deletions ?? 0
              ] })
            ] })
          ]
        }
      ),
      openFile === f.file_path && /* @__PURE__ */ jsx5(DiffView, { entry: f, filePath: f.file_path })
    ] }, f.file_path)) })
  ] });
}

// src/components/ListTabs.tsx
import { Fragment as Fragment2, jsx as jsx6, jsxs as jsxs6 } from "react/jsx-runtime";
function ListShell({
  listKey,
  children
}) {
  const state = useRepoState();
  const list = state[listKey];
  useEnsureList(listKey, state.phase === "ready");
  if (list.loading && list.data === null) return /* @__PURE__ */ jsx6(LoadingSkeleton, { rows: 6 });
  if (list.error) {
    return /* @__PURE__ */ jsx6(ErrorNote, { message: `${list.error}`, onRetry: () => void repoStore.loadList(listKey, true) });
  }
  if (list.data === null) return null;
  return /* @__PURE__ */ jsxs6("div", { className: "pg-listtab", children: [
    /* @__PURE__ */ jsx6(
      "button",
      {
        type: "button",
        className: "pg-mini pg-refresh-inline",
        "aria-label": "\u5237\u65B0",
        onClick: () => void repoStore.loadList(listKey, true),
        children: "\u5237\u65B0"
      }
    ),
    children(list.data)
  ] });
}
function BranchesTab() {
  const state = useRepoState();
  return /* @__PURE__ */ jsx6(ListShell, { listKey: "branches", children: (data) => {
    const branches = data;
    const current = state.status?.branch ?? "";
    const local = branches.filter((b) => !b.isRemote);
    const remote = branches.filter((b) => b.isRemote);
    return /* @__PURE__ */ jsxs6(Fragment2, { children: [
      /* @__PURE__ */ jsx6(BranchGroup, { title: "\u672C\u5730\u5206\u652F", branches: local, current }),
      remote.length > 0 && /* @__PURE__ */ jsx6(BranchGroup, { title: "\u8FDC\u7A0B\u5206\u652F", branches: remote, current })
    ] });
  } });
}
function BranchGroup({
  title,
  branches,
  current
}) {
  const sorted = [...branches].sort((a, b) => {
    const ac = a.isCurrent || a.name === current ? 0 : 1;
    const bc = b.isCurrent || b.name === current ? 0 : 1;
    return ac - bc;
  });
  return /* @__PURE__ */ jsxs6("div", { className: "pg-group", children: [
    /* @__PURE__ */ jsxs6("div", { className: "pg-group-title", children: [
      title,
      " \xB7 ",
      sorted.length
    ] }),
    sorted.map((b) => /* @__PURE__ */ jsxs6("div", { className: `pg-row${b.isCurrent || b.name === current ? " pg-row-current" : ""}`, children: [
      /* @__PURE__ */ jsx6("span", { className: "pg-row-main", title: b.name, children: b.name }),
      /* @__PURE__ */ jsxs6("span", { className: "pg-row-meta", children: [
        (b.ahead ?? 0) > 0 && /* @__PURE__ */ jsxs6("span", { className: "pg-ab", "aria-label": `\u9886\u5148 ${b.ahead} \u4E2A\u63D0\u4EA4`, children: [
          "\u2191",
          b.ahead
        ] }),
        (b.behind ?? 0) > 0 && /* @__PURE__ */ jsxs6("span", { className: "pg-ab", "aria-label": `\u843D\u540E ${b.behind} \u4E2A\u63D0\u4EA4`, children: [
          "\u2193",
          b.behind
        ] }),
        b.lastCommitDate ? /* @__PURE__ */ jsx6("span", { className: "pg-row-time", children: relativeTime(b.lastCommitDate) }) : null
      ] })
    ] }, b.name))
  ] });
}
function RemotesTab() {
  return /* @__PURE__ */ jsx6(ListShell, { listKey: "remotes", children: (data) => {
    const remotes = data;
    if (remotes.length === 0) {
      return /* @__PURE__ */ jsx6(EmptyBlock, { title: "\u6CA1\u6709\u914D\u7F6E\u8FDC\u7A0B\u4ED3\u5E93", hint: "\u672C\u8F6E\u63D2\u4EF6\u4E3A\u53EA\u8BFB\u67E5\u8BE2\uFF0C\u6DFB\u52A0\u8FDC\u7A0B\u8BF7\u5728\u7EC8\u7AEF\u6216\u5185\u7F6E\u5DE5\u5177\u5B8C\u6210\u3002" });
    }
    return /* @__PURE__ */ jsx6("div", { className: "pg-group", children: remotes.map((r) => /* @__PURE__ */ jsxs6("div", { className: "pg-row pg-row-stack", children: [
      /* @__PURE__ */ jsx6("span", { className: "pg-row-main", children: r.name }),
      r.fetch_url && /* @__PURE__ */ jsxs6("span", { className: "pg-row-sub", title: r.fetch_url, children: [
        "fetch: ",
        r.fetch_url
      ] }),
      r.push_url && r.push_url !== r.fetch_url && /* @__PURE__ */ jsxs6("span", { className: "pg-row-sub", title: r.push_url, children: [
        "push: ",
        r.push_url
      ] })
    ] }, r.name)) });
  } });
}
function TagsTab() {
  return /* @__PURE__ */ jsx6(ListShell, { listKey: "tags", children: (data) => {
    const tags = data;
    if (tags.length === 0) return /* @__PURE__ */ jsx6(EmptyBlock, { title: "\u6CA1\u6709\u6807\u7B7E" });
    return /* @__PURE__ */ jsx6("div", { className: "pg-group", children: tags.map((t) => /* @__PURE__ */ jsxs6("div", { className: "pg-row", children: [
      /* @__PURE__ */ jsxs6("span", { className: "pg-row-main", title: t.message ?? t.name, children: [
        t.name,
        t.isAnnotated ? /* @__PURE__ */ jsx6("span", { className: "pg-tag-annotated", title: "\u9644\u6CE8\u6807\u7B7E", children: " \u2295" }) : null
      ] }),
      /* @__PURE__ */ jsxs6("span", { className: "pg-row-meta", children: [
        /* @__PURE__ */ jsx6("span", { className: "pg-row-sha", children: t.shortSha }),
        t.timestamp ? /* @__PURE__ */ jsx6("span", { className: "pg-row-time", children: relativeTime(t.timestamp) }) : null
      ] })
    ] }, t.name)) });
  } });
}
function GitignoreTab() {
  const state = useRepoState();
  return /* @__PURE__ */ jsx6(ListShell, { listKey: "gitignore", children: (data) => {
    const gi = data;
    if (!gi.exists) {
      return /* @__PURE__ */ jsx6(EmptyBlock, { title: "\u4ED3\u5E93\u6CA1\u6709 .gitignore", hint: `\u9884\u671F\u8DEF\u5F84\uFF1A${gi.path}` });
    }
    return /* @__PURE__ */ jsxs6("div", { className: "pg-gitignore", children: [
      /* @__PURE__ */ jsx6("div", { className: "pg-group-title", title: gi.path, children: ".gitignore\uFF08\u53EA\u8BFB\uFF09" }),
      /* @__PURE__ */ jsx6("pre", { className: "pg-gitignore-content", children: gi.content }),
      /* @__PURE__ */ jsx6("div", { className: "pg-hint", children: "\u672C\u8F6E\u63D2\u4EF6\u4E3A\u53EA\u8BFB\u67E5\u8BE2\uFF1B\u7F16\u8F91 .gitignore \u8BF7\u5728\u7F16\u8F91\u5668\u4E2D\u4FEE\u6539\u3002" })
    ] });
  } });
}

// src/components/StashTab.tsx
import { useEffect as useEffect5, useState as useState6 } from "react";
import { jsx as jsx7, jsxs as jsxs7 } from "react/jsx-runtime";
function StashTab() {
  const state = useRepoState();
  useEnsureList("stashes", state.phase === "ready");
  const list = state.stashes;
  const [showIndex, setShowIndex] = useState6(null);
  if (list.loading && list.data === null) return /* @__PURE__ */ jsx7(LoadingSkeleton, { rows: 5 });
  if (list.error) {
    return /* @__PURE__ */ jsx7(ErrorNote, { message: list.error, onRetry: () => void repoStore.loadList("stashes", true) });
  }
  if (list.data === null) return null;
  if (list.data.length === 0) {
    return /* @__PURE__ */ jsx7(EmptyBlock, { title: "\u6CA1\u6709 stash", hint: "\u4FDD\u5B58 stash \u4E3A\u5199\u64CD\u4F5C\uFF0C\u672C\u8F6E\u63D2\u4EF6\u672A\u63D0\u4F9B\u3002" });
  }
  return /* @__PURE__ */ jsxs7("div", { className: "pg-listtab", children: [
    /* @__PURE__ */ jsx7("div", { className: "pg-group", children: list.data.map((s) => /* @__PURE__ */ jsxs7("div", { className: "pg-stashitem-wrap", children: [
      /* @__PURE__ */ jsxs7(
        "button",
        {
          type: "button",
          className: `pg-row pg-row-btn${showIndex === s.index ? " pg-row-current" : ""}`,
          "aria-expanded": showIndex === s.index,
          onClick: () => setShowIndex((cur) => cur === s.index ? null : s.index),
          title: s.message,
          children: [
            /* @__PURE__ */ jsxs7("span", { className: "pg-row-main", children: [
              /* @__PURE__ */ jsxs7("span", { className: "pg-row-sha", children: [
                "#",
                s.index
              ] }),
              " ",
              s.message
            ] }),
            /* @__PURE__ */ jsxs7("span", { className: "pg-row-meta", children: [
              /* @__PURE__ */ jsx7("span", { className: "pg-row-time", children: s.branch }),
              /* @__PURE__ */ jsx7("span", { className: "pg-row-time", children: relativeTime(s.timestamp) })
            ] })
          ]
        }
      ),
      showIndex === s.index && /* @__PURE__ */ jsx7(StashPatch, { index: s.index })
    ] }, s.index)) }),
    /* @__PURE__ */ jsx7("div", { className: "pg-hint", children: "apply / pop / drop \u4E3A\u5199\u64CD\u4F5C\uFF0C\u672C\u8F6E\u63D2\u4EF6\u672A\u63D0\u4F9B\uFF08\u6682\u5B58/\u63D0\u4EA4\u4E4B\u5916\u7684\u5199\u52A8\u4F5C\u5F85\u540E\u7EED\u6279\u6B21\uFF09\u3002" })
  ] });
}
function StashPatch({ index }) {
  const [patch, setPatch] = useState6(null);
  const [error, setError] = useState6(null);
  useEffect5(() => {
    let alive = true;
    setPatch(null);
    setError(null);
    void repoStore.stashShow(index).then((p) => {
      if (alive) setPatch(p);
    }).catch((e) => {
      if (alive) setError(e instanceof Error ? e.message : String(e));
    });
    return () => {
      alive = false;
    };
  }, [index]);
  return /* @__PURE__ */ jsx7("div", { className: "pg-inline-diff", children: /* @__PURE__ */ jsx7(DiffView, { patchText: patch, error, loading: patch === null && error === null, filePath: `stash@{${index}}` }) });
}

// src/components/Panel.tsx
import { Fragment as Fragment3, jsx as jsx8, jsxs as jsxs8 } from "react/jsx-runtime";
var TABS = [
  { id: "changes", label: "\u53D8\u66F4" },
  { id: "history", label: "\u5386\u53F2" },
  { id: "branch", label: "\u5206\u652F" },
  { id: "remote", label: "\u8FDC\u7A0B" },
  { id: "tags", label: "\u6807\u7B7E" },
  { id: "stash", label: "Stash" },
  { id: "gitignore", label: "\u5FFD\u7565" }
];
function Panel() {
  const state = useRepoState();
  const [tab, setTab] = useState7("changes");
  const { ref, mode } = useContainerWidth();
  useEffect6(() => {
    repoStore.init();
  }, []);
  if (!hasHostBridge()) {
    return /* @__PURE__ */ jsx8("div", { className: "pg-root", "data-mode": "regular", children: /* @__PURE__ */ jsx8(
      EmptyBlock,
      {
        title: "\u5BBF\u4E3B\u6865\u4E0D\u53EF\u7528",
        hint: "\u9700\u8981 Polaris \u4E3B\u5E94\u7528\u63D0\u4F9B __POLARIS_HOST_INVOKE__\uFF08\u8BF7\u5347\u7EA7\u4E3B\u5E94\u7528\uFF09\u3002"
      }
    ) });
  }
  return /* @__PURE__ */ jsxs8("div", { className: "pg-root", ref, "data-mode": mode, children: [
    /* @__PURE__ */ jsx8(RepositoryHeader, { mode }),
    state.phase === "ready" && /* @__PURE__ */ jsx8(TabStrip, { active: tab, onChange: setTab, mode, changeCount: state.status ? totalChangeCount(state.status) : 0 }),
    state.phase === "ready" && state.status?.conflicted.length ? /* @__PURE__ */ jsxs8("div", { className: "pg-conflictbar", role: "alert", children: [
      "\u6709 ",
      state.status.conflicted.length,
      " \u4E2A\u672A\u89E3\u51B3\u51B2\u7A81\u6587\u4EF6\uFF08\u53D8\u66F4\u9875\u7F6E\u9876\uFF09"
    ] }) : null,
    /* @__PURE__ */ jsxs8("div", { className: "pg-content", children: [
      state.phase === "no-workspace" && /* @__PURE__ */ jsx8(NoWorkspaceBlock, {}),
      state.phase === "probing" && /* @__PURE__ */ jsx8(LoadingSkeleton, { rows: 6 }),
      state.phase === "no-repo" && /* @__PURE__ */ jsx8(NoRepoBlock, { wsPath: state.wsPath }),
      state.phase === "error" && /* @__PURE__ */ jsx8(
        ErrorNote,
        {
          message: state.error ?? "\u4ED3\u5E93\u63A2\u6D4B\u5931\u8D25",
          onRetry: () => state.wsPath && repoStore.setWorkspace(state.wsPath)
        }
      ),
      state.phase === "ready" && /* @__PURE__ */ jsxs8(Fragment3, { children: [
        state.error && /* @__PURE__ */ jsx8(ErrorNote, { message: state.error, onRetry: () => void repoStore.refreshStatus(false) }),
        state.statusLoading && !state.status && /* @__PURE__ */ jsx8(LoadingSkeleton, { rows: 8 }),
        state.status && /* @__PURE__ */ jsxs8(Fragment3, { children: [
          tab === "changes" && /* @__PURE__ */ jsx8(ChangesTab, { mode }),
          tab === "history" && /* @__PURE__ */ jsx8(HistoryTab, {}),
          tab === "branch" && /* @__PURE__ */ jsx8(BranchesTab, {}),
          tab === "remote" && /* @__PURE__ */ jsx8(RemotesTab, {}),
          tab === "tags" && /* @__PURE__ */ jsx8(TagsTab, {}),
          tab === "stash" && /* @__PURE__ */ jsx8(StashTab, {}),
          tab === "gitignore" && /* @__PURE__ */ jsx8(GitignoreTab, {})
        ] })
      ] })
    ] })
  ] });
}
function RepositoryHeader({ mode }) {
  const state = useRepoState();
  const status = state.status;
  const refreshing = state.refreshing || state.statusLoading;
  const repoName = state.repoPath ? state.repoPath.replace(/\\/g, "/").split("/").filter(Boolean).pop() : null;
  return /* @__PURE__ */ jsxs8("div", { className: "pg-header", title: state.repoPath ?? state.wsPath ?? void 0, children: [
    /* @__PURE__ */ jsx8("span", { className: "pg-header-repo", title: state.repoPath ?? void 0, children: repoName ?? "Git" }),
    status && !status.isEmpty && /* @__PURE__ */ jsxs8("span", { className: "pg-header-branch", title: `\u5206\u652F ${status.branch} \xB7 ${status.shortCommit}`, children: [
      status.branch,
      (status.ahead > 0 || status.behind > 0) && /* @__PURE__ */ jsxs8("span", { className: "pg-ab-wrap", children: [
        status.ahead > 0 && /* @__PURE__ */ jsxs8("span", { className: "pg-ab", "aria-label": `\u9886\u5148 ${status.ahead} \u4E2A\u63D0\u4EA4`, children: [
          "\u2191",
          status.ahead
        ] }),
        status.behind > 0 && /* @__PURE__ */ jsxs8("span", { className: "pg-ab", "aria-label": `\u843D\u540E ${status.behind} \u4E2A\u63D0\u4EA4`, children: [
          "\u2193",
          status.behind
        ] })
      ] })
    ] }),
    state.repos.length > 1 && /* @__PURE__ */ jsx8(
      "select",
      {
        className: "pg-header-repos",
        value: state.repoPath ?? "",
        "aria-label": "\u9009\u62E9\u4ED3\u5E93",
        onChange: (e) => repoStore.selectRepo(e.target.value),
        children: state.repos.map((r) => /* @__PURE__ */ jsx8("option", { value: r.path, children: r.name }, r.path))
      }
    ),
    /* @__PURE__ */ jsx8("span", { className: "pg-header-actions", children: /* @__PURE__ */ jsx8(
      "button",
      {
        type: "button",
        className: `pg-iconbtn${refreshing ? " pg-spinning" : ""}`,
        "aria-label": "\u5237\u65B0\u4ED3\u5E93\u72B6\u6001",
        title: "\u5237\u65B0",
        disabled: refreshing || state.phase !== "ready",
        onClick: () => {
          void repoStore.refreshStatus(true);
          for (const key of ["branches", "remotes", "tags", "stashes", "gitignore"]) {
            void repoStore.loadList(key, true);
          }
        },
        children: "\u27F3"
      }
    ) }),
    mode === "narrow" ? null : null
  ] });
}
function TabStrip({
  active,
  onChange,
  mode,
  changeCount
}) {
  return /* @__PURE__ */ jsx8("div", { className: "pg-tabstrip", role: "tablist", "aria-label": "Git \u529F\u80FD\u9875", children: TABS.map((t) => {
    const count = t.id === "changes" ? changeCount : void 0;
    return /* @__PURE__ */ jsxs8(
      "button",
      {
        type: "button",
        role: "tab",
        "aria-selected": active === t.id,
        "aria-label": t.label + (count ? `\uFF08${count} \u9879\u53D8\u66F4\uFF09` : ""),
        className: `pg-tab${active === t.id ? " pg-tab-on" : ""}`,
        onClick: () => onChange(t.id),
        children: [
          t.label,
          count ? /* @__PURE__ */ jsx8("span", { className: "pg-tab-count", children: count }) : null
        ]
      },
      t.id
    );
  }) });
}

// src/badge.tsx
import { useEffect as useEffect7, useRef as useRef3, useState as useState8 } from "react";
import { jsx as jsx9, jsxs as jsxs9 } from "react/jsx-runtime";
var DEBOUNCE_MS = 600;
var FALLBACK_MS = 3e4;
var badgeStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  maxWidth: 150,
  minWidth: 0,
  padding: "0 5px",
  height: 20,
  borderRadius: 4,
  border: "1px solid rgb(var(--c-border) / 0.15)",
  background: "rgb(var(--c-bg-subtle))",
  color: "rgb(var(--c-text-secondary))",
  fontSize: 11,
  lineHeight: "18px",
  cursor: "default",
  userSelect: "none"
};
var branchStyle = {
  maxWidth: 100,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap"
};
var countStyle = {
  minWidth: 14,
  padding: "0 3px",
  borderRadius: 7,
  background: "rgb(var(--c-primary) / 0.16)",
  color: "rgb(var(--c-primary))",
  fontSize: 10,
  textAlign: "center"
};
var aheadBehindStyle = {
  fontSize: 10,
  color: "rgb(var(--c-text-tertiary, var(--c-text-secondary)))",
  whiteSpace: "nowrap"
};
function BranchBadge() {
  const [status, setStatus] = useState8(null);
  const timerRef = useRef3(null);
  const disposedRef = useRef3(false);
  useEffect7(() => {
    disposedRef.current = false;
    const load = async () => {
      const workspacePath = currentWorkspacePath();
      if (!workspacePath) {
        if (!disposedRef.current) setStatus(null);
        return;
      }
      try {
        const next = await capGit("get_status", { workspacePath });
        if (!disposedRef.current) setStatus(next?.exists ? next : null);
      } catch {
        if (!disposedRef.current) setStatus(null);
      }
    };
    const schedule = () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        void load();
      }, DEBOUNCE_MS);
    };
    const offWorkspace = onWorkspaceChanged(() => schedule());
    const offFs = listenFileSystemChange(schedule);
    const interval = window.setInterval(() => void load(), FALLBACK_MS);
    return () => {
      disposedRef.current = true;
      offWorkspace();
      offFs();
      window.clearInterval(interval);
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);
  if (!status) return null;
  const changes = status.staged.length + status.unstaged.length + status.untracked.length;
  const ahead = status.ahead ?? 0;
  const behind = status.behind ?? 0;
  const branch = status.branch || "HEAD";
  const title = [
    `Git: ${branch}`,
    changes > 0 ? `${changes} \u4E2A\u53D8\u66F4` : "\u5DE5\u4F5C\u533A\u5E72\u51C0",
    ahead > 0 ? `\u9886\u5148 ${ahead}` : "",
    behind > 0 ? `\u843D\u540E ${behind}` : ""
  ].filter(Boolean).join(" \xB7 ");
  return /* @__PURE__ */ jsxs9("span", { className: "pg-branch-badge", style: badgeStyle, title, "aria-label": title, children: [
    /* @__PURE__ */ jsx9("span", { style: branchStyle, children: branch }),
    (ahead > 0 || behind > 0) && /* @__PURE__ */ jsxs9("span", { style: aheadBehindStyle, children: [
      ahead > 0 ? `\u2191${ahead}` : "",
      behind > 0 ? `\u2193${behind}` : ""
    ] }),
    changes > 0 && /* @__PURE__ */ jsx9("span", { style: countStyle, children: changes })
  ] });
}

// src/index.tsx
import { jsx as jsx10 } from "react/jsx-runtime";
function PolarisGitEntry(props) {
  return /* @__PURE__ */ jsx10(Panel, {});
}
function registerUi(host, ctx) {
  host.registerFileExplorerToolbar(
    "branch-badge",
    BranchBadge,
    10
  );
  host.registerDiffRefreshProvider(async (filePath, workspacePath) => {
    try {
      const entry = await capGit("get_worktree_file_diff", {
        workspacePath,
        filePath
      });
      if (!entry || typeof entry !== "object") return null;
      return entry;
    } catch {
      return null;
    }
  });
}
export {
  PolarisGitEntry as default,
  registerUi
};
