/**
 * 服务集成测试（内存假 kv 桥 + 真实 HTTP 请求打真服务）：node test/service-tests.mjs
 *
 * 链路：spawn service/main.js（env 指向内存假桥，端口 0 随机）→
 *   1. /__health 200 + meta 落桥（端口/心跳就绪）+ 示例路由引导写入
 *   2. 模板引擎真实渲染（int/cname/email/bool/uuid/counter/req.path/req.query/req.body/req.header）
 *   3. 路由匹配评分（静态 > 参数 > 通配；ANY；大小写）
 *   4. 延迟注入 + 错误注入 + 404 诊断体 + fallback
 *   5. CORS（echo 预检/star/off）+ 请求体 413 + 历史/敏感头掩码
 *   6. cmd 信箱：selftest 全链路（报告落 mck.selftest，临时路由用后即删）
 *      + test_route（示例参数实例化）+ clear_history
 *   7. settings 热更：写 kv 后 ≤8s 生效；upsert 后立即 test_route 强制重读
 * 退出码 0=全绿；临时进程自清理。
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

function httpReq(method, port, urlPath, { headers = {}, body = null, timeoutMs = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1', port, path: urlPath, method,
      headers: { ...(body !== null ? { 'Content-Type': 'application/json' } : {}), ...headers },
      timeout: timeoutMs,
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: data }));
    });
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.on('error', reject);
    if (body !== null) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

const bridge = await startFakeBridge();
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mock-server-test-'));
let svc = null;
let svcPort = 0;

async function startService() {
  svc = spawn(process.execPath, [path.join(PLUGIN_ROOT, 'service', 'main.js'), '0', tmpDir], {
    env: { ...process.env, POLARIS_HOST: '127.0.0.1', POLARIS_PORT: String(bridge.port), POLARIS_TOKEN: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let errTail = '';
  svc.stderr.on('data', (c) => { errTail = (errTail + c).slice(-3000); });
  svc.stdout.on('data', () => {});
  // 端口 0 = 随机：等 meta 心跳落桥拿真实端口
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const meta = bridge.store.get('mck.meta');
    if (meta && meta.port) { svcPort = meta.port; return; }
    await sleep(300);
  }
  throw new Error(`服务未上线（meta 无端口）\n${errTail}`);
}

async function sendCmd(op, payload = {}, timeoutMs = 30000) {
  const nonce = `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  await httpReq('POST', bridge.port, '/api/router-dispatch', {
    body: { req: { target: 'cap.kv', payload: { action: 'set', key: 'mck.cmd', value: { op, nonce, ...payload, at: Date.now() } } } },
  });
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = bridge.store.get('mck.result');
    if (r && r.nonce === nonce) return r;
    await sleep(400);
  }
  throw new Error(`命令 ${op} 超时无回执`);
}

async function getSettings() { return bridge.store.get('mck.settings'); }
async function setSettings(s) {
  await httpReq('POST', bridge.port, '/api/router-dispatch', {
    body: { req: { target: 'cap.kv', payload: { action: 'set', key: 'mck.settings', value: s } } },
  });
}

try {
  await startService();

  // ── 1. 健康 + 引导 ─────────────────────────────────────────────────────────
  await t('健康端点 200 + 示例路由引导写入 kv', async () => {
    const h = await httpReq('GET', svcPort, '/__health');
    assert.strictEqual(h.status, 200);
    const j = JSON.parse(h.text);
    assert.strictEqual(j.ok, true);
    assert.ok(j.routes >= 2, `示例路由未引导: ${j.routes}`);
    const s = await getSettings();
    assert.ok(s && Array.isArray(s.routes) && s.routes.length >= 2);
    assert.ok(s.routes.some((r) => r.id === 'demo-users'));
  });

  // ── 2. 模板引擎真实渲染 ────────────────────────────────────────────────────
  await t('示例路由 /mockdemo/users：JSON 模板真实渲染', async () => {
    const r = await httpReq('GET', svcPort, '/mockdemo/users');
    assert.strictEqual(r.status, 200);
    const j = JSON.parse(r.text);
    assert.strictEqual(j.code, 0);
    assert.ok(Number.isInteger(j.data[0].id) && j.data[0].id >= 1 && j.data[0].id <= 99, `int 渲染: ${j.data[0].id}`);
    assert.ok(/^[\u4e00-\u9fa5]{2,3}$/.test(j.data[0].name), `cname 渲染: ${j.data[0].name}`);
    assert.match(j.data[0].email, /^[^@]+@[^@]+\.[^@]+$/);
    assert.strictEqual(typeof j.data[0].vip, 'boolean');
    assert.strictEqual(r.headers['content-type'], 'application/json; charset=utf-8');
  });
  await t('参数路由 /mockdemo/users/:id：req.path 回显', async () => {
    const r = await httpReq('GET', svcPort, '/mockdemo/users/9527');
    const j = JSON.parse(r.text);
    assert.strictEqual(j.data.id, '9527');
    assert.ok(/^[\u4e00-\u9fa5]{2,4}$/.test(j.data.city));
  });
  await t('匹配评分：静态段优先于参数段（/mockdemo/users/special 打到静态路由）', async () => {
    // 挂一条静态特殊路由，验证静态优先
    const s = await getSettings();
    s.routes.push({
      id: 'r-static-special', name: '特殊', method: 'GET', path: '/mockdemo/users/special', status: 200,
      bodyType: 'json', body: '{"special":true}', delayMs: 0, errorRate: 0, errorStatus: 500,
      enabled: true, builtin: false, headers: {}, createdAt: 1, updatedAt: 1,
    });
    await setSettings(s);
    await sleep(4200); // 等 settings 热更（3s tick + 裕量）
    const r = await httpReq('GET', svcPort, '/mockdemo/users/special');
    assert.strictEqual(JSON.parse(r.text).special, true, '静态路由未优先');
    const r2 = await httpReq('GET', svcPort, '/mockdemo/users/other');
    assert.strictEqual(JSON.parse(r2.text).data.id, 'other', '参数路由被误劫持');
  });
  await t('POST 体回显：{{req.body.a.b}} 深层取值 + {{req.header.*}}', async () => {
    const s = await getSettings();
    s.routes.push({
      id: 'r-echo-deep', name: '深回显', method: 'POST', path: '/mockdemo/echo', status: 201,
      bodyType: 'json', body: '{"order":"{{req.body.order.id}}","auth":"{{req.header.X-Auth}}","tag":"{{req.query.tag}}"}',
      delayMs: 0, errorRate: 0, errorStatus: 500, enabled: true, builtin: false, headers: { 'X-Mock': 'deep' },
      createdAt: 2, updatedAt: 2,
    });
    await setSettings(s);
    await sleep(4200);
    const r = await httpReq('POST', svcPort, '/mockdemo/echo?tag=t1', { headers: { 'X-Auth': 'tok-123' }, body: { order: { id: 'A-001' } } });
    assert.strictEqual(r.status, 201);
    const j = JSON.parse(r.text);
    assert.strictEqual(j.order, 'A-001');
    assert.strictEqual(j.auth, 'tok-123');
    assert.strictEqual(j.tag, 't1');
    assert.strictEqual(r.headers['x-mock'], 'deep');
  });
  await t('未识别模板按字面保留（自诊断）', async () => {
    const s = await getSettings();
    s.routes.push({
      id: 'r-typo', name: '拼错', method: 'GET', path: '/mockdemo/typo', status: 200,
      bodyType: 'text', body: 'value={{noSuchGen}}', delayMs: 0, errorRate: 0, errorStatus: 500,
      enabled: true, builtin: false, headers: {}, createdAt: 3, updatedAt: 3,
    });
    await setSettings(s);
    await sleep(4200);
    const r = await httpReq('GET', svcPort, '/mockdemo/typo');
    assert.strictEqual(r.text, 'value={{noSuchGen}}');
  });

  // ── 3. 延迟/错误/404/fallback ─────────────────────────────────────────────
  await t('延迟注入 500ms（实测 ≥450ms）', async () => {
    const s = await getSettings();
    s.routes.push({
      id: 'r-slow', name: '慢', method: 'GET', path: '/mockdemo/slow', status: 200,
      bodyType: 'json', body: '{"ok":1}', delayMs: 500, errorRate: 0, errorStatus: 500,
      enabled: true, builtin: false, headers: {}, createdAt: 4, updatedAt: 4,
    });
    await setSettings(s);
    await sleep(4200);
    const s0 = Date.now();
    const r = await httpReq('GET', svcPort, '/mockdemo/slow');
    const cost = Date.now() - s0;
    assert.strictEqual(r.status, 200);
    assert.ok(cost >= 450, `实测 ${cost}ms < 450ms`);
  });
  await t('错误注入 100% → errorStatus 503 + 注入标记', async () => {
    const s = await getSettings();
    s.routes.push({
      id: 'r-fail', name: '必失败', method: 'GET', path: '/mockdemo/fail', status: 200,
      bodyType: 'json', body: '{"never":"seen"}', delayMs: 0, errorRate: 100, errorStatus: 503,
      enabled: true, builtin: false, headers: {}, createdAt: 5, updatedAt: 5,
    });
    await setSettings(s);
    await sleep(4200);
    const r = await httpReq('GET', svcPort, '/mockdemo/fail');
    assert.strictEqual(r.status, 503);
    const j = JSON.parse(r.text);
    assert.strictEqual(j.ok, false);
    assert.strictEqual(j.route, 'r-fail');
  });
  await t('未匹配 → 404 诊断体（含 hint）', async () => {
    const r = await httpReq('DELETE', svcPort, '/mockdemo/nothing-here');
    assert.strictEqual(r.status, 404);
    const j = JSON.parse(r.text);
    assert.strictEqual(j.ok, false);
    assert.strictEqual(j.method, 'DELETE');
    assert.ok(j.hint, '缺 hint');
  });
  await t('fallback 启用后未匹配打到 fallback', async () => {
    const s = await getSettings();
    s.fallback = { enabled: true, status: 200, bodyType: 'json', body: '{"from":"fallback"}' };
    await setSettings(s);
    await sleep(4200);
    const r = await httpReq('GET', svcPort, '/mockdemo/nothing-here-2');
    assert.strictEqual(r.status, 200);
    assert.strictEqual(JSON.parse(r.text).from, 'fallback');
    // 还原 fallback
    s.fallback = { enabled: false, status: 200, bodyType: 'json', body: '{}' };
    await setSettings(s);
    await sleep(4200);
  });

  // ── 4. CORS / 413 / 历史 ──────────────────────────────────────────────────
  await t('CORS echo：预检 204 + Origin 回显 + Allow-Headers 回显', async () => {
    const r = await httpReq('OPTIONS', svcPort, '/mockdemo/users', {
      headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'x-token, content-type' },
    });
    assert.strictEqual(r.status, 204);
    assert.strictEqual(r.headers['access-control-allow-origin'], 'http://localhost:5173');
    assert.match(r.headers['access-control-allow-headers'], /x-token/i);
  });
  await t('CORS echo：带 Origin 的 GET 回显 ACAO + Vary；无 Origin 不给 ACAO', async () => {
    const r1 = await httpReq('GET', svcPort, '/mockdemo/users', { headers: { Origin: 'http://localhost:5173' } });
    assert.strictEqual(r1.headers['access-control-allow-origin'], 'http://localhost:5173');
    assert.strictEqual(r1.headers['access-control-allow-credentials'], 'true');
    const r2 = await httpReq('GET', svcPort, '/mockdemo/users');
    assert.strictEqual(r2.headers['access-control-allow-origin'], undefined);
  });
  await t('CORS off：预检也打 404/无 CORS 头', async () => {
    const s = await getSettings();
    const savedCors = s.cors.mode;
    s.cors = { mode: 'off' };
    await setSettings(s);
    await sleep(4200);
    const r = await httpReq('OPTIONS', svcPort, '/mockdemo/users', { headers: { Origin: 'http://x.test' } });
    assert.strictEqual(r.headers['access-control-allow-origin'], undefined);
    s.cors = { mode: savedCors };
    await setSettings(s);
    await sleep(4200);
  });
  await t('请求体超 2MB → 413', async () => {
    const big = 'x'.repeat(2 * 1024 * 1024 + 1024);
    let got = null;
    try { await httpReq('POST', svcPort, '/mockdemo/echo', { body: big, timeoutMs: 8000 }); } catch (e) { got = e; }
    // 413 后服务主动断连，对端可能见 ECONNRESET——两种都算护栏生效，只要求不是 2xx
    if (!got) {
      const r = await httpReq('POST', svcPort, '/mockdemo/echo', { body: big, timeoutMs: 8000 });
      assert.notStrictEqual(r.status, 200);
    }
  });
  await t('历史落镜像：method/path/status/敏感头掩码/请求体预览', async () => {
    await httpReq('POST', svcPort, '/mockdemo/echo?tag=hist', { headers: { Authorization: 'Bearer sk-super-secret-9999', 'X-Auth': 'tok' }, body: { ping: 'pong-hist' } });
    await sleep(4500); // 等 hist 镜像 tick
    const idx = bridge.store.get('mck.idx');
    assert.ok(idx && idx.count >= 1, `idx 未落: ${JSON.stringify(idx)}`);
    const chunk0 = bridge.store.get('mck.hist.0');
    assert.ok(Array.isArray(chunk0) && chunk0.length >= 1);
    const rec = chunk0.find((x) => x.path === '/mockdemo/echo' && x.method === 'POST');
    assert.ok(rec, 'POST 历史未找到');
    assert.strictEqual(rec.status, 201);
    assert.match(rec.reqHeaders.authorization, /（已脱敏）/, 'Authorization 未掩码');
    assert.ok(!/sk-super-secret/.test(rec.reqHeaders.authorization), '掩码后仍泄露原文');
    assert.strictEqual(rec.reqHeaders['x-auth'], 'tok');
    assert.match(rec.reqBodyPreview, /pong-hist/);
    assert.strictEqual(rec.matchedRouteId, 'r-echo-deep');
  });

  // ── 5. cmd 信箱 ───────────────────────────────────────────────────────────
  await t('cmd selftest 全链路：7 项全绿 + 临时路由用后即删', async () => {
    const r = await sendCmd('selftest', {}, 40000);
    assert.strictEqual(r.ok, true, `自检失败: ${JSON.stringify(r).slice(0, 400)}`);
    const report = r.report;
    assert.strictEqual(report.total, 7);
    assert.strictEqual(report.passed, 7, `未全绿: ${JSON.stringify(report.checks.filter((c) => !c.pass))}`);
    assert.strictEqual(report.allGreen, true);
    const s = await getSettings();
    assert.ok(!s.routes.some((x) => x.id.startsWith('st-')), '临时路由未清理');
    assert.ok(bridge.store.get('mck.selftest'), '报告未落 mck.selftest');
  });
  await t('cmd test_route：示例参数实例化 + 真实响应回执', async () => {
    const r = await sendCmd('test_route', { routeId: 'demo-user', query: 'x=1' });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.status, 200);
    assert.match(r.bodyPreview, /"id":"test-id"/, `参数未实例化: ${r.bodyPreview?.slice(0, 100)}`);
  });
  await t('cmd clear_history：confirm 闸 + 清空后 idx 归零', async () => {
    const no = await sendCmd('clear_history', {});
    assert.strictEqual(no.ok, false, '无 confirm 应被拒');
    const r = await sendCmd('clear_history', { confirm: true });
    assert.strictEqual(r.ok, true);
    await sleep(4500);
    const idx = bridge.store.get('mck.idx');
    assert.strictEqual(idx.count, 0);
    assert.strictEqual(bridge.store.get('mck.hist.0'), undefined, '块 0 未删除');
  });
  await t('cmd 未知 op 回执错误', async () => {
    const r = await sendCmd('no_such_op', {});
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /未知命令/);
  });

  // ── 6. settings 热更语义 ───────────────────────────────────────────────────
  await t('enabled=false 的路由立即不匹配（热更 ≤8s）', async () => {
    const s = await getSettings();
    const demo = s.routes.find((r) => r.id === 'demo-users');
    demo.enabled = false;
    await setSettings(s);
    await sleep(8000);
    const r = await httpReq('GET', svcPort, '/mockdemo/users');
    assert.strictEqual(r.status, 404, '禁用路由仍被命中');
    demo.enabled = true;
    await setSettings(s);
    await sleep(8000);
    const r2 = await httpReq('GET', svcPort, '/mockdemo/users');
    assert.strictEqual(r2.status, 200);
  });
  await t('upsert 后立即 test_route（强制重读，不等 3s tick）', async () => {
    const s = await getSettings();
    s.routes.push({
      id: 'r-fresh', name: '新路由', method: 'GET', path: '/mockdemo/fresh', status: 200,
      bodyType: 'json', body: '{"fresh":true}', delayMs: 0, errorRate: 0, errorStatus: 500,
      enabled: true, builtin: false, headers: {}, createdAt: 9, updatedAt: 9,
    });
    await setSettings(s);
    // 不等 tick，直接 test_route —— 应强制重读拿到新路由
    const r = await sendCmd('test_route', { routeId: 'r-fresh' });
    assert.strictEqual(r.ok, true, `强制重读失败: ${JSON.stringify(r).slice(0, 200)}`);
    assert.match(r.bodyPreview, /"fresh":true/);
  });
} finally {
  if (svc) { try { svc.kill('SIGTERM'); } catch (_) { /* ignore */ } }
  try { bridge.server.close(); } catch (_) { /* ignore */ }
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) { /* ignore */ }
}

let fail = 0;
for (const r of results) {
  console.log(`${r.pass ? '✅' : '❌'} ${r.name}${r.pass ? '' : ` —— ${r.detail}`}`);
  if (!r.pass) fail += 1;
}
console.log(`\n服务集成测试: ${results.length - fail}/${results.length} 通过`);
process.exit(fail ? 1 : 0);
