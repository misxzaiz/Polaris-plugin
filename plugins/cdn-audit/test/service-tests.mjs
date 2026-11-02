#!/usr/bin/env node
/**
 * service-tests.mjs —— 服务集成测试：真实子进程（REST + MCP stdio 全链路）。
 * 零外网纪律：网络路径只测围栏拒绝与 DNS 失败（.invalid 域），真实 CDN 抓取留给
 * smoke-real.mjs；核验管线全链路由 /api/selftest（本地夹具+注入权威）覆盖。
 * 跑法：node test/service-tests.mjs
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const PORT = 9891;

// 看门狗：任一环节挂起时强制退出（防 CI/本地悬挂）
setTimeout(() => {
  console.log('\nWATCHDOG: 集成测试超时（180s），强制退出');
  process.exit(2);
}, 180000);

let pass = 0;
const failures = [];
async function test(name, fn) {
  try {
    await fn();
    pass++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures.push({ name, msg: e.message });
    console.log(`  ✗ ${name}\n    ${e.message}`);
  }
}
function ok(cond, label) {
  if (!cond) throw new Error(label || '断言失败');
}
function eq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${label || 'eq'}：期望 ${b}，实际 ${a}`);
}

/* ---------- HTTP 小客户端 ---------- */
function req(method, path, bodyObj, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const data = bodyObj === undefined ? '' : JSON.stringify(bodyObj);
    const r = http.request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path,
        method,
        headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {},
        timeout: timeoutMs,
      },
      (res) => {
        let body = '';
        res.on('data', (c) => { body += c; });
        res.on('end', () => {
          try { resolve({ status: res.statusCode, json: JSON.parse(body) }); }
          catch (_) { resolve({ status: res.statusCode, raw: body.slice(0, 200) }); }
        });
      },
    );
    r.on('timeout', () => r.destroy(new Error('测试请求超时')));
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

function waitHealth(timeoutMs = 15000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        const r = await req('GET', '/__health', undefined, 1500);
        if (r.status === 200 && r.json && r.json.ok) return resolve(r.json);
      } catch (_) { /* 未起 */ }
      if (Date.now() - started > timeoutMs) return reject(new Error('服务健康检查超时'));
      setTimeout(poll, 300);
    };
    poll();
  });
}

/* ---------- MCP stdio 小客户端 ---------- */
class McpClient {
  constructor(proc) {
    this.proc = proc;
    this.buf = '';
    this.waiters = [];
    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', (chunk) => {
      this.buf += chunk;
      let idx;
      while ((idx = this.buf.indexOf('\n')) >= 0) {
        const line = this.buf.slice(0, idx).trim();
        this.buf = this.buf.slice(idx + 1);
        if (!line) continue;
        const w = this.waiters.shift();
        if (w) w.resolve(JSON.parse(line));
      }
    });
  }
  send(obj) {
    this.proc.stdin.write(JSON.stringify(obj) + '\n');
  }
  next(timeoutMs = 90000) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('MCP 响应超时')), timeoutMs);
      this.waiters.push({
        resolve: (v) => { clearTimeout(t); resolve(v); },
      });
    });
  }
  async initialize() {
    this.send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0' } } });
    return this.next();
  }
  async listTools() {
    this.send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
    return this.next();
  }
  async call(name, args) {
    this.send({ jsonrpc: '2.0', id: Math.floor(Math.random() * 1e9), method: 'tools/call', params: { name, arguments: args || {} } });
    const r = await this.next();
    return r.result;
  }
}

