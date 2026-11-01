/**
 * mcp-bridge.mjs —— mcp-probe 全链路集成测试（内存桥）
 *
 * 拓扑（对照 yizhou test/mcp-bridge.mjs 的内存桥套路）：
 *   stub 宿主桥（Map 版 cap.kv + cap.mcp 桩） ← kvclient/env —— service/probe.js（真服务）
 *                                                    ↑ HTTP（probe.meta 自发现）
 *                                             mcp/server.js（真 AI 工具层，stdio JSON-RPC）
 *                                                    ↑ /api/*
 *   假 stdio MCP 服务器 / 假 streamable HTTP MCP 服务器
 *
 * 运行：node test/mcp-bridge.mjs
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.join(__dirname, '..');
const TOKEN = 'test-token';
const TOKEN_MD5 = crypto.createHash('md5').update(TOKEN).digest('hex');

let pass = 0;
let fail = 0;
const failures = [];
function t(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { pass += 1; })
    .catch((e) => {
      fail += 1;
      failures.push(`${name}: ${e.message}`);
      console.error(`✗ ${name}\n  ${e.message}`);
    });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function freePort() {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

/* ---------------- stub 宿主桥 ---------------- */

function startStubBridge() {
  const kv = new Map();
  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (req.method !== 'POST' || req.url !== '/api/router-dispatch') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'not found' }));
      return;
    }
    const auth = req.headers.authorization || '';
    if (auth !== `Bearer ${TOKEN_MD5}`) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: '未授权' }));
      return;
    }
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      let payload;
      try { payload = JSON.parse(body); } catch (_) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'bad json' }));
        return;
      }
      const { target } = payload.req || {};
      const p = (payload.req || {}).payload || {};
      if (target === 'cap.kv') {
        if (p.action === 'get') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, result: { value: kv.has(p.key) ? kv.get(p.key) : null } }));
        } else if (p.action === 'set') {
          kv.set(p.key, p.value);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, result: { ok: true } }));
        } else if (p.action === 'delete') {
          kv.delete(p.key);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, result: { ok: true } }));
        } else if (p.action === 'list') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, result: { keys: Array.from(kv.keys()) } }));
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: `未知 kv action ${p.action}` }));
        }
        return;
      }
      if (target === 'cap.mcp') {
        if (p.action === 'list_plugin_tools') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            ok: true,
            result: {
              servers: [{
                pluginId: 'fake-plugin',
                server: 'fake-server',
                injected: 'injected',
                toolGates: null,
                tools: [
                  { name: 'stub_tool', description: '桩工具，用于验证 cap.mcp 代理调用链路。', inputSchema: { type: 'object', properties: {} } },
                  { name: 'lazy_tool', inputSchema: { type: 'object', properties: {} } },
                ],
              }],
            },
          }));
        } else if (p.action === 'call') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, result: { resultJson: `stub-result: ${p.tool} ${JSON.stringify(p.arguments || {})}` } }));
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: `未知 mcp action ${p.action}` }));
        }
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: `未知 target ${target}` }));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, kv }));
  });
}

/* ---------------- HTTP 小工具 ---------------- */

