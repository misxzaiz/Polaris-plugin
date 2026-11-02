#!/usr/bin/env node
/**
 * smoke-real.mjs —— 真桥冒烟：真实宿主（kv 心跳/历史落库）+ 真实服务子进程 + MCP 真子进程。
 * 前置：Polaris 宿主运行中。跑法：node test/smoke-real.mjs
 * 产物：少量 kv 读写（dfx.meta/dfx.history），结束自清理。
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const { resolveEndpoint, md5 } = require(join(root, 'service', 'kvclient.js'));

const PORT = 9877; // manifest 端口（真桥下 MCP 自发现应命中它）

let pass = 0;
const failures = [];
function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      pass++;
      console.log(`  ✓ ${name}`);
    })
    .catch((e) => {
      failures.push({ name, msg: e.message });
      console.log(`  ✗ ${name}\n    ${e.message}`);
    });
}
function ok(cond, label) {
  if (!cond) throw new Error(label || '断言失败');
}

/** 直连宿主 router-dispatch（真桥） */
function hostDispatch(ep, target, payload, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ req: { target, payload } });
    const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) };
    if (ep.token) headers.Authorization = `Bearer ${md5(ep.token)}`;
    const r = http.request(
      { hostname: ep.host, port: ep.port, path: '/api/router-dispatch', method: 'POST', headers, timeout: timeoutMs },
      (res) => {
        let body = '';
        res.on('data', (c) => { body += c; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            if (parsed && parsed.ok === true) resolve(parsed.result);
            else reject(new Error((parsed && parsed.error) || `dispatch 失败（HTTP ${res.statusCode}）`));
          } catch (e) {
            reject(new Error(`宿主返回非 JSON：${e.message}`));
          }
        });
      },
    );
    r.on('timeout', () => r.destroy(new Error('dispatch 超时')));
    r.on('error', reject);
    r.write(data);
    r.end();
  });
}

function svcReq(method, path, bodyObj, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const data = bodyObj === undefined ? '' : JSON.stringify(bodyObj);
    const r = http.request(
      {
        hostname: '127.0.0.1', port: PORT, path, method,
        headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {},
        timeout: timeoutMs,
      },
      (res) => {
        let body = '';
        res.on('data', (c) => { body += c; });
        res.on('end', () => resolve(JSON.parse(body)));
      },
    );
    r.on('timeout', () => r.destroy(new Error('service 请求超时')));
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
        const r = await svcReq('GET', '/__health', undefined, 1500);
        if (r.ok) return resolve(r.result);
      } catch (_) { /* 未起 */ }
      if (Date.now() - started > timeoutMs) return reject(new Error('服务健康检查超时'));
      setTimeout(poll, 300);
    };
    poll();
  });
}

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
  send(obj) { this.proc.stdin.write(JSON.stringify(obj) + '\n'); }
  next(timeoutMs = 20000) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('MCP 响应超时')), timeoutMs);
      this.waiters.push({ resolve: (v) => { clearTimeout(t); resolve(v); } });
    });
  }
  async call(name, args) {
    this.send({ jsonrpc: '2.0', id: Math.floor(Math.random() * 1e9), method: 'tools/call', params: { name, arguments: args || {} } });
    return (await this.next()).result;
  }
}

/* ---------- 主流程 ---------- */
const ep = await resolveEndpoint('');
console.log(`真桥端点：${ep.host}:${ep.port}（via ${ep.via}${ep.token ? ', authed' : ', noauth'}）`);
await hostDispatch(ep, 'cap.kv', { action: 'set', key: 'dfx.smoke-probe', value: { at: Date.now() } });
await hostDispatch(ep, 'cap.kv', { action: 'delete', key: 'dfx.smoke-probe' });
console.log('宿主 cap.kv 读写探针通过');

const tmp = mkdtempSync(join(tmpdir(), 'diff-desk-smoke-'));
// 真实 appConfigDir：与 kvclient 候选链一致的常见根
const os = await import('node:os');
let realConfigDir = '';
for (const cand of [
  process.env.APPDATA ? join(process.env.APPDATA, 'Polaris') : '',
  join(os.homedir(), '.config', 'Polaris'),
  join(os.homedir(), '.polaris'),
  'D:\\app\\polaris-s',
]) {
  if (cand && existsSync(join(cand, 'config.json'))) { realConfigDir = cand; break; }
}
console.log(`appConfigDir：${realConfigDir || '(未找到，退化为无桥模式)'}`);

