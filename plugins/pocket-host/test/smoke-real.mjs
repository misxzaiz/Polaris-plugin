/**
 * 真实环境全链路冒烟（node test/smoke-real.mjs）
 *
 * 前提：本机 Polaris 正在运行（anchor.json → config.json web.port 可达）。
 * 流程：
 *   1. 拉起一个安全的受害进程（node 定时器空转，无端口无文件）
 *   2. 手动拉起真实服务（node service/host.js 19871 %APPDATA%/Polaris）
 *      —— 服务走 anchor→config 自发现真实桥
 *   3. 等快照落真实 kv：结构完整（cpu/mem/disks/ports/procs/history）
 *   4. 面板读路径验证：meta/keys 等价 loadPanelData
 *   5. kill 真闭环：cmd.kill(ping 受害进程 pid, confirm) → 服务执行 →
 *      result ok → 受害进程确认死亡
 *   6. kill 守卫验证（全部安全目标）：PID 4（System）、服务自身 pid → 拒绝
 *   7. 拉起真实 mcp/server.js → tools/list 6 个 → host_status 读回真快照
 *   8. 清理：杀服务/MCP/受害进程（若仍活着）+ 删全部 hostmon.* 键
 */
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

const APP_ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

// ── 真实桥端点（与服务同规则：anchor → config）────────────────────────────
function loadEndpoint() {
  const anchorPath = path.join(process.env.APPDATA || '', 'Polaris', 'anchor.json');
  const anchor = JSON.parse(fs.readFileSync(anchorPath, 'utf8'));
  const cfg = JSON.parse(fs.readFileSync(path.join(anchor.dataRoot, 'config.json'), 'utf8'));
  return { host: '127.0.0.1', base: cfg.web.port, token: cfg.web.token || '' };
}
const EP = loadEndpoint();

function md5(s) { return crypto.createHash('md5').update(String(s)).digest('hex'); }

function bridgeDispatch(target, payload, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ req: { target, payload } });
    const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) };
    if (EP.token) headers.Authorization = `Bearer ${md5(EP.token)}`;
    const req = http.request({ hostname: EP.host, port: EP.base, path: '/api/router-dispatch', method: 'POST', headers, timeout: timeoutMs }, (res) => {
      let b = '';
      res.on('data', (c) => { b += c; });
      res.on('end', () => resolve(JSON.parse(b)));
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('bridge timeout')));
    req.write(data);
    req.end();
  });
}
async function kvSet(k, v) { const r = await bridgeDispatch('cap.kv', { action: 'set', key: k, value: v }); if (!r.ok) throw new Error('kv set: ' + r.error); }
async function kvGet(k) { const r = await bridgeDispatch('cap.kv', { action: 'get', key: k }); if (!r.ok) throw new Error('kv get: ' + r.error); return r.result?.value ?? null; }
async function kvKeys() { const r = await bridgeDispatch('cap.kv', { action: 'list' }); return r.result?.keys ?? []; }
async function kvDel(k) { return bridgeDispatch('cap.kv', { action: 'delete', key: k }); }

async function waitFor(fn, ms, step = 500, label = '') {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, step));
  }
  throw new Error(`冒烟超时：${label || fn.toString().slice(0, 60)}`);
}

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (_) { return false; } };

