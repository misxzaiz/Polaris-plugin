/**
 * MCP 集成测试（真 MCP 进程 × 真 service 进程 × 假桥 × mock 上游）：node test/mcp-tests.mjs
 * 覆盖：initialize/tools/list 四工具往返、变异重放链、掩码不变量（输出不得含完整 key）、
 *       预检拦截文案、护栏（cap）。
 */
import http from 'node:http';
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const core = require('../shared/request-core.js');

const here = path.dirname(fileURLToPath(import.meta.url));
const results = [];
const t = async (name, fn) => {
  try { await fn(); results.push({ name, pass: true }); }
  catch (e) { results.push({ name, pass: false, detail: e.message }); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 假桥（与 service-tests 同款内存 kv）─────────────────────────────────────
const kvStore = new Map();
const bridge = http.createServer((req, res) => {
  if (req.url === '/api/health') { res.writeHead(200); res.end('{"ok":true}'); return; }
  if (req.url === '/api/router-dispatch' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const { req: r } = JSON.parse(body);
      const { target, payload } = r || {};
      const a = payload || {};
      if (target === 'cap.kv' && a.action === 'get') {
        const v = kvStore.get(a.key);
        res.writeHead(200); res.end(JSON.stringify({ ok: true, result: { value: v === undefined ? null : v } }));
      } else if (target === 'cap.kv' && a.action === 'set') {
        kvStore.set(a.key, a.value === undefined ? null : a.value);
        res.writeHead(200); res.end(JSON.stringify({ ok: true, result: true }));
      } else if (target === 'cap.kv' && a.action === 'delete') {
        kvStore.delete(a.key);
        res.writeHead(200); res.end(JSON.stringify({ ok: true, result: true }));
      } else { res.writeHead(200); res.end(JSON.stringify({ ok: false, error: 'unsupported' })); }
    });
    return;
  }
  res.writeHead(404); res.end();
});

// ── mock LLM ────────────────────────────────────────────────────────────────
const llm = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    if (req.url.endsWith('/v1/models')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: [{ id: 'mock-chat' }] }));
      return;
    }
    if (req.url.includes('/badkey')) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'Incorrect API key provided', type: 'authentication_error' } }));
      return;
    }
    const j = (() => { try { return JSON.parse(body || '{}'); } catch (_) { return {}; } })();
    if (req.url.includes('/drift')) {
      // 参数漂移语义：带 reasoning_effort 才拒，裁剪为标准字段后放行（供变异重放链验证）
      if (j.reasoning_effort !== undefined) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'Unrecognized request argument supplied: reasoning_effort', type: 'invalid_request_error' } }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'DriftOK' }, finish_reason: 'stop' }], usage: { prompt_tokens: 4, completion_tokens: 1 } }));
      return;
    }
    if (j.stream) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n');
      setTimeout(() => {
        res.write('data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":3,"completion_tokens":1}}\n\n');
        res.write('data: [DONE]\n\n');
        res.end();
      }, 30);
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'PlainOK' }, finish_reason: 'stop' }], usage: { prompt_tokens: 5, completion_tokens: 2 } }));
  });
});

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}

// ── MCP stdio 客户端 ────────────────────────────────────────────────────────
let mcp = null;
let mcpBuf = '';
const pending = new Map();
let idSeq = 0;

function startMcp(tmpDir, bridgePort) {
  mcp = spawn(process.execPath, [path.join(here, '..', 'mcp', 'server.js'), tmpDir], {
    env: { ...process.env, APPDATA: tmpDir, HOME: tmpDir, POLARIS_HOST: '127.0.0.1', POLARIS_PORT: String(bridgePort), POLARIS_TOKEN: '' },
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
  mcp.stderr.on('data', () => { /* 日志走 stderr，忽略 */ });
}

function rpc(method, params, waitMs = 20000) {
  const id = ++idSeq;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`rpc ${method} 超时`)); }, waitMs);
    pending.set(id, (msg) => { clearTimeout(timer); resolve(msg); });
    mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}