function svcRequest(port, method, route, body, token) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (data) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = Buffer.byteLength(data); }
    const req = http.request({ hostname: '127.0.0.1', port, path: route, method, headers, timeout: 60000 }, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, json: JSON.parse(buf) }); } catch (e) { reject(new Error(`非 JSON: ${buf.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('request timeout')));
    if (data) req.write(data);
    req.end();
  });
}

/* ---------------- MCP 工具层 stdio 客户端 ---------------- */

class McpToolClient {
  constructor() {
    this.child = null;
    this.buffer = '';
    this.pending = new Map();
    this.nextId = 0;
  }

  start(appConfigDir) {
    this.child = spawn(process.execPath, [path.join(PLUGIN_ROOT, 'mcp', 'server.js'), appConfigDir], {
      env: { ...process.env, POLARIS_HOST: '127.0.0.1', POLARIS_PORT: String(BRIDGE.port), POLARIS_TOKEN: TOKEN },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', (chunk) => {
      this.buffer += chunk;
      let idx;
      // eslint-disable-next-line no-cond-assign
      while ((idx = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, idx).trim();
        this.buffer = this.buffer.slice(idx + 1);
        if (!line) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.id !== undefined && this.pending.has(msg.id)) {
            const p = this.pending.get(msg.id);
            this.pending.delete(msg.id);
            clearTimeout(p.timer);
            p.resolve(msg);
          }
        } catch (_) { /* 忽略 */ }
      }
    });
    this.child.stderr.on('data', () => { /* 日志放行 */ });
    return this.rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'bridge-test', version: '0.0.0' } });
  }

  rpc(method, params, timeoutMs = 60000) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`rpc 超时: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  }

  callTool(name, args, timeoutMs = 60000) {
    return this.rpc('tools/call', { name, arguments: args || {} }, timeoutMs).then((r) => {
      if (r.error) throw new Error(`tools/call 协议错误: ${r.error.message}`);
      const out = r.result;
      const text = out && out.content && out.content[0] ? out.content[0].text : '';
      return { text, isError: !!(out && out.isError) };
    });
  }

  async stop() {
    if (!this.child) return;
    const c = this.child;
    this.child = null;
    c.kill();
    await sleep(200);
    try { c.kill('SIGKILL'); } catch (_) { /* ignore */ }
  }
}

/* ---------------- 主流程 ---------------- */

const BRIDGE = await startStubBridge();
const SVC_PORT = await freePort();
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-probe-test-'));
const fixtureWs = path.join(tmpDir, 'ws');
fs.mkdirSync(path.join(fixtureWs, '.claude'), { recursive: true });
fs.writeFileSync(path.join(fixtureWs, '.mcp.json'), JSON.stringify({
  mcpServers: { 'fixture-stdio': { command: 'node', args: [path.join(__dirname, 'fake-mcp-server.js')] } },
}, null, 2));

const children = [];
const svcEnv = {
  ...process.env,
  POLARIS_HOST: '127.0.0.1',
  POLARIS_PORT: String(BRIDGE.port),
  POLARIS_TOKEN: TOKEN,
};
const svc = spawn(process.execPath, [path.join(PLUGIN_ROOT, 'service', 'probe.js'), String(SVC_PORT), tmpDir], { env: svcEnv, stdio: ['ignore', 'pipe', 'pipe'] });
children.push(svc);

async function waitHealth(timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const r = await svcRequest(SVC_PORT, 'GET', '/__health', undefined, undefined);
      if (r.status === 200 && r.json.ok) return r.json;
    } catch (_) { /* 未起 */ }
    if (Date.now() > deadline) throw new Error('服务健康检查超时');
    await sleep(300);
  }
}

const tools = new McpToolClient();
children.push(tools.child);

let profile1 = '';
let profile2 = '';
let httpProfile = '';
let importedId = '';