const results = [];
const record = (name, pass, detail = '') => { results.push({ name, pass }); console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`); };

// ── 1. 受害进程（安全：纯定时器空转）────────────────────────────────────────
const victim = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
console.log(`[smoke] 受害进程 PID=${victim.pid}；真实桥 ${EP.host}:${EP.base}`);

// ── 2. 真实服务（无 env 注入，走 anchor→config 自发现）───────────────────────
const appdata = process.env.APPDATA || '';
const svc = spawn(process.execPath, [path.join(APP_ROOT, 'service/host.js'), '19871', path.join(appdata, 'Polaris')], {
  cwd: APP_ROOT,
  stdio: ['ignore', 'pipe', 'pipe'],
});
const svcErr = [];
svc.stderr.on('data', (c) => svcErr.push(String(c)));

let mcp = null;
try {
  // 3. 快照落真实 kv 且结构完整
  const snap = await waitFor(async () => {
    const s = await kvGet('hostmon.snapshot');
    return s && s.at && s.host ? s : null;
  }, 25000, 500, '首份快照');
  record('服务自发现真实桥并写入快照', true, `host=${snap.host.name} cpu=${snap.cpuPct}% mem=${snap.memPct}%`);
  record('快照结构完整（cpu/mem/disks/ports/procs/history）',
    Number.isFinite(snap.cpuPct) && Number.isFinite(snap.memPct)
    && Array.isArray(snap.disks) && snap.disks.length > 0
    && Array.isArray(snap.ports.list) && snap.ports.list.length > 0
    && Array.isArray(snap.procs.list) && snap.procs.list.length > 0
    && Array.isArray(snap.history),
    `disks=${snap.disks.map((d) => d.mount).join(',')} via=${snap.disksVia} 端口数=${snap.ports.count} 进程数=${snap.procs.count}`);

  // 端口表里应能找到 Polaris 桥端口且归属名字含 polaris（不区分大小写）
  const bridgeRow = snap.ports.list.find((p) => p.port === EP.base);
  record('端口表解析出桥端口归属', !!bridgeRow && /polaris/i.test(bridgeRow.name || ''),
    bridgeRow ? `:${bridgeRow.port} ← ${bridgeRow.name} (PID ${bridgeRow.pid})` : '未找到');

  // 历史环开始积累（≈5s 一个样本）
  await waitFor(async () => {
    const s = await kvGet('hostmon.snapshot');
    return s && s.history && s.history.length >= 2;
  }, 30000, 1000, '历史样本积累');

  // 4. 面板读路径（等价 loadPanelData：snapshot+meta+keys）
  const meta = await kvGet('hostmon.meta');
  const keys = await kvKeys();
  const myKeys = keys.filter((k) => k.startsWith('hostmon.'));
  record('面板数据面完整（snapshot/meta/键空间）', !!meta && meta.lastTickAt > 0 && myKeys.length >= 2,
    `meta.pid=${meta.pid} bridge=${meta.bridge} hostmon.* 键 ${myKeys.length} 个`);

  // 5. kill 真闭环：受害进程
  await kvSet('hostmon.cmd.kill.smokevictim', { pid: victim.pid, confirm: true, reason: '冒烟', at: Date.now() });
  const killRes = await waitFor(async () => {
    const r = await kvGet('hostmon.result.smokevictim');
    return r || null;
  }, 25000, 800, 'kill 受害进程结果');
  await kvDel('hostmon.result.smokevictim').catch(() => {});
  await new Promise((r) => setTimeout(r, 600));
  record('kill 真闭环（cmd→服务执行→result→进程死亡）',
    killRes.ok === true && killRes.results?.[0]?.ok === true && !alive(victim.pid),
    `${killRes.results?.[0]?.name || '?'} (PID ${victim.pid}) output=${(killRes.results?.[0]?.output || '').slice(0, 60)}`);

  // 6. kill 守卫：PID 4（System）与服务自身都拒绝
  const svcPid = meta.pid;
  await kvSet('hostmon.cmd.kill.smokeguard1', { pid: 4, confirm: true, at: Date.now() });
  const g1 = await waitFor(async () => (await kvGet('hostmon.result.smokeguard1')), 20000, 800, '守卫 PID4');
  await kvDel('hostmon.result.smokeguard1').catch(() => {});
  await kvSet('hostmon.cmd.kill.smokeguard2', { pid: svcPid, confirm: true, at: Date.now() });
  const g2 = await waitFor(async () => (await kvGet('hostmon.result.smokeguard2')), 20000, 800, '守卫自身');
  await kvDel('hostmon.result.smokeguard2').catch(() => {});
  record('kill 守卫：系统进程与服务自身被拒',
    g1.ok === false && /系统关键/.test(g1.results?.[0]?.error || g1.error || '')
    && g2.ok === false && /自身/.test(g2.results?.[0]?.error || g2.error || ''),
    `PID4→${(g1.results?.[0]?.error || '').slice(0, 30)}；self→${(g2.results?.[0]?.error || '').slice(0, 30)}`);

  // 7. 真实 MCP 全闭环
  mcp = spawn(process.execPath, [path.join(APP_ROOT, 'mcp/server.js'), path.join(appdata, 'Polaris')], {
    cwd: APP_ROOT, stdio: ['pipe', 'pipe', 'pipe'],
  });
  let buf = '';
  const pending = new Map();
  let nextId = 1;
  mcp.stdout.setEncoding('utf8');
  mcp.stdout.on('data', (c) => {
    buf += c;
    while (true) {
      const i = buf.indexOf('\n');
      if (i === -1) break;
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line) continue;
      const msg = JSON.parse(line);
      const p = pending.get(msg.id);
      if (p) { pending.delete(msg.id); p(msg); }
    }
  });
  const rpc = (method, params) => new Promise((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => reject(new Error('mcp rpc 超时: ' + method)), 45000);
    pending.set(id, (m) => { clearTimeout(timer); resolve(m); });
    mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
  await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } });
  mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  const lst = await rpc('tools/list', {});
  record('MCP 连接真实桥，tools/list 6 个', lst.result.tools.length === 6, lst.result.tools.map((t) => t.name).join(', '));

  const st = await rpc('tools/call', { name: 'host_status', arguments: {} });
  record('MCP host_status 读回真实快照', !st.result.isError && /CPU：/.test(st.result.content[0].text),
    st.result.content[0].text.split('\n')[1]);
  const pp = await rpc('tools/call', { name: 'host_ports', arguments: { port: EP.base } });
  record('MCP host_ports 查桥端口归属', !pp.result.isError && new RegExp(String(EP.base)).test(pp.result.content[0].text), pp.result.content[0].text.split('\n')[1] || '');
  const kd = await rpc('tools/call', { name: 'host_kill', arguments: { pid: 4 } });
  record('MCP host_kill 无 confirm 直接拒绝', kd.result.isError === true && /confirm/.test(kd.result.content[0].text), '');
  const hh = await rpc('tools/call', { name: 'host_history', arguments: {} });
  record('MCP host_history 有样本', !hh.result.isError && /CPU 均值/.test(hh.result.content[0].text), '');

  console.log('[smoke] 冒烟项全部执行完毕，开始清理…');
} catch (e) {
  record('流程', false, e.message);
  console.error('服务日志尾部：', svcErr.join('').slice(-1200));
} finally {
  if (mcp) mcp.kill();
  svc.kill();
  try { victim.kill(); } catch (_) { /* 已被服务杀掉 */ }
  await new Promise((r) => setTimeout(r, 800));
  const keys = await kvKeys();
  const mine = keys.filter((k) => k.startsWith('hostmon.'));
  await Promise.all(mine.map((k) => kvDel(k)));
  console.log(`[smoke] 已清理 ${mine.length} 个 hostmon.* 键，真实 kv 恢复原状`);
  const bad = results.filter((r) => !r.pass);
  console.log(`[smoke] 结果：${results.length - bad.length}/${results.length} 通过`);
  process.exit(bad.length ? 1 : 0);
}
