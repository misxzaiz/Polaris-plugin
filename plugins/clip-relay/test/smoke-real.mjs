/**
 * 真实环境全链路冒烟（node test/smoke-real.mjs）
 *
 * 前提：本机 Polaris 正在运行（anchor.json → config.json web.port 可达）+ 有外网。
 * 流程：
 *   1. 预写设置（maxItems=20, sweepMs=60s）
 *   2. 手动拉起真实服务（node service/relay.js 19872 %APPDATA%/Polaris）
 *   3. 面板写路径：直写 cap.kv 一条文本（等价 pushItem）+ 心跳/键空间验证
 *   4. 拉起真实 mcp/server.js → tools/list 4 个 → relay_push 文本+URL（example.com）
 *   5. 等 URL 条目被服务 enrich（title ≈ "Example Domain"，真实外网抓取）
 *   6. MCP relay_list / relay_read 回读
 *   7. 保留策略：补 25 条 filler（共 28 > 20）→ 服务首轮/周期清扫 → 剩 20 且最旧被删
 *   8. relay_clear 无 confirm 拒绝；带 confirm 清空 → 0 条
 *   9. 清理：杀服务/MCP + 删全部 relay.* 键
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

async function waitFor(fn, ms, step = 800, label = '') {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, step));
  }
  throw new Error(`冒烟超时：${label || fn.toString().slice(0, 60)}`);
}

const results = [];
const record = (name, pass, detail = '') => { results.push({ name, pass }); console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`); };

const appdata = process.env.APPDATA || '';
let svc = null;
let mcp = null;

async function itemCount() {
  const keys = await kvKeys();
  return keys.filter((k) => k.startsWith('relay.item.')).length;
}

try {
  // 1. 预写设置（服务首轮 tick 读取）
  await kvSet('relay.settings', { maxItems: 20, retentionDays: 14, sweepMs: 60000, urlEnrich: true });

  // 2. 真实服务（无 env 注入，走 anchor→config 自发现）
  svc = spawn(process.execPath, [path.join(APP_ROOT, 'service/relay.js'), '19872', path.join(appdata, 'Polaris')], {
    cwd: APP_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const svcErr = [];
  svc.stderr.on('data', (c) => svcErr.push(String(c)));

  const meta = await waitFor(async () => {
    const m = await kvGet('relay.meta');
    return m && m.lastTickAt ? m : null;
  }, 20000, 500, '服务心跳');
  record('服务自发现真实桥并写入心跳', true, `bridge=${meta.bridge} version=${meta.version}`);

  // 3. 面板写路径（等价 pushItem：normalizeItem 同构）
  const panelItem = {
    id: 'i' + crypto.randomUUID().replace(/-/g, '').slice(0, 12),
    text: '冒烟-面板直写文本：dev server 9827 被占了',
    kind: 'text', from: '桌面', createdAt: Date.now(), pinned: false, enriched: false,
  };
  await kvSet(`relay.item.${panelItem.id}`, panelItem);
  const keys = await kvKeys();
  record('面板写路径落 kv（relay.item.*）', keys.includes(`relay.item.${panelItem.id}`), '');

  // 4. 真实 MCP 全闭环
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
    const timer = setTimeout(() => reject(new Error('mcp rpc 超时: ' + method)), 60000);
    pending.set(id, (m) => { clearTimeout(timer); resolve(m); });
    mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
  await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } });
  mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  const lst = await rpc('tools/list', {});
  record('MCP 连接真实桥，tools/list 4 个', lst.result.tools.length === 4, lst.result.tools.map((t) => t.name).join(', '));

  const pushText = await rpc('tools/call', { name: 'relay_push', arguments: { text: '冒烟-MCP推送文本：WiFi 密码是 polaris2026' } });
  record('MCP relay_push 文本条目', !pushText.result.isError, pushText.result.content[0].text.split('\n')[0]);
  const pushUrl = await rpc('tools/call', { name: 'relay_push', arguments: { text: 'https://example.com/' } });
  record('MCP relay_push URL 条目', !pushUrl.result.isError && /example\.com/.test(pushUrl.result.content[0].text), '');

  // 5. 服务 enrich：真实外网抓取 example.com 标题
  const urlId = (pushUrl.result.content[0].text.match(/\[i[a-z0-9]+\]/) || [])[0]?.slice(1, -1);
  const enriched = await waitFor(async () => {
    if (!urlId) return null;
    const it = await kvGet(`relay.item.${urlId}`);
    return it && it.enriched === true ? it : null;
  }, 45000, 1500, 'URL 标题抓取');
  record('服务真实外网 enrich（example.com → 标题）',
    /example domain/i.test(enriched.title || ''), `title="${enriched.title}" desc="${(enriched.desc || '').slice(0, 40)}"`);

  // 6. MCP 回读
  const lstAfter = await rpc('tools/call', { name: 'relay_list', arguments: {} });
  record('MCP relay_list 回读（含标题与条目）', !lstAfter.result.isError && /Example Domain/i.test(lstAfter.result.content[0].text), '');
  const rd = await rpc('tools/call', { name: 'relay_read', arguments: { id: urlId } });
  record('MCP relay_read 全文', !rd.result.isError && /example\.com/.test(rd.result.content[0].text), '');

  // 7. 保留策略：补 filler 到 28 条 → 清扫剩 20，最旧被删
  const fillers = [];
  for (let i = 0; i < 25; i++) {
    const id = 'i' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    fillers.push(id);
    await kvSet(`relay.item.${id}`, {
      id, text: `filler-${String(i).padStart(2, '0')}`, kind: 'text', from: '冒烟',
      createdAt: Date.now() - (1000 - i), pinned: false, enriched: false,
    });
  }
  const before = await itemCount();
  await waitFor(async () => (await itemCount()) === 20, 30000, 1500, '清扫到 maxItems=20');
  const oldestAlive = await kvGet(`relay.item.${fillers[0]}`);
  record('保留策略清扫（28→20，最旧删除）', before === 28 && oldestAlive === null,
    `before=${before} after=20；filler[0] 存活=${oldestAlive !== null}`);

  // 8. relay_clear 守卫与清空
  const noConfirm = await rpc('tools/call', { name: 'relay_clear', arguments: {} });
  record('MCP relay_clear 无 confirm 拒绝', noConfirm.result.isError === true && /confirm/.test(noConfirm.result.content[0].text), '');
  const cleared = await rpc('tools/call', { name: 'relay_clear', arguments: { confirm: true } });
  const afterClear = await itemCount();
  record('MCP relay_clear 真清空', !cleared.result.isError && afterClear === 0, `after=${afterClear}`);

  console.log('[smoke] 冒烟项全部执行完毕，开始清理…');
} catch (e) {
  record('流程', false, e.message);
} finally {
  if (mcp) mcp.kill();
  if (svc) svc.kill();
  await new Promise((r) => setTimeout(r, 800));
  const keys = await kvKeys();
  const mine = keys.filter((k) => k.startsWith('relay.'));
  await Promise.all(mine.map((k) => kvDel(k)));
  console.log(`[smoke] 已清理 ${mine.length} 个 relay.* 键，真实 kv 恢复原状`);
  const bad = results.filter((r) => !r.pass);
  console.log(`[smoke] 结果：${results.length - bad.length}/${results.length} 通过`);
  process.exit(bad.length ? 1 : 0);
}
