/**
 * 真实桥冒烟：node test/smoke-real.mjs
 * 真 service + 真 MCP 连「真宿主」web API（cap.kv → SqliteStorage）：
 * 导入合同（指向本机 mock 上游）→ MCP 读端点 → 真实发送 → 合同校验 → 清理全部 oadesk.* 键。
 *
 * ⚠ 需要：宿主 web API 在线（anchor.json → dataRoot/config.json 的 web.port）。
 * 目标是插件链路本身（桥读写/信箱往返/合同落库），不依赖外网。
 */
import http from 'node:http';
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const results = [];
const t = async (name, fn) => {
  try { await fn(); results.push({ name, pass: true }); }
  catch (e) { results.push({ name, pass: false, detail: e.message }); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const md5 = (s) => crypto.createHash('md5').update(String(s)).digest('hex');

// ── 定位真宿主 web 配置 ─────────────────────────────────────────────────────
function findHost() {
  const cands = [];
  if (process.env.APPDATA) cands.push(path.join(process.env.APPDATA, 'Polaris', 'anchor.json'));
  cands.push(path.join(os.homedir(), '.config', 'Polaris', 'anchor.json'));
  cands.push(path.join(os.homedir(), '.polaris', 'anchor.json'));
  for (const p of cands) {
    try {
      const a = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (a && a.dataRoot) {
        const cfg = JSON.parse(fs.readFileSync(path.join(a.dataRoot, 'config.json'), 'utf8'));
        if (cfg.web && cfg.web.port) return { host: '127.0.0.1', port: cfg.web.port, token: cfg.web.token || '' };
      }
    } catch (_) { /* 下一候选 */ }
  }
  throw new Error('未找到宿主 web 配置（anchor.json / config.json）——请先启动 Polaris');
}

function dispatch(host, port, token, target, payload, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ req: { target, payload } });
    const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) };
    if (token) headers.Authorization = `Bearer ${md5(token)}`;
    const req = http.request({ hostname: host, port, path: '/api/router-dispatch', method: 'POST', headers, timeout: timeoutMs }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    });
    req.on('timeout', () => req.destroy(new Error('dispatch timeout')));
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}
const kvGet = (h, k) => dispatch(h.host, h.port, h.token, 'cap.kv', { action: 'get', key: k });
const kvDel = (h, k) => dispatch(h.host, h.port, h.token, 'cap.kv', { action: 'delete', key: k });
const kvKeys = (h) => dispatch(h.host, h.port, h.token, 'cap.kv', { action: 'list' });

// ── mock 上游 ───────────────────────────────────────────────────────────────
function mockUpstream() {
  return http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const url = req.url || '';
      if (req.method === 'GET' && url.startsWith('/pets') && url.includes('limit=drift')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ items: [{ id: 'oops', name: 'a' }], bonus: 1 }));
        return;
      }
      if (req.method === 'GET' && url.startsWith('/pets')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ items: [{ id: 1, name: '旺财', tag: 'dog' }], total: 1 }));
        return;
      }
      res.writeHead(404); res.end('{}');
    });
  });
}

const specYaml = (port) => `openapi: 3.0.0
info:
  title: SmokeFixture
  version: '9.9'
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
`;

// ── MCP stdio 客户端 ────────────────────────────────────────────────────────
let mcp = null;
let mcpBuf = '';
const pending = new Map();
let idSeq = 0;
function startMcp(tmpDir, host) {
  mcp = spawn(process.execPath, [path.join(here, '..', 'mcp', 'server.js'), tmpDir], {
    env: { ...process.env, APPDATA: tmpDir, HOME: tmpDir, POLARIS_HOST: host.host, POLARIS_PORT: String(host.port), POLARIS_TOKEN: host.token },
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
        if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
      } catch (_) { /* 忽略 */ }
    }
  });
  mcp.stderr.on('data', () => { /* 日志忽略 */ });
}
function rpc(method, params, waitMs = 25000) {
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
  return content.map((c) => c.text || '').join('\n');
}

