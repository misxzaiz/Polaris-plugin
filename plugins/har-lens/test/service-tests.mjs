/**
 * 服务集成测试（内存假 kv 桥 + 真实服务子进程）：node test/service-tests.mjs
 *
 * 链路：spawn service/main.js（env 指向内存假桥，端口 0 随机）→
 *   1. /__health 200 + har.meta 落桥（端口/心跳就绪）
 *   2. cmd open：fixture 文件真实解析 → report/rows.idx/rows.0 落桥 + 行 URL 已脱敏
 *   3. 护栏：非 .har 扩展拒绝 / 文件不存在拒绝 / 坏 JSON 报错且 meta.state=error
 *   4. cmd entry：详情无明文密钥（掩码）；越界拒绝
 *   5. cmd sanitize：预检不写盘 → confirm 落盘 sha256+复核 valid+无明文 → 重复导出拒（须 overwrite）
 *   6. cmd compare：第二份 fixture（变慢+翻转）→ har.diff 落桥 summary
 *   7. cmd selftest：试金石全绿（报告落 har.selftest）
 *   8. settings 热更：har.settings bodies:false → sanitize 预检 options 反映
 * 退出码 0=全绿；临时进程/文件自清理。
 */
import assert from 'node:assert';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const core = (await import('../shared/core.js')).default ?? (await import('../shared/core.js'));

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
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'har-lens-test-'));
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
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const meta = bridge.store.get('har.meta');
    if (meta && meta.port) { svcPort = meta.port; return; }
    await sleep(300);
  }
  throw new Error(`服务未上线（meta 无端口）\n${errTail}`);
}

