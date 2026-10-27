/**
 * 真实环境全链路冒烟（node test/smoke-real.mjs）
 *
 * 前提：本机 Polaris 正在运行（anchor.json → config.json web.port 可达）。
 * 流程：
 *   1. 清理残留 netmon.* 键；写 settings（tickSec=5 加速冒烟）
 *   2. 手动拉起真实服务（node service/net.js 19873 %APPDATA%/Polaris）
 *      —— 服务走 anchor→config 自发现真实桥
 *   3. 等快照落真实 kv：结构完整（online/round/targets/recent/counts）
 *   4. 小时桶已写（服务写前持久，首轮 tick 后即有）
 *   5. meta 心跳：网关已发现（win/mac/linux 至少尝试）
 *   6. cmd.targets 真闭环：add example.com:80 → result ok → netmon.targets 含新目标
 *   7. cmd.speed 守卫：无 allowPrivate 指向 127.0.0.1 → result error 拒绝；
 *      本地起 2MB HTTP 服务 + allowPrivate → 测速真闭环 mbps>0
 *   8. 拉起真实 mcp/server.js → tools/list 5 个 → net_status 读回真快照
 *   9. 清理：杀服务/MCP/本地测速服务 + 删全部 netmon.* 键
 */
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

const PLUGIN_ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