// ── 信箱（直接经真宿主 dispatch 投 cmd）─────────────────────────────────────
async function sendCmd(host, action, payload, waitMs = 40000) {
  const nonce = `s${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  await dispatch(host.host, host.port, host.token, 'cap.kv', { action: 'set', key: 'oadesk.cmd', value: { nonce, action, payload, at: new Date().toISOString() } });
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    await sleep(500);
    const res = await kvGet(host, 'oadesk.res');
    const v = res && res.ok && res.result ? res.result.value : null;
    if (v && v.nonce === nonce) {
      await kvDel(host, 'oadesk.res');
      return v.result || { ok: false, error: '回执为空' };
    }
  }
  return { ok: false, error: '信箱超时（服务未消费）' };
}

async function main() {
  const host = findHost();
  console.log(`真宿主：127.0.0.1:${host.port}`);

  // 基线键集（只清理自己的 oadesk.*）
  const baseKeys = await kvKeys(host);
  const baseList = (baseKeys && baseKeys.ok && baseKeys.result && Array.isArray(baseKeys.result.keys)) ? baseKeys.result.keys : [];

  const upstream = mockUpstream();
  const uPort = await new Promise((r) => upstream.listen(0, '127.0.0.1', () => r(upstream.address().port)));
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oadesk-smoke-'));
  const svc = spawn(process.execPath, [path.join(here, '..', 'service', 'main.js'), '20999', tmpDir], {
    env: { ...process.env, POLARIS_HOST: host.host, POLARIS_PORT: String(host.port), POLARIS_TOKEN: host.token },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  svc.stderr.on('data', () => { /* 服务日志忽略 */ });

  try {
    await t('真桥 meta 心跳可见（服务→宿主 kv 写入链路）', async () => {
      const deadline = Date.now() + 20000;
      while (Date.now() < deadline) {
        const r = await kvGet(host, 'oadesk.meta');
        const v = r && r.ok && r.result ? r.result.value : null;
        if (v && v.version) return;
        await sleep(500);
      }
      throw new Error('oadesk.meta 20s 未出现在真宿主 kv');
    });

    let specId = '';
    await t('导入合同（spec_import 走真宿主信箱往返）', async () => {
      const r = await sendCmd(host, 'spec_import', { source: 'text', content: specYaml(uPort), name: 'SmokeFixture' });
      assert.ok(r.ok, r.error);
      specId = r.specId;
      assert.ok(specId);
    });

    await t('真宿主 kv 里 specs 索引/合同详情键真实存在', async () => {
      const idx = await kvGet(host, 'oadesk.specs');
      const items = idx && idx.ok && idx.result && idx.result.value && idx.result.value.items;
      assert.ok(Array.isArray(items) && items.some((s) => s.id === specId), 'specs 索引应含 SmokeFixture');
      const full = await kvGet(host, `oadesk.spec.${specId}`);
      assert.ok(full && full.ok && full.result && full.result.value && Array.isArray(full.result.value.endpoints), '合同详情键应存在');
    });

    startMcp(tmpDir, host);
    await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } });
    await t('MCP oadesk_specs 经真桥可见', async () => {
      const text = await callTool('oadesk_specs', {});
      assert.match(text, /SmokeFixture/);
    });

    await t('MCP oadesk_endpoints 端点概览', async () => {
      const text = await callTool('oadesk_endpoints', { specId: 'SmokeFixture' });
      assert.match(text, /GET \/pets/);
    });

    // 配环境（bearer）
    const envSet = await sendCmd(host, 'env_set', { specId, env: { baseUrl: `http://127.0.0.1:${uPort}`, auth: { type: 'bearer', token: 'tok-smoke-1122334455' } } });
    await t('环境保存成功（掩码落真宿主 kv）', async () => {
      assert.ok(envSet.ok, envSet.error);
      const envs = await kvGet(host, 'oadesk.envs');
      const raw = JSON.stringify(envs);
      assert.equal(raw.includes('1122334455'), false, 'kv 不含 token 原文');
      assert.ok(raw.includes('****'), '含掩码');
    });

    await t('MCP oadesk_verify：真实发送 + 零漂移校验（全链路）', async () => {
      const text = await callTool('oadesk_verify', { specId: 'SmokeFixture', endpointId: 'GET /pets', values: { query: { limit: '3' } } });
      assert.match(text, /HTTP 200/, text.slice(0, 200));
      assert.match(text, /完全相符/, text.slice(0, 300));
    });

    await t('MCP oadesk_verify：漂移响应逐条报告', async () => {
      const text = await callTool('oadesk_verify', { specId: 'SmokeFixture', endpointId: 'GET /pets', values: { query: { limit: 'drift' } } });
      assert.match(text, /type-mismatch/);
      assert.match(text, /missing-required/);
      assert.equal(text.includes('1122334455'), false, 'token 掩码不变量');
    });

    await t('调用历史落真宿主 kv', async () => {
      const h = await kvGet(host, 'oadesk.history');
      const items = h && h.ok && h.result && h.result.value;
      assert.ok(Array.isArray(items) && items.length >= 2, '历史应 >=2 条');
    });

    await t('清理：oadesk.* 键全部删除（不污染真宿主 kv）', async () => {
      const now = await kvKeys(host);
      const nowList = (now && now.ok && now.result && Array.isArray(now.result.keys)) ? now.result.keys : [];
      const mine = nowList.filter((k) => k.startsWith('oadesk.'));
      // 基线里已有的 oadesk 键（上次冒烟残留）也一并清理
      const allMine = new Set([...mine, ...baseList.filter((k) => k.startsWith('oadesk.'))]);
      for (const k of allMine) await kvDel(host, k).catch(() => undefined);
      const meta = await kvGet(host, 'oadesk.meta');
      const v = meta && meta.ok && meta.result ? meta.result.value : null;
      if (v) throw new Error('meta 仍在，清理失败');
    });
  } finally {
    try { mcp.kill(); } catch (_) { /* 忽略 */ }
    try { svc.kill(); } catch (_) { /* 忽略 */ }
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
