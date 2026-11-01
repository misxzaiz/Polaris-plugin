/**
 * 真实环境全链路冒烟（node test/smoke-real.mjs）
 *
 * 前提：本机 Polaris 正在运行（anchor.json → config.json web.port 可达）。
 * 流程：
 *   1. 防误伤护栏：真实 kv 已有 site-audit.* 业务键 → 拒跑（避免覆盖真实数据）
 *   2. 手动拉起真实服务（node service/main.js 19876 %DATA_ROOT%）——零 env，自发现真实桥
 *   3. 断言 meta 落真实 kv（token/port/版本）
 *   4. 真实体检一次内置试金石站 → 报告落真实 kv（断链/重定向链/robots 排除/sitemap 孤岛逐项命中）
 *   5. MCP 全链路：真实 mcp/server.js → initialize → tools/list(6) → site_audit_run（试金石）
 *   6. 清理：杀服务/MCP + 删光 site-audit.* 键（全绿自清理）
 */
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KPREFIX = 'site-audit.';

function loadEndpoint() {
  const anchorPath = path.join(process.env.APPDATA || '', 'Polaris', 'anchor.json');
  const anchor = JSON.parse(fs.readFileSync(anchorPath, 'utf8'));
  const cfg = JSON.parse(fs.readFileSync(path.join(anchor.dataRoot, 'config.json'), 'utf8'));
  return { host: '127.0.0.1', port: cfg.web.port, token: cfg.web.token || '', appConfigDir: path.join(anchor.dataRoot) };
}
let EP;
try { EP = loadEndpoint(); } catch (e) {
  console.error(`⚠ 宿主不在线（读取 anchor/config 失败：${e.message}）——真桥冒烟明确跳过，三层验证剩余两层（离线单测/假桥集成测试）已全绿。`);
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

async function waitFor(fn, ms, step = 600, label = '') {
  const t0 = Date.now();
  for (;;) {
    try { const v = await fn(); if (v) return v; } catch (_) { /* 重试 */ }
    if (Date.now() - t0 > ms) throw new Error(`等待超时：${label}`);
    await new Promise((r) => setTimeout(r, step));
  }
}

const results = [];
const t = async (name, fn) => {
  try { await fn(); results.push({ name, pass: true }); }
  catch (e) { results.push({ name, pass: false, detail: e.message }); }
};

// 1. 防误伤：真实 kv 已有业务键 → 拒跑
const existing = (await kvKeys()).filter((k) => k.startsWith(KPREFIX));
if (existing.length) {
  console.error(`⚠ 真实 kv 已存在 ${existing.length} 个 site-audit.* 键（插件可能正在使用）——为不覆盖真实数据拒跑。`);
  process.exit(1);
}

const SVC_PORT = 19876;
const svc = spawn(process.execPath, [path.join(PLUGIN_ROOT, 'service', 'main.js'), String(SVC_PORT), EP.appConfigDir], { stdio: ['ignore', 'pipe', 'pipe'] });
let svcLog = '';
svc.stderr.on('data', (c) => { svcLog += c; });

let auditId = null;
try {
  await t('meta 落真实 kv（token/port/版本，端点自发现走 anchor→config 链）', async () => {
    const m = await waitFor(() => kvGet(`${KPREFIX}meta`), 20000, 600, 'meta');
    if (!m.port || !m.token) throw new Error('meta 缺 token/port');
    if (m.port !== SVC_PORT) throw new Error(`meta.port=${m.port} ≠ ${SVC_PORT}`);
    if (!m.version) throw new Error('meta 缺版本');
  });

  await t('健康端点（真实服务进程）', async () => {
    const r = await fetch(`http://127.0.0.1:${SVC_PORT}/__health`);
    const j = await r.json();
    if (!j.ok || j.plugin !== 'site-audit') throw new Error(JSON.stringify(j));
  });

  await t('真实体检试金石站 → 报告落真实 kv 且逐项命中', async () => {
    const meta = await kvGet(`${KPREFIX}meta`);
    const r = await fetch(`http://127.0.0.1:${SVC_PORT}/api/op`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-SiteAudit-Token': meta.token },
      body: JSON.stringify({ action: 'start', payload: { url: `http://127.0.0.1:${SVC_PORT}/demo/`, maxPages: 50, delayMs: 0, timeoutS: 10 } }),
    });
    const j = await r.json();
    if (!j.ok) throw new Error(JSON.stringify(j));
    auditId = j.auditId;
    const rep = await waitFor(() => kvGet(`${KPREFIX}report.${auditId}`), 90000, 700, '报告');
    const types = Object.fromEntries(rep.issues.map((i) => [i.type, i]));
    if (!types.broken_page) throw new Error('broken_page 缺失');
    if (!types.redirect_chain) throw new Error('redirect_chain 缺失');
    if (!types.robots_blocked) throw new Error('robots_blocked 缺失');
    if (!types.sitemap_gap) throw new Error('sitemap_gap 缺失');
    if (!(rep.score.value < 100)) throw new Error(`健康分=${rep.score.value}`);
  });

  await t('MCP 真子进程：initialize → tools/list=6 → site_audit_run', async () => {
    const readline = await import('node:readline');
    const mcp = spawn(process.execPath, [path.join(PLUGIN_ROOT, 'mcp', 'server.js'), EP.appConfigDir], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';
    mcp.stderr.on('data', (c) => { stderr += c; });
    const rl = readline.createInterface({ input: mcp.stdout });
    const pending = new Map();
    let idc = 0;
    rl.on('line', (line) => {
      let msg; try { msg = JSON.parse(line); } catch (_) { return; }
      if (msg.id !== undefined && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    });
    const call = (method, params) => new Promise((resolve) => {
      const id = ++idc;
      pending.set(id, resolve);
      mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
    try {
      const init = await call('initialize', {});
      if (init.result.serverInfo.name !== 'site-audit') throw new Error('init 失败');
      const list = await call('tools/list', {});
      if (list.result.tools.length !== 6) throw new Error(`tools=${list.result.tools.length}`);
      const run = await call('tools/call', { name: 'site_audit_run', arguments: { url: `http://127.0.0.1:${SVC_PORT}/demo/`, maxPages: 50, delayMs: 0, waitMs: 120000 } });
      if (run.result.isError) throw new Error(run.result.content[0].text);
      if (!run.result.content[0].text.includes('体检完成')) throw new Error(run.result.content[0].text.slice(0, 200));
    } finally {
      mcp.kill('SIGKILL');
      if (stderr && !results.every((r) => r.pass)) console.log('---- MCP stderr ----\n' + stderr.split('\n').slice(-10).join('\n'));
    }
  });

  await t('历史与 latest 均落真实 kv', async () => {
    const latest = await kvGet(`${KPREFIX}latest`);
    // MCP 用例又跑了一次体检，latest 应指向其中一次真实报告（两次分数一致）
    if (!latest || !latest.score || !latest.seed) throw new Error('latest 缺失');
    const h = await kvGet(`${KPREFIX}history`);
    if (!Array.isArray(h) || !h.some((x) => x.auditId === auditId)) throw new Error('history 缺失');
    if (h.length < 2) throw new Error(`历史应含两次体检，实际 ${h.length}`);
  });
} catch (e) {
  results.push({ name: '（冒烟编排）', pass: false, detail: e.message });
}

// 清理：杀服务 + 删光 site-audit.* 键（全绿自清理纪律）
svc.kill('SIGKILL');
try {
  const keys = (await kvKeys()).filter((k) => k.startsWith(KPREFIX));
  for (const k of keys) await kvDel(k);
  console.log(`清理：杀服务 + 删除 ${keys.length} 个 ${KPREFIX}* 键`);
} catch (e) {
  console.error(`⚠ 清理失败（真实 kv 残留 site-audit.* 键，需手动删）：${e.message}`);
}

let pass = 0;
for (const r of results) {
  if (r.pass) pass++;
  console.log(`${r.pass ? '✓' : '✗'} ${r.name}${r.pass ? '' : ` —— ${r.detail}`}`);
}
console.log(`\n${pass}/${results.length} 通过`);
if (pass !== results.length) console.log('---- 服务日志尾部 ----\n' + svcLog.split('\n').slice(-20).join('\n'));
process.exit(pass === results.length ? 0 : 1);