// 9877 若已被占用（插件已安装常驻），复用它
let svc = null;
let reused = false;
try {
  const probe = await svcReq('GET', '/__health', undefined, 1500);
  if (probe.ok) reused = true;
} catch (_) { /* 空闲 */ }
if (!reused) {
  svc = spawn(process.execPath, [join(root, 'service', 'main.js'), String(PORT), realConfigDir || tmp], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  svc.stderr.on('data', () => { /* 静默 */ });
}
const mcp = spawn(process.execPath, [join(root, 'mcp', 'server.js'), realConfigDir || tmp], { stdio: ['pipe', 'pipe', 'pipe'] });
mcp.stderr.on('data', () => { /* 静默 */ });
const mcpClient = new McpClient(mcp);

const fa = join(tmp, 'before.json');
const fb = join(tmp, 'after.json');
writeFileSync(fa, JSON.stringify({ version: '1.0.0', db: { host: 'a', port: 5432 } }, null, 2));
writeFileSync(fb, JSON.stringify({ version: '1.1.0', db: { host: 'a', port: 5433 } }, null, 2));

try {
  await waitHealth();
  await test('服务健康（' + (reused ? '复用已驻留实例' : '本冒烟拉起') + '）', async () => {
    const r = await svcReq('GET', '/api/status');
    ok(r.ok && r.result.version === '0.1.0', JSON.stringify(r));
  });

  await test('心跳落真 kv：dfx.meta 可直读且端口一致', async () => {
    const meta = await hostDispatch(ep, 'cap.kv', { action: 'get', key: 'dfx.meta' });
    ok(meta && meta.value && meta.value.port === PORT, JSON.stringify(meta));
    ok(meta.value.pid > 0, 'pid');
  });

  mcpClient.send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
  await mcpClient.next();
  await test('MCP df_status（真自发现端口）', async () => {
    const r = await mcpClient.call('df_status');
    ok(!r.isError && r.content[0].text.includes('运行中'), r.content[0].text);
  });

  await test('MCP df_diff_files（真实文件语义对比）', async () => {
    const r = await mcpClient.call('df_diff_files', { aPath: fa, bPath: fb, mode: 'json' });
    ok(!r.isError, r.content[0].text);
    ok(r.content[0].text.includes('$.version') && r.content[0].text.includes('$.db.port'), r.content[0].text);
  });

  await test('REST 对比后 dfx.history 落真 kv', async () => {
    const r = await svcReq('POST', '/api/diff_text', { a: '{"x":1}', b: '{"x":2}', mode: 'json' });
    ok(r.ok, r.error || '');
    // 等镜像写完
    let found = false;
    for (let i = 0; i < 10 && !found; i++) {
      const h = await hostDispatch(ep, 'cap.kv', { action: 'get', key: 'dfx.history' });
      const items = h && h.value && Array.isArray(h.value.items) ? h.value.items : (Array.isArray(h && h.value) ? h.value : []);
      found = items.length > 0 && items.some((it) => it.kind === 'json');
      if (!found) await new Promise((res) => setTimeout(res, 400));
    }
    ok(found, 'dfx.history 应含本次对比（仅元数据）');
  });

  await test('MCP df_selftest 全绿', async () => {
    const r = await mcpClient.call('df_selftest');
    ok(!r.isError && r.content[0].text.includes('全部通过'), r.content[0].text.slice(-300));
  });

  await test('清理：history_clear + 服务收尾删 dfx.meta', async () => {
    const r = await svcReq('POST', '/api/history_clear');
    ok(r.ok, r.error || '');
    const h = await hostDispatch(ep, 'cap.kv', { action: 'get', key: 'dfx.history' });
    const empty = !h || !h.value || (Array.isArray(h.value) ? h.value.length === 0 : (h.value.items || []).length === 0);
    ok(empty, '历史应已清空');
  });
} finally {
  if (svc) {
    svc.kill();
    // 给服务 SIGTERM 收尾时间（删 dfx.meta）
    await new Promise((res) => setTimeout(res, 800));
  }
  try { mcp.kill(); } catch (_) { /* ignore */ }
  // meta 兜底清理
  try { await hostDispatch(ep, 'cap.kv', { action: 'delete', key: 'dfx.meta' }); } catch (_) { /* ignore */ }
  try { rmSync(tmp, { recursive: true, force: true }); } catch (_) { /* ignore */ }
  console.log(`\n通过 ${pass} 项，失败 ${failures.length} 项`);
  process.exit(failures.length ? 1 : 0);
}
