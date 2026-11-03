/**
 * MCP 三方集成测试（真 service + 真 MCP server + 假桥 + mock 上游）：
 * node test/mcp-tests.mjs
 *
 * 覆盖：tools/list 注册、无合同引导文案、specs/endpoints 检索、call 真实发送
 * （AI 护栏：POST 无 confirm 拒发）、verify 漂移报告、diff 对比——AI 视角的
 * 完整联调链路。
 */
import http from 'node:http';
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const results = [];
const t = async (name, fn) => {
  try { await fn(); results.push({ name, pass: true }); }
  catch (e) { results.push({ name, pass: false, detail: e.message }); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 假桥 ────────────────────────────────────────────────────────────────────
const kvStore = new Map();
const bridge = http.createServer((req, res) => {
  if (req.url === '/api/health') { res.writeHead(200); res.end('{"ok":true}'); return; }
  if (req.url === '/api/router-dispatch' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      try {
        const { req: r } = JSON.parse(body);
        const { target, payload } = r || {};
        if (target !== 'cap.kv') { res.writeHead(200); res.end(JSON.stringify({ ok: false, error: 'unknown target' })); return; }
        const a = payload || {};
        if (a.action === 'get') {
          const v = kvStore.get(a.key);
          res.writeHead(200); res.end(JSON.stringify({ ok: true, result: { value: v === undefined ? null : v } }));
        } else if (a.action === 'set') {
          kvStore.set(a.key, a.value === undefined ? null : a.value);
          res.writeHead(200); res.end(JSON.stringify({ ok: true, result: true }));
        } else if (a.action === 'delete') {
          kvStore.delete(a.key);
          res.writeHead(200); res.end(JSON.stringify({ ok: true, result: true }));
        } else { res.writeHead(200); res.end(JSON.stringify({ ok: false, error: 'unknown kv action' })); }
      } catch (e) { res.writeHead(200); res.end(JSON.stringify({ ok: false, error: e.message })); }
    });
    return;
  }
  res.writeHead(404); res.end();
});

// ── mock 上游 ───────────────────────────────────────────────────────────────
function mockUpstream() {
  return http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const url = req.url || '';
      if (req.method === 'GET' && url.startsWith('/pets') && url.includes('limit=drift')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ items: [{ id: 'oops', name: 'a', tag: 'fish' }], bonus: 1 }));
        return;
      }
      if (req.method === 'GET' && url.startsWith('/pets')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ items: [{ id: 1, name: '旺财', tag: 'dog' }], total: 1 }));
        return;
      }
      if (req.method === 'POST' && url.startsWith('/pets')) {
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: 9, name: 'x' }));
        return;
      }
      res.writeHead(404); res.end('{}');
    });
  });
}

const specYaml = (port) => `openapi: 3.0.0
info:
  title: McpFixture
  version: '1.0'
servers:
  - url: http://127.0.0.1:${port}
paths:
  /pets:
    get:
      summary: 列出宠物
      security:
        - bearerAuth: []
      parameters:
        - name: limit
          in: query
          schema:
            type: integer
      responses:
        '200':
          description: ok
          content:
            application/json:
              schema:
                type: object
                required: [items, total]
                properties:
                  items:
                    type: array
                    items:
                      $ref: '#/components/schemas/Pet'
                  total:
                    type: integer
    post:
      summary: 新建宠物
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/NewPet'
      responses:
        '201':
          description: created
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
  schemas:
    Pet:
      type: object
      required: [id, name]
      properties:
        id:
          type: integer
        name:
          type: string
        tag:
          type: string
          enum: [cat, dog]
    NewPet:
      type: object
      required: [name]
      properties:
        name:
          type: string
`;

// ── MCP stdio 客户端 ────────────────────────────────────────────────────────
let mcp = null;
let mcpBuf = '';
const pending = new Map();
let idSeq = 0;