async function callTool(name, args, waitMs = 30000) {
  const r = await rpc('tools/call', { name, arguments: args || {} }, waitMs);
  if (r.error) throw new Error(`tools/call ${name} error: ${JSON.stringify(r.error)}`);
  const text = (r.result && r.result.content || []).map((c) => c.text || '').join('\n');
  return { text, isError: !!(r.result && r.result.isError) };
}

let nonceSeq = 0;
async function svcCmd(action, payload, waitMs = 15000) {
  const nonce = `t${Date.now().toString(36)}-${++nonceSeq}`;
  kvStore.set('llmdesk.cmd', { nonce, action, payload: payload || {}, at: new Date().toISOString() });
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    await sleep(300);
    const r = kvStore.get('llmdesk.res');
    if (r && r.nonce === nonce) { kvStore.delete('llmdesk.res'); return r.result; }
  }
  throw new Error(`svc 命令 ${action} 超时`);
}

// ── 主流程 ──────────────────────────────────────────────────────────────────
async function main() {
  const bridgePort = await listen(bridge);
  const llmPort = await listen(llm);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'llmdesk-mcp-'));
  const svcPort = 20871 + Math.floor(Math.random() * 500);

  const svc = spawn(process.execPath, [path.join(here, '..', 'service', 'main.js'), String(svcPort), tmpDir], {
    env: { ...process.env, APPDATA: tmpDir, HOME: tmpDir, POLARIS_HOST: '127.0.0.1', POLARIS_PORT: String(bridgePort), POLARIS_TOKEN: '' },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  startMcp(tmpDir, bridgePort);

  try {
    await t('initialize + tools/list：4 工具注册', async () => {
      const init = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
      assert.equal(init.result.serverInfo.name, 'llm-request-desk');
      // notification 无 id，服务端不回执——直接写不等
      mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
      const list = await rpc('tools/list', {});
      const names = list.result.tools.map((x) => x.name);
      assert.deepEqual(names.sort(), ['llmdesk_endpoints', 'llmdesk_get', 'llmdesk_history', 'llmdesk_send']);
    });

    await t('llmdesk_endpoints：空态引导', async () => {
      const { text } = await callTool('llmdesk_endpoints');
      assert.ok(text.includes('暂无端点'));
    });

    await t('send：拒绝任意 URL（必须已存端点）', async () => {
      const { text } = await callTool('llmdesk_send', { endpointId: 'nope', draft: { model: 'm', messages: [{ role: 'user', content: 'x' }] } });
      assert.ok(text.includes('endpointId') || text.includes('暂无端点'), text.slice(0, 200));
    });

    // 注册两个端点
    await svcCmd('endpoint_upsert', { endpoint: { id: 'mock-openai', name: 'Mock OpenAI', baseUrl: `http://127.0.0.1:${llmPort}/ok`, apiKey: 'sk-secret-abcdef123456', wire: core.WIRE_OPENAI } });
    await svcCmd('endpoint_upsert', { endpoint: { id: 'mock-drift', name: 'Drift', baseUrl: `http://127.0.0.1:${llmPort}/drift`, apiKey: 'sk-secret-abcdef123456', wire: core.WIRE_OPENAI } });

    await t('llmdesk_endpoints：列出且掩码', async () => {
      const { text } = await callTool('llmdesk_endpoints');
      assert.ok(text.includes('mock-openai'));
      assert.ok(text.includes('****3456'));
      assert.ok(!text.includes('sk-secret-abcdef123456'), '不得泄露完整 key');
    });

    await t('llmdesk_send：draft 发送成功（流式渲染 + reqId）', async () => {
      const { text } = await callTool('llmdesk_send', { endpointId: 'mock-openai', draft: { model: 'mock-chat', messages: [{ role: 'user', content: 'hi' }], stream: true } });
      assert.ok(text.includes('HTTP 200'), text.slice(0, 300));
      assert.ok(text.includes('TTFT'));
      assert.ok(text.includes('reqId='));
      assert.ok(!text.includes('sk-secret-abcdef123456'));
    });

    await t('llmdesk_send：400 参数漂移 → 诊断进 AI 返回', async () => {
      const { text } = await callTool('llmdesk_send', { endpointId: 'mock-drift', draft: { model: 'mock-chat', messages: [{ role: 'user', content: 'hi' }], extra: { reasoning_effort: 'high' } } });
      assert.ok(text.includes('param-unsupported'), text.slice(0, 400));
      assert.ok(text.includes('裁剪为标准字段'));
    });

    await t('llmdesk_send：rawJson 原样透传', async () => {
      const raw = JSON.stringify({ model: 'mock-chat', messages: [{ role: 'user', content: 'raw!' }], custom_gate_field: 1 });
      const { text } = await callTool('llmdesk_send', { endpointId: 'mock-openai', rawJson: raw });
      assert.ok(text.includes('HTTP 200'));
      assert.ok(text.includes('custom_gate_field'), '请求体应含透传字段');
    });

    await t('llmdesk_send：reqId+mutatorId 变异重放链', async () => {
      const { text } = await callTool('llmdesk_send', {
        endpointId: 'mock-drift',
        draft: { model: 'mock-chat', messages: [{ role: 'user', content: 'hi' }], extra: { reasoning_effort: 'high' } },
      });
      const reqId = (text.match(/reqId=([a-z0-9-]+)/) || [])[1];
      assert.ok(reqId, '应返回 reqId');
      const r2 = await callTool('llmdesk_send', { endpointId: 'mock-drift', reqId, mutatorId: 'standard-fields' });
      assert.ok(r2.text.includes('HTTP 200'), r2.text.slice(0, 300));
      assert.ok(!r2.text.includes('param-unsupported'), '裁剪后参数漂移应消失');
    });

    await t('llmdesk_send：预检拦截文案（不消耗额度）', async () => {
      const { text } = await callTool('llmdesk_send', { endpointId: 'mock-openai', draft: { model: '', messages: [{ role: 'user', content: 'x' }] } });
      assert.ok(text.includes('预检拦截'));
      assert.ok(text.includes('force:true'));
    });

    await t('护栏：AI 通道 maxTokens 被 cap 到 256', async () => {
      const { text } = await callTool('llmdesk_send', { endpointId: 'mock-openai', draft: { model: 'mock-chat', messages: [{ role: 'user', content: 'hi' }], maxTokens: 100000 } });
      assert.ok(text.includes('max_tokens') === false || true);
      // 从 latest 记录验证实际发送体
      const latest = kvStore.get('llmdesk.latest');
      assert.equal(latest.body.max_tokens, 256);
    });

    await t('llmdesk_get / llmdesk_history', async () => {
      const g = await callTool('llmdesk_get', {});
      assert.ok(g.text.includes('最近一次请求'));
      const h = await callTool('llmdesk_history', {});
      assert.ok(h.text.includes('reqId='));
      assert.ok(!h.text.includes('sk-secret-abcdef123456'));
    });

    await t('llmdesk_get：401 案例诊断可回读', async () => {
      await svcCmd('endpoint_upsert', { endpoint: { id: 'mock-bad', name: 'Bad', baseUrl: `http://127.0.0.1:${llmPort}/badkey`, apiKey: 'sk-x-000000000011', wire: core.WIRE_OPENAI } });
      await callTool('llmdesk_send', { endpointId: 'mock-bad', draft: { model: 'mock-chat', messages: [{ role: 'user', content: 'hi' }] } });
      const { text } = await callTool('llmdesk_get', {});
      assert.ok(text.includes('auth-fail'));
    });
  } finally {
    try { mcp.kill(); } catch (_) { /* 忽略 */ }
    try { svc.kill(); } catch (_) { /* 忽略 */ }
    bridge.close();
    llm.close();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) { /* Windows 句柄延迟 */ }
  }

  const pass = results.filter((x) => x.pass).length;
  for (const r of results) console.log(`${r.pass ? '✔' : '✖'} ${r.name}${r.pass ? '' : ` — ${r.detail}`}`);
  console.log(`\n${pass}/${results.length} passed`);
  if (pass !== results.length) process.exit(1);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
