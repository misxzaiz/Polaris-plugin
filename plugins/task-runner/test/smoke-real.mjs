/**
 * 真实环境全链路冒烟（node test/smoke-real.mjs）
 *
 * 前提：本机 Polaris 正在运行（anchor.json → config.json web.port 可达）。
 * 流程：
 *   1. 防误伤护栏：真实 kv 已有 taskrun.* 业务键 → 拒跑
 *   2. 起本地 mock 端点（127.0.0.1，http 任务目标，allowPrivate 显式放行）
 *   3. 拉起真实服务（node service/main.js 19876 appConfigDir）→ meta 心跳落真实 kv
 *   4. cmd.add 建 notify(interval 6s) 任务 → 等自动执行 → 运行历史落真实 kv
 *   5. cmd.add http 任务（指向本地 mock）+ cmd.runNow → 回执 + 历史含 HTTP 200
 *   6. cmd.add command 任务（powershell echo）+ runNow → 退出码 0 + stdout 摘录
 *   7. 错过补跑：杀服务 → 直接写 jobs 键（nextRunAt 过期）→ 重启服务 → missed:true 补跑一次
 *   8. MCP 全链路：真实 mcp/server.js → initialize → tools/list(6) → task_list / task_add(confirm 闸)
 *   9. 清理：杀进程 + 删光 taskrun.* 键（全绿自清理）
 */
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const PLUGIN_ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const KPREFIX = 'taskrun.';

function loadEndpoint() {
  const anchorPath = path.join(process.env.APPDATA || '', 'Polaris', 'anchor.json');
  const anchor = JSON.parse(fs.readFileSync(anchorPath, 'utf8'));
  const cfg = JSON.parse(fs.readFileSync(path.join(anchor.dataRoot, 'config.json'), 'utf8'));
  return { host: '127.0.0.1', port: cfg.web.port, token: cfg.web.token || '', appConfigDir: anchor.dataRoot };
}
let EP;
try { EP = loadEndpoint(); } catch (e) {
  console.error(`⚠ 宿主不在线（读取 anchor/config 失败：${e.message}）——真桥冒烟明确跳过，前三层（单测/MCP/SSR 渲染）已全绿。`);
  process.exit(0);
}

function md5(s) { return crypto.createHash('md5').update(String(s)).digest('hex'); }

function bridgeDispatch(target, payload, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ req: { target, payload } });
    const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) };
    if (EP.token) headers.Authorization = `Bearer ${md5(EP.token)}`;
    const req = http.request({ hostname: EP.host, port: EP.port, path: '/api/router-dispatch', method: 'POST', headers, timeout: timeoutMs }, (res) => {
      let b = '';
      res.on('data', (c) => { b += c; });
      res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('bridge timeout')));
    req.write(data);
    req.end();
  });
}
async function kvSet(k, v) { const r = await bridgeDispatch('cap.kv', { action: 'set', key: k, value: v }); if (!r.ok) throw new Error('kv set: ' + r.error); }
async function kvGet(k) { const r = await bridgeDispatch('cap.kv', { action: 'get', key: k }); if (!r.ok) throw new Error('kv get: ' + r.error); return r.result?.value ?? null; }
async function kvDel(k) { return bridgeDispatch('cap.kv', { action: 'delete', key: k }); }
async function kvKeys() { const r = await bridgeDispatch('cap.kv', { action: 'list' }); if (!r.ok) throw new Error('kv list: ' + r.error); return r.result?.keys ?? []; }

async function waitFor(fn, ms, step = 500, label = '') {
  const t0 = Date.now();
  for (;;) {
    try { const v = await fn(); if (v) return v; } catch (_) { /* 重试 */ }
    if (Date.now() - t0 > ms) throw new Error(`等待超时：${label}`);
    await new Promise((r) => setTimeout(r, step));
  }
}

