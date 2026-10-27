/**
 * 真实环境全链路冒烟（node test/smoke-real.mjs）
 *
 * 前提：本机 Polaris 正在运行（config.json web.port 可达）。
 * 流程：
 *   1. 起本地 mock 网站（价格页 + JSON 接口）
 *   2. 用真实 bridge（cap.kv）登记两个目标：example.com（真实外网）+ mock 价格页
 *   3. 手动拉起真实服务进程（节点 node service/sentinel.js 19870 %APPDATA%/Polaris）
 *      —— 服务走 anchor→config 自发现真实桥
 *   4. 等首查落地（真实 kv 中出现 state/snap）
 *   5. 改价格 → 写 cmd.check → 等 change 事件 + diff
 *   6. 拉起真实 mcp/server.js（无 env，自发现真实桥）→ sentinel_test_fetch 走真实闭环
 *   7. 面板读路径验证：cap.kv 读回快照/状态/事件/心跳
 *   8. 清理：杀服务进程 + 删全部 sentinel.* 键
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const APP_ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

// ── 真实桥端点（与服务同规则：anchor → config）────────────────────────────
function loadEndpoint() {
  const anchorPath = path.join(process.env.APPDATA || '', 'Polaris', 'anchor.json');
  const anchor = JSON.parse(fs.readFileSync(anchorPath, 'utf8'));
  const cfg = JSON.parse(fs.readFileSync(path.join(anchor.dataRoot, 'config.json'), 'utf8'));
  const host = '127.0.0.1';
  const base = cfg.web.port;
  return { host, base, token: cfg.web.token || '' };
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

// ── mock 网站 ──────────────────────────────────────────────────────────────
let priceHtml = '<html><body><h1>测试商品</h1><div class="price">¥ 199.00</div><div class="stock">缺货</div></body></html>';
const site = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(req.url === '/json' ? JSON.stringify({ data: { price: 149 } }) : priceHtml);
});
await new Promise((r) => site.listen(0, '127.0.0.1', r));
const sitePort = site.address().port;
console.log(`[smoke] mock 网站 :${sitePort}；真实桥 ${EP.host}:${EP.base}`);

// ── 登记（真实 kv）─────────────────────────────────────────────────────────
const id1 = 'smoke-real-' + crypto.randomUUID().slice(0, 6);   // 真实外网 example.com
const id2 = 'smoke-mock-' + crypto.randomUUID().slice(0, 6);   // mock 价格页
await kvSet(`sentinel.target.${id1}`, {
  id: id1, name: '冒烟-example.com', url: 'https://example.com/', mode: 'text',
  intervalSec: 3600, condition: 'any', enabled: true, createdAt: Date.now(), updatedAt: Date.now(),
});
await kvSet(`sentinel.target.${id2}`, {
  id: id2, name: '冒烟-价格页', url: `http://127.0.0.1:${sitePort}/item`, mode: 'selector', selector: '.price',
  intervalSec: 3600, condition: 'any', enabled: true, createdAt: Date.now(), updatedAt: Date.now(),
});
console.log('[smoke] 目标已写入真实 cap.kv');

// ── 拉起真实服务（无 env 注入，走 anchor→config 自发现）─────────────────────
const appdata = process.env.APPDATA || '';
const svc = spawn(process.execPath, [path.join(APP_ROOT, 'service/sentinel.js'), '19870', path.join(appdata, 'Polaris')], {
  cwd: APP_ROOT,
  stdio: ['ignore', 'pipe', 'pipe'],
});
const svcErr = [];
svc.stderr.on('data', (c) => svcErr.push(String(c)));

const results = [];
const record = (name, pass, detail) => { results.push({ name, pass, detail }); console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`); };

try {
  // 1. 服务发现真实桥 + 首查落地
  await waitFor(async () => (await kvGet('sentinel.meta'))?.lastTickAt, 20000, 500, '服务心跳（真实桥）');
  record('服务自发现真实桥并写入心跳', true, `桥=${(await kvGet('sentinel.meta')).bridge}`);

  await waitFor(async () => {
    const st = await kvGet(`sentinel.state.${id1}`);
    return st && st.lastCheckedAt;
  }, 40000, 500, 'example.com 首查');
  const st1 = await kvGet(`sentinel.state.${id1}`);
  const snap1 = await kvGet(`sentinel.snap.${id1}`);
  record('真实外网抓取（example.com）', st1.status === 'ok' && /example domain/i.test(snap1?.text || ''),
    `status=${st1.status} http=${st1.httpStatus} 抽取="${(snap1?.text || '').slice(0, 60).replace(/\n/g, ' ')}…"`);

  await waitFor(async () => {
    const st = await kvGet(`sentinel.state.${id2}`);
    return st && st.lastCheckedAt;
  }, 40000, 500, 'mock 首查');
  const snap2 = await kvGet(`sentinel.snap.${id2}`);
  record('mock 价格页 selector 抽取', /199\.00/.test(snap2?.text || ''), `快照="${snap2?.text}"`);

  // 2. 改价格 → cmd.check → change 事件
  priceHtml = '<html><body><h1>测试商品</h1><div class="price">¥ 149.00</div><div class="stock">缺货</div></body></html>';
  await kvSet(`sentinel.cmd.check.${id2}`, { op: 'check', at: Date.now() });
  const evKey = await waitFor(async () => {
    const keys = await kvKeys();
    return keys.find((k) => k.startsWith(`sentinel.event.${id2}.`)) || null;
  }, 30000, 500, 'change 事件');
  const ev = await kvGet(evKey);
  const diffText = (ev.diff || []).map((d) => d.kind + d.text).join(' | ');
  record('立即检查 → change 事件 + 行级 diff', ev.type === 'change' && diffText.includes('199') && diffText.includes('149'),
    `${ev.summary}；diff=[${diffText}]`);

  // 3. 面板读路径：快照/状态/事件/心跳 全部可读（等价面板 loadSnapshot 所需数据）
  const meta = await kvGet('sentinel.meta');
  record('面板数据面完整（target/state/snap/event/meta）',
    !!(await kvGet(`sentinel.target.${id2}`)) && !!ev && !!meta, `meta.lastTickAt=${meta.lastTickAt}`);

  // 4. 真实 MCP 全闭环：mcp/server.js（无 env 自发现真实桥）→ sentinel_test_fetch
  const mcp = spawn(process.execPath, [path.join(APP_ROOT, 'mcp/server.js'), path.join(appdata, 'Polaris')], {
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
    const t = setTimeout(() => reject(new Error('mcp rpc 超时: ' + method)), 60000);
    pending.set(id, (m) => { clearTimeout(t); resolve(m); });
    mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
  await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } });
  mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  const lst = await rpc('tools/list', {});
  record('MCP 连接真实桥，tools/list', lst.result.tools.length === 7, `${lst.result.tools.map((t) => t.name).join(', ')}`);
  const tf = await rpc('tools/call', { name: 'sentinel_test_fetch', arguments: { url: `http://127.0.0.1:${sitePort}/json`, mode: 'json', jsonPath: 'data.price' } });
  const tfText = tf.result.content[0].text;
  record('MCP sentinel_test_fetch（真实闭环：MCP→桥→kv→服务→抓取→回读）', /149/.test(tfText), tfText.split('\n')[0]);

  // 5. MCP list_watch 应能看到刚才登记的目标与状态
  const lw = await rpc('tools/call', { name: 'sentinel_list_watch', arguments: {} });
  record('MCP sentinel_list_watch 读到目标与状态', /冒烟-价格页/.test(lw.result.content[0].text), '');
  mcp.kill();

  // 6. 清理 example.com 目标（保留现场最小化；全部清理在 finally）
  console.log('[smoke] 冒烟项全部执行完毕，开始清理…');
} catch (e) {
  record('流程', false, e.message);
  console.error('服务日志尾部：', svcErr.join('').slice(-1200));
} finally {
  svc.kill();
  site.close();
  // 清理全部 sentinel.* 测试数据（真实 kv 恢复原状）
  await new Promise((r) => setTimeout(r, 800));
  const keys = await kvKeys();
  const mine = keys.filter((k) => k.startsWith('sentinel.'));
  await Promise.all(mine.map((k) => kvDel(k)));
  console.log(`[smoke] 已清理 ${mine.length} 个 sentinel.* 键，真实 kv 恢复原状`);
  const bad = results.filter((r) => !r.pass);
  console.log(`[smoke] 结果：${results.length - bad.length}/${results.length} 通过`);
  process.exit(bad.length ? 1 : 0);
}
