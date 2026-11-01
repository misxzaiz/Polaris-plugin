/**
 * 服务集成测试（内存假 kv 桥 + 内置试金石站真实爬取）：node test/service-tests.mjs
 *
 * 链路：spawn service/main.js（env 指向内存假桥）→
 *   1. /__health 200 + meta 落桥（token/port 就绪）
 *   2. 试金石端点（入口页/404/robots/sitemap/img）
 *   3. /api/op start → live 轮询 → 完成报告落 kv：断链/重定向链/缺标题/缺描述/
 *      缺 alt/资源 404/慢页/noindex/重复标题/robots 排除/sitemap 孤岛/外链死链 逐项断言
 *   4. 鉴权（无 token 401）+ 忙拒（409）+ stop 部分报告（aborted:true）
 *   5. 校验拒绝（坏 URL / 元数据目标）
 *   6. settings_set 生效
 *   7. MCP 信箱全链路：cmd run → res 回执 nonce 对齐 + 报告落库
 * 退出码 0=全绿；临时进程/目录自清理。
 */
import assert from 'node:assert';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const results = [];
const t = async (name, fn) => {
  try { await fn(); results.push({ name, pass: true }); }
  catch (e) { results.push({ name, pass: false, detail: e.message }); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 假 kv 桥（内存 Map，协议与宿主 /api/router-dispatch 对齐）────────────────
function startFakeBridge() {
  const store = new Map();
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body || '{}');
        const payload = (parsed.req && parsed.req.payload) || {};
        const act = payload.action;
        let result = null;
        if (act === 'get') result = { ok: true, result: { value: store.has(payload.key) ? store.get(payload.key) : null } };
        else if (act === 'set') { store.set(payload.key, payload.value === undefined ? null : payload.value); result = { ok: true, result: { ok: true } }; }
        else if (act === 'delete') { store.delete(payload.key); result = { ok: true, result: { ok: true } }; }
        else if (act === 'list') result = { ok: true, result: { keys: [...store.keys()] } };
        else result = { ok: false, error: `fake bridge: unknown action ${act}` };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, store, port: server.address().port }));
  });
}

function httpJson(method, url, { headers = {}, body = null, timeoutMs = 10000 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request({
      hostname: u.hostname, port: u.port, path: u.pathname + u.search, method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
      timeout: timeoutMs,
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, json: JSON.parse(data || '{}') }); }
        catch (_) { resolve({ status: res.statusCode, json: {}, text: data }); }
      });
    });
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

const bridge = await startFakeBridge();
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-audit-test-'));
let svc = null;
let svcPort = 0;
let token = '';

