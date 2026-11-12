/**
 * state.js —— 插件侧持久状态（撤销快照 + 操作流水），零 npm 依赖，ESM
 *
 * 架构方案 C R1：宿主删除 git2 后，undo 快照与操作流水由插件自己持久化到
 * <appConfigDir>/polaris-git/ 下（对齐主仓 git_capability.rs 的 OPERATIONS 环形缓冲
 * 与 undo.rs 的 refs/polaris-undo/* 快照网络，但按集成约束改用 JSON 文件落地）。
 *
 * 目录布局：
 *   <appConfigDir>/polaris-git/undo/<safe-name>.json   每个快照一个 JSON（元数据 + 内容副本）
 *   <appConfigDir>/polaris-git/operations.jsonl         操作流水（每行一条 GitOperationEntry）
 *
 * 快照内容（满足「HEAD / index / 工作区改动 patch 或文件副本」要求）：
 *   - headSha / branch / hasChanges（元数据，对齐 UndoSnapshotMeta）
 *   - stashSha：git stash create 产出的可恢复 commit（含 index + 工作区改动，用
 *     git update-ref 保活，restore 走 git stash apply，与主仓 undo.rs 语义一致）
 *   - patch / indexPatch：git diff HEAD --binary / git diff --cached --binary 的
 *     base64 内容副本（stash 不可用或失败时用 git apply 兜底恢复）
 *   - untracked：未跟踪文件内容副本（base64），restore 时写回
 *   - deletedRefs：被删分支原 tip（delete_branch 场景），restore 用 update-ref 重建
 *
 * 一切 git 调用走 execFile 数组参数 + shell:false，workspacePath 仅作 cwd。
 * 本插件 package.json 为 "type": "module"，故使用 ESM。
 */
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SNAPSHOT_CONTEXTS } from './actions.js';

const MAX_BUFFER = 64 * 1024 * 1024;
const KEEP_SNAPSHOTS = 5;      // 对齐主仓 prune_undo_snapshots(5)
const OPERATIONS_MAX = 50;     // 对齐主仓 OPERATIONS_MAX

let appConfigDir = path.join(os.tmpdir(), 'polaris-git-default-state');

/** 由 main.js 启动时注入真实 appConfigDir。 */
export function configureState(config) {
  if (config && typeof config.appConfigDir === 'string' && config.appConfigDir.trim()) {
    appConfigDir = config.appConfigDir;
  }
}
function stateDir() { return path.join(appConfigDir, 'polaris-git'); }
function undoDir() { return path.join(stateDir(), 'undo'); }
function opsFile() { return path.join(stateDir(), 'operations.jsonl'); }
function ensureDir(d) { fs.mkdirSync(d, { recursive: true }); }

// ── 独立 git 执行器（state.js 不 import engine.js，避免循环依赖）────────────
/** 永远 resolve；encoding='buffer' 时 stdout 为 Buffer，否则为字符串。 */
function git(cwd, args, opts = {}) {
  const encoding = opts.encoding || 'utf8';
  return new Promise((resolve) => {
    execFile('git', args, {
      cwd,
      encoding,
      maxBuffer: MAX_BUFFER,
      windowsHide: true,
      shell: false,
    }, (err, stdout, stderr) => {
      resolve({
        ok: !err,
        stdout: stdout == null ? (encoding === 'buffer' ? Buffer.alloc(0) : '') : stdout,
        stderr: stderr == null ? '' : String(stderr),
      });
    });
  });
}

// ── 快照命名 / 文件映射 ──────────────────────────────────────────────────
/** ws 路径 → ref 命名段：路径分隔符与非法 ref 字符统一替换为 _（对齐 undo.rs）。 */
function wsSegment(wsPath) {
  return String(wsPath).replace(/[\\/\s~^:?*\[\].]/g, '_').slice(0, 120);
}
/** ref 名 → 安全的 JSON 文件名（不含目录分隔符）。 */
function safeFileName(name) {
  return String(name).replace(/[^A-Za-z0-9._-]/g, '_');
}
function snapshotContext(action) {
  return SNAPSHOT_CONTEXTS[action] || 'undo';
}
function readSnapshotFiles() {
  const dir = undoDir();
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    try {
      const meta = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      out.push({ file: path.join(dir, f), meta });
    } catch (_) { /* 损坏文件跳过 */ }
  }
  return out;
}
function findSnapshot(snapshotRef) {
  return readSnapshotFiles().find((x) => x.meta && x.meta.name === snapshotRef) || null;
}

/**
 * 写动作执行前创建撤销快照。返回 UndoSnapshotMeta 形状的对象；任何失败返回 null
 * （快照是安全网，绝不阻塞原写操作 —— 对齐主仓 create_undo_snapshot_for_action）。
 */