try {
  const health = await waitHealth();
  const httpPort = await freePort();
  const httpSrv = spawn(process.execPath, [path.join(__dirname, 'fake-http-mcp.js'), String(httpPort)], { stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(httpSrv);
  await sleep(500);

  await t('health: 服务探针恒 200 且带版本', () => {
    assert.equal(health.ok, true);
    assert.equal(health.service, 'mcp-probe');
  });

  await t('安全: 无 token 访问 /api/state → 401', async () => {
    const r = await svcRequest(SVC_PORT, 'GET', '/api/state', undefined, undefined);
    assert.equal(r.status, 401);
  });

  await t('meta: 服务自注册 probe.meta（端口+token）', () => {
    const meta = BRIDGE.kv.get('probe.meta');
    assert.ok(meta, 'probe.meta 应存在');
    assert.equal(meta.port, SVC_PORT);
    assert.equal(meta.pid, svc.pid);
    assert.ok(meta.token, 'token 应存在');
  });

  await t('MCP: initialize 握手', async () => {
    const r = await tools.start(tmpDir);
    assert.equal(r.result.serverInfo.name, 'polaris-mcp-probe');
  });

  await t('MCP: tools/list 返回 7 个 probe_* 工具', async () => {
    const r = await tools.rpc('tools/list');
    const names = r.result.tools.map((x) => x.name);
    assert.equal(names.length, 7);
    for (const expect of ['probe_list_servers', 'probe_connect', 'probe_call_tool', 'probe_health_check', 'probe_diff_tools', 'probe_recent_calls', 'probe_scan_claude_configs']) {
      assert.ok(names.includes(expect), `缺工具 ${expect}`);
    }
  });

  await t('工具: probe_list_servers 展示宿主插件 + 空档案', async () => {
    const { text } = await tools.callTool('probe_list_servers');
    assert.ok(text.includes('host:fake-server'), `应含宿主 server: ${text.slice(0, 300)}`);
    assert.ok(text.includes('stub_tool'));
    assert.ok(text.includes('外部服务器档案'));
  });

  await t('服务: 建 stdio 档案', async () => {
    const r = await svcRequest(SVC_PORT, 'POST', '/api/profiles/save', {
      name: 'fake-stdio', transport: 'stdio', command: process.execPath, args: [path.join(__dirname, 'fake-mcp-server.js')], timeoutMs: 15000,
    }, BRIDGE.kv.get('probe.meta').token);
    assert.equal(r.json.ok, true);
    profile1 = r.json.profile.id;
    assert.ok(profile1);
  });

  await t('工具: probe_connect 连接假 stdio 服务器并列 4 工具', async () => {
    const { text } = await tools.callTool('probe_connect', { serverId: profile1 });
    assert.ok(text.includes('fake-stdio-mcp'), text.slice(0, 300));
    assert.ok(text.includes('echo') && text.includes('add') && text.includes('no_desc'));
  });

  await t('工具: probe_call_tool echo 往返（中文参数）', async () => {
    const { text, isError } = await tools.callTool('probe_call_tool', { serverId: profile1, tool: 'echo', arguments: { text: '你好世界' } });
    assert.equal(isError, false);
    assert.ok(text.includes('echo: 你好世界'), text.slice(0, 300));
  });

  await t('工具: probe_call_tool 未知工具 → 失败语义', async () => {
    const { text, isError } = await tools.callTool('probe_call_tool', { serverId: profile1, tool: 'no_such_tool', arguments: {} });
    assert.equal(isError, true);
    assert.ok(text.startsWith('【失败】'), text.slice(0, 200));
  });

  await t('服务: 调用历史已落 kv（含 via=ai）', () => {
    const hist = BRIDGE.kv.get('probe.history');
    assert.ok(hist && Array.isArray(hist.calls) && hist.calls.length >= 2, '应至少 2 条（成功+失败）');
    const okCall = hist.calls.find((c) => c.tool === 'echo');
    assert.ok(okCall, '应有 echo 调用');
    assert.equal(okCall.via, 'ai');
    assert.equal(okCall.serverId, profile1);
  });

  await t('超时边界: 慢工具触发超时并拒绝（poisoned 连接被杀）', async () => {
    const r = await svcRequest(SVC_PORT, 'POST', '/api/profiles/save', {
      name: 'fake-stdio-slow', transport: 'stdio', command: process.execPath, args: [path.join(__dirname, 'fake-mcp-server.js')], timeoutMs: 800,
    }, BRIDGE.kv.get('probe.meta').token);
    profile2 = r.json.profile.id;
    const { text, isError } = await tools.callTool('probe_call_tool', { serverId: profile2, tool: 'slow', arguments: {} }, 30000);
    assert.equal(isError, true);
    assert.ok(text.includes('超时'), text.slice(0, 200));
  });

  await t('工具: probe_health_check 单档案 → 通过且检出 no_desc', async () => {
    const { text } = await tools.callTool('probe_health_check', { serverId: profile1 });
    assert.ok(text.includes('✓ 通过'), text.slice(0, 400));
    assert.ok(text.includes('no_desc'));
    assert.ok(text.includes('缺少 description'));
  });

  await t('工具: probe_health_check 全量 → 至少 2 份外部报告', async () => {
    const { text } = await tools.callTool('probe_health_check', {});
    assert.ok((text.match(/## /g) || []).length >= 2, text.slice(0, 500));
  });

  await t('工具: probe_health_check 宿主 server → 清单级体检', async () => {
    const { text } = await tools.callTool('probe_health_check', { serverId: 'host:fake-server' });
    assert.ok(text.includes('cap.mcp'), text.slice(0, 300));
    assert.ok(text.includes('lazy_tool') || text.includes('缺少 description'));
  });

  await t('工具: probe_diff_tools 首次拍基准快照', async () => {
    const { text } = await tools.callTool('probe_diff_tools', { serverId: profile1 });
    assert.ok(text.includes('首个快照'), text.slice(0, 300));
  });

  await t('工具: probe_diff_tools 第二次对比 → 无漂移', async () => {
    const { text } = await tools.callTool('probe_diff_tools', { serverId: profile1 });
    assert.ok(text.includes('不变 4'), text.slice(0, 300));
    assert.ok(text.includes('新增 0'));
  });

  await t('工具: probe_recent_calls 返回历史', async () => {
    const { text } = await tools.callTool('probe_recent_calls', { limit: 10 });
    assert.ok(text.includes('echo'), text.slice(0, 300));
    assert.ok(text.includes('via=ai'));
  });

  await t('工具: probe_call_tool 走宿主 cap.mcp 代理', async () => {
    const { text, isError } = await tools.callTool('probe_call_tool', { serverId: 'host:fake-server', tool: 'stub_tool', arguments: { k: 1 } });
    assert.equal(isError, false);
    assert.ok(text.includes('stub-result: stub_tool'), text.slice(0, 300));
  });

  await t('安全: serverId 引用不存在档案 → 明确报错', async () => {
    const { text, isError } = await tools.callTool('probe_call_tool', { serverId: 'srv-nothing', tool: 'x', arguments: {} });
    assert.equal(isError, true);
    assert.ok(text.includes('未找到档案') || text.includes('未注册'), text.slice(0, 200));
  });

  await t('工具: probe_scan_claude_configs 扫描 fixture 工作区', async () => {
    const { text } = await tools.callTool('probe_scan_claude_configs', { workspace: fixtureWs, scopes: ['project'] });
    assert.ok(text.includes('fixture-stdio'), text.slice(0, 300));
  });

  await t('工具: probe_scan_claude_configs apply 导入为档案', async () => {
    const { text } = await tools.callTool('probe_scan_claude_configs', { workspace: fixtureWs, scopes: ['project'], apply: true });
    assert.ok(text.includes('已导入 1 个'), text.slice(0, 300));
    const profiles = BRIDGE.kv.get('probe.profiles');
    const imported = profiles.servers.find((p) => p.name === 'fixture-stdio');
    assert.ok(imported, '导入档案应落库');
    importedId = imported.id;
    assert.equal(imported.origin, 'claude-import');
    assert.equal(imported.transport, 'stdio');
  });

  await t('HTTP 传输: 连接 streamable HTTP 假服务器（会话头）', async () => {
    const r = await svcRequest(SVC_PORT, 'POST', '/api/profiles/save', {
      name: 'fake-http', transport: 'http', url: `http://127.0.0.1:${httpPort}/mcp`, timeoutMs: 10000,
    }, BRIDGE.kv.get('probe.meta').token);
    httpProfile = r.json.profile.id;
    const { text } = await tools.callTool('probe_connect', { serverId: httpProfile });
    assert.ok(text.includes('fake-http-mcp'), text.slice(0, 300));
    assert.ok(text.includes('hello'));
  });

  await t('HTTP 传输: 调用 hello 工具', async () => {
    const { text } = await tools.callTool('probe_call_tool', { serverId: httpProfile, tool: 'hello', arguments: { who: '世界' } });
    assert.ok(text.includes('hello, 世界'), text.slice(0, 300));
  });

  await t('HTTP 传输: 断开触发会话 DELETE 清理', async () => {
    await svcRequest(SVC_PORT, 'POST', '/api/disconnect', { serverId: httpProfile }, BRIDGE.kv.get('probe.meta').token);
    await sleep(300);
    const stats = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${httpPort}/__stats`, (res) => {
        let b = '';
        res.on('data', (c) => { b += c; });
        res.on('end', () => resolve(JSON.parse(b)));
      }).on('error', reject);
    });
    assert.equal(stats.deleted, 1, '应收到 1 次 DELETE 会话清理');
  });

  await t('面板视角: /api/state 池与档案就绪', async () => {
    const r = await svcRequest(SVC_PORT, 'GET', '/api/state', undefined, BRIDGE.kv.get('probe.meta').token);
    assert.equal(r.json.ok, true);
    assert.ok(r.json.profiles.length >= 3);
    assert.ok(r.json.counts.history >= 3);
    const p = r.json.profiles.find((x) => x.id === profile1);
    assert.ok(p, '档案应在列');
  });

  await t('档案删除: 删除导入档案与 HTTP 档案', async () => {
    const token = BRIDGE.kv.get('probe.meta').token;
    for (const id of [importedId, httpProfile]) {
      // eslint-disable-next-line no-await-in-loop
      const r = await svcRequest(SVC_PORT, 'POST', '/api/profiles/delete', { id }, token);
      assert.equal(r.json.ok, true);
    }
    const st = await svcRequest(SVC_PORT, 'GET', '/api/state', undefined, token);
    assert.equal(st.json.profiles.length, 2, '删除后应剩 2 个档案');
  });
} catch (e) {
  fail += 1;
  failures.push(`主流程异常: ${e.stack || e.message}`);
  console.error(`✗ 主流程异常: ${e.stack || e.message}`);
} finally {
  // 清理：杀全部子进程（服务 SIGTERM 应同步杀掉其 stdio 孙进程）
  await tools.stop();
  svc.kill('SIGTERM');
  for (const c of children) {
    if (c && c.pid && c.exitCode === null) {
      try { c.kill(); } catch (_) { /* ignore */ }
    }
  }
  await sleep(800);
  for (const c of children) {
    if (c && c.pid && c.exitCode === null) {
      try { c.kill('SIGKILL'); } catch (_) { /* ignore */ }
    }
  }
  BRIDGE.server.close();
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) { /* ignore */ }
}

console.log(`\n内存桥全链路: ${pass} 通过, ${fail} 失败`);
if (fail > 0) process.exit(1);