// ── 真实桥端点（与服务同规则：anchor → config）────────────────────────────
function loadEndpoint() {
  const anchorPath = path.join(process.env.APPDATA || '', 'Polaris', 'anchor.json');
  const anchor = JSON.parse(fs.readFileSync(anchorPath, 'utf8'));
  const cfg = JSON.parse(fs.readFileSync(path.join(anchor.dataRoot, 'config.json'), 'utf8'));
  return { host: '127.0.0.1', base: cfg.web.port, token: cfg.web.token || '', appConfigDir: path.join(process.env.APPDATA || '', 'Polaris') };
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
      res.on('end', () => {
        try { resolve(JSON.parse(b)); } catch (e) { reject(new Error(`bridge 非 JSON: ${b.slice(0, 120)}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('bridge timeout')));
    req.write(data);
    req.end();
  });
}
async function kvSet(k, v) { const r = await bridgeDispatch('cap.kv', { action: 'set', key: k, value: v }); if (!r.ok) throw new Error('kv set: ' + r.error); }
async function kvGet(k) { const r = await bridgeDispatch('cap.kv', { action: 'get', key: k }); if (!r.ok) throw new Error('kv get: ' + r.error); return r.result?.value ?? null; }
async function kvKeys() { const r = await bridgeDispatch('cap.kv', { action: 'list' }); if (!r.ok) throw new Error('kv list: ' + r.error); return r.result?.keys ?? []; }
async function kvDel(k) { return bridgeDispatch('cap.kv', { action: 'delete', key: k }); }

async function waitFor(fn, ms, step = 500, label = '') {
  const t0 = Date.now();
  let lastErr = '';
  while (Date.now() - t0 < ms) {
    try {
      const v = await fn();
      if (v) return v;
    } catch (e) { lastErr = e.message; }
    await new Promise((r) => setTimeout(r, step));
  }
  throw new Error(`冒烟超时：${label || '条件'}${lastErr ? `（最后错误：${lastErr}）` : ''}`);
}

const results = [];
const record = (name, pass, detail = '') => { results.push({ name, pass }); console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`); };
const cleanupFns = [];

async function main() {
  // 0. 清残留
  const pre = (await kvKeys()).filter((k) => k.startsWith('netmon.'));
  for (const k of pre) await kvDel(k).catch(() => {});

  // 1. settings：tickSec=5 加速
  await kvSet('netmon.settings', { tickSec: 5, timeoutMs: 2500, latencyMs: 400, sustainRounds: 3, retentionHours: 720, speedMb: 2, speedUrl: '', paused: false });

  // 2. 起本地测速源（2MB 随机字节）
  const payload = crypto.randomBytes(1024 * 1024);
  const speedSrv = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': String(payload.length * 2) });
    res.end(Buffer.concat([payload, payload]));
  });
  await new Promise((r) => speedSrv.listen(0, '127.0.0.1', r));
  const speedPort = speedSrv.address().port;
  cleanupFns.push(() => new Promise((r) => speedSrv.close(r)));

  // 3. 拉起真实服务
  const svc = spawn('node', [path.join(PLUGIN_ROOT, 'service', 'net.js'), '19873', EP.appConfigDir], { stdio: ['ignore', 'pipe', 'pipe'] });
  cleanupFns.push(() => { try { svc.kill(); } catch (_) { /* ignore */ } });
  let svcLog = '';
  svc.stderr.on('data', (c) => { svcLog += String(c); });
  await waitFor(() => new Promise((resolve) => {
    const req = http.get({ hostname: '127.0.0.1', port: 19873, path: '/__health', timeout: 1000 }, (res) => { res.resume(); resolve(res.statusCode === 200); });
    req.on('error', () => resolve(false));
  }), 15000, 500, '服务健康端点').catch((e) => { throw new Error(`${e.message}\n服务日志：${svcLog.slice(-800)}`); });

  // 4. 快照结构完整
  const snap = await waitFor(async () => {
    const s = await kvGet('netmon.snapshot');
    if (!s || !s.round || !Array.isArray(s.targets) || s.targets.length < 5) return null;
    if (!Object.keys(s.round).length || !s.counts || s.counts.rounds < 1) return null;
    return s;
  }, 30000, 800, '快照结构完整');
  record('快照结构完整', true, `${snap.targets.length} 目标 / ${snap.counts.rounds} 轮 / online=${snap.online}`);
  record('全部默认目标都有本轮结果', snap.targets.every((t) => snap.round[t.id] && typeof snap.round[t.id].ok === 'boolean'),
    snap.targets.map((t) => `${t.label}:${snap.round[t.id] ? (snap.round[t.id].ok ? `${Math.round(snap.round[t.id].ms)}ms` : snap.round[t.id].err) : '?'}`).join(' '));
  record('recent 环形窗口已开始积累', Object.values(snap.recent).some((arr) => arr.length >= 1));

  // 5. 小时桶（写前持久：首轮 tick 后即有当前小时桶）
  const hourKey = (() => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `netmon.h.${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}`; })();
  const bucket = await waitFor(async () => {
    const b = await kvGet(hourKey);
    return b && b.byTarget && Object.keys(b.byTarget).length ? b : null;
  }, 20000, 800, '当前小时桶');
  const bucketTargetCount = Object.keys(bucket.byTarget).length;
  const bucketHasRecs = Object.values(bucket.byTarget).some((recs) => Array.isArray(recs) && recs.length >= 1);
  record('小时桶写前持久', bucketHasRecs, `${hourKey} 覆盖 ${bucketTargetCount} 目标`);

  // 6. meta 心跳（网关发现——Windows 上必成；其他平台尽力）
  const meta = await waitFor(async () => {
    const m = await kvGet('netmon.meta');
    return m && m.lastTickAt ? m : null;
  }, 20000, 800, 'meta 心跳');
  if (process.platform === 'win32') {
    record('网关自动发现（win）', typeof meta.gateway === 'string' && /^\d+\.\d+\.\d+\.\d+$/.test(meta.gateway || ''), meta.gateway);
  } else {
    record('meta 心跳正常', true, `gateway=${meta.gateway || '(未发现)'}`);
  }

  // 7. cmd.targets 真闭环：add
  const n1 = 't' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  await kvSet(`netmon.cmd.targets.${n1}`, { action: 'add', target: { label: '冒烟站点', host: 'example.com', port: 80, kind: 'normal' }, at: Date.now() });
  const addRes = await waitFor(async () => {
    const r = await kvGet(`netmon.result.${n1}`);
    if (!r) return null;
    await kvDel(`netmon.result.${n1}`).catch(() => {});
    return r;
  }, 20000, 800, 'targets add 结果');
  const targetsNow = ((addRes.payload || {}).targets) || [];
  record('cmd.targets add 闭环', addRes.ok === true && targetsNow.some((t) => t.host === 'example.com'),
    `共 ${targetsNow.length} 目标`);
  // 坏命令被拒
  const n2 = 't' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  await kvSet(`netmon.cmd.targets.${n2}`, { action: 'add', target: { host: 'bad host!', port: 80 }, at: Date.now() });
  const badRes = await waitFor(async () => {
    const r = await kvGet(`netmon.result.${n2}`);
    if (!r) return null;
    await kvDel(`netmon.result.${n2}`).catch(() => {});
    return r;
  }, 20000, 800, 'targets 坏命令结果');
  record('cmd.targets 坏载荷被拒', badRes.ok === false && /host 非法/.test(badRes.error || ''), badRes.error);

  // 8. 测速守卫：无 allowPrivate → 拒绝
  const s1 = 's' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  await kvSet(`netmon.cmd.speed.${s1}`, { confirm: true, mb: 1, url: `http://127.0.0.1:${speedPort}/file`, allowPrivate: false, at: Date.now() });
  const guardRes = await waitFor(async () => {
    const r = await kvGet(`netmon.result.${s1}`);
    if (!r) return null;
    await kvDel(`netmon.result.${s1}`).catch(() => {});
    return r;
  }, 20000, 800, '测速守卫结果');
  record('测速 SSRF 守卫生效', guardRes.ok === false && /拒绝本机\/私网/.test(guardRes.error || ''), guardRes.error);

  // 9. 测速真闭环（allowPrivate）
  const s2 = 's' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  await kvSet(`netmon.cmd.speed.${s2}`, { confirm: true, mb: 2, url: `http://127.0.0.1:${speedPort}/file`, allowPrivate: true, at: Date.now() });
  const speedRes = await waitFor(async () => {
    const r = await kvGet(`netmon.result.${s2}`);
    if (!r) return null;
    await kvDel(`netmon.result.${s2}`).catch(() => {});
    return r;
  }, 40000, 800, '测速结果');
  record('测速真闭环（本地 2MB）', speedRes.ok === true && Number(speedRes.payload?.mbps) > 0,
    speedRes.ok ? `${speedRes.payload.mbps} Mbps / ${(speedRes.payload.bytes / 1048576).toFixed(1)}MB / 首字节 ${Math.round(speedRes.payload.latencyMs)}ms` : speedRes.error);
  const speedRec = await waitFor(async () => {
    const keys = (await kvKeys()).filter((k) => k.startsWith('netmon.speed.'));
    return keys.length ? keys : null;
  }, 10000, 500, '测速记录落库');
  record('测速记录落库 netmon.speed.*', Array.isArray(speedRec), `${speedRec.length} 条`);

  // 10. MCP：tools/list + net_status
  const mcp = spawn('node', [path.join(PLUGIN_ROOT, 'mcp', 'server.js'), EP.appConfigDir], { stdio: ['pipe', 'pipe', 'pipe'] });
  cleanupFns.push(() => { try { mcp.kill(); } catch (_) { /* ignore */ } });
  let mcpOut = '';
  mcp.stdout.on('data', (c) => { mcpOut += String(c); });
  const sendRpc = (obj) => new Promise((resolve) => {
    const before = mcpOut.length;
    mcp.stdin.write(JSON.stringify(obj) + '\n');
    const t0 = Date.now();
    const timer = setInterval(() => {
      const chunk = mcpOut.slice(before);
      const nl = chunk.indexOf('\n');
      if (nl >= 0) { clearInterval(timer); resolve(JSON.parse(chunk.slice(0, nl))); }
      else if (Date.now() - t0 > 20000) { clearInterval(timer); resolve(null); }
    }, 100);
  });
  await sendRpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
  const listRes = await sendRpc({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
  const toolNames = (listRes?.result?.tools || []).map((t) => t.name);
  record('MCP tools/list 5 个 net_*', ['net_status', 'net_history', 'net_events', 'net_speedtest', 'net_targets'].every((n) => toolNames.includes(n)), toolNames.join(','));
  const statusRes = await sendRpc({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'net_status', arguments: {} } });
  const statusText = statusRes?.result?.content?.[0]?.text || '';
  record('MCP net_status 读回真快照', /网络(在线|离线)/.test(statusText) && /快照龄期/.test(statusText), statusText.split('\n')[0]);
  const historyRes = await sendRpc({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'net_history', arguments: { hours: 1 } } });
  const historyText = historyRes?.result?.content?.[0]?.text || '';
  record('MCP net_history 读回小时桶聚合', /最近 1 小时/.test(historyText) && (/(均值|暂无数据)/.test(historyText)), historyText.split('\n')[0]);

  // 清理在 finally 中执行
}

const cleanup = async () => {
  for (const fn of cleanupFns.reverse()) { try { await fn(); } catch (_) { /* ignore */ } }
  try {
    const keys = (await kvKeys()).filter((k) => k.startsWith('netmon.'));
    for (const k of keys) await kvDel(k).catch(() => {});
    console.log(`\n已清理 ${keys.length} 个 netmon.* 键`);
  } catch (_) { /* 桥可能已不可达 */ }
};

main().then(async () => {
  await cleanup();
  const failed = results.filter((r) => !r.pass);
  console.log(`\n冒烟共 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length}`);
  process.exit(failed.length ? 1 : 0);
}).catch(async (e) => {
  console.error('✗ 冒烟异常：', e.message);
  await cleanup();
  const failed = results.filter((r) => !r.pass);
  console.log(`\n冒烟共 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length + 1}`);
  process.exit(1);
});