export async function createUndoSnapshot(workspacePath, action, params = {}) {
  if (typeof workspacePath !== 'string' || !workspacePath.trim()) return null;
  const cwd = workspacePath;
  try {
    ensureDir(undoDir());

    const headR = await git(cwd, ['rev-parse', '--verify', '--quiet', 'HEAD']);
    const headSha = headR.ok ? String(headR.stdout).trim() : null;
    const symR = await git(cwd, ['symbolic-ref', '--short', 'HEAD']);
    const branch = symR.ok ? String(symR.stdout).trim() : null;
    const statusR = await git(cwd, ['status', '--porcelain', '-uall']);
    const hasChanges = statusR.ok && String(statusR.stdout).trim().length > 0;

    // 主恢复通道：git stash create（含 index + 工作区 tracked 改动，不改工作区）。
    let stashSha = null;
    if (hasChanges) {
      const sc = await git(cwd, ['stash', 'create', `polaris-undo ${snapshotContext(action)}`]);
      const sha = sc.ok ? String(sc.stdout).trim() : '';
      if (/^[0-9a-f]{40}$/i.test(sha)) stashSha = sha;
    }

    // 内容副本：相对 HEAD 的完整改动 patch + index patch（base64，兼容二进制）。
    const patchR = await git(cwd, ['diff', 'HEAD', '--binary'], { encoding: 'buffer' });
    const patch = patchR.ok ? patchR.stdout.toString('base64') : '';
    const indexR = await git(cwd, ['diff', '--cached', '--binary'], { encoding: 'buffer' });
    const indexPatch = indexR.ok ? indexR.stdout.toString('base64') : '';

    // 未跟踪文件内容副本（stash create 不覆盖它们）。
    const untracked = [];
    const uR = await git(cwd, ['ls-files', '--others', '--exclude-standard', '-z']);
    if (uR.ok) {
      for (const p of String(uR.stdout).split('\0').filter(Boolean)) {
        try {
          const buf = fs.readFileSync(path.join(cwd, p));
          untracked.push({ path: p, content: buf.toString('base64') });
        } catch (_) { /* 读取失败跳过该文件 */ }
      }
    }

    // 被删分支原 tip（delete_branch 场景，对齐主仓 snapshot_extra_refs）。
    const deletedRefs = [];
    if (action === 'delete_branch' && typeof params.name === 'string') {
      const ref = `refs/heads/${params.name}`;
      const r = await git(cwd, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
      if (r.ok && String(r.stdout).trim()) {
        deletedRefs.push({ ref, sha: String(r.stdout).trim() });
      }
    }

    const ts = Math.floor(Date.now() / 1000);
    const name = `refs/polaris-undo/${wsSegment(cwd)}/${ts}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
    const meta = {
      name,
      createdAt: ts,
      context: snapshotContext(action),
      action,
      workspacePath: cwd,
      branch: branch || null,
      headSha,
      hasChanges,
      stashSha,
      patch,
      indexPatch,
      untracked,
      deletedRefs,
    };
    const file = path.join(undoDir(), `${safeFileName(name)}.json`);
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(meta));
    fs.renameSync(`${file}.tmp`, file);

    // 用 git ref 保活 stash commit（否则悬空对象可能被 gc）；无改动则指向 HEAD。
    if (stashSha || headSha) {
      await git(cwd, ['update-ref', name, stashSha || headSha]);
    }
    pruneSnapshots(cwd);
    return {
      name, createdAt: ts, context: meta.context, hasChanges, branch: meta.branch,
    };
  } catch (e) {
    return null;
  }
}

/** 每 ws 仅保留最近 KEEP_SNAPSHOTS 个快照，超限时删 JSON + git ref。 */
function pruneSnapshots(workspacePath) {
  try {
    const mine = readSnapshotFiles()
      .filter((x) => x.meta && x.meta.workspacePath === workspacePath)
      .sort((a, b) => (b.meta.createdAt || 0) - (a.meta.createdAt || 0));
    for (const x of mine.slice(KEEP_SNAPSHOTS)) {
      try { fs.unlinkSync(x.file); } catch (_) {}
      git(workspacePath, ['update-ref', '-d', x.meta.name]).catch(() => {});
    }
  } catch (_) { /* 清理失败不影响主流程 */ }
}

/** 列出某 ws 的快照（倒序），字段对齐主仓 UndoSnapshotMeta（camelCase）。 */
export function listUndoSnapshots(workspacePath) {
  return readSnapshotFiles()
    .filter((x) => x.meta && x.meta.workspacePath === workspacePath)
    .map((x) => ({
      name: x.meta.name,
      createdAt: x.meta.createdAt || 0,
      context: x.meta.context || 'undo',
      hasChanges: !!x.meta.hasChanges,
      branch: x.meta.branch || null,
    }))
    .sort((a, b) => b.createdAt - a.createdAt || String(b.name).localeCompare(String(a.name)));
}

/**
 * 恢复快照：重建被删 ref → 写回未跟踪文件 → stash apply（主）/ git apply patch（兜底）。
 * 返回 UndoRestoreOutcome（camelCase）：{ ok, conflictedFiles, conflictMessage }。
 */
export async function restoreUndoSnapshot(workspacePath, snapshotRef) {
  const found = findSnapshot(snapshotRef);
  if (!found) throw new Error(`恢复快照失败：快照 '${snapshotRef}' 不存在`);
  const meta = found.meta;
  // 命名空间保护：禁止跨 workspace 恢复。
  if (meta.workspacePath !== workspacePath) {
    throw new Error('恢复快照失败：快照不属于当前 workspace');
  }
  const cwd = workspacePath;

  // 1) 重建被删分支 ref
  for (const d of (meta.deletedRefs || [])) {
    await git(cwd, ['update-ref', d.ref, d.sha]);
  }
  // 2) 未跟踪文件内容副本写回
  for (const u of (meta.untracked || [])) {
    const full = path.join(cwd, u.path);
    try {
      ensureDir(path.dirname(full));
      fs.writeFileSync(full, Buffer.from(u.content || '', 'base64'));
    } catch (_) { /* 单文件失败不阻断 */ }
  }

  // 3) tracked 改动：优先 stash apply（含 index 状态），失败再用 patch 兜底。
  let conflictMessage = null;
  let restored = false;
  if (meta.stashSha) {
    const r = await git(cwd, ['stash', 'apply', meta.stashSha]);
    if (r.ok) restored = true;
    else conflictMessage = r.stderr.trim() || null;
  }
  if (!restored && meta.patch) {
    const patchFile = path.join(os.tmpdir(), `polaris-undo-${process.pid}-${Date.now()}.patch`);
    try {
      fs.writeFileSync(patchFile, Buffer.from(meta.patch, 'base64'));
      const r = await git(cwd, ['apply', '--binary', patchFile]);
      if (r.ok) restored = true;
      else conflictMessage = [conflictMessage, r.stderr.trim()].filter(Boolean).join('\n') || null;
    } finally {
      try { fs.unlinkSync(patchFile); } catch (_) {}
    }
  }
  // 无内容改动（纯 HEAD 快照）也视为恢复成功：工作区本就是该 HEAD 状态。
  if (!meta.hasChanges && !meta.stashSha && !meta.patch) restored = true;

  const cf = await git(cwd, ['diff', '--name-only', '--diff-filter=U', '-z']);
  const conflictedFiles = cf.ok ? String(cf.stdout).split('\0').filter(Boolean) : [];
  const ok = restored && conflictedFiles.length === 0;
  return {
    ok,
    conflictedFiles,
    conflictMessage: ok ? null : (conflictMessage || (conflictedFiles.length ? '恢复后存在冲突文件' : null)),
  };
}

/** 删除快照（JSON + git ref），带命名空间保护。返回 null。 */
export async function dropUndoSnapshot(workspacePath, snapshotRef) {
  const found = findSnapshot(snapshotRef);
  if (!found) throw new Error(`删除快照失败：快照 '${snapshotRef}' 不存在`);
  if (found.meta.workspacePath !== workspacePath) {
    throw new Error('拒绝删除快照：不在当前 workspace 命名空间下');
  }
  await git(workspacePath, ['update-ref', '-d', found.meta.name]);
  try { fs.unlinkSync(found.file); } catch (_) {}
  return null;
}

// ── 操作流水（GitOperationEntry，camelCase，倒序，每 ws 上限 50）──────────
/** 追加一条流水。paramsDigest 为参数摘要（扩展字段，主仓 DTO 无，前端可忽略）。 */
export function recordOperation(entry) {
  try {
    ensureDir(stateDir());
    const e = {
      wsPath: entry.workspacePath || '',
      action: entry.action,
      label: entry.label || entry.action,
      ok: !!entry.ok,
      durationMs: Number.isFinite(entry.durationMs) ? entry.durationMs : 0,
      source: entry.source || 'plugin:polaris-git',
      ts: Number.isFinite(entry.ts) ? entry.ts : Math.floor(Date.now() / 1000),
      gitTaskId: entry.gitTaskId ?? null,
      paramsDigest: entry.paramsDigest || '',
    };
    fs.appendFileSync(opsFile(), JSON.stringify(e) + '\n');
  } catch (_) { /* 流水是审计增强，失败不影响写动作 */ }
}

/** 读某 ws 的流水（新→旧，最多 50 条）。字段对齐 GitOperationEntry。 */
export function listOperations(workspacePath) {
  if (!fs.existsSync(opsFile())) return [];
  let lines;
  try { lines = fs.readFileSync(opsFile(), 'utf8').split(/\r?\n/).filter(Boolean); }
  catch (_) { return []; }
  const out = [];
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const e = JSON.parse(lines[i]);
      if (e.wsPath === workspacePath) out.push(e);
    } catch (_) { /* 损坏行跳过 */ }
    if (out.length >= OPERATIONS_MAX) break;
  }
  return out;
}

/** 清空某 ws 的流水（保留其他 ws 的行）。返回 null。 */
export function clearOperations(workspacePath) {
  if (!fs.existsSync(opsFile())) return null;
  try {
    const lines = fs.readFileSync(opsFile(), 'utf8').split(/\r?\n/).filter(Boolean);
    const kept = lines.filter((l) => {
      try { return JSON.parse(l).wsPath !== workspacePath; } catch (_) { return true; }
    });
    const tmp = `${opsFile()}.tmp`;
    fs.writeFileSync(tmp, kept.length ? kept.join('\n') + '\n' : '');
    fs.renameSync(tmp, opsFile());
  } catch (_) { /* 忽略 */ }
  return null;
}
