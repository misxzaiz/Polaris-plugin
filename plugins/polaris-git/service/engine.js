/**
 * engine.js —— 零 npm 依赖的 Git 引擎（Node >= 18）
 *
 * 用 child_process.execFile('git', args, { cwd }) 实现主仓 cap.git 的 KNOWN_ACTIONS
 * 全部 77 个 action。返回 JSON 字段名严格对齐主仓 models/git.rs 的 serde 序列化
 * （逐结构体声明 camelCase / snake_case，见同目录 README.md 覆盖矩阵）。
 *
 * 设计要点：
 *  - 一律 execFile 数组参数 + shell:false，绝不拼接命令字符串，杜绝命令注入；
 *    workspacePath 仅作为 cwd，必须存在且为目录。
 *  - R1 零降级：77 个 action 全部为真实实现，不再有任何 UNSUPPORTED 返回；
 *    唯一的「能力不可用」是 PR 动作在 gh CLI 未安装时返回结构化
 *    PR_CLI_UNAVAILABLE（带安装提示），历史缺口见 service/UNSUPPORTED.md。
 *  - 未知 action 返回明确错误并列出支持列表。
 *  - dispatch(action, params) 统一返回 { ok:true,data } | { ok:false,error } 信封，
 *    与 POST /dispatch 的响应形状一致，供 main.js / 测试直接消费。
 *
 * 本插件 package.json 为 "type": "module"，故使用 ESM。
 */
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  KNOWN_ACTIONS,
  ALIASES,
  UNSUPPORTED_REASONS,
} from './actions.js';
import {
  listUndoSnapshots,
  restoreUndoSnapshot,
  dropUndoSnapshot,
  listOperations,
  clearOperations,
} from './state.js';

// R1：PR 动作探测的 gh 命令名，可由环境变量覆盖（测试注入不存在的命令以稳定验证
// PR_CLI_UNAVAILABLE 分支；生产默认 'gh'）。仍是 execFile 数组参数，不经 shell。
const GH_CLI = (process.env.POLARIS_GIT_GH_CLI || 'gh').trim() || 'gh';

const MAX_BUFFER = 64 * 1024 * 1024;
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
const COMMIT_FORMAT = '%H%x1f%P%x1f%an%x1f%ae%x1f%ct%x1f%B%x1e';
const REFLOG_FORMAT = '%H%x1f%h%x1f%gs%x1f%ct%x1f%gD%x1e';

/** 引擎错误（message 直接进入 { ok:false, error }）。 */
class EngineError extends Error {}

/**
 * 结构化错误：除 error 文本外，在信封上附带 code 与 extra（R1 用于
 * PR_CLI_UNAVAILABLE 这类带安装提示的可判定错误，而非 UNSUPPORTED）。
 */
class StructuredError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.code = code;
    this.extra = extra;
  }
}

// ── 底层 git 执行器（唯一出站点）──────────────────────────────────────────
/**
 * 执行 git。永远 resolve（不 reject），便于把非零退出码当作业务结果处理。
 * stdout 按 encoding 原样返回：utf8 时为 string，buffer 时为 Buffer。
 */
function runGit(cwd, args, opts = {}) {
  const { encoding = 'utf8', env, ...rest } = opts;
  return new Promise((resolve) => {
    execFile('git', args, {
      cwd,
      encoding,
      maxBuffer: MAX_BUFFER,
      windowsHide: true,
      shell: false, // 关键：不经 shell，参数以数组逐项传递
      env: env ? { ...process.env, ...env } : process.env,
      ...rest,
    }, (err, stdout, stderr) => {
      resolve({
        ok: !err,
        code: err ? (typeof err.code === 'number' ? err.code : 1) : 0,
        stdout: stdout == null ? (encoding === 'buffer' ? Buffer.alloc(0) : '') : stdout,
        stderr: stderr == null ? '' : String(stderr),
        enoent: !!(err && err.code === 'ENOENT'),
      });
    });
  });
}

/**
 * 执行任意外部 CLI（R1 PR 动作探测 gh）。同样 execFile 数组参数 + shell:false，
 * 永不 reject；enoent 用于判定「CLI 未安装」→ 结构化 PR_CLI_UNAVAILABLE。
 */
function runExec(cmd, cwd, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, {
      cwd,
      encoding: 'utf8',
      maxBuffer: MAX_BUFFER,
      windowsHide: true,
      shell: false,
      ...opts,
    }, (err, stdout, stderr) => {
      resolve({
        ok: !err,
        stdout: stdout == null ? '' : String(stdout),
        stderr: stderr == null ? '' : String(stderr),
        enoent: !!(err && err.code === 'ENOENT'),
      });
    });
  });
}

function gitErrMsg(args, r) {
  if (r.enoent) return '未找到 git CLI：请确保系统已安装 git 且在 PATH 中';
  const detail = r.stderr.trim()
    || (typeof r.stdout === 'string' ? r.stdout.trim() : '')
    || `git ${args[0] || ''} 执行失败（退出码 ${r.code}）`;
  return detail;
}

/** 执行并要求成功，返回 stdout 字符串。 */
async function gitText(cwd, args, opts) {
  const r = await runGit(cwd, args, opts);
  if (!r.ok) throw new EngineError(gitErrMsg(args, r));
  return String(r.stdout);
}

/** 提交类命令：仓库未配置 user.name/user.email 时注入兜底身份，避免插件首次提交失败。 */
async function identityArgs(cwd) {
  const out = [];
  const n = await runGit(cwd, ['config', 'user.name']);
  const e = await runGit(cwd, ['config', 'user.email']);
  if (!n.ok || !String(n.stdout).trim()) out.push('-c', 'user.name=Polaris Git Plugin');
  if (!e.ok || !String(e.stdout).trim()) out.push('-c', 'user.email=polaris-git@localhost');
  return out;
}

/** 可能产生 commit 的命令统一入口（前置 -c 身份 + 免交互编辑器）。 */
async function commitGit(cwd, args) {
  const id = await identityArgs(cwd);
  return runGit(cwd, [...id, ...args], {
    env: { GIT_EDITOR: 'true', GIT_SEQUENCE_EDITOR: 'true' },
  });
}

async function commitGitOk(cwd, args) {
  const r = await commitGit(cwd, args);
  if (!r.ok) throw new EngineError(gitErrMsg(args, r));
  return String(r.stdout);
}

// ── 参数提取 helpers ─────────────────────────────────────────────────────
function reqStr(params, key) {
  const v = params && params[key];
  if (typeof v !== 'string') throw new EngineError(`Missing required argument: ${key}`);
  return v;
}
function optStr(params, key) {
  const v = params && params[key];
  return typeof v === 'string' && v !== '' ? v : null;
}
function boolOr(params, key, dflt) {
  const v = params && params[key];
  return typeof v === 'boolean' ? v : dflt;
}
function optNum(params, key) {
  const v = params && params[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function reqNum(params, key) {
  const v = params && params[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new EngineError(`Missing required argument: ${key}`);
  return v;
}
function strArr(params, key) {
  const v = params && params[key];
  return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
}

/** workspacePath 必须存在且为目录（路径安全校验；cwd 之外绝不做 shell 拼接）。 */
function ws(params) {
  const p = params && params.workspacePath;
  if (typeof p !== 'string' || p.trim() === '') throw new EngineError('Missing required argument: workspacePath');
  let st;
  try { st = fs.statSync(p); } catch { throw new EngineError(`workspacePath 不存在或不可访问: ${p}`); }
  if (!st.isDirectory()) throw new EngineError(`workspacePath 不是目录: ${p}`);
  return p;
}

/** 取工作区路径并确认其为 git 工作树。 */
async function repo(params) {
  const cwd = ws(params);
  const r = await runGit(cwd, ['rev-parse', '--is-inside-work-tree']);
  if (!r.ok || r.stdout.trim() !== 'true') throw new EngineError(`不是 git 仓库（或为裸仓库）: ${cwd}`);
  return cwd;
}

// ── 通用解析 / 计算 helpers ──────────────────────────────────────────────
function toLines(s) {
  if (!s) return [];
  const a = String(s).split(/\r?\n/);
  if (a.length && a[a.length - 1] === '') a.pop();
  return a;
}

/** 计算行级 diff 的 additions/deletions（基于 LCS 长度，仅需两行滚动数组）。 */
function computeLineDiff(oldText, newText) {
  const a = toLines(oldText);
  const b = toLines(newText);
  const n = a.length;
  const m = b.length;
  if (n === 0) return { additions: m, deletions: 0 };
  if (m === 0) return { additions: 0, deletions: n };
  if (n * m > 4_000_000) {
    // 超大文件：多重集近似，避免 O(n*m) 内存/时间
    const counts = new Map();
    for (const l of a) counts.set(l, (counts.get(l) || 0) + 1);
    let common = 0;
    for (const l of b) {
      const c = counts.get(l) || 0;
      if (c > 0) { common += 1; counts.set(l, c - 1); }
    }
    return { additions: Math.max(0, m - common), deletions: Math.max(0, n - common) };
  }
  let prev = new Int32Array(m + 1);
  let cur = new Int32Array(m + 1);
  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    }
    const t = prev; prev = cur; cur = t;
    cur.fill(0);
  }
  const lcs = prev[m];
  return { additions: m - lcs, deletions: n - lcs };
}

function shortSha(sha) { return String(sha || '').slice(0, 8); }

function isBinaryBuf(buf) {
  if (!buf) return false;
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i += 1) if (buf[i] === 0) return true;
  return false;
}
const BINARY_EXT = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico', 'webp', 'tif', 'tiff', 'psd',
  'pdf', 'zip', 'gz', 'tgz', 'bz2', 'xz', '7z', 'rar', 'tar', 'jar', 'war',
  'exe', 'dll', 'so', 'dylib', 'o', 'a', 'obj', 'lib', 'class', 'pyc',
  'bin', 'dat', 'db', 'sqlite', 'woff', 'woff2', 'ttf', 'eot', 'otf',
  'mp3', 'mp4', 'avi', 'mov', 'mkv', 'wav', 'flac', 'ogg', 'iso',
]);
function isBinaryPath(p) {
  const ext = path.extname(String(p || '')).slice(1).toLowerCase();
  return BINARY_EXT.has(ext);
}

/** git commit 记录解析（记录分隔 \x1e，字段分隔 \x1f）。 */
function parseCommits(text) {
  const out = [];
  for (const raw of String(text || '').split('\x1e')) {
    const rec = raw.trim();
    if (!rec) continue;
    const p = rec.split('\x1f');
    if (p.length < 6) continue;
    const sha = p[0].trim();
    out.push({
      sha,
      shortSha: shortSha(sha),
      message: p[5].trim(),
      author: p[2].trim(),
      authorEmail: p[3].trim(),
      timestamp: parseInt(p[4].trim(), 10) || 0,
      parents: p[1].trim() ? p[1].trim().split(/\s+/).filter(Boolean) : [],
    });
  }
  return out;
}

async function logCommits(cwd, args) {
  const commits = parseCommits(await gitText(cwd, ['log', `--format=${COMMIT_FORMAT}`, ...args]));
  // R1：给每个 GitCommit 补 refs 装饰（对齐 models/git.rs GitCommit.refs，
  // 主仓 commit_to_model + collect_commit_refs 同款；空数组时主仓 serde 会省略，
  // 这里保留空数组亦不破坏前端）。
  const refsMap = await collectCommitRefs(cwd);
  for (const c of commits) c.refs = refsMap.get(c.sha) || [];
  return commits;
}