/* ---------- 内存假桥（cap.kv 协议）：真实验证 kvclient→宿主 dispatch 全链路 ---------- */
const BRIDGE_PORT = 18099;
const kvStore = new Map();
const bridge = http.createServer((req, res) => {
  if (req.method !== 'POST' || !req.url.startsWith('/api/router-dispatch')) { res.writeHead(404); res.end(); return; }
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    try {
      const { req: inner } = JSON.parse(body);
      const { target, payload } = inner || {};
      if (target !== 'cap.kv') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: `假桥仅支持 cap.kv，收到 ${target}` })); return; }
      let result = {};
      if (payload.action === 'get') result = { value: kvStore.has(payload.key) ? kvStore.get(payload.key) : null };
      else if (payload.action === 'set') { kvStore.set(payload.key, payload.value === undefined ? null : payload.value); }
      else if (payload.action === 'delete') { kvStore.delete(payload.key); }
      else if (payload.action === 'list') result = { keys: [...kvStore.keys()] };
      else { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: `未知 action ${payload.action}` })); return; }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, result }));
    } catch (e) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: String(e.message || e) }));
    }
  });
});

/* ---------- 起 service + MCP ---------- */
const tmp = mkdtempSync(join(tmpdir(), 'cdn-audit-test-'));
bridge.listen(BRIDGE_PORT, '127.0.0.1', () => { /* 假桥就绪 */ });
const svc = spawn(process.execPath, [join(root, 'service', 'main.js'), String(PORT), tmp], {
  env: { ...process.env, POLARIS_HOST: '127.0.0.1', POLARIS_PORT: String(BRIDGE_PORT) },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const svcErr = [];
svc.stderr.on('data', (c) => svcErr.push(String(c)));
const mcp = spawn(process.execPath, [join(root, 'mcp', 'server.js'), tmp], {
  env: { ...process.env, CDNAUDIT_PORT: String(PORT), POLARIS_HOST: '127.0.0.1', POLARIS_PORT: String(BRIDGE_PORT) },
  stdio: ['pipe', 'pipe', 'pipe'],
});
const mcpErr = [];
mcp.stderr.on('data', (c) => mcpErr.push(String(c)));
const mcpClient = new McpClient(mcp);

async function main() {
  await waitHealth();

  await test('健康端点与状态', async () => {
    const h = await req('GET', '/__health');
    ok(h.json.ok && h.json.version === '0.1.0', JSON.stringify(h.json));
    const s = await req('GET', '/api/status');
    ok(s.json.ok && s.json.result.port === PORT, JSON.stringify(s.json));
  });

  await test('settings 读写回环', async () => {
    const g0 = await req('GET', '/api/settings');
    ok(g0.json.ok && g0.json.result.timeoutMs === 15000, JSON.stringify(g0.json));
    ok(Array.isArray(g0.json.result.mirrors) && g0.json.result.mirrors.length >= 10, '镜像表非空');
    const s = await req('POST', '/api/settings_set', { timeoutMs: 8000, proxy: '127.0.0.1:7890', maxBytesMB: 10 });
    ok(s.json.ok && s.json.result.timeoutMs === 8000 && s.json.result.maxBytesMB === 10, JSON.stringify(s.json));
    // 越界值回默认
    const s2 = await req('POST', '/api/settings_set', { timeoutMs: 1, maxBytesMB: 9999, proxy: '' });
    ok(s2.json.ok && s2.json.result.timeoutMs === 15000, '越界回默认');
  });

  await test('check：围栏拒绝回环目标（公开通道）', async () => {
    const r = await req('POST', '/api/check', { mode: 'urls', urls: ['http://127.0.0.1:9/evil.js'] });
    ok(r.json.ok, r.json.error || '');
    const row = r.json.report.rows[0];
    ok(row.verdict === 'unreachable' && String(row.note).includes('回环'), JSON.stringify(row));
  });

  await test('check：URL 非法输入报人话错误', async () => {
    const r = await req('POST', '/api/check', { mode: 'urls', urls: [] });
    ok(!r.json.ok && r.json.error.includes('URL'), JSON.stringify(r.json));
    const r2 = await req('POST', '/api/check', { mode: 'urls', urls: ['不是网址'] });
    ok(!r2.json.ok, JSON.stringify(r2.json));
  });

  await test('check：DNS 失败资源判 unreachable 并落报告/历史', async () => {
    const r = await req('POST', '/api/check', { mode: 'urls', urls: ['https://cdn-audit-selftest.invalid/x.js'] });
    ok(r.json.ok, r.json.error || '');
    const rep = r.json.report;
    eq(rep.rows.length, 1, '行数');
    eq(rep.rows[0].verdict, 'unreachable', 'verdict');
    ok(rep.score.total >= 0 && rep.score.total < 100, `score=${rep.score.total}`);
    ok(rep.findings.some((f) => f.code === 'resource.unreachable'), JSON.stringify(rep.findings.map((f) => f.code)));
    const h = await req('GET', '/api/history');
    ok(h.json.ok && h.json.result.items.some((x) => x.runId === rep.runId), '历史含本次');
    const again = await req('POST', '/api/report', { id: rep.runId });
    ok(again.json.ok && again.json.result.runId === rep.runId, '按 id 取回');
  });

  await test('check：HTML 模式（含错误 integrity 属性）', async () => {
    const html = `<html><head>
      <script src="https://cdn-audit-selftest.invalid/lib@1.0.0/x.js" integrity="sha384-bad"></script>
      <script src="/local.js"></script>
      </head><body></body></html>`;
    const r = await req('POST', '/api/check', { mode: 'html', html });
    ok(r.json.ok, r.json.error || '');
    const rep = r.json.report;
    eq(rep.rows.length, 1, '仅外链入列');
    ok(rep.source.skipped && rep.source.skipped.relative === 1, JSON.stringify(rep.source));
    // 抓取失败（DNS .invalid）→ 无摘要可算，SRI 属性核对如实跳过（selftest 覆盖错值路径）
    ok(rep.rows[0].verdict === 'unreachable', JSON.stringify(rep.rows[0]));
    eq(rep.rows[0].sri, null, '无摘要时 SRI 核对为空');
  });

  await test('selftest：本地夹具全链路（一致/篡改/现场生成/SRI 错值/评分）', async () => {
    const r = await req('POST', '/api/selftest', {});
    ok(r.json.ok === true, JSON.stringify(r.json.items, null, 1).slice(0, 600));
    ok(Array.isArray(r.json.items) && r.json.items.every((x) => x.ok), JSON.stringify(r.json.items, null, 1).slice(0, 600));
  });

  await test('mirror：输入校验（未知主机/缺参数）', async () => {
    const r = await req('POST', '/api/mirror', { url: 'https://evil-cdn.example.com/npm/a@1/b.js' });
    ok(!r.json.ok && r.json.error.includes('镜像'), JSON.stringify(r.json));
    const r2 = await req('POST', '/api/mirror', {});
    ok(!r2.json.ok, JSON.stringify(r2.json));
  });

  await test('sri：输入校验与错误传播', async () => {
    const r = await req('POST', '/api/sri', { url: 'http://127.0.0.1:1/x.js' });
    ok(!r.json.ok && String(r.json.error).includes('回环'), JSON.stringify(r.json));
    const r2 = await req('POST', '/api/sri', { url: 'https://cdn-audit-selftest.invalid/y.js' });
    ok(!r2.json.ok && String(r2.json.error).includes('抓取失败'), JSON.stringify(r2.json));
  });

  await test('purge：非 jsDelivr 域名拒绝', async () => {
    const r = await req('POST', '/api/purge', { url: 'https://unpkg.com/a@1/b.js' });
    ok(!r.json.ok && r.json.error.includes('jsDelivr'), JSON.stringify(r.json));
  });

  await test('watch：建立→采样（DNS 失败样本）→取消→删除', async () => {
    const c = await req('POST', '/api/watch', {
      originUrl: 'https://cdn-audit-invalid.example/origin.js',
      edgeUrl: 'https://cdn-audit-invalid.example/edge.js',
      intervalSec: 5, maxMinutes: 1,
    });
    ok(c.json.ok, c.json.error || '');
    const id = c.json.id;
    ok(id && id.startsWith('w'), 'id 形态');
    // 等首轮采样（tick 1.5s + DNS 快速失败）
    let got = null;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const g = await req('GET', `/api/watch_get?id=${id}`);
      if (g.json.ok && g.json.result.samples.length > 0) { got = g.json.result; break; }
    }
    ok(got, '未在 10s 内取到样本');
    ok(got.samples[0].equal === false, JSON.stringify(got.samples[0]));
    ok(got.status === 'running', `status=${got.status}`);
    const cx = await req('POST', '/api/watch_cancel', { id });
    ok(cx.json.ok && cx.json.watch.status === 'cancelled', JSON.stringify(cx.json));
    const del = await req('POST', '/api/watch_delete', { id });
    ok(del.json.ok, JSON.stringify(del.json));
    const g2 = await req('GET', `/api/watch_get?id=${id}`);
    ok(!g2.json.ok, '删除后不可见');
  });

  await test('watch：回环目标建立被拒', async () => {
    const r = await req('POST', '/api/watch', { originUrl: 'http://127.0.0.1:1/a', edgeUrl: 'http://127.0.0.1:1/b' });
    ok(!r.json.ok && String(r.json.error).includes('回环'), JSON.stringify(r.json));
  });

  await test('MCP：initialize + tools/list（8 工具）', async () => {
    const init = await mcpClient.initialize();
    ok(init.result && init.result.serverInfo.name === 'cdn-audit', JSON.stringify(init).slice(0, 200));
    mcpClient.send({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
    const list = await mcpClient.listTools();
    const names = list.result.tools.map((t) => t.name);
    eq(names, ['cda_check', 'cda_mirror', 'cda_sri', 'cda_watch', 'cda_watch_status', 'cda_report', 'cda_history', 'cda_selftest'], '工具清单');
  });

  await test('MCP：cda_selftest 全链路', async () => {
    const r = await mcpClient.call('cda_selftest', {});
    ok(r && r.isError === false, JSON.stringify(r).slice(0, 300));
    const text = r.content[0].text;
    ok(text.includes('全绿'), text.slice(0, 400));
  });

  await test('MCP：cda_check（围栏拒绝路径）+ cda_history', async () => {
    const r = await mcpClient.call('cda_check', { urls: ['http://127.0.0.1:9/evil.js'] });
    const text = r.content[0].text;
    ok(text.includes('不可达') || text.includes('回环'), text.slice(0, 300));
    const h = await mcpClient.call('cda_history', {});
    ok(h.content[0].text.includes('体检') || h.content[0].text.includes('尚无'), h.content[0].text.slice(0, 200));
  });

  await test('MCP：未知工具报错', async () => {
    const r = await mcpClient.call('cda_nope', {});
    ok(r && r.isError === true && r.content[0].text.includes('未知工具'), JSON.stringify(r));
  });

  await test('404 与未知端点', async () => {
    const nf = await req('GET', '/nothing');
    ok(nf.status === 404, `status=${nf.status}`);
    const unk = await req('GET', '/api/nope');
    ok(unk.json.ok === false, JSON.stringify(unk.json));
  });
}

main()
  .catch((e) => { failures.push({ name: '（主流程）', msg: e.message }); })
  .finally(() => {
    try { mcp.kill(); } catch (_) { /* 忽略 */ }
    try { svc.kill(); } catch (_) { /* 忽略 */ }
    try { bridge.close(); } catch (_) { /* 忽略 */ }
    setTimeout(() => {
      try { rmSync(tmp, { recursive: true, force: true }); } catch (_) { /* 忽略 */ }
      console.log(`\n${pass}/${pass + failures.length} 通过`);
      if (failures.length) {
        console.log('失败清单：');
        for (const f of failures) console.log(`  ✗ ${f.name}: ${f.msg}`);
        if (svcErr.length) console.log('--- service stderr 尾部 ---\n' + svcErr.join('').slice(-2000));
        if (mcpErr.length) console.log('--- mcp stderr 尾部 ---\n' + mcpErr.join('').slice(-1200));
        process.exit(1);
      }
      process.exit(0);
    }, 300);
  });
