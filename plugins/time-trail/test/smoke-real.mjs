/**
 * 真实环境全链路冒烟（node test/smoke-real.mjs）
 *
 * 前提：本机 Polaris 正在运行（anchor.json → config.json web.port 可达）。
 * 流程：
 *   1. 清理残留 timetrail.* 键；写 settings（captureTitles=true 加速断言）
 *   2. 拉起真实服务（node service/trail.js 19876 %APPDATA%/Polaris），
 *      经 TIMETRAIL_COLLECTOR_CMD 注入脚本化采集器（时钟/状态可控）
 *   3. /__health 200；快照落真实 kv 且 collector=alive
 *   4. 等 16s 归集 → cmd flush 真闭环 → 天账本：code/chrome/idle/switches/titles
 *   5. cmd purge_app 真闭环：chrome 从天账本消失，code 保留
 *   6. 真实 mcp/server.js：tools/list 5 个 → timetrail_query/timetrail_today 读回
 *      → timetrail_set_categories 写 cats → timetrail_control pause/resume 写 settings
 *   7. 清理：杀服务/MCP + 删全部 timetrail.* 键
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  // 0. 清残留
  const pre = (await kvKeys()).filter((k) => k.startsWith('timetrail.'));
  for (const k of pre) await kvDel(k).catch(() => {});

  // 1. settings（captureTitles=true 以断言标题链路）
  await kvSet('timetrail.settings', { tickSec: 2, idleSec: 180, retentionDays: 90, captureTitles: true, paused: false });

  // 2. 拉服务（假采集器注入）
  const SERVICE_PORT = 19876;
  const fakePath = path.join(PLUGIN_ROOT, 'test', 'fake-collector.mjs');
  const svc = spawn(process.execPath, [path.join(PLUGIN_ROOT, 'service', 'trail.js'), String(SERVICE_PORT), EP.appConfigDir], {
    env: { ...process.env, TIMETRAIL_COLLECTOR_CMD: `node "${fakePath}"` },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let svcErr = '';
  svc.stderr.on('data', (c) => { svcErr = (svcErr + c).slice(-600); });
  cleanupFns.push(() => { try { svc.kill(); } catch (_) { /* noop */ } });

  // 3. 健康检查
  const health = await waitFor(async () => new Promise((resolve) => {
    const req = http.get({ hostname: '127.0.0.1', port: SERVICE_PORT, path: '/__health', timeout: 1500 }, (res) => {
      let b = ''; res.on('data', (c) => { b += c; });
      res.on('end', () => { try { resolve(JSON.parse(b)); } catch (_) { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  }), 15000, 400, 'service /__health');
  record('服务健康检查 200', !!health && health.status === 'ok', JSON.stringify(health));

  // 4. 快照落真实 kv 且 collector=alive
  const snap = await waitFor(async () => {
    const s = await kvGet('timetrail.snapshot').catch(() => null);
    return s && s.collector === 'alive' ? s : null;
  }, 20000, 500, '快照 collector=alive');
  record('快照落 kv 且采集器存活', !!snap, snap ? `tick=${snap.tickSec}s today.active=${snap.today?.activeSec}s` : svcErr);
  record('设置已应用（tickSec=2）', snap && snap.tickSec === 2);

  // 5. 等 16s 归集 → cmd flush 真闭环
  await sleep(16000);
  const nonce = `smoke${Date.now()}`;
  await kvSet(`timetrail.cmd.${nonce}`, { action: 'flush', at: Date.now() });
  const flushResult = await waitFor(async () => {
    const r = await kvGet(`timetrail.result.${nonce}`).catch(() => null);
    return r || null;
  }, 20000, 500, 'cmd flush result');
  record('cmd flush 闭环（result ok）', !!flushResult && flushResult.ok === true, JSON.stringify(flushResult || {}));

  const todayKey = (() => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  })();
  const day = await kvGet(`timetrail.day.${todayKey}`);
  record('天账本存在且 code≈6s', !!day && (day.apps?.code || 0) >= 4 && (day.apps?.code || 0) <= 9, day ? `code=${day.apps?.code}s` : '无天账本');
  record('chrome≈4s 已归集', !!day && (day.apps?.chrome || 0) >= 2 && (day.apps?.chrome || 0) <= 7, day ? `chrome=${day.apps?.chrome}s` : '');
  record('空闲入 idle 桶', !!day && (day.idleSec || 0) >= 2, day ? `idle=${day.idleSec}s` : '');
  record('应用切换计数=1', !!day && day.switches === 1, day ? `switches=${day.switches}` : '');
  record('标题链路（captureTitles=true）', !!day && !!day.titles?.code && (day.titles.code['Polaris - VS Code'] || 0) >= 4, day ? JSON.stringify(Object.keys(day.titles?.code || {})) : '');
  record('小时桶有值', !!day && Object.keys(day.hours || {}).length >= 1, day ? `hours=${Object.keys(day.hours || {}).join(',')}` : '');

  // 6. 快照 current 指向最后状态 chrome
  const snap2 = await kvGet('timetrail.snapshot');
  record('快照 current=chrome', snap2?.current?.app === 'chrome', snap2?.current ? JSON.stringify(snap2.current) : '无 current');

  // 7. purge_app 闭环
  const nonce2 = `smokep${Date.now()}`;
  await kvSet(`timetrail.cmd.${nonce2}`, { action: 'purge_app', app: 'chrome', at: Date.now() });
  await waitFor(async () => {
    const r = await kvGet(`timetrail.result.${nonce2}`).catch(() => null);
    return r || null;
  }, 20000, 500, 'purge_app result');
  const dayAfter = await kvGet(`timetrail.day.${todayKey}`);
  record('purge_app：chrome 已从历史移除', !!dayAfter && dayAfter.apps?.chrome === undefined, dayAfter ? `apps=${JSON.stringify(dayAfter.apps)}` : '');
  record('purge_app：code 保留', !!dayAfter && (dayAfter.apps?.code || 0) >= 4);

  // 8. 真实 MCP
  const mcp = spawn(process.execPath, [path.join(PLUGIN_ROOT, 'mcp', 'server.js'), EP.appConfigDir], { stdio: ['pipe', 'pipe', 'pipe'] });
  cleanupFns.push(() => { try { mcp.kill(); } catch (_) { /* noop */ } });
  let mcpBuf = '';
  const pending = new Map();
  mcp.stdout.setEncoding('utf8');
  mcp.stdout.on('data', (c) => {
    mcpBuf += c;
    let i;
    while ((i = mcpBuf.indexOf('\n')) !== -1) {
      const line = mcpBuf.slice(0, i).trim();
      mcpBuf = mcpBuf.slice(i + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        const p = pending.get(msg.id);
        if (p) { pending.delete(msg.id); p(msg); }
      } catch (_) { /* 忽略 */ }
    }
  });
  let mcpErr = '';
  mcp.stderr.on('data', (c) => { mcpErr = (mcpErr + c).slice(-300); });
  const rpc = (method, params) => new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1e9);
    pending.set(id, resolve);
    mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error(`rpc 超时: ${method}`)); } }, 20000);
  });

  const init = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {} });
  record('MCP initialize', init?.result?.serverInfo?.name === 'time-trail', init?.result?.serverInfo?.name);
  const list = await rpc('tools/list', {});
  const toolNames = (list?.result?.tools || []).map((t) => t.name);
  record('MCP tools/list 5 个工具', toolNames.length === 5, toolNames.join(','));
  const q = await rpc('tools/call', { name: 'timetrail_query', arguments: { days: 1 } });
  record('timetrail_query 读回真数据', q?.result?.content?.[0]?.text?.includes('刻漏查询') === true, (q?.result?.content?.[0]?.text || mcpErr).slice(0, 80));
  const today = await rpc('tools/call', { name: 'timetrail_today', arguments: {} });
  const todayText = today?.result?.content?.[0]?.text || '';
  record('timetrail_today 含 Top 应用', todayText.includes('Top 应用'), todayText.slice(0, 80));

  const setCats = await rpc('tools/call', { name: 'timetrail_set_categories', arguments: { cats: { 'smoke-fake-app': 'play', 'bad-app': 'nope' } } });
  record('set_categories 接受合法拒绝非法', setCats?.result?.isError !== true, (setCats?.result?.content?.[0]?.text || '').slice(0, 80));
  const cats = await kvGet('timetrail.cats');
  record('cats 已写入 kv（smoke-fake-app→play）', !!cats && (cats.rules || []).some((r) => r.match === 'smoke-fake-app' && r.cat === 'play'), cats ? JSON.stringify(cats.rules) : '无');
  record('cats 拒绝未知分类', !!cats && !(cats.rules || []).some((r) => r.match === 'bad-app'));

  const ctrl = await rpc('tools/call', { name: 'timetrail_control', arguments: { action: 'pause' } });
  record('timetrail_control pause 写 settings', ctrl?.result?.isError !== true, (ctrl?.result?.content?.[0]?.text || '').slice(0, 60));
  const settingsAfter = await kvGet('timetrail.settings');
  record('settings.paused=true 已落库', settingsAfter?.paused === true);
  await rpc('tools/call', { name: 'timetrail_control', arguments: { action: 'resume' } });
  const settingsBack = await kvGet('timetrail.settings');
  record('resume 后 paused=false', settingsBack?.paused === false);

  const apps = await rpc('tools/call', { name: 'timetrail_apps', arguments: { unknownOnly: true } });
  record('timetrail_apps 未知清单可用', apps?.result?.isError !== true, (apps?.result?.content?.[0]?.text || '').slice(0, 60));
}

main()
  .catch((e) => { record('冒烟主流程', false, e.message); })
  .finally(async () => {
    for (const fn of cleanupFns) { try { fn(); } catch (_) { /* noop */ } }
    try {
      const keys = (await kvKeys()).filter((k) => k.startsWith('timetrail.'));
      for (const k of keys) await kvDel(k).catch(() => {});
      console.log(`\n清理：删除 ${keys.length} 个 timetrail.* 键`);
    } catch (_) { /* noop */ }
    const failed = results.filter((r) => !r.pass);
    console.log(`\n${results.length - failed.length}/${results.length} 通过`);
    process.exit(failed.length ? 1 : 0);
  });