function startMcp(tmpDir, env) {
  mcp = spawn(process.execPath, [path.join(here, '..', 'mcp', 'server.js'), tmpDir], {
    env: { ...process.env, ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  mcp.stdout.setEncoding('utf8');
  mcp.stdout.on('data', (c) => {
    mcpBuf += c;
    let idx;
    while ((idx = mcpBuf.indexOf('\n')) >= 0) {
      const line = mcpBuf.slice(0, idx).trim();
      mcpBuf = mcpBuf.slice(idx + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id && pending.has(msg.id)) {
          pending.get(msg.id)(msg);
          pending.delete(msg.id);
        }
      } catch (_) { /* 忽略非 JSON 行 */ }
    }
  });
  mcp.stderr.on('data', () => { /* MCP 日志走 stderr，忽略 */ });
}

function rpc(method, params, waitMs = 20000) {
  const id = ++idSeq;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`rpc 超时：${method}`)); }, waitMs);
    pending.set(id, (msg) => { clearTimeout(timer); resolve(msg); });
    mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}

async function callTool(name, args) {
  const r = await rpc('tools/call', { name, arguments: args || {} });
  const content = r.result && Array.isArray(r.result.content) ? r.result.content : [];
  const text = content.map((c) => c.text || '').join('\n');
  return { text, isError: !!((r.result && r.result.isError) || (r.error)) };
}