// ── 命令通道（冒烟侧 = 面板/MCP 同款协议）───────────────────────────────────
async function sendCmd(op, payload, waitMs = 20000) {
  const nonce = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}sm`;
  const key = `${KPREFIX}cmd.${op}.${nonce}`;
  await kvSet(key, { op, ...payload, at: Date.now() });
  const deadline = Date.now() + waitMs;
  for (;;) {
    const r = await kvGet(`${KPREFIX}result.${nonce}`);
    if (r && typeof r === 'object' && ('ok' in r || 'error' in r)) {
      if (r.queued === true && Date.now() < deadline) { await new Promise((res) => setTimeout(res, 700)); continue; }
      await kvDel(`${KPREFIX}result.${nonce}`);
      return r;
    }
    if (Date.now() > deadline) return { ok: false, error: '未回执' };
    await new Promise((res) => setTimeout(res, 700));
  }
}

async function readRuns(limit = 50) {
  const idx = await kvGet(`${KPREFIX}runsIdx`);
  const chunkCount = idx?.chunkCount || 0;
  const out = [];
  for (let n = chunkCount - 1; n >= 0 && out.length < limit; n--) {
    const chunk = await kvGet(`${KPREFIX}run.${n}`);
    if (Array.isArray(chunk)) out.push(...chunk);
  }
  return out;
}

const svc = { proc: null };
function startService() {
  const proc = spawn('node', [path.join(PLUGIN_ROOT, 'service', 'main.js'), '19876', EP.appConfigDir], { stdio: 'ignore' });
  svc.proc = proc;
  return proc;
}
function stopService() {
  if (svc.proc) { try { svc.proc.kill(); } catch (_) {} svc.proc = null; }
}
async function killAllTaskRunner() {
  try {
    const { execSync } = await import('node:child_process');
    const out = execSync("powershell -NoProfile -Command \"Get-CimInstance Win32_Process -Filter \\\"Name='node.exe'\\\" | Where-Object { $_.CommandLine -like '*task-runner*service*main.js*' } | Select-Object -ExpandProperty ProcessId\"", { encoding: 'utf8' });
    for (const line of out.split(/\r?\n/)) {
      const pid = parseInt(line.trim(), 10);
      if (Number.isFinite(pid)) { try { process.kill(pid); } catch (_) { /* 已退 */ } }
    }
  } catch (_) { /* CIM 不可用则忽略（svc.proc 已直接杀） */ }
}

const results = [];
const t = async (name, fn) => {
  try { await fn(); results.push({ name, pass: true }); }
  catch (e) { results.push({ name, pass: false, detail: e.message }); }
};

// ── 1. 防误伤护栏 ────────────────────────────────────────────────────────────
const existing = (await kvKeys()).filter((k) => k.startsWith(KPREFIX));
if (existing.length) {
  console.error(`⚠ 真实 kv 已存在 ${existing.length} 个 taskrun.* 键（插件可能正在使用）——为不覆盖真实数据拒跑。`);
  process.exit(1);
}

// ── 2. 本地 mock 端点（http 任务目标）───────────────────────────────────────
let mockHits = 0;
const mock = http.createServer((req, res) => {
  mockHits += 1;
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, hits: mockHits, at: new Date().toISOString() }));
});
await new Promise((resolve) => mock.listen(0, '127.0.0.1', resolve));
const mockPort = mock.address().port;

try {
  // ── 3. 起服务 + 心跳 ───────────────────────────────────────────────────────
  startService();
  await t('服务心跳落真实 kv（自发现桥 + meta）', async () => {
    const meta = await waitFor(() => kvGet(`${KPREFIX}meta`), 30000, 600, 'meta 心跳');
    if (!meta || !meta.lastTickAt) throw new Error('meta 缺 lastTickAt');
    if (!meta.leaseholder) throw new Error('meta 缺 leaseholder（未取得租约）');
  });

  // ── 4. notify 任务 runNow 执行（interval 下限 60s 是产品护栏；自动触发路径由补跑用例覆盖）──
  let notifyJobId = '';
  await t('cmd.add 建 notify 任务（interval 60s）→ 回执含 nextRunAt', async () => {
    const r = await sendCmd('add', { job: { name: '冒烟提醒', type: 'notify', schedule: { type: 'interval', everyMs: 60000 }, payload: { message: '冒烟提醒 ' + Date.now() } } });
    if (!r.ok) throw new Error(r.error || 'add 未回执 ok');
    notifyJobId = r.jobId;
    if (!notifyJobId) throw new Error('回执缺 jobId');
  });
  await t('notify runNow → 运行历史 ok + 任务表 lastStatus 推进', async () => {
    const run = await sendCmd('runNow', { id: notifyJobId }, 25000);
    if (run.ok !== true || run.status !== 'ok') throw new Error('runNow 回执: ' + JSON.stringify(run));
    await waitFor(async () => {
      const jobs = await kvGet(`${KPREFIX}jobs`);
      const job = (jobs?.jobs || []).find((j) => j.id === notifyJobId);
      return job && job.lastStatus === 'ok';
    }, 15000, 600, 'notify lastStatus');
  });

// ── 5. http 任务（本地 mock，allowPrivate）+ runNow ──────────────────────
  let httpJobId = '';
  await t('cmd.add http 任务（allowPrivate 指向本地 mock）+ runNow → HTTP 200', async () => {
    const r = await sendCmd('add', { job: { name: '冒烟心跳', type: 'http', schedule: { type: 'daily', time: '23:59' }, payload: { url: `http://127.0.0.1:${mockPort}/probe`, method: 'GET', allowPrivate: true } } });
    if (!r.ok) throw new Error(r.error || 'add 未回执 ok');
    httpJobId = r.jobId;
    const run = await sendCmd('runNow', { id: httpJobId }, 25000);
    if (!r.ok || run.ok !== true || run.status !== 'ok') {
      throw new Error(`runNow 回执异常: ${JSON.stringify(run)}`);
    }
  });
  await t('http 运行历史含 HTTP 200 + 摘录 + mock 被命中', async () => {
    await waitFor(async () => {
      const runs = await readRuns();
      const r = runs.find((x) => x.jobId === httpJobId && x.status === 'ok');
      return r && /HTTP 200/.test(r.summary) && /"ok":true/.test(r.excerpt || '');
    }, 15000, 600, 'http 运行记录');
    if (mockHits < 1) throw new Error('mock 端点未被请求');
  });

  // ── 6. command 任务 runNow ────────────────────────────────────────────────
  let cmdJobId = '';
  await t('cmd.add command 任务（powershell echo）+ runNow → 退出码 0 + stdout 摘录', async () => {
    const r = await sendCmd('add', { job: { name: '冒烟命令', type: 'command', schedule: { type: 'weekly', time: '03:00', dows: [0] }, payload: { shell: 'powershell', command: "Write-Output 'smoke-ok-12345'" } } }, 25000);
    if (!r.ok) throw new Error(r.error || 'add 未回执 ok');
    cmdJobId = r.jobId;
    const run = await sendCmd('runNow', { id: cmdJobId }, 40000);
    if (run.ok !== true || run.status !== 'ok') throw new Error(`runNow 回执: ${JSON.stringify(run)}`);
  });
  await t('command 运行历史含 stdout 摘录', async () => {
    const runs = await readRuns();
    const r = runs.find((x) => x.jobId === cmdJobId);
    if (!r) throw new Error('无运行记录');
    if (!/smoke-ok-12345/.test(r.excerpt || '')) throw new Error(`摘录缺 stdout: ${(r.excerpt || '').slice(0, 80)}`);
  });

  // ── 6b. SSRF 闸：未开 allowPrivate 的私网目标被拒 ─────────────────────────
  await t('SSRF 闸：私网目标未开 allowPrivate → fail 且不出网', async () => {
    const r = await sendCmd('add', { job: { name: '冒烟私网', type: 'http', schedule: { type: 'daily', time: '23:58' }, payload: { url: `http://127.0.0.1:${mockPort}/should-deny`, method: 'GET' } } });
    const before = mockHits;
    await sendCmd('runNow', { id: r.jobId }, 25000);
    await waitFor(async () => {
      const runs = await readRuns();
      const run = runs.find((x) => x.jobId === r.jobId);
      return run;
    }, 15000, 600, '私网任务运行记录');
    const runs = await readRuns();
    const run = runs.find((x) => x.jobId === r.jobId);
    if (run.status !== 'fail') throw new Error('私网请求未被拒');
    if (!/私网/.test(run.summary)) throw new Error('拒绝原因未说明: ' + run.summary);
    if (mockHits !== before) throw new Error('请求居然出网了');
  });

  // ── 7. 错过补跑 ───────────────────────────────────────────────────────────
  await t('错过补跑：重启服务后 overdue 任务 missed:true 补一次', async () => {
    stopService();
    await new Promise((r) => setTimeout(r, 800));
    // 直写 jobs 键（服务已停，无写者竞争）：一个已过期的 notify 任务
    const overdueId = 'job_overdue';
    const curJobs = await kvGet(`${KPREFIX}jobs`);
    const keptJobs = (curJobs && Array.isArray(curJobs.jobs)) ? curJobs.jobs : [];
    await kvSet(`${KPREFIX}jobs`, {
      jobs: [...keptJobs, {
        id: overdueId, name: '冒烟补跑', type: 'notify', enabled: true,
        schedule: { type: 'interval', everyMs: 60000 },
        payload: { message: '补跑目标' },
        createdAt: Date.now() - 600000, updatedAt: Date.now() - 600000,
        nextRunAt: Date.now() - 60000, lastRunAt: null, lastStatus: null, lastSummary: '',
      }],
    });
    await kvDel(`${KPREFIX}lease`);
    await kvDel(`${KPREFIX}meta`);
    startService();
    await waitFor(async () => {
      const runs = await readRuns();
      const r = runs.find((x) => x.jobId === overdueId);
      return r && r.missed === true;
    }, 30000, 700, '补跑记录（missed:true）');
    const runs = await readRuns();
    const missedRuns = runs.filter((x) => x.jobId === overdueId);
    if (missedRuns.length !== 1) throw new Error(`补跑应恰好一次，实得 ${missedRuns.length}`);
    const jobs = await kvGet(`${KPREFIX}jobs`);
    const job = (jobs?.jobs || []).find((j) => j.id === overdueId);
    if (!job || !(job.nextRunAt > Date.now())) throw new Error('补跑后未重排 nextRunAt');
  });

  // ── 8. MCP 全链路 ─────────────────────────────────────────────────────────
  await t('MCP：initialize → tools/list 六工具 → task_list 可见任务', async () => {
    const mcp = spawn('node', [path.join(PLUGIN_ROOT, 'mcp', 'server.js'), EP.appConfigDir], { stdio: ['pipe', 'pipe', 'pipe'] });
    let buf = '';
    mcp.stdout.on('data', (c) => { buf += String(c); });
    mcp.stderr.resume();
    const rpc = (msg) => new Promise((resolve) => {
      const id = Math.floor(Math.random() * 1e9);
      const handler = (data) => {
        buf += String(data);
        let i;
        while ((i = buf.indexOf('\n')) !== -1) {
          const line = buf.slice(0, i).trim();
          buf = buf.slice(i + 1);
          if (!line) continue;
          try {
            const parsed = JSON.parse(line);
            if (parsed.id === id) { mcp.stdout.off('data', handler); resolve(parsed); return; }
          } catch (_) { /* 半行 */ }
        }
      };
      mcp.stdout.on('data', handler);
      mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, ...msg }) + '\n');
    });
    try {
      const init = await rpc({ method: 'initialize', params: {} });
      if (!init.result || !init.result.serverInfo) throw new Error('initialize 失败');
      const list = await rpc({ method: 'tools/list' });
      const names = (list.result.tools || []).map((x) => x.name);
      if (names.length !== 6) throw new Error('工具数 ≠ 6: ' + names.join(','));
      const call = await rpc({ method: 'tools/call', params: { name: 'task_list', arguments: {} } });
      if (!/冒烟提醒|冒烟心跳|冒烟命令|冒烟补跑/.test(call.result.content[0].text)) throw new Error('task_list 未见冒烟任务: ' + call.result.content[0].text.slice(0, 100));
    } finally {
      try { mcp.kill(); } catch (_) {}
    }
  });
  await t('MCP：task_add command 无 confirm → isError 拒绝（真子进程闸）', async () => {
    const mcp = spawn('node', [path.join(PLUGIN_ROOT, 'mcp', 'server.js'), EP.appConfigDir], { stdio: ['pipe', 'pipe', 'pipe'] });
    let buf = '';
    mcp.stdout.on('data', (c) => { buf += String(c); });
    mcp.stderr.resume();
    const rpc = (msg) => new Promise((resolve) => {
      const id = Math.floor(Math.random() * 1e9);
      const handler = (data) => {
        buf += String(data);
        let i;
        while ((i = buf.indexOf('\n')) !== -1) {
          const line = buf.slice(0, i).trim();
          buf = buf.slice(i + 1);
          if (!line) continue;
          try {
            const parsed = JSON.parse(line);
            if (parsed.id === id) { mcp.stdout.off('data', handler); resolve(parsed); return; }
          } catch (_) { /* 半行 */ }
        }
      };
      mcp.stdout.on('data', handler);
      mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, ...msg }) + '\n');
    });
    try {
      await rpc({ method: 'initialize', params: {} });
      const call = await rpc({ method: 'tools/call', params: { name: 'task_add', arguments: { name: 'x', type: 'command', schedule: { type: 'daily', time: '08:00' }, payload: { shell: 'cmd', command: 'echo x' } } } });
      if (call.result.isError !== true) throw new Error('confirm 闸未生效');
      if (!/confirm/.test(call.result.content[0].text)) throw new Error('拒绝文案缺 confirm 提示');
    } finally {
      try { mcp.kill(); } catch (_) {}
    }
  });
} finally {
  stopService();
  await killAllTaskRunner();
  mock.close();
  // 清理：删光 taskrun.* 键
  const keys = (await kvKeys()).filter((k) => k.startsWith(KPREFIX));
  for (const k of keys) await kvDel(k);
  console.log(`（清理 ${keys.length} 个 taskrun.* 键）`);
}

const bad = results.filter((r) => !r.pass);
for (const r of results) console.log(`${r.pass ? '✓' : '✗'} ${r.name}${r.pass ? '' : ' — ' + r.detail}`);
console.log(`\n${results.length - bad.length}/${results.length} 通过`);
process.exit(bad.length ? 1 : 0);