/** git diff --name-status -z -M 解析（重命名/复制为 status\0old\0new\0）。 */
function parseNameStatusZ(text) {
  const t = String(text || '').split('\0');
  const out = [];
  let i = 0;
  while (i < t.length) {
    const st = t[i]; i += 1;
    if (!st) continue;
    const code = st[0];
    if (code === 'R' || code === 'C') {
      const oldPath = t[i]; i += 1;
      const newPath = t[i]; i += 1;
      if (!newPath) continue;
      out.push({ code, path: newPath, oldPath: oldPath || null, newPath });
    } else {
      const p = t[i]; i += 1;
      if (!p) continue;
      out.push({ code, path: p, oldPath: null, newPath: p });
    }
  }
  return out;
}

/** git status --porcelain=v1 -z -uall 解析（重命名为 "XY new"\0old\0）。 */
function parsePorcelainZ(text) {
  const t = String(text || '').split('\0');
  const out = [];
  let i = 0;
  while (i < t.length) {
    const rec = t[i]; i += 1;
    if (!rec || rec.length < 3) continue;
    const x = rec[0];
    const y = rec[1];
    const p = rec.slice(3);
    let oldPath = null;
    if ((x === 'R' || x === 'C' || y === 'R' || y === 'C') && i < t.length && t[i]) {
      oldPath = t[i]; i += 1;
    }
    out.push({ x, y, path: p, oldPath });
  }
  return out;
}

function changeType(code) {
  switch (code) {
    case 'A': return 'added';
    case 'D': return 'deleted';
    case 'R': return 'renamed';
    case 'C': return 'copied';
    default: return 'modified';
  }
}
function fileStatusFromIndex(x) {
  switch (x) {
    case 'A': return 'added';
    case 'D': return 'deleted';
    case 'R': return 'renamed';
    case 'C': return 'copied';
    default: return 'modified';
  }
}
function fileStatusFromWt(y) {
  switch (y) {
    case 'A': return 'added';
    case 'D': return 'deleted';
    case 'R': return 'renamed';
    case 'C': return 'copied';
    default: return 'modified';
  }
}

// ── 内容提供器 ───────────────────────────────────────────────────────────
/** 读取某个 treeish 下的文件 blob，返回 Buffer；不存在返回 null。 */
async function showBlob(cwd, treeish, filePath) {
  const r = await runGit(cwd, ['show', `${treeish}:${filePath}`], { encoding: 'buffer' });
  if (!r.ok) return null;
  return r.stdout;
}
/** 读取 index（stage 0）内容。 */
async function showIndex(cwd, filePath) {
  const r = await runGit(cwd, ['show', `:${filePath}`], { encoding: 'buffer' });
  if (!r.ok) return null;
  return r.stdout;
}
/** 读取工作区文件内容。 */
function readWorktree(cwd, filePath) {
  try { return fs.readFileSync(path.join(cwd, filePath)); } catch { return null; }
}

/** 读取冲突三方 stage 内容（text）。 */
async function stageBlob(cwd, stage, filePath) {
  const r = await runGit(cwd, ['show', `:${stage}:${filePath}`], { encoding: 'utf8' });
  return r.ok ? String(r.stdout) : null;
}

/** 冲突清单（GitConflictEntry[]，CLI 可诚实给出三方 stage 文本；kind 归一 text）。 */
async function collectConflicts(cwd) {
  const r = await runGit(cwd, ['diff', '--name-only', '--diff-filter=U', '-z']);
  if (!r.ok) return [];
  const paths = String(r.stdout).split('\0').filter(Boolean);
  const out = [];
  for (const p of paths) {
    const entry = { path: p, kind: 'text' };
    const base = await stageBlob(cwd, 1, p);
    const ours = await stageBlob(cwd, 2, p);
    const theirs = await stageBlob(cwd, 3, p);
    if (base !== null) entry.base = base;
    if (ours !== null) entry.ours = ours;
    if (theirs !== null) entry.theirs = theirs;
    out.push(entry);
  }
  return out;
}

// ── Diff 条目构造 ────────────────────────────────────────────────────────
/**
 * 由一条 name-status 变更构造 GitDiffEntry（含完整 old/new content）。
 * getOld / getNew: (filePath) => Buffer|null（null = 该侧不存在）。
 */
async function makeDiffEntry(ch, getOld, getNew, currentView, hintExtra) {
  const code = ch.code;
  const entry = {
    file_path: ch.newPath || ch.path,
    change_type: changeType(code),
    is_binary: false,
    additions: 0,
    deletions: 0,
    status_hint: { has_conflict: false, current_view: currentView },
  };
  if ((code === 'R' || code === 'C') && ch.oldPath) entry.old_file_path = ch.oldPath;
  if (hintExtra) Object.assign(entry.status_hint, hintExtra);

  let oldBuf = null;
  let newBuf = null;
  if (code !== 'A') oldBuf = await getOld(ch.oldPath || ch.path);
  if (code !== 'D') newBuf = await getNew(ch.newPath || ch.path);

  const binary = isBinaryPath(ch.newPath || ch.path)
    || isBinaryBuf(oldBuf) || isBinaryBuf(newBuf);
  if (binary) {
    entry.is_binary = true;
    entry.content_omitted = true;
    return entry; // additions/deletions 保持 0，old/new_content 缺省
  }
  if (oldBuf !== null) entry.old_content = oldBuf.toString('utf8');
  if (newBuf !== null) entry.new_content = newBuf.toString('utf8');
  const d = computeLineDiff(entry.old_content || '', entry.new_content || '');
  entry.additions = d.additions;
  entry.deletions = d.deletions;
  return entry;
}

/** 通用 diff 枚举 + 转换。diffArgs 为 git diff 的参数（含 treeish / --cached / pathspec）。 */
async function diffEntries(cwd, diffArgs, getOld, getNew, currentView, hintExtra) {
  const args = ['diff', '--name-status', '-z', '-M', '--no-ext-diff', ...diffArgs];
  const r = await runGit(cwd, args);
  if (!r.ok) throw new EngineError(gitErrMsg(args, r));
  const changes = parseNameStatusZ(String(r.stdout));
  const out = [];
  for (const ch of changes) {
    out.push(await makeDiffEntry(ch, getOld, getNew, currentView, hintExtra));
  }
  return out;
}

/** 两个 treeish 之间的 diff（get_diffs / get_commit_details / get_file_history 共用）。 */
function twoTreeDiff(cwd, base, target, pathspec, currentView) {
  const diffArgs = [base, target];
  if (pathspec) diffArgs.push('--', pathspec);
  return diffEntries(
    cwd,
    diffArgs,
    (p) => showBlob(cwd, base, p),
    (p) => showBlob(cwd, target, p),
    currentView,
  );
}

/** 单文件工作区 diff（含未跟踪文件兜底）。 */
async function worktreeFileDiff(cwd, filePath) {
  // 判定该文件是否有已暂存变更：有则「暂存区 vs 工作区」，否则「HEAD vs 工作区」
  const staged = await runGit(cwd, ['diff', '--cached', '--name-only', '-z', '--', filePath]);
  const hasStaged = staged.ok && String(staged.stdout).split('\0').filter(Boolean).length > 0;

  const diffArgs = hasStaged
    ? ['--', filePath]
    : ['HEAD', '--', filePath];
  const getOld = hasStaged ? (p) => showIndex(cwd, p) : (p) => showBlob(cwd, 'HEAD', p);
  const getNew = (p) => readWorktree(cwd, p);
  const view = hasStaged ? '暂存区 vs 工作区' : 'HEAD vs 工作区';
  const hint = hasStaged
    ? { has_conflict: true, message: '暂存区和工作区都有修改' }
    : null;
  const entries = await diffEntries(cwd, diffArgs, getOld, getNew, view, hint);
  if (entries.length) return entries[0];

  // 未跟踪文件：构造 added 条目（无 GitDiffEntry 通道时前端也用 added 伪 diff）
  const untracked = await runGit(cwd, ['ls-files', '--others', '--exclude-standard', '-z', '--', filePath]);
  if (untracked.ok && String(untracked.stdout).split('\0').includes(filePath)) {
    return makeDiffEntry(
      { code: 'A', path: filePath, oldPath: null, newPath: filePath },
      () => null,
      (p) => readWorktree(cwd, p),
      'HEAD vs 工作区',
    );
  }
  throw new EngineError(`文件 ${filePath} 没有变更`);
}

// ── HEAD / commit 信息 helpers ───────────────────────────────────────────
async function headSha(cwd) {
  const r = await runGit(cwd, ['rev-parse', '--verify', 'HEAD']);
  return r.ok ? String(r.stdout).trim() : null;
}
async function headCommitMessage(cwd) {
  const r = await runGit(cwd, ['log', '-1', '--format=%B', 'HEAD']);
  return r.ok ? String(r.stdout).trim() : '';
}
async function hasHead(cwd) { return (await headSha(cwd)) !== null; }

// ── R1 补齐：泳道 / 冲突 / rebase / 风险 / PR 的公共 helpers ──────────────

/** .git 目录绝对路径（支持 .git 文件与 worktree）。 */
async function gitDir(cwd) {
  return (await gitText(cwd, ['rev-parse', '--absolute-git-dir'])).trim();
}

/**
 * 收集全部 refs，按 commit sha 聚合为 GitCommitRef[]。
 * 对齐主仓 log.rs collect_commit_refs：HEAD=head / 本地分支=local /
 * 远程分支=remote / tag=tag；name 为 shorthand，target 为 ref 全名。
 */