async function startService() {
  svc = spawn(process.execPath, [path.join(PLUGIN_ROOT, 'service', 'main.js'), '0', tmpDir], {
    env: { ...process.env, POLARIS_HOST: '127.0.0.1', POLARIS_PORT: String(bridge.port), POLARIS_TOKEN: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let errTail = '';
  svc.stderr.on('data', (c) => { errTail = (errTail + c).slice(-2000); });
  svc.stdout.on('data', () => {});
  // 端口 0 = 随机：等 meta 心跳落桥拿真实端口/token
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const meta = bridge.store.get('site-audit.meta');
    if (meta && meta.port && meta.token) { svcPort = meta.port; token = meta.token; return; }
    await sleep(200);
  }
  throw new Error(`服务未在 15s 内落 meta 心跳；stderr 尾部：${errTail}`);
}

function op(action, payload, withToken = true) {
  return httpJson('POST', `http://127.0.0.1:${svcPort}/api/op`, {
    headers: withToken ? { 'X-SiteAudit-Token': token } : {},
    body: { action, payload },
  });
}

async function waitDone(timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await httpJson('GET', `http://127.0.0.1:${svcPort}/api/live`, { headers: { 'X-SiteAudit-Token': token } });
    if (r.json && r.json.running === false) return r.json;
    await sleep(400);
  }
  throw new Error(`体检未在 ${timeoutMs}ms 内完成`);
}

try {
  await t('服务启动 + meta 落桥（token/port 就绪）', startService);

  await t('/__health 200 + 版本与空闲态', async () => {
    const r = await httpJson('GET', `http://127.0.0.1:${svcPort}/__health`);
    assert.equal(r.status, 200);
    assert.equal(r.json.plugin, 'site-audit');
    assert.equal(r.json.running, false);
  });

  await t('试金石端点：入口页/404/robots/sitemap/图片', async () => {
    const idx = await httpJson('GET', `http://127.0.0.1:${svcPort}/demo/`);
    assert.equal(idx.status, 200);
    assert.ok(String(idx.text || '').includes('/demo/redirect-1'));
    const miss = await httpJson('GET', `http://127.0.0.1:${svcPort}/demo/missing-404`);
    assert.equal(miss.status, 404);
    const robots = await httpJson('GET', `http://127.0.0.1:${svcPort}/robots.txt`);
    assert.equal(robots.status, 200);
    assert.ok(String(robots.text || '').includes('Disallow: /demo/private'));
    const sm = await httpJson('GET', `http://127.0.0.1:${svcPort}/sitemap.xml`);
    assert.ok(String(sm.text || '').includes('/demo/orphan'));
    const img = await httpJson('GET', `http://127.0.0.1:${svcPort}/demo/img-exists.svg`);
    assert.equal(img.status, 200);
  });

  await t('鉴权：无 token 的 /api/op 401', async () => {
    const r = await op('state', {}, false);
    assert.equal(r.status, 401);
  });

  await t('校验拒绝：坏 URL 与云元数据目标', async () => {
    const bad = await op('start', { url: 'not-a-url' });
    assert.equal(bad.json.ok, false);
    assert.ok(bad.json.error.includes('无效'));
    const meta = await op('start', { url: 'http://169.254.169.254/latest' });
    assert.equal(meta.json.ok, false);
    assert.ok(meta.json.error.includes('元数据'));
  });

  let report = null;
  await t('整站体检试金石站：报告逐项命中全部检查项', async () => {
    const seed = `http://127.0.0.1:${svcPort}/demo/`;
    const start = await op('start', { url: seed, maxPages: 50, delayMs: 0, timeoutS: 10, slowMs: 2000 });
    assert.equal(start.json.ok, true, `start 失败：${start.json.error}`);
    const live = await waitDone(90000);
    assert.equal(live.running, false);
    const auditId = start.json.auditId;
    const fromKv = bridge.store.get(`site-audit.report.${auditId}`);
    assert.ok(fromKv, '报告未落 kv');
    report = fromKv;
    const types = Object.fromEntries(report.issues.map((i) => [i.type, i]));
    const urlsOf = (g) => (g ? g.items.map((x) => x.url) : []);

    assert.ok(types.broken_page, 'broken_page 缺失');
    assert.ok(urlsOf(types.broken_page).some((u) => u.endsWith('/demo/missing-404')), JSON.stringify(urlsOf(types.broken_page)));

    assert.ok(types.redirect_chain, 'redirect_chain 缺失');
    const chainItem = types.redirect_chain.items.find((x) => x.url.endsWith('/demo/redirect-1'));
    assert.ok(chainItem, `redirect-1 未入链明细：${JSON.stringify(types.redirect_chain.items)}`);
    assert.ok(chainItem.detail.includes('2 跳'), chainItem.detail);

    assert.ok(types.missing_title && urlsOf(types.missing_title).some((u) => u.endsWith('/demo/no-title')));
    assert.ok(types.missing_description && urlsOf(types.missing_description).some((u) => u.endsWith('/demo/no-title')));
    assert.ok(types.missing_alt && urlsOf(types.missing_alt).some((u) => u.endsWith('/demo/no-title')));
    assert.ok(types.broken_asset && urlsOf(types.broken_asset).some((u) => u.endsWith('/demo/img-missing.png')), JSON.stringify(urlsOf(types.broken_asset)));
    assert.ok(types.slow_page && urlsOf(types.slow_page).some((u) => u.includes('/demo/slow')), JSON.stringify(urlsOf(types.slow_page)));
    assert.ok(types.noindex && urlsOf(types.noindex).some((u) => u.endsWith('/demo/noindex')));
    const dup = types.duplicate_title;
    assert.ok(dup, 'duplicate_title 缺失');
    assert.equal(dup.items[0].dupUrls.length, 2, JSON.stringify(dup.items[0]));
    assert.ok(types.robots_blocked && urlsOf(types.robots_blocked).some((u) => u.endsWith('/demo/private')), 'robots_blocked 缺失');
    assert.ok(types.sitemap_gap && urlsOf(types.sitemap_gap).some((u) => u.endsWith('/demo/orphan')), 'sitemap_gap 缺失');
    assert.ok(types.broken_external && urlsOf(types.broken_external).some((u) => u.startsWith('https://demo.invalid/')), JSON.stringify(urlsOf(types.broken_external)));

    assert.ok(report.score.value < 100, `健康分应 <100，实际 ${report.score.value}`);
    assert.ok(report.stats.pagesCrawled >= 8, `爬到的页面太少：${report.stats.pagesCrawled}`);
    assert.equal(report.stats.statusDist['404'] >= 1, true);
    assert.equal(report.robots.fetched, true);
    assert.equal(report.sitemap.fetched, true);
    assert.equal(report.seed.scopeHosts.length, 1);
    // 健康页不误报：入口页有 title/desc/lang
    const titleOk = report.issues.every((g) => !g.items.some((x) => x.url.endsWith('/demo/') && (g.type === 'missing_title' || g.type === 'missing_description')));
    assert.ok(titleOk, '入口页被误报缺标题/描述');
  });

  await t('history 落桥（含健康分/计数口径）', async () => {
    const h = bridge.store.get('site-audit.history');
    assert.ok(Array.isArray(h) && h.length >= 1);
    assert.equal(h[0].auditId, report.auditId);
    assert.equal(h[0].score, report.score.value);
  });

  await t('忙拒 409 + stop 部分报告（aborted:true）', async () => {
    const seed = `http://127.0.0.1:${svcPort}/demo/`;
    const s1 = await op('start', { url: seed, maxPages: 50, delayMs: 800 });
    assert.equal(s1.json.ok, true);
    const s2 = await op('start', { url: seed, maxPages: 50, delayMs: 0 });
    assert.equal(s2.status, 409);
    assert.equal(s2.json.busy, true);
    const st = await op('stop', {});
    assert.equal(st.json.ok, true);
    const live = await waitDone(60000);
    assert.equal(live.running, false);
    const rep2 = bridge.store.get(`site-audit.report.${s1.json.auditId}`);
    assert.ok(rep2, '中止报告未落库');
    assert.equal(rep2.aborted, true);
  });

  await t('settings_set 生效（含 clamp）', async () => {
    const r = await op('settings_set', { maxPages: 99999, delayMs: 400, slowMs: 1500 });
    assert.equal(r.json.ok, true);
    assert.equal(r.json.settings.maxPages, 5000);
    assert.equal(r.json.settings.delayMs, 400);
    const g = await op('settings_get', {});
    assert.equal(g.json.settings.slowMs, 1500);
  });

  await t('MCP 信箱全链路：cmd run → res 回执 nonce 对齐', async () => {
    const nonce = `test-${Date.now().toString(36)}`;
    bridge.store.delete('site-audit.res');
    bridge.store.set('site-audit.cmd', { nonce, action: 'run', payload: { url: `http://127.0.0.1:${svcPort}/demo/`, maxPages: 50, delayMs: 0 }, at: new Date().toISOString() });
    const deadline = Date.now() + 90000;
    let res = null;
    while (Date.now() < deadline) {
      res = bridge.store.get('site-audit.res');
      if (res && res.nonce === nonce) break;
      await sleep(400);
    }
    assert.ok(res && res.nonce === nonce, '回执未按 nonce 对齐');
    assert.equal(res.result.ok, true, JSON.stringify(res.result).slice(0, 300));
    assert.ok(res.result.report.score.value < 100);
    // 服务消费后应删除 cmd
    await sleep(1500);
    assert.equal(bridge.store.has('site-audit.cmd'), false, 'cmd 未被服务消费删除');
  });
} finally {
  if (svc) { try { svc.kill(); } catch (_) { /* 忽略 */ } }
  bridge.server.close();
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) { /* 忽略 */ }
}

const failed = results.filter((r) => !r.pass);
for (const r of results) console.log(`${r.pass ? '  ✔' : '  ✖'} ${r.name}${r.pass ? '' : ` —— ${r.detail}`}`);
console.log(`\n服务集成：${results.length - failed.length}/${results.length} 通过`);
if (failed.length) process.exit(1);