// ── 主流程 ──────────────────────────────────────────────────────────────────
async function main() {
  const bPort = await new Promise((r) => bridge.listen(0, '127.0.0.1', () => r(bridge.address().port)));
  const upstream = mockUpstream();
  const uPort = await new Promise((r) => upstream.listen(0, '127.0.0.1', () => r(upstream.address().port)));
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oadesk-mcp-'));
  const svcPort = 20995;
  const svc = spawn(process.execPath, [path.join(here, '..', 'service', 'main.js'), String(svcPort), tmpDir], {
    env: { ...process.env, POLARIS_HOST: '127.0.0.1', POLARIS_PORT: String(bPort), POLARIS_TOKEN: 'test-token' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const env = { APPDATA: tmpDir, HOME: tmpDir, POLARIS_HOST: '127.0.0.1', POLARIS_PORT: String(bPort), POLARIS_TOKEN: 'test-token' };

  try {
    await t('service 就绪', async () => {
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline) {
        const ok = await new Promise((resolve) => {
          const rq = http.get({ hostname: '127.0.0.1', port: svcPort, path: '/__health', timeout: 800 }, (rs) => { rs.resume(); resolve(rs.statusCode === 200); });
          rq.on('error', () => resolve(false));
          rq.on('timeout', () => { rq.destroy(); resolve(false); });
        });
        if (ok) return;
        await sleep(300);
      }
      throw new Error('service 健康 15s 未就绪');
    });

    startMcp(tmpDir, env);
    const init = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
    await t('initialize 握手', async () => {
      assert.equal(init.result.serverInfo.name, 'openapi-desk');
    });

    let tools = [];
    await t('tools/list：5 个工具注册', async () => {
      const r = await rpc('tools/list', {});
      tools = r.result.tools || [];
      const names = tools.map((x) => x.name);
      for (const want of ['oadesk_specs', 'oadesk_endpoints', 'oadesk_call', 'oadesk_verify', 'oadesk_diff']) {
        assert.ok(names.includes(want), `缺工具 ${want}`);
      }
    });

    await t('oadesk_specs：空库给引导文案', async () => {
      const { text } = await callTool('oadesk_specs', {});
      assert.match(text, /暂无合同/);
      assert.match(text, /导入/);
    });

    // 经 MCP 信箱导入合同（走 service spec_import）
    let specId = '';
    await t('经信箱导入合同后 oadesk_specs 可见', async () => {
      // MCP 没有导入工具（设计如此：导入是面板动作）——用假桥直接投 cmd 模拟面板操作
      const nonce = `t${Date.now()}`;
      kvStore.set('oadesk.cmd', { nonce, action: 'spec_import', payload: { source: 'text', content: specYaml(uPort), name: 'McpFixture' }, at: new Date().toISOString() });
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline) {
        await sleep(300);
        const res = kvStore.get('oadesk.res');
        if (res && res.nonce === nonce) {
          kvStore.delete('oadesk.res');
          assert.ok(res.result.ok, res.result.error);
          specId = res.result.specId;
          break;
        }
      }
      assert.ok(specId, '导入应回执');
      const { text } = await callTool('oadesk_specs', {});
      assert.match(text, /McpFixture/);
      assert.match(text, /2 端点/);
    });

    await t('oadesk_endpoints：合同名容错 + 参数概览', async () => {
      const { text } = await callTool('oadesk_endpoints', { specId: 'McpFixture' });
      assert.match(text, /GET \/pets/);
      assert.match(text, /POST \/pets/);
      assert.match(text, /limit/);
      assert.match(text, /需鉴权/);
    });

    await t('oadesk_call：GET 真实发送（环境未配 bearer → 护栏拦截提示）', async () => {
      const { text } = await callTool('oadesk_call', { specId, endpointId: 'GET /pets', values: { query: { limit: '5' } } });
      assert.match(text, /鉴权/, `应有鉴权护栏提示：${text.slice(0, 200)}`);
    });

    // 配环境（模拟面板保存了 bearer）
    {
      const nonce = `t${Date.now()}e`;
      kvStore.set('oadesk.cmd', { nonce, action: 'env_set', payload: { specId, env: { baseUrl: `http://127.0.0.1:${uPort}`, auth: { type: 'bearer', token: 'tok-mcp-1234567890abcd' } } }, at: new Date().toISOString() });
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline) {
        await sleep(300);
        const res = kvStore.get('oadesk.res');
        if (res && res.nonce === nonce) { kvStore.delete('oadesk.res'); break; }
      }
    }

    await t('oadesk_call：环境带鉴权后发送成功，返回体不泄 token', async () => {
      const { text } = await callTool('oadesk_call', { specId, endpointId: 'GET /pets', values: { query: { limit: '5' } } });
      assert.match(text, /HTTP 200/);
      assert.match(text, /reqId=/);
      assert.equal(text.includes('1234567890abcd'), false, 'token 原文不得出现');
    });

    await t('oadesk_verify：漂移报告逐条中文可读', async () => {
      const { text } = await callTool('oadesk_verify', { specId, endpointId: 'GET /pets', values: { query: { limit: 'drift' } } });
      assert.match(text, /合同校验/);
      assert.match(text, /type-mismatch/);
      assert.match(text, /missing-required/);
      assert.match(text, /breaking/);
      assert.equal(text.includes('1234567890abcd'), false);
    });

    await t('oadesk_call：POST 无 confirm → 安全护栏文案（未发送）', async () => {
      const { text } = await callTool('oadesk_call', { specId, endpointId: 'POST /pets', bodyText: '{"name":"x"}' });
      assert.match(text, /护栏/);
      assert.match(text, /confirm/);
    });

    await t('oadesk_call：POST confirm:true 后发送成功', async () => {
      const { text } = await callTool('oadesk_call', { specId, endpointId: 'POST /pets', bodyText: '{"name":"旺财"}', confirm: true });
      assert.match(text, /HTTP 201/);
    });

    await t('oadesk_diff：单合同时给「需两份」引导', async () => {
      const { text } = await callTool('oadesk_diff', { specIdA: specId, specIdB: specId });
      assert.match(text, /至少需要两份/);
    });
  } finally {
    try { mcp.kill(); } catch (_) { /* 忽略 */ }
    try { svc.kill(); } catch (_) { /* 忽略 */ }
    try { bridge.close(); } catch (_) { /* 忽略 */ }
    try { upstream.close(); } catch (_) { /* 忽略 */ }
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) { /* 句柄延迟 */ }
  }

  const pass = results.filter((x) => x.pass).length;
  for (const r of results) console.log(`${r.pass ? '✔' : '✖'} ${r.name}${r.pass ? '' : ` — ${r.detail}`}`);
  console.log(`\n${pass}/${results.length} passed`);
  if (pass !== results.length) process.exit(1);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