async function collectCommitRefs(cwd) {
  const map = new Map();
  const add = (sha, ref) => {
    if (!sha) return;
    if (!map.has(sha)) map.set(sha, []);
    map.get(sha).push(ref);
  };
  const head = await headSha(cwd);
  if (head) add(head, { name: 'HEAD', kind: 'head', target: 'HEAD' });
  // 用 NUL 分隔字段（ref 名不含 NUL 字节，最稳）；peeled 用于附注 tag 指向的 commit。
  const r = await runGit(cwd, [
    'for-each-ref',
    '--format=%(refname)%00%(objectname)%00%(*objectname)',
    'refs/heads', 'refs/remotes', 'refs/tags',
  ]);
  if (r.ok) {
    for (const line of String(r.stdout).split(/\r?\n/)) {
      if (!line.trim()) continue;
      const parts = line.split('\0');
      const full = (parts[0] || '').trim();
      const obj = (parts[1] || '').trim();
      const peeled = (parts[2] || '').trim();
      const sha = peeled || obj;
      if (!full || !/^[0-9a-f]{40}$/i.test(sha)) continue;
      let kind = 'local';
      if (full.startsWith('refs/tags/')) kind = 'tag';
      else if (full.startsWith('refs/remotes/')) kind = 'remote';
      const short = full.replace(/^refs\/(heads|remotes|tags)\//, '');
      add(sha, { name: short, kind, target: full });
    }
  }
  return map;
}

/**
 * 泳道分配（拓扑序 commits 新→旧）。输出对齐主仓 GitLaneRow / GitLaneCell：
 * 每条 lane 记录「下一行期望出现的 sha」，第一父占当前 lane，其余父开新 lane。
 * 覆盖单线主分支 + 合并分支（主仓 mini crate graph.c 语义的可读简化版，
 * 不做列收缩；edgeUp 恒 null 属已知语义差异，见 README）。
 */
function computeLanes(commits) {
  let lanes = [];
  const rows = [];
  for (const c of commits) {
    let lane = lanes.indexOf(c.sha);
    if (lane === -1) { lane = lanes.length; lanes.push(c.sha); }
    const parents = c.parents || [];
    const cells = [];
    for (let i = 0; i < lanes.length; i++) {
      if (i === lane) {
        cells.push({
          lane: i,
          node: parents.length > 1 ? 'merge' : 'commit',
          edgeDown: parents.length ? i : null,
          edgeUp: null,
        });
      } else {
        cells.push({ lane: i, node: 'empty', edgeDown: lanes[i] ? i : null, edgeUp: null });
      }
    }
    rows.push({ sha: c.sha, cells, refs: c.refs || [] });
    const next = lanes.slice();
    if (parents.length === 0) {
      next.splice(lane, 1);
    } else {
      next[lane] = parents[0];
      for (let k = 1; k < parents.length; k++) next.splice(lane + k, 0, parents[k]);
    }
    lanes = next.filter(Boolean);
  }
  return rows;
}

/** 语义色（确定性）：远程分支可达 → local，否则 unpushed（对齐 GitLaneSemantic.kind 取值域）。 */
async function laneSemantics(cwd, commits) {
  let reachable = new Set();
  const rr = await runGit(cwd, ['for-each-ref', '--format=%(objectname)', 'refs/remotes']);
  const tips = rr.ok ? String(rr.stdout).split(/\r?\n/).map((s) => s.trim()).filter(Boolean) : [];
  if (tips.length) {
    const rev = await runGit(cwd, ['rev-list', ...tips]);
    if (rev.ok) reachable = new Set(String(rev.stdout).split(/\r?\n/).map((s) => s.trim()).filter(Boolean));
  }
  return commits.map((c) => ({ kind: reachable.has(c.sha) ? 'local' : 'unpushed' }));
}

/** 读取 blob 文本；含 NUL 字节视为二进制（返回哨兵字符串）。 */
async function blobText(cwd, sha) {
  const r = await runGit(cwd, ['cat-file', 'blob', sha], { encoding: 'buffer' });
  if (!r.ok) return null;
  if (r.stdout.includes(0)) return '__binary__';
  return r.stdout.toString('utf8');
}

/**
 * 冲突条目（C10 语义，对齐 GitConflictEntry）：git ls-files -u 聚合三方 stage，
 * 用 cat-file 读内容，按 stage 存在性判 kind（binary / deleted_by_* / text）。
 */
async function conflictEntriesV2(cwd) {
  const r = await runGit(cwd, ['ls-files', '-u', '-z']);
  if (!r.ok) return [];
  const stages = new Map();
  for (const rec of String(r.stdout).split('\0')) {
    if (!rec) continue;
    const tab = rec.indexOf('\t');
    if (tab === -1) continue;
    const left = rec.slice(0, tab).trim().split(/\s+/);
    const p = rec.slice(tab + 1);
    if (left.length < 3) continue;
    const stage = parseInt(left[2], 10);
    if (!stages.has(p)) stages.set(p, {});
    stages.get(p)[stage] = left[1];
  }
  const out = [];
  for (const [p, st] of stages) {
    const base = st[1] ? await blobText(cwd, st[1]) : null;
    const ours = st[2] ? await blobText(cwd, st[2]) : null;
    const theirs = st[3] ? await blobText(cwd, st[3]) : null;
    const anyBinary = [base, ours, theirs].includes('__binary__');
    let kind = 'text';
    if (anyBinary) kind = 'binary';
    else if (st[2] && !st[3]) kind = 'deleted_by_them'; // 对方删、本地改
    else if (!st[2] && st[3]) kind = 'deleted_by_us';   // 本地删、对方改
    const entry = { path: p, kind };
    if (!anyBinary) {
      if (base !== null) entry.base = base;
      if (ours !== null) entry.ours = ours;
      if (theirs !== null) entry.theirs = theirs;
    }
    out.push(entry);
  }
  return out;
}

/** 探测进行中的序列操作类型 + rebase 步数（对齐 sequence.rs detect_kind / read_rebase_steps）。 */
async function detectSequence(cwd) {
  let gd;
  try { gd = await gitDir(cwd); } catch (_) { gd = path.join(cwd, '.git'); }
  const has = (f) => fs.existsSync(path.join(gd, f));
  let kind = 'none';
  if (has('rebase-merge') || has('rebase-apply')) kind = 'rebase';
  else if (has('MERGE_HEAD')) kind = 'merge';
  else if (has('REBASE_HEAD')) kind = 'rebase';
  else if (has('CHERRY_PICK_HEAD')) kind = 'cherry_pick';
  else if (has('REVERT_HEAD')) kind = 'revert';
  let currentStep = null;
  let totalSteps = null;
  if (kind === 'rebase' && has('rebase-merge')) {
    const readNum = (n) => {
      try {
        const v = parseInt(fs.readFileSync(path.join(gd, 'rebase-merge', n), 'utf8').trim(), 10);
        return Number.isFinite(v) ? v : null;
      } catch (_) { return null; }
    };
    currentStep = readNum('msgnum');
    totalSteps = readNum('end');
  }
  return { kind, currentStep, totalSteps };
}

async function currentBranchName(cwd) {
  const r = await runGit(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
  return r.ok && String(r.stdout).trim() !== 'HEAD' ? String(r.stdout).trim() : '';
}

/** Interactive Rebase 预览计划：base..HEAD 应用序（老→新），对齐 rebase.rs plan_interactive_rebase。 */
async function rebasePlanInternal(cwd, base) {
  const chk = await runGit(cwd, ['rev-parse', '--verify', `${base}^{commit}`]);
  if (!chk.ok) throw new EngineError(`Branch/commit not found: ${base}`);
  const text = await gitText(cwd, ['log', '--topo-order', '--reverse', '--format=%H%x1f%s', `${base}..HEAD`]);
  const commits = [];
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [sha, ...rest] = line.split('\x1f');
    commits.push({ sha: sha.trim(), subject: rest.join('\x1f').trim(), action: 'Pick' });
  }
  return { baseCommitish: base, commits, firstLocked: commits.length > 0 };
}

/** todo action 归一：兼容大写枚举（Pick）与小写关键字（pick）。 */
function normAction(a) {
  const map = { pick: 'Pick', drop: 'Drop', squash: 'Squash', fixup: 'Fixup', reword: 'Reword' };
  return map[String(a || '').toLowerCase()] || 'Pick';
}
/** 面板 todo 校验（对齐 rebase.rs validate_todos）：非空、首项 pick、squash/fixup 紧跟 pick/reword。 */
function validateTodos(todos) {
  if (!Array.isArray(todos) || todos.length === 0) {
    throw new EngineError('interactive rebase: empty todo list');
  }
  if (normAction(todos[0].action) !== 'Pick') {
    throw new EngineError('interactive rebase: first entry must be pick (squash/fixup must follow a pick)');
  }
  for (let i = 1; i < todos.length; i++) {
    const cur = normAction(todos[i].action);
    const prev = normAction(todos[i - 1].action);
    if ((cur === 'Squash' || cur === 'Fixup') && prev !== 'Pick' && prev !== 'Reword') {
      throw new EngineError(`interactive rebase: '${cur.toLowerCase()}' must directly follow a pick or reword`);
    }
  }
}
/** todo 行渲染：<小写关键字> <full-sha> <subject>。 */
function renderTodoLine(item) {
  const action = normAction(item.action).toLowerCase();
  const subject = String(item.subject || '').replace(/[\r\n]/g, ' ');
  return `${action} ${item.sha} ${subject}`;
}

/**
 * fixup!/squash! 整理建议（对齐 rebase.rs assemble_suggestions）：
 * subject 前缀命中（大小写不敏感）的最近 pick 连段尾部插入；找不到目标 →
 * 保持原位 pick 并记入 unmatched（如实报告，不假装成功）。
 */
function assembleSuggestions(commits) {
  const out = [];
  let movedCount = 0;
  const unmatched = [];
  for (const item of commits) {
    const subj = String(item.subject || '');
    const m = /^(fixup!|squash!)\s+(.*)$/i.exec(subj);
    let action = null;
    let rest = '';
    if (m) { action = /^fixup/i.test(m[1]) ? 'Fixup' : 'Squash'; rest = (m[2] || '').trim(); }
    if (!action) { out.push({ ...item }); continue; }
    const restLc = rest.toLowerCase();
    const resolvable = restLc !== ''
      && !/^fixup!\s/i.test(restLc) && !/^squash!\s/i.test(restLc);
    let inserted = false;
    if (resolvable) {
      let idx = -1;
      for (let j = out.length - 1; j >= 0; j--) {
        if (normAction(out[j].action) === 'Pick'
          && String(out[j].subject || '').toLowerCase().startsWith(restLc)) { idx = j; break; }
      }
      if (idx >= 0) {
        let i = idx;
        while (i + 1 < out.length
          && ['Fixup', 'Squash'].includes(normAction(out[i + 1].action))) i++;
        out.splice(i + 1, 0, { ...item, action });
        inserted = true;
      }
    }
    if (inserted) movedCount += 1;
    else {
      unmatched.push(String(item.sha).slice(0, 7));
      out.push({ ...item, action: 'Pick' });
    }
  }
  return { commits: out, movedCount, unmatched };
}

/** 疑似密钥模式集（逐条对齐主仓 risk_scan.rs secret_patterns，纯正则、确定性）。 */
function secretPatterns() {
  return [
    ['aws-access-key', /AKIA[0-9A-Z]{16}/],
    ['openai-key', /sk-[A-Za-z0-9_-]{20,}/],
    ['github-token', /gh[pousr]_[A-Za-z0-9]{30,}/],
    ['slack-token', /xox[baprs]-[A-Za-z0-9-]{10,}/],
    ['private-key-block', /^-----BEGIN [A-Z ]*PRIVATE KEY-----/],
    ['kv-secret', /(api[_-]?key|secret|passwd|password|token)\s*[=:]\s*['"][^'"]{8,}['"]/i],
  ];
}

/** 解析 git diff -U0 的新增行：产出 { file, line, content }（只看 '+' 行）。 */
function parseAddedLines(diffText) {
  const out = [];
  let file = null;
  let lineNo = 0;
  for (const raw of String(diffText || '').split(/\r?\n/)) {
    if (raw.startsWith('+++ b/')) { file = raw.slice(6); continue; }
    const h = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (h) { lineNo = parseInt(h[1], 10); continue; }
    if (file && raw.startsWith('+') && !raw.startsWith('+++')) {
      out.push({ file, line: lineNo, content: raw.slice(1) });
      lineNo += 1;
    } else if (file && raw.startsWith(' ')) {
      lineNo += 1;
    }
  }
  return out;
}

/** gh CLI 不可用时的结构化错误（R1：明确 PR_CLI_UNAVAILABLE + 安装提示，非 UNSUPPORTED）。 */
function prCliUnavailable(action) {
  return new StructuredError(
    'PR_CLI_UNAVAILABLE',
    'PR_CLI_UNAVAILABLE: 未检测到 GitHub CLI (gh)，无法执行 PR 操作',
    {
      action,
      requiredCli: 'gh',
      installHint: '请安装 GitHub CLI (gh)，并在终端执行 gh auth login 完成认证后重试',
    },
  );
}
/** 探测 gh 并执行 --json 命令，返回解析后的对象；未安装抛结构化错误。 */
async function ghJson(cwd, args, action) {
  const chk = await runExec(GH_CLI, cwd, ['--version']);
  if (!chk.ok || chk.enoent) throw prCliUnavailable(action);
  const r = await runExec(GH_CLI, cwd, args);
  if (r.enoent) throw prCliUnavailable(action);
  if (!r.ok) throw new EngineError(`gh ${args.slice(0, 2).join(' ')} 失败: ${r.stderr.trim() || r.stdout.trim()}`);
  try { return JSON.parse(r.stdout.trim()); }
  catch (_) { throw new EngineError(`gh 返回非 JSON: ${r.stdout.slice(0, 200)}`); }
}
/** gh --json → PullRequest（字段名对齐 models/git.rs PullRequest，无 serde rename）。 */
function prFromGh(d) {
  const ts = (s) => { const t = Date.parse(s || ''); return Number.isFinite(t) ? Math.floor(t / 1000) : 0; };
  const stateRaw = String(d.state || 'open').toUpperCase();
  const state = stateRaw === 'MERGED' ? 'merged' : stateRaw === 'CLOSED' ? 'closed' : 'open';
  const reviews = Array.isArray(d.reviews) ? d.reviews : [];
  const last = reviews.length ? reviews[reviews.length - 1] : null;
  let reviewStatus = null;
  if (last) {
    const s = String(last.state || '').toUpperCase();
    reviewStatus = s === 'APPROVED' ? 'approved'
      : s === 'CHANGES_REQUESTED' ? 'changes_requested'
        : s === 'COMMENTED' ? 'commented' : 'pending';
  }
  return {
    number: Number(d.number) || 0,
    url: String(d.url || ''),
    title: String(d.title || ''),
    body: d.body == null ? null : String(d.body),
    state,
    head_branch: String(d.headRefName || ''),
    base_branch: String(d.baseRefName || ''),
    created_at: ts(d.createdAt),
    updated_at: ts(d.updatedAt || d.createdAt),
    merged_at: d.mergedAt ? ts(d.mergedAt) : null,
    closed_at: d.closedAt ? ts(d.closedAt) : null,
    author: (d.author && d.author.login) ? String(d.author.login) : 'unknown',
    review_status: reviewStatus,
    additions: d.additions == null ? null : Number(d.additions),
    deletions: d.deletions == null ? null : Number(d.deletions),
    changed_files: d.changedFiles == null ? null : Number(d.changedFiles),
  };
}

// ── 动作 handlers ────────────────────────────────────────────────────────
// 每个 handler: async (params) => data（data 即 { ok:true,data } 的 data）。
// 失败一律 throw EngineError / StructuredError，由 dispatch 统一转信封。

const HANDLERS = {
  // ── 状态 / 仓库 ────────────────────────────────────────────────────────
  async is_repository(params) {
    const cwd = ws(params);
    // 与主仓 Repository::open 一致：路径本身即仓库根（.git 为直接子项）且 git 可打开。
    const dotgit = path.join(cwd, '.git');
    if (!fs.existsSync(dotgit)) return false;
    const r = await runGit(cwd, ['rev-parse', '--git-dir']);
    return r.ok;
  },

  async discover_repositories(params) {
    const root = ws(params);
    const maxDepth = optNum(params, 'maxDepth') ?? 4;
    const skip = new Set([
      'node_modules', 'target', 'dist', 'build', 'out', '.git', '.next',
      '.venv', 'venv', '__pycache__', '.cache', 'coverage', '.turbo', '.idea', '.vscode',
    ]);
    const results = [];

    async function scanOne(dir) {
      if (!fs.existsSync(path.join(dir, '.git'))) return null;
      const gd = await runGit(dir, ['rev-parse', '--git-dir']);
      if (!gd.ok) return null; // 损坏的 .git：跳过（与主仓一致）
      const head = await headSha(dir);
      const isEmpty = head === null;
      let branch = '';
      let shortCommit = '';
      if (isEmpty) {
        const s = await runGit(dir, ['symbolic-ref', '--short', 'HEAD']);
        branch = s.ok ? String(s.stdout).trim() : '';
      } else {
        shortCommit = shortSha(head);
        const b = await runGit(dir, ['rev-parse', '--abbrev-ref', 'HEAD']);
        branch = b.ok ? String(b.stdout).trim() : 'HEAD';
      }
      const st = await runGit(dir, ['status', '--porcelain']);
      const hasChanges = st.ok && String(st.stdout).trim().length > 0;
      return {
        path: dir,
        name: path.basename(dir),
        branch,
        shortCommit,
        isEmpty,
        hasChanges,
      };
    }

    async function walk(dir, depth) {
      const one = await scanOne(dir);
      if (one) { results.push(one); return; }
      if (depth >= maxDepth) return;
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        if (!e.isDirectory() || skip.has(e.name)) continue;
        await walk(path.join(dir, e.name), depth + 1);
      }
    }

    const rootRepo = await scanOne(root);
    if (rootRepo) return [rootRepo];
    await walk(root, 0);
    results.sort((a, b) => a.path.localeCompare(b.path));
    return results;
  },

  async get_status(params) {
    const cwd = await repo(params);
    const head = await headSha(cwd);
    const isEmpty = head === null;
    let branch = '';
    let commit = '';
    let shortCommit = '';
    if (isEmpty) {
      const s = await runGit(cwd, ['symbolic-ref', '--short', 'HEAD']);
      branch = s.ok ? String(s.stdout).trim() : '';
    } else {
      commit = head;
      shortCommit = shortSha(head);
      const b = await runGit(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
      branch = b.ok ? String(b.stdout).trim() : 'HEAD';
    }

    let ahead = 0;
    let behind = 0;
    if (!isEmpty && branch) {
      const ab = await runGit(cwd, ['rev-list', '--left-right', '--count', 'HEAD...@{upstream}']);
      if (ab.ok) {
        const m = String(ab.stdout).trim().split(/\s+/);
        if (m.length >= 2) {
          ahead = parseInt(m[0], 10) || 0;
          behind = parseInt(m[1], 10) || 0;
        }
      }
    }

    const st = await gitText(cwd, ['status', '--porcelain=v1', '-z', '-uall']);
    const records = parsePorcelainZ(st);
    const staged = [];
    const unstaged = [];
    const untracked = [];
    const conflicted = [];
    for (const rec of records) {
      const { x, y, path: p } = rec;
      const conflict = x === 'U' || y === 'U'
        || (x === 'A' && y === 'A') || (x === 'D' && y === 'D');
      if (conflict) { conflicted.push(p); continue; }
      // porcelain v1 未跟踪文件为 "?? path"（x=y='?'）：必须单独归入 untracked，
      // 否则下面的 staged/unstaged 判断会把该记录整体丢弃。
      if (x === '?' && y === '?') { untracked.push(p); continue; }
      if (x !== ' ' && x !== '?') staged.push({ path: p, status: fileStatusFromIndex(x) });
      if (y !== ' ' && y !== '?') {
        unstaged.push({ path: p, status: fileStatusFromWt(y) });
      }
    }
    return {
      exists: true,
      branch,
      commit,
      shortCommit,
      ahead,
      behind,
      staged,
      unstaged,
      untracked,
      conflicted,
      isEmpty,
    };
  },

  // ── Diff / 提交详情 ────────────────────────────────────────────────────
  async get_diffs(params) {
    const cwd = await repo(params);
    const base = reqStr(params, 'baseCommit');
    const target = optStr(params, 'compareTo') || 'HEAD';
    return twoTreeDiff(cwd, base, target, null, 'HEAD vs 暂存区');
  },

  async get_commit_details(params) {
    const cwd = await repo(params);
    const sha = reqStr(params, 'commitSha');
    const parent = await runGit(cwd, ['rev-parse', `${sha}^`]);
    const base = parent.ok ? String(parent.stdout).trim() : EMPTY_TREE;
    const [commit] = await logCommits(cwd, ['-1', sha]);
    if (!commit) throw new EngineError(`Commit '${sha}' not found`);
    const files = await twoTreeDiff(cwd, base, sha, null, 'HEAD vs 暂存区');
    let totalAdditions = 0;
    let totalDeletions = 0;
    for (const f of files) {
      totalAdditions += f.additions || 0;
      totalDeletions += f.deletions || 0;
    }
    return { commit, files, totalAdditions, totalDeletions };
  },

  async get_file_history(params) {
    const cwd = await repo(params);
    const filePath = reqStr(params, 'filePath');
    const limit = optNum(params, 'limit') ?? 50;
    const skip = optNum(params, 'skip') ?? 0;
    const branch = optStr(params, 'branch');
    const args = ['--topo-order', '-n', String(limit)];
    if (skip > 0) args.push(`--skip=${skip}`);
    if (branch) args.push(branch);
    args.push('--', filePath);
    const commits = await logCommits(cwd, args);
    const out = [];
    for (const commit of commits) {
      const parent = await runGit(cwd, ['rev-parse', `${commit.sha}^`]);
      const base = parent.ok ? String(parent.stdout).trim() : EMPTY_TREE;
      const entries = await twoTreeDiff(cwd, base, commit.sha, filePath, 'HEAD vs 暂存区');
      const file = entries[0] || {
        file_path: filePath,
        change_type: 'modified',
        is_binary: false,
        additions: 0,
        deletions: 0,
        status_hint: { has_conflict: false, current_view: 'HEAD vs 暂存区' },
      };
      out.push({ commit, file });
    }
    return out;
  },

  async get_worktree_diff(params) {
    const cwd = await repo(params);
    return diffEntries(
      cwd,
      ['HEAD'],
      (p) => showBlob(cwd, 'HEAD', p),
      (p) => readWorktree(cwd, p),
      'HEAD vs 暂存区',
    );
  },

  async get_index_diff(params) {
    const cwd = await repo(params);
    return diffEntries(
      cwd,
      ['--cached', 'HEAD'],
      (p) => showBlob(cwd, 'HEAD', p),
      (p) => showIndex(cwd, p),
      'HEAD vs 暂存区',
    );
  },

  async get_worktree_file_diff(params) {
    const cwd = await repo(params);
    return worktreeFileDiff(cwd, reqStr(params, 'filePath'));
  },

  async get_index_file_diff(params) {
    const cwd = await repo(params);
    const filePath = reqStr(params, 'filePath');
    const entries = await diffEntries(
      cwd,
      ['--cached', 'HEAD', '--', filePath],
      (p) => showBlob(cwd, 'HEAD', p),
      (p) => showIndex(cwd, p),
      'HEAD vs 暂存区',
    );
    if (!entries.length) throw new EngineError(`文件 ${filePath} 没有变更`);
    return entries[0];
  },

  // ── Log / 搜索 / Reflog / Blame ────────────────────────────────────────
  async get_log(params) {
    const cwd = await repo(params);
    const limit = optNum(params, 'limit') ?? optNum(params, 'maxCount') ?? 50;
    const skip = optNum(params, 'skip') ?? 0;
    const branch = optStr(params, 'branch');
    const args = ['--topo-order', '-n', String(limit)];
    if (skip > 0) args.push(`--skip=${skip}`);
    if (branch) args.push(branch);
    return logCommits(cwd, args);
  },

  async search_log(params) {
    const cwd = await repo(params);
    const filter = (params && params.filter && typeof params.filter === 'object') ? params.filter : {};
    const limit = optNum(params, 'limit') ?? 50;
    const skip = optNum(params, 'skip') ?? 0;
    const args = ['-n', String(limit)];
    if (skip > 0) args.push(`--skip=${skip}`);
    if (filter.fixedStrings) args.push('--fixed-strings');
    if (typeof filter.grep === 'string') args.push(`--grep=${filter.grep}`);
    if (typeof filter.author === 'string') args.push(`--author=${filter.author}`);
    if (typeof filter.pickaxe === 'string') args.push('-S', filter.pickaxe);
    if (typeof filter.since === 'string') args.push(`--since=${filter.since}`);
    if (typeof filter.until === 'string') args.push(`--until=${filter.until}`);
    if (typeof filter.range === 'string') args.push(filter.range);
    if (typeof filter.path === 'string') args.push('--', filter.path);
    return logCommits(cwd, args);
  },

  async get_reflog(params) {
    const cwd = await repo(params);
    const branch = optStr(params, 'branch');
    const limit = optNum(params, 'limit') ?? 30;
    const args = ['reflog', 'show', `--format=${REFLOG_FORMAT}`, '-n', String(limit)];
    if (branch) args.push(branch);
    const text = await gitText(cwd, args);
    const out = [];
    for (const raw of String(text).split('\x1e')) {
      const rec = raw.trim();
      if (!rec) continue;
      const p = rec.split('\x1f');
      if (p.length < 5) continue;
      const sha = p[0].trim();
      const selector = p[4].trim();
      let br = null;
      if (selector.startsWith('refs/heads/')) {
        br = selector.slice('refs/heads/'.length).split('@{')[0];
      }
      out.push({
        sha,
        shortSha: shortSha(sha),
        selector,
        subject: p[2].trim(),
        timestamp: parseInt(p[3].trim(), 10) || 0,
        ...(br ? { branch: br } : {}),
      });
    }
    return out;
  },

  async blame_file(params) {
    const cwd = await repo(params);
    const filePath = reqStr(params, 'filePath');
    const text = await gitText(cwd, ['blame', '--line-porcelain', 'HEAD', '--', filePath]);
    const lines = [];
    let cur = null;
    for (const line of String(text).split('\n')) {
      const m = /^([0-9a-f]{40,64}) (\d+) (\d+)(?: \d+)?$/.exec(line);
      if (m) {
        cur = {
          lineNumber: parseInt(m[3], 10),
          originalLineNumber: parseInt(m[2], 10),
          commitSha: m[1],
          shortSha: shortSha(m[1]),
          author: '',
          authorEmail: '',
          timestamp: 0,
          content: '',
        };
      } else if (cur && line.startsWith('\t')) {
        cur.content = line.slice(1);
        lines.push(cur);
        cur = null;
      } else if (cur) {
        if (line.startsWith('author ')) cur.author = line.slice(7);
        else if (line.startsWith('author-mail ')) cur.authorEmail = line.slice(12).replace(/^<|>$/g, '');
        else if (line.startsWith('author-time ')) cur.timestamp = parseInt(line.slice(12), 10) || 0;
        else if (line.startsWith('summary ')) cur.summary = line.slice(8);
      }
    }
    return { filePath, lines, totalLines: lines.length };
  },

  // ── 仓库初始化 ────────────────────────────────────────────────────────
  async init_repository(params) {
    const cwd = ws(params);
    const initialBranch = optStr(params, 'initialBranch') || 'main';
    const r = await runGit(cwd, ['init', '-b', initialBranch]);
    if (!r.ok) throw new EngineError(gitErrMsg(['init'], r));
    await commitGitOk(cwd, ['commit', '--allow-empty', '-m', 'Initial commit']);
    const sha = await headSha(cwd);
    return sha || '';
  },

  // ── 提交 / 暂存 ───────────────────────────────────────────────────────
  async commit_changes(params) {
    const cwd = await repo(params);
    const message = reqStr(params, 'message');
    const selected = strArr(params, 'selectedFiles');
    if (selected.length) await gitText(cwd, ['add', '-A', '--', ...selected]);
    else if (boolOr(params, 'stageAll', false)) await gitText(cwd, ['add', '-A']);
    await commitGitOk(cwd, ['commit', '-m', message]);
    return (await headSha(cwd)) || '';
  },

  async stage_file(params) {
    const cwd = await repo(params);
    await gitText(cwd, ['add', '-A', '--', reqStr(params, 'filePath')]);
    return null;
  },

  async unstage_file(params) {
    const cwd = await repo(params);
    const filePath = reqStr(params, 'filePath');
    if (await hasHead(cwd)) await gitText(cwd, ['reset', '-q', 'HEAD', '--', filePath]);
    else await gitText(cwd, ['rm', '--cached', '-q', '--', filePath]);
    return null;
  },

  async discard_changes(params) {
    const cwd = await repo(params);
    const filePath = reqStr(params, 'filePath');
    const untracked = await runGit(cwd, ['ls-files', '--others', '--exclude-standard', '-z', '--', filePath]);
    if (untracked.ok && String(untracked.stdout).split('\0').includes(filePath)) {
      throw new EngineError('Untracked files cannot be discarded; delete them instead');
    }
    await gitText(cwd, ['checkout', '--', filePath]);
    return null;
  },

  async batch_stage(params) {
    const cwd = await repo(params);
    const files = strArr(params, 'filePaths');
    const staged = [];
    const failed = [];
    for (const f of files) {
      const r = await runGit(cwd, ['add', '-A', '--', f]);
      if (r.ok) staged.push(f);
      else failed.push({ path: f, error: gitErrMsg(['add'], r) });
    }
    return { staged, failed, total: files.length };
  },

  async batch_unstage(params) {
    const cwd = await repo(params);
    const files = strArr(params, 'filePaths');
    const has = await hasHead(cwd);
    const ok = [];
    const failed = [];
    for (const f of files) {
      const args = has ? ['reset', '-q', 'HEAD', '--', f] : ['rm', '--cached', '-q', '--', f];
      const r = await runGit(cwd, args);
      if (r.ok) ok.push(f);
      else failed.push({ path: f, error: gitErrMsg(args, r) });
    }
    return { ok, failed, total: files.length };
  },

  async batch_discard(params) {
    const cwd = await repo(params);
    const files = strArr(params, 'filePaths');
    const ok = [];
    const failed = [];
    for (const f of files) {
      const untracked = await runGit(cwd, ['ls-files', '--others', '--exclude-standard', '-z', '--', f]);
      if (untracked.ok && String(untracked.stdout).split('\0').includes(f)) {
        failed.push({ path: f, error: 'Untracked files cannot be discarded; delete them instead' });
        continue;
      }
      const r = await runGit(cwd, ['checkout', '--', f]);
      if (r.ok) ok.push(f);
      else failed.push({ path: f, error: gitErrMsg(['checkout'], r) });
    }
    return { ok, failed, total: files.length };
  },

  async commit_group(params) {
    const cwd = await repo(params);
    const message = reqStr(params, 'message');
    const files = strArr(params, 'files');
    if (!files.length) throw new EngineError('Missing required argument: files');
    await commitGitOk(cwd, ['commit', '-m', message, '--', ...files]);
    return (await headSha(cwd)) || '';
  },

  async amend_commit(params) {
    const cwd = await repo(params);
    const message = optStr(params, 'message');
    const selected = strArr(params, 'selectedFiles');
    if (selected.length) await gitText(cwd, ['add', '-A', '--', ...selected]);
    else if (boolOr(params, 'stageAll', false)) await gitText(cwd, ['add', '-A']);
    const args = ['commit', '--amend'];
    if (message !== null) args.push('-m', message);
    else args.push('--no-edit');
    await commitGitOk(cwd, args);
    return (await headSha(cwd)) || '';
  },

  // ── 分支 ──────────────────────────────────────────────────────────────
  async get_branches(params) {
    const cwd = await repo(params);
    const head = await headSha(cwd);
    const isEmpty = head === null;
    let current = '';
    if (isEmpty) {
      const s = await runGit(cwd, ['symbolic-ref', '--short', 'HEAD']);
      current = s.ok ? String(s.stdout).trim() : '';
    } else {
      const b = await runGit(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
      current = b.ok ? String(b.stdout).trim() : 'HEAD';
    }
    const out = [];
    // 本地分支
    const locals = await runGit(cwd, ['for-each-ref', '--format=%(refname:short)|%(objectname)|%(committerdate:unix)', 'refs/heads']);
    if (locals.ok) {
      for (const line of String(locals.stdout).split(/\r?\n/)) {
        if (!line.trim()) continue;
        const [name, commit, ts] = line.split('|');
        out.push({
          name,
          isCurrent: name === current,
          isRemote: false,
          commit: commit || '',
          lastCommitDate: parseInt(ts, 10) || undefined,
        });
      }
    }
    // 远程分支（跳过 */HEAD）
    const remotes = await runGit(cwd, ['for-each-ref', '--format=%(refname:short)|%(objectname)', 'refs/remotes']);
    if (remotes.ok) {
      for (const line of String(remotes.stdout).split(/\r?\n/)) {
        if (!line.trim()) continue;
        const [name, commit] = line.split('|');
        if (name.endsWith('/HEAD')) continue;
        out.push({ name, isCurrent: false, isRemote: true, commit: commit || '' });
      }
    }
    return out;
  },

  async create_branch(params) {
    const cwd = await repo(params);
    const name = reqStr(params, 'name');
    const checkout = boolOr(params, 'checkout', false);
    const startPoint = optStr(params, 'startPoint');
    if (!(await hasHead(cwd))) {
      if (checkout) await gitText(cwd, ['symbolic-ref', 'HEAD', `refs/heads/${name}`]);
      return null;
    }
    const args = checkout ? ['checkout', '-b', name] : ['branch', name];
    if (startPoint) args.push(startPoint);
    await gitText(cwd, args);
    return null;
  },

  async checkout_branch(params) {
    const cwd = await repo(params);
    await gitText(cwd, ['checkout', reqStr(params, 'name')]);
    return null;
  },

  async delete_branch(params) {
    const cwd = await repo(params);
    const flag = boolOr(params, 'force', false) ? '-D' : '-d';
    await gitText(cwd, ['branch', flag, reqStr(params, 'name')]);
    return null;
  },

  async rename_branch(params) {
    const cwd = await repo(params);
    await gitText(cwd, ['branch', '-m', reqStr(params, 'oldName'), reqStr(params, 'newName')]);
    return null;
  },

  async checkout_commit(params) {
    const cwd = await repo(params);
    await gitText(cwd, ['checkout', '--detach', reqStr(params, 'commitSha')]);
    return null;
  },

  async reset(params) {
    const cwd = await repo(params);
    const mode = reqStr(params, 'mode');
    if (!['soft', 'mixed', 'hard'].includes(mode)) {
      throw new EngineError(`Unknown reset mode: ${mode}. Expected: soft, mixed, or hard`);
    }
    await gitText(cwd, ['reset', `--${mode}`, reqStr(params, 'commitSha')]);
    return null;
  },

  async merge_branch(params) {
    const cwd = await repo(params);
    const source = reqStr(params, 'sourceBranch');
    const before = await headSha(cwd);
    const args = ['merge'];
    if (boolOr(params, 'noFF', false)) args.push('--no-ff');
    args.push('--no-edit', source);
    const r = await commitGit(cwd, args);
    if (!r.ok) {
      const conflicts = await collectConflicts(cwd);
      if (conflicts.length) {
        return {
          success: false, fast_forward: false, has_conflicts: true,
          conflicts, merged_commits: 0, files_changed: 0,
        };
      }
      throw new EngineError(gitErrMsg(args, r));
    }
    const after = await headSha(cwd);
    let mergedCommits = 0;
    if (before && after) {
      const c = await runGit(cwd, ['rev-list', '--count', `${before}..${after}`]);
      mergedCommits = c.ok ? (parseInt(String(c.stdout).trim(), 10) || 0) : 0;
    }
    return {
      success: true,
      fast_forward: String(r.stdout).includes('Fast-forward'),
      has_conflicts: false,
      conflicts: [],
      merged_commits: mergedCommits,
      files_changed: 0,
    };
  },

  // ── 标签 ──────────────────────────────────────────────────────────────
  async get_tags(params) {
    const cwd = await repo(params);
    const names = String(await gitText(cwd, ['tag', '--list'])).split(/\r?\n/).filter(Boolean);
    const out = [];
    for (const name of names) {
      const meta = await runGit(cwd, ['for-each-ref', '--format=%(objecttype)|%(objectname)|%(*objectname)|%(taggername)|%(taggerdate:unix)', `refs/tags/${name}`]);
      if (!meta.ok) continue;
      const [otype, oname, peeled, tagger, ts] = String(meta.stdout).trim().split('|');
      const isAnnotated = otype === 'tag';
      const commitSha = isAnnotated ? (peeled || oname) : oname;
      const tag = { name, isAnnotated, commitSha: commitSha || '', shortSha: shortSha(commitSha || '') };
      if (isAnnotated) {
        const msg = await runGit(cwd, ['for-each-ref', '--format=%(contents)', `refs/tags/${name}`]);
        if (msg.ok) tag.message = String(msg.stdout).trim() || undefined;
        tag.tagger = tagger || undefined;
        tag.timestamp = parseInt(ts, 10) || undefined;
      }
      out.push(tag);
    }
    out.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    return out;
  },

  async create_tag(params) {
    const cwd = await repo(params);
    const name = reqStr(params, 'name');
    const message = optStr(params, 'message');
    const commitish = optStr(params, 'commitish');
    const args = ['tag'];
    if (message !== null) args.push('-a', '-m', message);
    args.push(name);
    if (commitish) args.push(commitish);
    await gitText(cwd, args);
    // 返回与 get_tags 同构的单条
    const meta = await runGit(cwd, ['for-each-ref', '--format=%(objecttype)|%(objectname)|%(*objectname)|%(taggername)|%(taggerdate:unix)', `refs/tags/${name}`]);
    const [otype, oname, peeled, tagger, ts] = String(meta.stdout).trim().split('|');
    const isAnnotated = otype === 'tag';
    const commitSha = isAnnotated ? (peeled || oname) : oname;
    const tag = { name, isAnnotated, commitSha: commitSha || '', shortSha: shortSha(commitSha || '') };
    if (isAnnotated) {
      const msg = await runGit(cwd, ['for-each-ref', '--format=%(contents)', `refs/tags/${name}`]);
      if (msg.ok) tag.message = String(msg.stdout).trim() || undefined;
      tag.tagger = tagger || undefined;
      tag.timestamp = parseInt(ts, 10) || undefined;
    }
    return tag;
  },

  async delete_tag(params) {
    const cwd = await repo(params);
    await gitText(cwd, ['tag', '-d', reqStr(params, 'name')]);
    return null;
  },

  // ── 远程 / 推送 / 拉取 ────────────────────────────────────────────────
  async get_remotes(params) {
    const cwd = await repo(params);
    const names = String(await gitText(cwd, ['remote'])).split(/\r?\n/).filter(Boolean);
    const out = [];
    for (const name of names) {
      const entry = { name };
      const u = await runGit(cwd, ['config', '--get', `remote.${name}.url`]);
      if (u.ok) entry.fetch_url = String(u.stdout).trim();
      const pu = await runGit(cwd, ['config', '--get', `remote.${name}.pushurl`]);
      if (pu.ok) entry.push_url = String(pu.stdout).trim();
      out.push(entry);
    }
    return out;
  },

  async add_remote(params) {
    const cwd = await repo(params);
    const name = reqStr(params, 'name');
    const url = reqStr(params, 'url');
    const exists = await runGit(cwd, ['remote', 'get-url', name]);
    if (exists.ok) throw new EngineError(`Remote '${name}' already exists`);
    await gitText(cwd, ['remote', 'add', name, url]);
    return { name, fetch_url: url };
  },

  async remove_remote(params) {
    const cwd = await repo(params);
    const name = reqStr(params, 'name');
    const exists = await runGit(cwd, ['remote', 'get-url', name]);
    if (!exists.ok) throw new EngineError(`Remote '${name}' not found`);
    await gitText(cwd, ['remote', 'remove', name]);
    return null;
  },

  async detect_host(params) {
    const u = reqStr(params, 'remoteUrl');
    if (u.includes('github.com')) return 'github';
    if (u.includes('gitlab.com')) return 'gitlab';
    if (u.includes('dev.azure.com') || u.includes('visualstudio.com')) return 'azure_dev_ops';
    if (u.includes('bitbucket.org')) return 'bitbucket';
    return 'unknown';
  },

  async push_branch(params) {
    const cwd = await repo(params);
    const branchName = reqStr(params, 'branchName');
    const remoteName = optStr(params, 'remoteName') || 'origin';
    const remoteBranchName = optStr(params, 'remoteBranchName');
    const leaseSha = optStr(params, 'leaseSha');
    const refspec = (remoteBranchName && remoteBranchName !== branchName)
      ? `${branchName}:${remoteBranchName}` : branchName;
    // 与主仓 push_branch 一致：force 一律走 --force-with-lease（含显式 leaseSha）
    const forceArg = boolOr(params, 'force', false)
      ? (leaseSha ? `--force-with-lease=${refspec}:${leaseSha}` : '--force-with-lease')
      : '--force-with-lease';
    await gitText(cwd, ['push', remoteName, refspec, forceArg]);
    return null;
  },

  async push_set_upstream(params) {
    const cwd = await repo(params);
    const branchName = reqStr(params, 'branchName');
    const remoteName = optStr(params, 'remoteName') || 'origin';
    const remoteBranchName = optStr(params, 'remoteBranchName');
    const refspec = (remoteBranchName && remoteBranchName !== branchName)
      ? `${branchName}:${remoteBranchName}` : branchName;
    await gitText(cwd, ['push', '-u', remoteName, refspec]);
    return null;
  },

  async pull(params) {
    const cwd = await repo(params);
    const remoteName = optStr(params, 'remoteName') || 'origin';
    const branchName = optStr(params, 'branchName');
    const args = ['pull', remoteName];
    if (branchName) args.push(branchName);
    args.push('--no-edit');
    const r = await commitGit(cwd, args);
    if (!r.ok) throw new EngineError(gitErrMsg(args, r));
    return {
      success: true,
      fast_forward: String(r.stdout).includes('Fast-forward'),
      pulled_commits: 0,
      files_changed: 0,
      insertions: 0,
      deletions: 0,
      conflicts: [],
    };
  },

  async fetch(params) {
    const cwd = await repo(params);
    const args = ['fetch'];
    if (boolOr(params, 'prune', false)) args.push('--prune');
    const remoteName = optStr(params, 'remoteName');
    if (remoteName) args.push(remoteName);
    const r = await runGit(cwd, args);
    if (!r.ok) throw new EngineError(gitErrMsg(args, r));
    return String(r.stdout) + String(r.stderr);
  },

  // ── Stash ─────────────────────────────────────────────────────────────
  async stash_list(params) {
    const cwd = await repo(params);
    const text = await gitText(cwd, ['stash', 'list', '--format=%gd|%gs|%h|%ct']);
    const out = [];
    for (const line of String(text).split(/\r?\n/)) {
      if (!line.trim()) continue;
      const parts = line.split('|');
      if (parts.length < 4) continue;
      const idx = parts[0].replace(/^stash@\{/, '').replace(/\}$/, '');
      out.push({
        index: parseInt(idx, 10) || 0,
        message: parts[1],
        branch: '',
        commit_sha: parts[2],
        timestamp: parseInt(parts[3], 10) || 0,
      });
    }
    return out;
  },

  async stash_save(params) {
    const cwd = await repo(params);
    const args = ['stash', 'push'];
    const message = optStr(params, 'message');
    if (message !== null) args.push('-m', message);
    if (boolOr(params, 'includeUntracked', false)) args.push('--include-untracked');
    return gitText(cwd, args);
  },

  async stash_pop(params) {
    const cwd = await repo(params);
    const idx = optNum(params, 'index') ?? 0;
    await gitText(cwd, ['stash', 'pop', `stash@{${idx}}`]);
    return null;
  },

  async stash_apply(params) {
    const cwd = await repo(params);
    const idx = optNum(params, 'index') ?? 0;
    await gitText(cwd, ['stash', 'apply', `stash@{${idx}}`]);
    return null;
  },

  async stash_drop(params) {
    const cwd = await repo(params);
    const idx = reqNum(params, 'index');
    await gitText(cwd, ['stash', 'drop', `stash@{${idx}}`]);
    return null;
  },

  async stash_show(params) {
    const cwd = await repo(params);
    const idx = optNum(params, 'index') ?? 0;
    return gitText(cwd, ['stash', 'show', '-p', `stash@{${idx}}`]);
  },

  // ── gitignore ─────────────────────────────────────────────────────────
  async get_gitignore(params) {
    const cwd = await repo(params);
    const file = path.join(cwd, '.gitignore');
    if (fs.existsSync(file)) return { exists: true, content: fs.readFileSync(file, 'utf8'), path: '.gitignore' };
    return { exists: false, content: '', path: '.gitignore' };
  },

  async save_gitignore(params) {
    const cwd = await repo(params);
    fs.writeFileSync(path.join(cwd, '.gitignore'), reqStr(params, 'content'), 'utf8');
    return null;
  },

  async add_to_gitignore(params) {
    const cwd = await repo(params);
    const rules = strArr(params, 'rules');
    const file = path.join(cwd, '.gitignore');
    let content = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    const existing = new Set(content.split(/\r?\n/));
    const fresh = rules.filter((r) => !existing.has(r));
    if (!fresh.length) return null;
    if (content && !content.endsWith('\n')) content += '\n';
    for (const r of fresh) content += `${r}\n`;
    fs.writeFileSync(file, content, 'utf8');
    return null;
  },

  async get_gitignore_templates() {
    return [
      { name: 'Node.js', description: 'Node.js 项目常用忽略规则', rules: ['node_modules/', 'dist/', 'build/', '.cache/', '*.log', '.env', '.env.local', '.env.*.local'] },
      { name: 'Rust', description: 'Rust 项目常用忽略规则', rules: ['/target/', '**/*.rs.bk', '*.pdb', 'Cargo.lock'] },
      { name: 'Python', description: 'Python 项目常用忽略规则', rules: ['__pycache__/', '*.py[cod]', '*$py.class', '.Python', 'venv/', '.venv/', '*.egg-info/', '.pytest_cache/'] },
      { name: 'macOS', description: 'macOS 系统文件', rules: ['.DS_Store', '.AppleDouble', '.LSOverride', '._*'] },
      { name: 'Windows', description: 'Windows 系统文件', rules: ['Thumbs.db', 'ehthumbs.db', 'Desktop.ini', '$RECYCLE.BIN/'] },
      { name: 'IDE', description: 'IDE 配置文件', rules: ['.idea/', '.vscode/', '*.swp', '*.swo', '*~'] },
    ];
  },

  // ── 序列操作 / rebase 计划 ────────────────────────────────────────────
  async rebase_branch(params) {
    const cwd = await repo(params);
    const before = await headSha(cwd);
    const args = ['rebase', reqStr(params, 'sourceBranch')];
    const r = await commitGit(cwd, args);
    if (!r.ok) {
      const conflicts = await collectConflicts(cwd);
      if (conflicts.length) {
        return {
          success: false, has_conflicts: true, conflicts,
          rebased_commits: 0, current_step: 0, total_steps: 0, finished: false,
        };
      }
      throw new EngineError(gitErrMsg(args, r));
    }
    const after = await headSha(cwd);
    let count = 0;
    if (before && after) {
      const c = await runGit(cwd, ['rev-list', '--count', `${before}..${after}`]);
      count = c.ok ? (parseInt(String(c.stdout).trim(), 10) || 0) : 0;
    }
    return {
      success: true, has_conflicts: false, conflicts: [],
      rebased_commits: count, current_step: count, total_steps: count, finished: true,
    };
  },

  async rebase_abort(params) {
    const cwd = await repo(params);
    await gitText(cwd, ['rebase', '--abort']);
    return null;
  },

  async rebase_continue(params) {
    const cwd = await repo(params);
    const args = ['rebase', '--continue'];
    const r = await commitGit(cwd, args);
    if (!r.ok) {
      const conflicts = await collectConflicts(cwd);
      if (conflicts.length) {
        return {
          success: false, has_conflicts: true, conflicts,
          rebased_commits: 0, current_step: 0, total_steps: 0, finished: false,
        };
      }
      throw new EngineError(gitErrMsg(args, r));
    }
    return {
      success: true, has_conflicts: false, conflicts: [],
      rebased_commits: 0, current_step: 0, total_steps: 0, finished: true,
    };
  },

  /** 只读预览：base..HEAD 应用序（老→新）的 pick todo 列表。 */
  async plan_interactive_rebase(params) {
    const cwd = await repo(params);
    return rebasePlanInternal(cwd, reqStr(params, 'baseCommitish'));
  },

  async cherry_pick(params) {
    const cwd = await repo(params);
    const sha = reqStr(params, 'commitSha');
    const args = ['cherry-pick', sha];
    const r = await commitGit(cwd, args);
    if (!r.ok) {
      const conflicts = await collectConflicts(cwd);
      if (conflicts.length) {
        return {
          success: false, has_conflicts: true, conflicts,
          commit_sha: sha, commit_message: '', finished: false,
        };
      }
      throw new EngineError(gitErrMsg(args, r));
    }
    return {
      success: true, has_conflicts: false, conflicts: [],
      commit_sha: (await headSha(cwd)) || '', commit_message: await headCommitMessage(cwd), finished: true,
    };
  },

  async cherry_pick_abort(params) {
    const cwd = await repo(params);
    await gitText(cwd, ['cherry-pick', '--abort']);
    return null;
  },

  async cherry_pick_continue(params) {
    const cwd = await repo(params);
    const args = ['cherry-pick', '--continue', '--no-edit'];
    const r = await commitGit(cwd, args);
    if (!r.ok) {
      const conflicts = await collectConflicts(cwd);
      if (conflicts.length) {
        return {
          success: false, has_conflicts: true, conflicts,
          commit_sha: '', commit_message: '', finished: false,
        };
      }
      throw new EngineError(gitErrMsg(args, r));
    }
    return {
      success: true, has_conflicts: false, conflicts: [],
      commit_sha: (await headSha(cwd)) || '', commit_message: await headCommitMessage(cwd), finished: true,
    };
  },

  async revert(params) {
    const cwd = await repo(params);
    const sha = reqStr(params, 'commitSha');
    const args = ['revert', '--no-edit', sha];
    const r = await commitGit(cwd, args);
    if (!r.ok) {
      const conflicts = await collectConflicts(cwd);
      if (conflicts.length) {
        return {
          success: false, has_conflicts: true, conflicts,
          commit_sha: sha, commit_message: '', finished: false,
        };
      }
      throw new EngineError(gitErrMsg(args, r));
    }
    return {
      success: true, has_conflicts: false, conflicts: [],
      commit_sha: (await headSha(cwd)) || '', commit_message: await headCommitMessage(cwd), finished: true,
    };
  },

  async revert_abort(params) {
    const cwd = await repo(params);
    await gitText(cwd, ['revert', '--abort']);
    return null;
  },

  async revert_continue(params) {
    const cwd = await repo(params);
    const args = ['revert', '--continue', '--no-edit'];
    const r = await commitGit(cwd, args);
    if (!r.ok) {
      const conflicts = await collectConflicts(cwd);
      if (conflicts.length) {
        return {
          success: false, has_conflicts: true, conflicts,
          commit_sha: '', commit_message: '', finished: false,
        };
      }
      throw new EngineError(gitErrMsg(args, r));
    }
    return {
      success: true, has_conflicts: false, conflicts: [],
      commit_sha: (await headSha(cwd)) || '', commit_message: await headCommitMessage(cwd), finished: true,
    };
  },

  // ── 冲突文件解决（CLI 等价：写内容 / 删除 / checkout ours|theirs + add）──
  async resolve_conflict_file(params) {
    const cwd = await repo(params);
    const filePath = reqStr(params, 'filePath');
    const content = optStr(params, 'content');
    const remove = boolOr(params, 'remove', false);
    if (content !== null) {
      const full = path.join(cwd, filePath);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content, 'utf8');
      await gitText(cwd, ['add', '-A', '--', filePath]);
      return null;
    }
    if (remove) {
      const full = path.join(cwd, filePath);
      try { fs.unlinkSync(full); } catch (e) { if (e.code !== 'ENOENT') throw new EngineError(e.message); }
      await gitText(cwd, ['rm', '-f', '--', filePath]);
      return null;
    }
    const side = (optStr(params, 'side') === 'ours') ? '--ours' : '--theirs';
    await gitText(cwd, ['checkout', side, '--', filePath]);
    await gitText(cwd, ['add', '-A', '--', filePath]);
    return null;
  },

  // ── R1 补齐：原 13 个 UNSUPPORTED 动作的真实实现 ──────────────────────

  // 撤销快照（对齐主仓 undo.rs；元数据 + 内容副本落在 state.js 的 JSON 文件）
  async undo_list(params) {
    return listUndoSnapshots(ws(params));
  },

  async undo_restore(params) {
    return restoreUndoSnapshot(ws(params), reqStr(params, 'snapshotRef'));
  },

  async undo_drop(params) {
    return dropUndoSnapshot(ws(params), reqStr(params, 'snapshotRef'));
  },

  // 操作流水（对齐主仓 GitOperationEntry / OPERATIONS 环形缓冲，倒序、每 ws 上限 50）
  async get_operations(params) {
    return listOperations(ws(params));
  },

  async clear_operations(params) {
    return clearOperations(ws(params));
  },

  // 泳道日志（对齐主仓 GitLogPage：commits 含 refs + rows 泳道 + semantic 语义色）
  async get_log_with_lanes(params) {
    const cwd = await repo(params);
    const limit = optNum(params, 'limit') ?? optNum(params, 'maxCount') ?? 500;
    const skip = optNum(params, 'skip') ?? 0;
    const branch = optStr(params, 'branch');
    const args = ['--topo-order', '-n', String(limit)];
    if (skip > 0) args.push(`--skip=${skip}`);
    if (branch) args.push(branch);
    const commits = await logCommits(cwd, args); // logCommits 已补 refs 装饰
    return {
      commits,
      rows: computeLanes(commits),
      semantic: await laneSemantics(cwd, commits),
    };
  },

  // 归一序列状态（对齐主仓 GitSequenceState / GitConflictEntry，字段名为 snake_case）
  async get_conflict_state(params) {
    const cwd = await repo(params);
    const seq = await detectSequence(cwd);
    const conflicts = await conflictEntriesV2(cwd);
    const out = { kind: seq.kind, has_conflicts: conflicts.length > 0, conflicts };
    if (seq.currentStep !== null) out.current_step = seq.currentStep;
    if (seq.totalSteps !== null) out.total_steps = seq.totalSteps;
    return out;
  },

  // fixup!/squash! 整理建议（对齐主仓 GitRebaseSuggestion，规则见 assembleSuggestions）
  async suggest_rebase_todos(params) {
    const cwd = await repo(params);
    const base = reqStr(params, 'baseCommitish');
    const plan = await rebasePlanInternal(cwd, base);
    const s = assembleSuggestions(plan.commits);
    try { validateTodos(s.commits); } catch (_) {
      // 防御兜底：建议序列不过校验则如实降级为原 plan（moved=0），不静默出错序。
      return { baseCommitish: base, commits: plan.commits, movedCount: 0, unmatched: [] };
    }
    return { baseCommitish: base, commits: s.commits, movedCount: s.movedCount, unmatched: s.unmatched };
  },

  // 面板化 Interactive Rebase：GIT_SEQUENCE_EDITOR 注入 todo（reword 另用 GIT_EDITOR 回放）
  async start_interactive_rebase(params) {
    const cwd = await repo(params);
    const base = reqStr(params, 'baseCommitish');
    const todos = params.todos;
    validateTodos(todos);
    const autosquash = boolOr(params, 'autosquash', false);
    const chk = await runGit(cwd, ['rev-parse', '--verify', `${base}^{commit}`]);
    if (!chk.ok) throw new EngineError(`Branch/commit not found: ${base}`);

    const q = (p) => `"${String(p).replace(/\\/g, '/')}"`;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'polaris-rebase-'));
    try {
      const todoFile = path.join(tmp, 'git-rebase-todo.txt');
      fs.writeFileSync(todoFile, todos.map(renderTodoLine).join('\n') + '\n');
      // GIT_SEQUENCE_EDITOR：把面板 todo 覆盖到 git 传入的 todo 文件（argv[2]）。
      const seqEditor = path.join(tmp, 'seq-editor.cjs');
      fs.writeFileSync(seqEditor,
        "const fs=require('node:fs');\n"
        + "const src=process.env.POLARIS_REBASE_TODO;\n"
        + "if(src&&process.argv[2]) fs.copyFileSync(src, process.argv[2]);\n");

      const rewords = todos.filter((t) => normAction(t.action) === 'Reword');
      let gitEditorCmd = 'true';
      if (rewords.length) {
        const order = [];
        rewords.forEach((t, k) => {
          const name = `reword-${k}.txt`;
          const body = String(t.new_message || t.newMessage || t.subject || '');
          fs.writeFileSync(path.join(tmp, name), body.endsWith('\n') ? body : body + '\n');
          order.push(name);
        });
        fs.writeFileSync(path.join(tmp, 'reword-order.txt'), order.join('\n') + '\n');
        const gitEditor = path.join(tmp, 'reword-editor.cjs');
        fs.writeFileSync(gitEditor,
          "const fs=require('node:fs');const path=require('node:path');\n"
          + "const dir=__dirname;const order=path.join(dir,'reword-order.txt');\n"
          + "if(!fs.existsSync(order)||!process.argv[2]) process.exit(0);\n"
          + "const lines=fs.readFileSync(order,'utf8').split(/\\r?\\n/).filter(Boolean);\n"
          + "if(!lines.length) process.exit(0);\n"
          + "const msg=path.join(dir,lines[0]);\n"
          + "if(fs.existsSync(msg)) fs.copyFileSync(msg, process.argv[2]);\n"
          + "fs.writeFileSync(order, lines.slice(1).join('\\n')+(lines.length>1?'\\n':''));\n");
        gitEditorCmd = `${q(process.execPath)} ${q(gitEditor)}`;
      }
      const args = ['rebase', '-i'];
      if (autosquash) args.push('--autosquash');
      args.push(base);
      const r = await runGit(cwd, args, {
        env: {
          GIT_SEQUENCE_EDITOR: `${q(process.execPath)} ${q(seqEditor)}`,
          POLARIS_REBASE_TODO: todoFile,
          GIT_EDITOR: gitEditorCmd,
          GIT_TERMINAL_PROMPT: '0',
        },
      });
      if (r.ok) {
        const collapsed = todos.filter((t) => ['Squash', 'Fixup'].includes(normAction(t.action))).length;
        const picks = todos.filter((t) => normAction(t.action) === 'Pick').length;
        return {
          success: true, has_conflicts: false, conflicts: [],
          rebased_commits: Math.max(0, picks - collapsed),
          current_step: todos.length, total_steps: todos.length, finished: true,
        };
      }
      const seq = await detectSequence(cwd);
      const conflicts = await conflictEntriesV2(cwd);
      if (conflicts.length) {
        return {
          success: false, has_conflicts: true, conflicts, rebased_commits: 0,
          current_step: seq.currentStep ?? 1, total_steps: seq.totalSteps ?? todos.length, finished: false,
        };
      }
      throw new EngineError(r.stderr.trim() || `git rebase -i ${base} 失败`);
    } finally {
      try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
    }
  },

  // 冲突预测（对齐主仓 GitConflictPrediction：incoming_files ∩ local_modified）
  async predict_conflicts(params) {
    const cwd = await repo(params);
    const branchName = optStr(params, 'branch') || (await currentBranchName(cwd)) || '';
    const empty = (upstream) => ({
      branch: branchName, upstream: upstream || null, behind: 0, incoming: [],
      localModified: [], incomingFiles: [], riskFiles: [], advice: 'none',
    });
    if (!branchName) return empty(null);
    const up = await runGit(cwd, ['rev-parse', '--abbrev-ref', `${branchName}@{upstream}`]);
    if (!up.ok) return empty(null);
    const upstream = String(up.stdout).trim();
    let behind = 0;
    const ab = await runGit(cwd, ['rev-list', '--left-right', '--count', `HEAD...${upstream}`]);
    if (ab.ok) {
      const m = String(ab.stdout).trim().split(/\s+/);
      if (m.length >= 2) behind = parseInt(m[1], 10) || 0;
    }
    const incoming = [];
    const incomingFiles = new Set();
    const logR = await runGit(cwd, ['log', '--topo-order', '--format=%H%x1f%s', `HEAD..${upstream}`]);
    if (logR.ok) {
      for (const line of String(logR.stdout).split(/\r?\n/)) {
        if (!line.trim()) continue;
        const [sha, ...rest] = line.split('\x1f');
        const s = sha.trim();
        if (!/^[0-9a-f]{40}$/i.test(s)) continue;
        incoming.push({ sha: s, shortSha: shortSha(s), summary: rest.join('\x1f').trim() });
        const dr = await runGit(cwd, ['diff-tree', '--no-commit-id', '--name-only', '-r', '--root', s]);
        if (dr.ok) for (const p of String(dr.stdout).split(/\r?\n/).filter(Boolean)) incomingFiles.add(p.trim());
      }
    }
    const incomingFilesArr = [...incomingFiles].sort();
    const localSet = new Set();
    const st = await gitText(cwd, ['status', '--porcelain=v1', '-z', '-uall']);
    for (const rec of parsePorcelainZ(st)) {
      const { x, y, path: p } = rec;
      const conflict = x === 'U' || y === 'U' || (x === 'A' && y === 'A') || (x === 'D' && y === 'D');
      if (conflict) { localSet.add(p); continue; }
      if (x !== ' ' && x !== '?') localSet.add(p);
      if (y !== ' ' && y !== '?') localSet.add(p);
    }
    const localModified = [...localSet].sort();
    const riskFiles = incomingFilesArr.filter((f) => localModified.includes(f));
    return {
      branch: branchName, upstream, behind, incoming, localModified,
      incomingFiles: incomingFilesArr, riskFiles,
      advice: riskFiles.length ? 'commitOrStash' : 'none',
    };
  },

  // 提交前风险扫描（对齐主仓 GitCommitRiskReport：密钥 / 冲突 marker / 大文件，只看新增行）
  async scan_commit_risk(params) {
    const cwd = await repo(params);
    const MAX = 120;
    const LARGE = 1024 * 1024;
    const findings = [];
    let truncated = false;
    const push = (f) => {
      if (findings.length >= MAX) { truncated = true; return false; }
      findings.push(f); return true;
    };
    const names = new Set();
    const cached = await runGit(cwd, ['diff', '--cached', '--name-only', '-z']);
    if (cached.ok) for (const p of String(cached.stdout).split('\0').filter(Boolean)) names.add(p);
    const untracked = await runGit(cwd, ['ls-files', '--others', '--exclude-standard', '-z']);
    if (untracked.ok) for (const p of String(untracked.stdout).split('\0').filter(Boolean)) names.add(p);
    for (const f of [...names].sort()) {
      let size = 0;
      const b = await runGit(cwd, ['cat-file', '-s', `:${f}`]);
      if (b.ok) size = parseInt(String(b.stdout).trim(), 10) || 0;
      else { try { size = fs.statSync(path.join(cwd, f)).size; } catch (_) {} }
      if (size > LARGE) {
        if (!push({ file: f, line: null, category: 'large-file', pattern: null, excerpt: `文件 ${size} 字节，超 1MiB（是否走 LFS 或加入 ignore？）` })) break;
      }
    }
    const diff = await runGit(cwd, ['diff', '--cached', '--unified=0', '--no-color']);
    const added = parseAddedLines(diff.ok ? String(diff.stdout) : '');
    const patterns = secretPatterns();
    for (const a of added) {
      if (findings.length >= MAX) { truncated = true; break; }
      const trimmed = a.content.replace(/\s+$/, '');
      if (trimmed.startsWith('<<<<<<<') || trimmed.startsWith('>>>>>>>')) {
        push({ file: a.file, line: a.line, category: 'conflict-marker', pattern: null, excerpt: trimmed.slice(0, 80) });
        continue;
      }
      for (const [name, re] of patterns) {
        if (re.test(a.content)) {
          push({ file: a.file, line: a.line, category: 'secret', pattern: name, excerpt: trimmed.slice(0, 60) });
          break;
        }
      }
    }
    return { findings, truncated };
  },

  // PR：优先探测并使用 gh CLI；未安装返回结构化 PR_CLI_UNAVAILABLE（带安装提示）
  async create_pr(params) {
    const cwd = ws(params);
    const options = params.options;
    if (!options || typeof options !== 'object' || !options.title || !options.head_branch || !options.base_branch) {
      throw new EngineError('Invalid PR options: 需要 title / head_branch / base_branch');
    }
    const args = [
      'pr', 'create', '--title', String(options.title),
      '--base', String(options.base_branch), '--head', String(options.head_branch),
      '--json', 'number,state,title,body,url,headRefName,baseRefName,createdAt,updatedAt,mergedAt,closedAt,author,additions,deletions,changedFiles',
    ];
    if (options.body != null) args.push('--body', String(options.body));
    if (options.draft) args.push('--draft');
    for (const a of (Array.isArray(options.assignees) ? options.assignees : [])) args.push('--assignee', String(a));
    for (const l of (Array.isArray(options.labels) ? options.labels : [])) args.push('--label', String(l));
    return prFromGh(await ghJson(cwd, args, 'create_pr'));
  },

  async get_pr_status(params) {
    const cwd = ws(params);
    const n = params.prNumber;
    if (typeof n !== 'number' || !Number.isFinite(n)) {
      throw new EngineError('Missing required argument: prNumber');
    }
    const d = await ghJson(cwd, [
      'pr', 'view', String(Math.floor(n)), '--json',
      'number,state,title,body,url,headRefName,baseRefName,createdAt,updatedAt,mergedAt,closedAt,author,additions,deletions,changedFiles,reviews',
    ], 'get_pr_status');
    return prFromGh(d);
  },
};