async function sendCmd(op, payload = {}, timeoutMs = 30000) {
  const nonce = `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  await httpReq('POST', bridge.port, '/api/router-dispatch', {
    body: { req: { target: 'cap.kv', payload: { action: 'set', key: 'har.cmd', value: { op, nonce, ...payload, at: Date.now() } } } },
  });
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = bridge.store.get('har.result');
    if (r && r.nonce === nonce) return r;
    await sleep(300);
  }
  throw new Error(`命令 ${op} 超时无回执`);
}

async function kvSet(key, value) {
  await httpReq('POST', bridge.port, '/api/router-dispatch', {
    body: { req: { target: 'cap.kv', payload: { action: 'set', key, value } } },
  });
}

// fixture 文件（真实落盘再打开，链路完整）
const fixture = core.makeFixtureHar();
const fixturePath = path.join(tmpDir, 'trace.har');
fs.writeFileSync(fixturePath, JSON.stringify(fixture));
const badJsonPath = path.join(tmpDir, 'broken.har');
fs.writeFileSync(badJsonPath, '{"log": {"version": "1.2", "entri');
const txtPath = path.join(tmpDir, 'notes.txt');
fs.writeFileSync(txtPath, 'not a har');

try {
  await startService();

  // ── 1. 健康 + meta ─────────────────────────────────────────────────────────
  await t('健康端点 200 + har.meta 落桥（端口/心跳）', async () => {
    const h = await httpReq('GET', svcPort, '/__health');
    assert.strictEqual(h.status, 200);
    const j = JSON.parse(h.text);
    assert.strictEqual(j.ok, true);
    const meta = bridge.store.get('har.meta');
    assert.ok(meta && meta.port === svcPort, `meta.port=${meta && meta.port}`);
    assert.strictEqual(meta.state, 'idle');
  });
  await t('无数据面 API：非 /__health 路径 404', async () => {
    const r = await httpReq('GET', svcPort, '/api/whatever');
    assert.strictEqual(r.status, 404);
  });

  // ── 2. open 全链路 ─────────────────────────────────────────────────────────
  await t('open：真实文件解析 → report/rows 投影落桥 + URL 已脱敏', async () => {
    const r = await sendCmd('open', { path: fixturePath });
    assert.strictEqual(r.ok, true, r.error || '');
    assert.strictEqual(r.entryCount, 6);
    const rep = bridge.store.get('har.report');
    assert.ok(rep && rep.entryCount === 6 && rep.path === fixturePath);
    const idx = bridge.store.get('har.rows.idx');
    assert.ok(idx && idx.count === 6 && idx.chunkCount === 1, JSON.stringify(idx));
    const rows = bridge.store.get('har.rows.0');
    assert.ok(Array.isArray(rows) && rows.length === 6);
    assert.ok(rows[0].u.includes('access_token=‹'), `投影 URL 未脱敏: ${rows[0].u}`);
    assert.ok(!JSON.stringify(rows).includes('SECRET123'), '投影行泄露明文 token');
    const meta = bridge.store.get('har.meta');
    assert.strictEqual(meta.state, 'ready');
  });
  await t('open 后审计报告自动落桥（无明文密钥）', async () => {
    const audit = bridge.store.get('har.audit');
    assert.ok(audit && Array.isArray(audit.findings) && audit.findings.length >= 4, `findings=${audit && audit.findings.length}`);
    assert.ok(!JSON.stringify(audit).includes('SECRET123'));
  });
  await t('open 历史落桥', async () => {
    const hist = bridge.store.get('har.hist');
    assert.ok(Array.isArray(hist) && hist.some((h) => h.path === fixturePath));
  });

  // ── 3. 护栏 ────────────────────────────────────────────────────────────────
  await t('护栏：非 .har 扩展拒绝', async () => {
    const r = await sendCmd('open', { path: txtPath });
    assert.strictEqual(r.ok, false);
    assert.ok(r.error.includes('.har'), r.error);
  });
  await t('护栏：文件不存在拒绝', async () => {
    const r = await sendCmd('open', { path: path.join(tmpDir, 'nope.har') });
    assert.strictEqual(r.ok, false);
    assert.ok(r.error.includes('不存在'), r.error);
  });
  await t('护栏：坏 JSON 报错；已就绪分析不受影响（state 保持 ready + error 留痕）', async () => {
    const r = await sendCmd('open', { path: badJsonPath });
    assert.strictEqual(r.ok, false);
    assert.ok(r.error.includes('JSON'), r.error);
    const meta = bridge.store.get('har.meta');
    assert.strictEqual(meta.state, 'ready', `坏打开不应清掉已就绪分析: ${meta.state}`);
    assert.ok(meta.error.includes('JSON'), meta.error);
  });

  // 重新打开好的 fixture 供后续测试
  await sendCmd('open', { path: fixturePath });

  // ── 4. entry 详情 ──────────────────────────────────────────────────────────
  await t('entry：详情掩码完整（密码/cookie/token 均无明文）', async () => {
    const r = await sendCmd('entry', { index: 1 });
    assert.strictEqual(r.ok, true, r.error || '');
    const s = JSON.stringify(r.entry);
    for (const secret of ['hunter2', 'session=abc123', 'eyJhbGciOiJIUzI1NiJ9']) {
      assert.ok(!s.includes(secret), `详情泄露 ${secret}`);
    }
    assert.strictEqual(r.entry.method, 'POST');
    assert.strictEqual(r.entry.status, 200);
  });
  await t('entry：越界/非法 index 拒绝', async () => {
    const r1 = await sendCmd('entry', { index: 99 });
    assert.strictEqual(r1.ok, false);
    const r2 = await sendCmd('entry', { index: -1 });
    assert.strictEqual(r2.ok, false);
    const r3 = await sendCmd('entry', {});
    assert.strictEqual(r3.ok, false);
  });

  // ── 5. sanitize ────────────────────────────────────────────────────────────
  await t('sanitize 预检：不写盘 + 报告目标路径', async () => {
    const r = await sendCmd('sanitize', {});
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.preview, true);
    assert.ok(r.outputPath.endsWith('trace.sanitized.har'), r.outputPath);
    assert.ok(!fs.existsSync(r.outputPath), '预检不应写盘');
  });
  await t('sanitize confirm：落盘 + sha256 + 复核 valid + 无明文密钥', async () => {
    const r = await sendCmd('sanitize', { confirm: true });
    assert.strictEqual(r.ok, true, r.error || '');
    assert.ok(fs.existsSync(r.outputPath));
    assert.ok(r.recheck && r.recheck.valid === true, JSON.stringify(r.recheck));
    assert.ok(r.recheck.auditTotal === 0, `复核审计应归零: ${r.recheck && r.recheck.auditTotal}`);
    assert.match(r.sha256, /^[0-9a-f]{64}$/);
    const out = fs.readFileSync(r.outputPath, 'utf8');
    for (const secret of ['SECRET123', 'hunter2', 'sk-proj-', 's3cret']) {
      assert.ok(!out.includes(secret), `导出文件泄露 ${secret}`);
    }
  });
  await t('sanitize 重复导出：已存在拒收（须 overwrite）', async () => {
    const r = await sendCmd('sanitize', { confirm: true });
    assert.strictEqual(r.ok, false);
    assert.ok(r.error.includes('overwrite'), r.error);
    const r2 = await sendCmd('sanitize', { confirm: true, overwrite: true });
    assert.strictEqual(r2.ok, true);
  });

  // ── 6. compare ─────────────────────────────────────────────────────────────
  await t('compare：变慢/翻转/新增检出 + har.diff 落桥', async () => {
    const f2 = JSON.parse(JSON.stringify(fixture));
    f2.log.entries[4].time = 2400;
    f2.log.entries[5].response.status = 503;
    const cmpPath = path.join(tmpDir, 'after.har');
    fs.writeFileSync(cmpPath, JSON.stringify(f2));
    const r = await sendCmd('compare', { path: cmpPath });
    assert.strictEqual(r.ok, true, r.error || '');
    assert.ok(r.summary.slowerCount >= 1, JSON.stringify(r.summary));
    assert.ok(r.summary.flips >= 1);
    const diff = bridge.store.get('har.diff');
    assert.ok(diff && diff.summary && diff.candPath === cmpPath);
    assert.ok(!JSON.stringify(diff).includes('SECRET123'), 'diff 投影泄露明文');
  });
  await t('compare：坏文件拒绝', async () => {
    const r = await sendCmd('compare', { path: badJsonPath });
    assert.strictEqual(r.ok, false);
  });

  // ── 7. selftest ────────────────────────────────────────────────────────────
  await t('selftest：试金石全绿（报告落 har.selftest）', async () => {
    const r = await sendCmd('selftest', {}, 45000);
    assert.strictEqual(r.ok, true, JSON.stringify(r.report && r.report.checks.filter((c) => !c.pass)));
    const rep = bridge.store.get('har.selftest');
    assert.ok(rep && rep.allGreen === true && rep.passed === rep.total);
  });

  // ── 8. settings 热更 ───────────────────────────────────────────────────────
  await t('settings 热更：bodies:false → sanitize 预检 options 反映', async () => {
    await kvSet('har.settings', { sanitize: { bodies: false } });
    await sleep(1600); // tick 1s + 裕量
    const r = await sendCmd('sanitize', {});
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.options.bodies, false, JSON.stringify(r.options));
    assert.strictEqual(r.options.authHeaders, true, '缺省其余应保持全开');
  });

  // ── 9. 防重放 ──────────────────────────────────────────────────────────────
  await t('命令信箱防重放：同 nonce 残留被清不重复执行', async () => {
    const nonce = 'replay-test-1';
    await kvSet('har.cmd', { op: 'entry', index: 0, nonce, at: Date.now() });
    await sleep(2500); // 等消费 + 清残留
    assert.ok(!bridge.store.has('har.cmd'), 'cmd 键应被清掉');
  });
} catch (e) {
  results.push({ name: '(测试夹具异常)', pass: false, detail: e.message });
} finally {
  try { if (svc) svc.kill(); } catch (_) { /* ignore */ }
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) { /* ignore */ }
  bridge.server.close();
}

const failed = results.filter((r) => !r.pass);
for (const r of results) console.log(`${r.pass ? '✅' : '❌'} ${r.name}${r.pass ? '' : ` —— ${r.detail}`}`);
console.log(`\n服务集成: ${results.length - failed.length}/${results.length} 通过`);
process.exit(failed.length ? 1 : 0);
