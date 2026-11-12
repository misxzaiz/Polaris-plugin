/**
 * service.test.mjs —— polaris-git 插件服务验收测试（node:test，零 npm 依赖）
 *
 * 覆盖：
 *   - HTTP 子进程真实启动（node service/main.js 0 <appConfigDir>）、端口 0 自动分配
 *   - GET /__health 恒 200
 *   - POST /dispatch 的 { ok:true,data } / { ok:false,error } 信封（含结构化错误）
 *   - 真实临时 git 仓库上的 get_status / get_diffs / get_log / stage / unstage /
 *     commit / get_branches 的结构化字段（对齐主仓 cap.git + repoStore 兼容）
 *   - R1 零降级：77/77 全实现、0 个 UNSUPPORTED，13 个历史动作的真实实现断言
 *   - R1 七类能力：undo 恢复 / 操作流水 / 泳道日志 / 冲突状态 / rebase plan /
 *     风险清单 / PR 未安装时的结构化错误
 *   - 未知 action 明确错误、路径安全与命令注入防护、写类 action 全局串行队列
 *   - MCP tools/list 覆盖 77 个 action
 *
 * 全部临时目录由 os.tmpdir() + fs.mkdtempSync 创建（Windows 真实路径，Node 与
 * git CLI 均可识别），after 钩子统一 kill 子进程并清理，Windows Git Bash 下可过。
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  KNOWN_ACTIONS,
  WRITE_ACTIONS,
  SNAPSHOT_ACTIONS,
  UNSUPPORTED_REASONS,
  ACTION_LABELS,
} from '../service/actions.js';

const MAIN_JS = fileURLToPath(new URL('../service/main.js', import.meta.url));
const PORT_FILE = 'polaris-git-service.port';

let ROOT;        // 测试根目录（所有临时产物都在其下，便于一次性清理）
let CFG_DIR;     // 服务 appConfigDir（日志 + .port 文件 + undo/operations.jsonl 落此处）
let child;       // 服务子进程
let childErr;    // 服务 stderr 收集，失败时提供诊断
let port;        // 服务实际监听端口

// ── git / HTTP helpers ───────────────────────────────────────────────────
function git(cwd, args) {
  return execFileSync('git', args, { cwd, stdio: 'pipe', windowsHide: true }).toString();
}
/** 允许非零退出（用于制造 merge 冲突等预期失败），返回 stdout 字符串。 */
function gitMaybe(cwd, args) {
  try { return git(cwd, args); } catch (_) { return ''; }
}
function headSha(cwd) {
  return git(cwd, ['rev-parse', 'HEAD']).trim();
}
/** 读文本并归一化 CRLF（Windows git autocrlf 兼容）。 */
function readText(p) {
  return fs.readFileSync(p, 'utf8').replace(/\r/g, '');
}
async function health() {
  return fetch(`http://127.0.0.1:${port}/__health`);
}
async function call(action, params = {}) {
  const body = JSON.stringify({ action, params });
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      // Connection: close：每个请求独立连接，避免长测试中间空闲导致 keep-alive
      // 连接被 service 关闭后 undici 复用失效（fetch failed）；失败再重试一次。
      const res = await fetch(`http://127.0.0.1:${port}/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Connection: 'close' },
        body,
      });
      return await res.json();
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  throw lastErr;
}

/**
 * 建一个独立、已有 1 笔 commit 的真实仓库，返回路径。
 * 每个测试用独立仓库，彼此无共享可变状态。
 */
function makeRepo(tag) {
  const repo = fs.mkdtempSync(path.join(ROOT, `repo-${tag}-`));
  git(repo, ['init', '-q']);
  git(repo, ['config', 'user.email', 'test@example.com']);
  git(repo, ['config', 'user.name', 'Test']);
  fs.writeFileSync(path.join(repo, 'a.txt'), 'l1\nl2\n');
  git(repo, ['add', 'a.txt']);
  git(repo, ['commit', '-q', '-m', 'init']);
  return repo;
}

async function waitPortFile(file, timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(file)) {
      const p = parseInt(fs.readFileSync(file, 'utf8').trim(), 10);
      if (Number.isFinite(p) && p > 0) return p;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`端口文件未出现: ${file}\n--- 服务 stderr ---\n${childErr}`);
}

// R1：历史 13 个 UNSUPPORTED 动作（现均为真实实现）。
const HISTORICAL_UNSUPPORTED = [
  'undo_list', 'undo_restore', 'undo_drop', 'get_operations', 'clear_operations',
  'get_log_with_lanes', 'get_conflict_state', 'start_interactive_rebase',
  'suggest_rebase_todos', 'predict_conflicts', 'scan_commit_risk',
  'create_pr', 'get_pr_status',
];

// ── 生命周期 ─────────────────────────────────────────────────────────────
before(async () => {
  ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'polaris-git-test-'));
  CFG_DIR = path.join(ROOT, 'cfg');
  fs.mkdirSync(CFG_DIR, { recursive: true });
  childErr = '';
  // R1：注入一个不存在的 gh 命令名，稳定触发 PR_CLI_UNAVAILABLE 分支。
  const childEnv = {
    ...process.env,
    POLARIS_GIT_GH_CLI: '__polaris_gh_cli_absent_for_test__',
  };
  child = spawn(process.execPath, [MAIN_JS, '0', CFG_DIR], {
    stdio: ['ignore', 'ignore', 'pipe'],
    env: childEnv,
  });
  child.stderr.on('data', (d) => { childErr += d.toString(); });
  port = await waitPortFile(path.join(CFG_DIR, PORT_FILE));
});

after(async () => {
  if (child && child.exitCode === null) {
    child.kill();
    await new Promise((resolve) => {
      const t = setTimeout(resolve, 3000);
      child.once('exit', () => { clearTimeout(t); resolve(); });
    });
  }
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* 清理兜底 */ }
});

// ── 1. 动作清单自检（R1：77/77 全实现）──────────────────────────────────
test('actions.js：77 个 KNOWN_ACTIONS / 46 个 WRITE / 8 个 SNAPSHOT / 0 个 UNSUPPORTED', () => {
  assert.equal(KNOWN_ACTIONS.length, 77, 'KNOWN_ACTIONS 应为 77');
  assert.equal(WRITE_ACTIONS.size, 46, 'WRITE_ACTIONS 应为 46');
  assert.equal(SNAPSHOT_ACTIONS.size, 8, 'SNAPSHOT_ACTIONS 应为 8');
  assert.equal(Object.keys(UNSUPPORTED_REASONS).length, 0, 'R1 零降级：UNSUPPORTED_REASONS 必须为空');
  // 全部 action 有中文展示名
  const missingLabels = KNOWN_ACTIONS.filter((a) => !ACTION_LABELS[a]);
  assert.deepEqual(missingLabels, [], 'ACTION_LABELS 不应缺项');
  // WRITE / SNAPSHOT 都必须是 KNOWN 的子集
  for (const a of WRITE_ACTIONS) assert.ok(KNOWN_ACTIONS.includes(a), `WRITE ${a} 不在 KNOWN_ACTIONS`);
  for (const a of SNAPSHOT_ACTIONS) assert.ok(KNOWN_ACTIONS.includes(a), `SNAPSHOT ${a} 不在 KNOWN_ACTIONS`);
  // engine 初始化自检：能 import 成功即代表 77 个 handler 齐全且回归自检通过
});

// ── 2. health 恒 200 ────────────────────────────────────────────────────
test('GET /__health 恒 200 且标识 polaris-git', async () => {
  const res = await health();
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.service, 'polaris-git');
  assert.equal(body.port, port);
});

// ── 3. get_status 真实状态 + repoStore 字段兼容 ─────────────────────────
test('get_status 返回真实仓库状态且字段名对齐 repoStore（camelCase）', async () => {
  const repo = makeRepo('status');
  fs.writeFileSync(path.join(repo, 'a.txt'), 'l1\nl2\nl3\n');  // 未暂存修改
  fs.writeFileSync(path.join(repo, 'b.txt'), 'new\n');         // 未跟踪文件

  const r = await call('get_status', { workspacePath: repo });
  assert.equal(r.ok, true, r.error);
  const s = r.data;
  // 顶层字段（对齐 GitRepositoryStatus / repoStore.ts，均为 camelCase）
  for (const k of ['exists', 'branch', 'commit', 'shortCommit', 'ahead', 'behind',
    'staged', 'unstaged', 'untracked', 'conflicted', 'isEmpty']) {
    assert.ok(Object.prototype.hasOwnProperty.call(s, k), `缺少字段 ${k}`);
  }
  assert.equal(s.exists, true);
  assert.equal(s.isEmpty, false);
  assert.equal(typeof s.branch, 'string');
  assert.match(s.shortCommit, /^[0-9a-f]{7,40}$/);
  assert.equal(s.ahead, 0);
  assert.equal(s.behind, 0);
  // untracked 是字符串数组（repoStore 契约），unstaged 是 GitFileChange[]
  assert.ok(s.untracked.includes('b.txt'), '未跟踪文件应进入 untracked');
  const changed = s.unstaged.find((x) => x.path === 'a.txt');
  assert.ok(changed, 'a.txt 的修改应进入 unstaged');
  assert.equal(changed.status, 'modified');
  assert.deepEqual(s.staged, []);
  assert.deepEqual(s.conflicted, []);
});

// ── 4. get_diffs 返回结构化 GitDiffEntry ────────────────────────────────
test('get_diffs 返回两提交间差异（snake_case GitDiffEntry 字段）', async () => {
  const repo = makeRepo('diffs');
  const first = headSha(repo);
  fs.writeFileSync(path.join(repo, 'a.txt'), 'l1\nl2\nl3\n');
  const cr = await call('commit_changes', { workspacePath: repo, message: 'second', stageAll: true });
  assert.equal(cr.ok, true, cr.error);

  const r = await call('get_diffs', { workspacePath: repo, baseCommit: first, compareTo: 'HEAD' });
  assert.equal(r.ok, true, r.error);
  assert.ok(Array.isArray(r.data));
  const e = r.data.find((x) => x.file_path === 'a.txt');
  assert.ok(e, '应包含 a.txt 的差异条目');
  assert.equal(e.change_type, 'modified');
  assert.equal(typeof e.is_binary, 'boolean');
  assert.equal(e.old_content, 'l1\nl2\n');
  assert.equal(e.new_content, 'l1\nl2\nl3\n');
  assert.ok(Number.isInteger(e.additions) && Number.isInteger(e.deletions));
  assert.ok(e.status_hint && typeof e.status_hint === 'object');
});

// ── 5. get_log 结构化 GitCommit ─────────────────────────────────────────
test('get_log 返回结构化 GitCommit（camelCase 字段）', async () => {
  const repo = makeRepo('log');
  const r = await call('get_log', { workspacePath: repo });
  assert.equal(r.ok, true, r.error);
  assert.ok(Array.isArray(r.data) && r.data.length >= 1);
  const c = r.data[0];
  for (const k of ['sha', 'shortSha', 'message', 'author', 'authorEmail', 'timestamp', 'parents']) {
    assert.ok(Object.prototype.hasOwnProperty.call(c, k), `缺少字段 ${k}`);
  }
  assert.equal(c.message, 'init');
  assert.equal(c.author, 'Test');
  assert.equal(c.authorEmail, 'test@example.com');
  assert.ok(Number.isInteger(c.timestamp));
  assert.ok(Array.isArray(c.parents));
});

// ── 6. stage_file / unstage_file ────────────────────────────────────────
test('stage_file 与 unstage_file 真实改变暂存区状态', async () => {
  const repo = makeRepo('stage');
  fs.writeFileSync(path.join(repo, 'b.txt'), 'new\n');

  const s0 = await call('get_status', { workspacePath: repo });
  assert.ok(s0.data.untracked.includes('b.txt'));

  const st = await call('stage_file', { workspacePath: repo, filePath: 'b.txt' });
  assert.equal(st.ok, true, st.error);
  const s1 = await call('get_status', { workspacePath: repo });
  assert.ok(s1.data.staged.some((x) => x.path === 'b.txt'), 'b.txt 应进入 staged');
  assert.ok(!s1.data.untracked.includes('b.txt'), 'b.txt 应离开 untracked');

  const us = await call('unstage_file', { workspacePath: repo, filePath: 'b.txt' });
  assert.equal(us.ok, true, us.error);
  const s2 = await call('get_status', { workspacePath: repo });
  assert.ok(s2.data.untracked.includes('b.txt'), 'unstage 后 b.txt 应回到 untracked');
});

// ── 7. commit_changes 真实提交 ──────────────────────────────────────────
test('commit_changes 产生真实提交且日志递增', async () => {
  const repo = makeRepo('commit');
  const before = await call('get_log', { workspacePath: repo });
  assert.equal(before.data.length, 1);

  fs.writeFileSync(path.join(repo, 'c.txt'), 'ccc\n');
  const cr = await call('commit_changes', { workspacePath: repo, message: 'add c', stageAll: true });
  assert.equal(cr.ok, true, cr.error);
  assert.match(cr.data, /^[0-9a-f]{40}$/, '应返回新提交 sha');

  const afterLog = await call('get_log', { workspacePath: repo });
  assert.equal(afterLog.data.length, 2);
  assert.equal(afterLog.data[0].message, 'add c');
  assert.equal(afterLog.data[0].sha, cr.data);
  assert.deepEqual(afterLog.data[0].parents, [before.data[0].sha]);
});

// ── 8. get_branches 结构化 GitBranch ────────────────────────────────────
test('get_branches 返回结构化 GitBranch（camelCase 字段）', async () => {
  const repo = makeRepo('branches');
  const r = await call('get_branches', { workspacePath: repo });
  assert.equal(r.ok, true, r.error);
  assert.ok(Array.isArray(r.data) && r.data.length >= 1);
  const cur = r.data.find((b) => b.isCurrent === true);
  assert.ok(cur, '应有一个 isCurrent 分支');
  for (const k of ['name', 'isCurrent', 'isRemote', 'commit']) {
    assert.ok(Object.prototype.hasOwnProperty.call(cur, k), `缺少字段 ${k}`);
  }
  assert.equal(cur.isRemote, false);
});

// ── 9. R1 零降级：历史 13 个动作不再返回 UNSUPPORTED ────────────────────
test('R1 零降级：13 个历史 UNSUPPORTED 动作均为真实实现，不返回 UNSUPPORTED', async () => {
  assert.equal(HISTORICAL_UNSUPPORTED.length, 13);
  for (const action of HISTORICAL_UNSUPPORTED) {
    const r = await call(action, { workspacePath: ROOT });
    assert.ok(
      !/^UNSUPPORTED(:| )/.test(String(r.error || '')),
      `${action} 不应再返回 UNSUPPORTED，实得: ${r.error}`,
    );
    assert.ok(
      r.ok === true || typeof r.error === 'string',
      `${action} 应返回合法信封（真实结果或明确错误）`,
    );
  }
});

// ── 10. 未知 action 明确错误并列出支持列表 ──────────────────────────────
test('未知 action 返回明确错误并列出 77 个支持动作', async () => {
  const r = await call('__definitely_unknown__', { workspacePath: ROOT });
  assert.equal(r.ok, false);
  assert.match(r.error, /不支持动作/);
  assert.match(r.error, /77/);
  assert.match(r.error, /get_status/);
  assert.match(r.error, /commit_changes/);
});

// ── 11. 路径安全与命令注入防护 ──────────────────────────────────────────
test('workspacePath 缺失/不存在/非目录均被拒绝，且拒绝命令注入', async () => {
  // 缺失 workspacePath
  const r1 = await call('get_status', {});
  assert.equal(r1.ok, false);
  assert.match(r1.error, /Missing required argument: workspacePath/);

  // 不存在的路径
  const notExist = path.join(ROOT, 'no-such-dir-xyz');
  const r2 = await call('get_status', { workspacePath: notExist });
  assert.equal(r2.ok, false);
  assert.match(r2.error, /不存在或不可访问/);

  // 存在但为普通文件
  const aFile = path.join(ROOT, 'not-a-dir.txt');
  fs.writeFileSync(aFile, 'x');
  const r3 = await call('get_status', { workspacePath: aFile });
  assert.equal(r3.ok, false);
  assert.match(r3.error, /不是目录/);

  // 携带 shell 元字符：应被当作普通路径拒绝（execFile + shell:false）。
  // 关键证据：路径被「原样回显」——$(...) / && / ; 均未被 shell 解释或展开
  // （若被展开，$(whoami) 会变成具体用户名，endsWith 即失败）。
  const injection = path.join(ROOT, 'repo; echo INJECTED && $(whoami)');
  const r4 = await call('get_status', { workspacePath: injection });
  assert.equal(r4.ok, false);
  assert.match(r4.error, /^workspacePath 不存在或不可访问: /);
  assert.ok(r4.error.endsWith(injection), 'shell 元字符应作为纯路径字符串原样回显，未被展开执行');
});

// ── 12. 写类 action 全局串行队列（并发写无丢失）────────────────────────
test('并发写操作经全局串行队列处理，全部生效且无丢失', async () => {
  const repo = makeRepo('writequeue');
  const files = ['w1.txt', 'w2.txt', 'w3.txt', 'w4.txt', 'w5.txt'];
  for (const f of files) fs.writeFileSync(path.join(repo, f), `${f}\n`);

  const results = await Promise.all(
    files.map((f) => call('stage_file', { workspacePath: repo, filePath: f })),
  );
  for (const r of results) assert.equal(r.ok, true, r.error);

  const s = await call('get_status', { workspacePath: repo });
  assert.equal(s.ok, true, s.error);
  for (const f of files) {
    assert.ok(s.data.staged.some((x) => x.path === f), `${f} 应已暂存`);
  }
});

// ── 13. R1 undo：危险写动作前自动建快照，list/restore/drop 真实可用 ─────
test('R1 undo：discard_changes 前自动建快照，undo_list/restore/drop 真实恢复工作区', async () => {
  const repo = makeRepo('undo');
  // 制造未提交改动 + 未跟踪文件（均纳入快照）
  fs.writeFileSync(path.join(repo, 'a.txt'), 'l1\nl2\nCHANGED\n');
  fs.writeFileSync(path.join(repo, 'new.txt'), 'untracked\n');

  // 危险写动作（SNAPSHOT_ACTIONS）：丢弃 a.txt 改动，触发执行前快照
  const dc = await call('discard_changes', { workspacePath: repo, filePath: 'a.txt' });
  assert.equal(dc.ok, true, dc.error);
  assert.ok(!readText(path.join(repo, 'a.txt')).includes('CHANGED'), 'discard 后改动应被丢弃');

  // undo_list：应有 1 个快照，字段对齐 UndoSnapshotMeta（camelCase）
  const ul = await call('undo_list', { workspacePath: repo });
  assert.equal(ul.ok, true, ul.error);
  assert.ok(Array.isArray(ul.data) && ul.data.length >= 1, '应自动产生撤销快照');
  const snap = ul.data[0];
  for (const k of ['name', 'createdAt', 'context', 'hasChanges', 'branch']) {
    assert.ok(Object.prototype.hasOwnProperty.call(snap, k), `快照缺少字段 ${k}`);
  }
  assert.equal(snap.hasChanges, true);
  assert.equal(snap.context, 'discard');
  assert.match(snap.name, /^refs\/polaris-undo\//);

  // undo_restore：恢复被丢弃的改动，返回 UndoRestoreOutcome
  const rr = await call('undo_restore', { workspacePath: repo, snapshotRef: snap.name });
  assert.equal(rr.ok, true, rr.error);
  assert.equal(rr.data.ok, true, JSON.stringify(rr.data));
  assert.deepEqual(rr.data.conflictedFiles, []);
  assert.equal(rr.data.conflictMessage, null);
  assert.ok(readText(path.join(repo, 'a.txt')).includes('CHANGED'), 'restore 应恢复被丢弃的改动');

  // undo_drop：精确删除快照
  const dp = await call('undo_drop', { workspacePath: repo, snapshotRef: snap.name });
  assert.equal(dp.ok, true, dp.error);
  const ul2 = await call('undo_list', { workspacePath: repo });
  assert.ok(!ul2.data.some((x) => x.name === snap.name), 'drop 后快照应消失');
});

// ── 14. R1 操作流水：写动作统一记录 + 清空 ──────────────────────────────
test('R1 操作流水：get_operations 对齐 GitOperationEntry，clear_operations 清除历史', async () => {
  const repo = makeRepo('ops');
  fs.writeFileSync(path.join(repo, 'x.txt'), 'x\n');
  const st = await call('stage_file', { workspacePath: repo, filePath: 'x.txt' });
  assert.equal(st.ok, true, st.error);

  const ops = await call('get_operations', { workspacePath: repo });
  assert.equal(ops.ok, true, ops.error);
  assert.ok(Array.isArray(ops.data));
  const e = ops.data.find((o) => o.action === 'stage_file');
  assert.ok(e, 'stage_file 应留痕');
  for (const k of ['wsPath', 'action', 'label', 'ok', 'durationMs', 'source', 'ts', 'gitTaskId']) {
    assert.ok(Object.prototype.hasOwnProperty.call(e, k), `流水缺少字段 ${k}`);
  }
  assert.equal(e.wsPath, repo);
  assert.equal(e.ok, true);
  assert.equal(typeof e.label, 'string');
  assert.ok(e.label.length > 0, 'label 应为中文展示名');
  assert.ok(Number.isInteger(e.durationMs) && e.durationMs >= 0);
  assert.ok(Number.isInteger(e.ts) && e.ts > 0);

  const cl = await call('clear_operations', { workspacePath: repo });
  assert.equal(cl.ok, true, cl.error);
  const ops2 = await call('get_operations', { workspacePath: repo });
  assert.ok(!ops2.data.some((o) => o.action === 'stage_file'), 'clear 后 stage_file 历史应被清除');
});

// ── 15. R1 泳道日志：GitLogPage（commits/rows/semantic + refs）──────────
test('R1 泳道日志：get_log_with_lanes 返回 GitLogPage 结构化泳道与 refs 装饰', async () => {
  const repo = makeRepo('lanes');
  const r = await call('get_log_with_lanes', { workspacePath: repo, limit: 10 });
  assert.equal(r.ok, true, r.error);
  assert.ok(Array.isArray(r.data.commits), 'commits 应为数组');
  assert.ok(Array.isArray(r.data.rows), 'rows 应为数组');
  assert.ok(Array.isArray(r.data.semantic), 'semantic 应为数组');
  assert.equal(r.data.rows.length, r.data.commits.length, 'rows 与 commits 一一对应');
  assert.equal(r.data.semantic.length, r.data.commits.length, 'semantic 与 commits 一一对应');

  const row = r.data.rows[0];
  assert.ok(row.sha, '泳道行应有 sha');
  assert.ok(Array.isArray(row.cells) && row.cells.length >= 1, 'cells 应非空');
  assert.ok(Array.isArray(row.refs), 'refs 应为数组');
  for (const cell of row.cells) {
    for (const k of ['lane', 'node', 'edgeDown', 'edgeUp']) {
      assert.ok(Object.prototype.hasOwnProperty.call(cell, k), `泳道格缺少字段 ${k}`);
    }
  }
  assert.ok(['local', 'unpushed'].includes(r.data.semantic[0].kind), '语义色应为 local/unpushed');
  // R1：GitCommit 补 refs 装饰
  assert.ok(Array.isArray(r.data.commits[0].refs), 'GitCommit 应带 refs 装饰');
});

// ── 16. R1 冲突状态：真实 merge 冲突 → GitSequenceState 三方 stage ─────
test('R1 冲突状态：get_conflict_state 解析真实 merge 冲突的三方 stage 与序列态', async () => {
  const repo = makeRepo('conflictstate');
  // 在 master 与 feature 分别改同一文件，制造真实冲突
  const main = git(repo, ['rev-parse', '--abbrev-ref', 'HEAD']).trim();
  git(repo, ['checkout', '-q', '-b', 'feature']);
  fs.writeFileSync(path.join(repo, 'a.txt'), 'feature side\n');
  git(repo, ['add', 'a.txt']);
  git(repo, ['commit', '-q', '-m', 'feature']);
  git(repo, ['checkout', '-q', main]);
  fs.writeFileSync(path.join(repo, 'a.txt'), 'master side\n');
  git(repo, ['add', 'a.txt']);
  git(repo, ['commit', '-q', '-m', 'master']);
  gitMaybe(repo, ['merge', '--no-edit', 'feature']); // 预期冲突，忽略退出码

  const r = await call('get_conflict_state', { workspacePath: repo });
  assert.equal(r.ok, true, r.error);
  // 字段名对齐 GitSequenceState（原名 snake_case）
  for (const k of ['kind', 'has_conflicts', 'conflicts']) {
    assert.ok(Object.prototype.hasOwnProperty.call(r.data, k), `缺少字段 ${k}`);
  }
  assert.equal(r.data.kind, 'merge', '应探测到进行中的 merge 序列');
  assert.equal(r.data.has_conflicts, true);
  assert.ok(Array.isArray(r.data.conflicts) && r.data.conflicts.length >= 1);
  const e = r.data.conflicts.find((x) => x.path === 'a.txt');
  assert.ok(e, '应包含 a.txt 冲突条目');
  for (const k of ['path', 'kind']) assert.ok(k in e, `冲突条目缺少字段 ${k}`);
  assert.equal(e.kind, 'text');
  assert.equal(typeof e.ours, 'string', 'ours 应有三方 stage 内容');
  assert.equal(typeof e.theirs, 'string', 'theirs 应有三方 stage 内容');
});

// ── 17. R1 rebase：plan / suggest / start_interactive_rebase ─────────────
test('R1 rebase：plan/suggest 产出可编辑 todo 与 fixup 建议，start 真实执行', async () => {
  const repo = makeRepo('rebase');
  fs.writeFileSync(path.join(repo, 'a.txt'), 'l1\nl2\nl3\n');
  git(repo, ['add', 'a.txt']);
  git(repo, ['commit', '-q', '-m', 'second']);
  fs.writeFileSync(path.join(repo, 'a.txt'), 'l1\nl2\nl3\nl4\n');
  git(repo, ['add', 'a.txt']);
  git(repo, ['commit', '-q', '-m', 'fixup! second']);

  // plan：base..HEAD 应用序（老→新），对齐 GitRebasePlan（camelCase）
  const plan = await call('plan_interactive_rebase', { workspacePath: repo, baseCommitish: 'HEAD~2' });
  assert.equal(plan.ok, true, plan.error);
  assert.equal(plan.data.baseCommitish, 'HEAD~2');
  assert.equal(plan.data.commits.length, 2);
  assert.equal(plan.data.firstLocked, true);
  assert.ok(plan.data.commits.every((c) => c.action === 'Pick'), 'plan 默认全为 Pick');

  // suggest：fixup! second 应配对到 second 并改写为 Fixup
  const sug = await call('suggest_rebase_todos', { workspacePath: repo, baseCommitish: 'HEAD~2' });
  assert.equal(sug.ok, true, sug.error);
  assert.equal(sug.data.movedCount, 1, 'fixup! second 应成功配对');
  assert.deepEqual(sug.data.unmatched, []);
  const fix = sug.data.commits.find((c) => c.subject === 'fixup! second');
  assert.ok(fix, '应保留 fixup! 提交');
  assert.equal(fix.action, 'Fixup');

  // start：GIT_SEQUENCE_EDITOR 注入纯 pick todo，真实执行成功
  const todos = plan.data.commits.map((c) => ({ sha: c.sha, subject: c.subject, action: 'Pick' }));
  const st = await call('start_interactive_rebase', {
    workspacePath: repo, baseCommitish: 'HEAD~2', todos, autosquash: false,
  });
  assert.equal(st.ok, true, st.error);
  // 字段名对齐 GitRebaseResult（原名 snake_case）
  for (const k of ['success', 'has_conflicts', 'conflicts', 'rebased_commits', 'current_step', 'total_steps', 'finished']) {
    assert.ok(Object.prototype.hasOwnProperty.call(st.data, k), `rebase 结果缺少字段 ${k}`);
  }
  assert.equal(st.data.success, true);
  assert.equal(st.data.finished, true);
});

// ── 18. R1 风险清单：predict_conflicts 交集 + scan_commit_risk 规则 ─────
test('R1 风险清单：predict_conflicts 确定性交集 + scan_commit_risk 密钥/冲突标记/大文件', async () => {
  // (a) predict_conflicts：构造有 upstream 且 incoming 与本地改动重叠的仓库
  const bare = path.join(ROOT, 'predict-remote.git');
  fs.mkdirSync(bare, { recursive: true });
  git(bare, ['init', '-q', '--bare']);
  const p = fs.mkdtempSync(path.join(ROOT, 'repo-predict-'));
  git(p, ['init', '-q']);
  git(p, ['config', 'user.email', 'test@example.com']);
  git(p, ['config', 'user.name', 'Test']);
  fs.writeFileSync(path.join(p, 'shared.txt'), 'v1\n');
  git(p, ['add', 'shared.txt']);
  git(p, ['commit', '-q', '-m', 'A']);
  git(p, ['remote', 'add', 'origin', bare.replace(/\\/g, '/')]);
  git(p, ['push', '-q', '-u', 'origin', 'HEAD']);
  fs.writeFileSync(path.join(p, 'shared.txt'), 'v2\n');
  git(p, ['add', 'shared.txt']);
  git(p, ['commit', '-q', '-m', 'B']);
  git(p, ['push', '-q', 'origin', 'HEAD']);
  git(p, ['reset', '--hard', 'HEAD~1']);   // 本地回到 A，upstream 领先 B
  fs.writeFileSync(path.join(p, 'shared.txt'), 'local edit\n'); // 本地改同一文件

  const pr = await call('predict_conflicts', { workspacePath: p });
  assert.equal(pr.ok, true, pr.error);
  for (const k of ['branch', 'upstream', 'behind', 'incoming', 'localModified', 'incomingFiles', 'riskFiles', 'advice']) {
    assert.ok(Object.prototype.hasOwnProperty.call(pr.data, k), `预测缺少字段 ${k}`);
  }
  assert.equal(pr.data.upstream, 'origin/master');
  assert.ok(pr.data.behind >= 1, 'upstream 应领先');
  assert.ok(pr.data.incoming.length >= 1, '应有 incoming 提交预览');
  assert.ok(pr.data.localModified.includes('shared.txt'));
  assert.ok(pr.data.incomingFiles.includes('shared.txt'));
  assert.ok(pr.data.riskFiles.includes('shared.txt'), '重叠文件应进入 riskFiles');
  assert.equal(pr.data.advice, 'commitOrStash');

  // (b) scan_commit_risk：暂存疑似密钥 / 冲突标记 / >1MiB 大文件
  const repo = makeRepo('risk');
  fs.writeFileSync(path.join(repo, 'secret.txt'), 'AKIAIOSFODNN7EXAMPLE\n');
  git(repo, ['add', 'secret.txt']);
  fs.writeFileSync(path.join(repo, 'marker.txt'), '<<<<<<< HEAD\n');
  git(repo, ['add', 'marker.txt']);
  fs.writeFileSync(path.join(repo, 'big.bin'), Buffer.alloc(1024 * 1024 + 10, 1));
  git(repo, ['add', 'big.bin']);

  const risk = await call('scan_commit_risk', { workspacePath: repo });
  assert.equal(risk.ok, true, risk.error);
  assert.ok(Array.isArray(risk.data.findings));
  assert.equal(typeof risk.data.truncated, 'boolean');
  const cats = risk.data.findings.map((f) => f.category);
  assert.ok(cats.includes('secret'), '应命中密钥模式');
  assert.ok(cats.includes('conflict-marker'), '应命中冲突标记');
  assert.ok(cats.includes('large-file'), '应命中大文件');
  const secret = risk.data.findings.find((f) => f.category === 'secret');
  assert.equal(secret.pattern, 'aws-access-key');
  for (const k of ['file', 'line', 'category', 'pattern', 'excerpt']) {
    assert.ok(Object.prototype.hasOwnProperty.call(secret, k), `风险条目缺少字段 ${k}`);
  }
});

// ── 19. R1 PR：gh 未安装时返回结构化 PR_CLI_UNAVAILABLE（非 UNSUPPORTED）──
test('R1 PR：create_pr/get_pr_status 在 gh 未安装时返回 PR_CLI_UNAVAILABLE 结构化错误', async () => {
  const r = await call('create_pr', {
    workspacePath: ROOT,
    options: { title: 't', head_branch: 'h', base_branch: 'b' },
  });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'PR_CLI_UNAVAILABLE');
  assert.match(r.error, /PR_CLI_UNAVAILABLE/);
  assert.ok(!/^UNSUPPORTED/.test(r.error), '应为可判定错误而非 UNSUPPORTED');
  assert.equal(r.requiredCli, 'gh');
  assert.match(r.installHint, /安装/);
  assert.match(r.installHint, /gh auth login/);

  const r2 = await call('get_pr_status', { workspacePath: ROOT, prNumber: 1 });
  assert.equal(r2.ok, false);
  assert.equal(r2.code, 'PR_CLI_UNAVAILABLE');
  assert.match(r2.installHint, /gh auth login/);
});

// ── 20. MCP 工具面覆盖 77 个 action ─────────────────────────────────────
test('MCP tools/list 覆盖 77 个 git_<action> + git_dispatch，描述无 UNSUPPORTED 残留', async () => {
  const { buildTools, createHttpDispatcher } = await import('../mcp/tools.js');
  const stub = async () => ({ content: [{ type: 'text', text: '' }], isError: false });
  const tools = buildTools(stub);
  const names = tools.map((t) => t.name);
  assert.equal(names.length, 78, '77 个 action + 1 个 git_dispatch');
  for (const a of KNOWN_ACTIONS) {
    assert.ok(names.includes(`git_${a}`), `缺少工具 git_${a}`);
  }
  assert.ok(names.includes('git_dispatch'));
  for (const t of tools) {
    assert.ok(!/UNSUPPORTED/.test(t.description), `${t.name} 描述不应残留 UNSUPPORTED`);
  }

  // R1：service 的结构化错误经 MCP 透传 code / 安装提示给 AI 调用方
  const dispatcher = createHttpDispatcher([CFG_DIR, String(port)]);
  const prResult = await dispatcher('create_pr', {
    workspacePath: ROOT,
    options: { title: 't', head_branch: 'h', base_branch: 'b' },
  });
  assert.equal(prResult.isError, true);
  const text = prResult.content[0].text;
  assert.match(text, /PR_CLI_UNAVAILABLE/);
  assert.match(text, /code=PR_CLI_UNAVAILABLE/);
  assert.match(text, /installHint=/);
  assert.match(text, /gh auth login/);
});