// ── R1 零降级：不再注册任何 UNSUPPORTED 分支 ────────────────────────────
// 历史曾由 UNSUPPORTED_REASONS 派生 13 个 UNSUPPORTED handler；R1 后全部改为
// HANDLERS 内的真实实现。若该常量被误填非空，视为回归并拒绝启动。
if (Object.keys(UNSUPPORTED_REASONS).length > 0) {
  throw new Error('engine.js 初始化失败：R1 零降级下 UNSUPPORTED_REASONS 必须为空');
}

// 覆盖性自检：77 个 action 必须全部有显式真实 handler（防止漏登）。
for (const a of KNOWN_ACTIONS) {
  if (typeof HANDLERS[a] !== 'function') {
    throw new Error(`engine.js 初始化失败：action '${a}' 缺少 handler`);
  }
}

/** 归一化 action（别名）。 */
function normalize(action) {
  return ALIASES[action] || action;
}

function unsupportedActionError(action) {
  return `不支持动作: ${action}。cap.git 支持的动作(${KNOWN_ACTIONS.length}): ${KNOWN_ACTIONS.join(', ')}；别名: get_stash_list。请通过 cap.help show target=cap.git 查看完整协议`;
}

/**
 * 统一调度入口。返回 { ok:true, data } | { ok:false, error }。
 * params 缺省视为 {}。
 */
export async function dispatch(action, params = {}) {
  if (typeof action !== 'string' || !action) {
    return { ok: false, error: 'Missing required field: action' };
  }
  const a = normalize(action);
  if (!KNOWN_ACTIONS.includes(a)) {
    return { ok: false, error: unsupportedActionError(action) };
  }
  try {
    const data = await HANDLERS[a](params || {});
    return { ok: true, data };
  } catch (e) {
    if (e instanceof StructuredError) {
      // R1：PR 类能力不可用时回结构化错误（code + installHint），而非 UNSUPPORTED。
      return { ok: false, error: e.message, code: e.code, ...e.extra };
    }
    return { ok: false, error: (e && e.message) ? e.message : String(e) };
  }
}

export default { dispatch };
