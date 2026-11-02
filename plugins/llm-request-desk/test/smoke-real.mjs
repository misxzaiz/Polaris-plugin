/**
 * 真实桥冒烟：node test/smoke-real.mjs
 * 真 service + 真 MCP 连「真宿主」9820 web API（cap.kv → SqliteStorage），
 * 导入真宿主端点后发一次 min 请求（max_tokens=16）验证全链路，跑完清理全部 llmdesk.* 键。
 *
 * ⚠ 需要：宿主 web API 在线（anchor.json → dataRoot/config.json 的 web.port）。
 * 端点成功率不是冒烟目标（429/401 也算链路通）——目标是插件链路本身。
 */
import http from 'node:http';
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

// ── 定位真宿主 web 配置（与 kvclient 候选序一致）────────────────────────────
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
  throw new Error('未找到宿主 web 配置（anchor.json / config.json）');
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
  mcp.stderr.on('data', () => { /* 日志 */ });
}
function rpc(method, params, waitMs = 20000) {
  const id = ++idSeq;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`rpc ${method} 超时`)); }, waitMs);
    pending.set(id, (msg) => { clearTimeout(timer); resolve(msg); });
    mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}
async function callTool(name, args, waitMs = 60000) {
  const r = await rpc('tools/call', { name, arguments: args || {} }, waitMs);
  const text = (r.result && r.result.content || []).map((c) => c.text || '').join('\n');
  return text;
}

let svc = null;

async function main() {
  const host = findHost();
  console.log(`宿主 web API: ${host.host}:${host.port}（${host.token ? 'authed' : 'noauth'}）`);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'llmdesk-real-'));
  const svcPort = 21871 + Math.floor(Math.random() * 500);
  svc = spawn(process.execPath, [path.join(here, '..', 'service', 'main.js'), String(svcPort), tmpDir], {
    env: { ...process.env, POLARIS_HOST: host.host, POLARIS_PORT: String(host.port), POLARIS_TOKEN: host.token },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let svcLog = '';
  svc.stderr.on('data', (c) => { svcLog += c; });
  startMcp(tmpDir, host);

  try {
    await t('MCP initialize（经真桥 kv 自发现）', async () => {
      const init = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } });
      if (!init.result || !init.result.serverInfo) throw new Error(JSON.stringify(init).slice(0, 200));
      mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    });

    await t('真桥 kv 心跳：llmdesk.meta 可读', async () => {
      let meta = null;
      for (let i = 0; i < 20; i++) {
        await sleep(500);
        const r = await kvGet(host, 'llmdesk.meta');
        if (r && r.ok && r.result && r.result.value) { meta = r.result.value; break; }
      }
      if (!meta) throw new Error('meta 未出现（service 未连上真桥？）\n' + svcLog.slice(-400));
      if (meta.degraded) throw new Error(`service 降级：${meta.lastBridgeErr}`);
    });

    await t('llmdesk_endpoints：真宿主端点导入可见（掩码）', async () => {
      const text = await callTool('llmdesk_endpoints');
      if (text.includes('暂无端点')) throw new Error('宿主端点未导入');
      if (!/\*\*\*\*/.test(text)) throw new Error('端点列表未掩码');
    });

    // 选一个 OpenAI wire 端点发 min 请求
    let target = null;
    {
      const r = await kvGet(host, 'llmdesk.endpoints');
      const items = r && r.ok && r.result && r.result.value ? r.result.value.items : [];
      target = items.find((x) => x.wire === 'openai-chat-completions' && !x.keyMask.includes('（无）')) || items[0] || null;
    }

    let sendText = '';
    await t('llmdesk_send：真实外呼 min 请求（max_tokens=16，成败均算链路通）', async () => {
      if (!target) throw new Error('无可用端点');
      sendText = await callTool('llmdesk_send', {
        endpointId: target.id,
        draft: { model: 'gpt-3.5-turbo', messages: [{ role: 'user', content: '回复"ok"两个字母即可' }], maxTokens: 16, stream: false },
        waitMs: 45000,
      }, 60000);
      if (!sendText.includes('HTTP')) throw new Error('返回无 HTTP 行：' + sendText.slice(0, 300));
      console.log(`    ↳ 对 ${target.name} 实发结果：${sendText.split('\n')[1] || ''}`);
    });

    await t('llmdesk_get：latest 经真桥回读', async () => {
      const text = await callTool('llmdesk_get', {});
      if (!text.includes('reqId=')) throw new Error('latest 不可读：' + text.slice(0, 200));
    });

    await t('llmdesk_history：历史可见', async () => {
      const text = await callTool('llmdesk_history', {});
      if (!text.includes('reqId=')) throw new Error('历史不可读');
    });

    await t('清理：llmdesk.* 键全部删除（不污染真宿主 kv）', async () => {
      const keys = ['llmdesk.meta', 'llmdesk.endpoints', 'llmdesk.latest', 'llmdesk.history', 'llmdesk.settings', 'llmdesk.cmd', 'llmdesk.res', 'llmdesk.reqids'];
      for (const k of keys) await kvDel(host, k).catch(() => undefined);
      // req.* 详情键
      const idx = await kvGet(host, 'llmdesk.reqids');
      // reqids 已删，详情键按前缀历史可能残留：尽力再删一次 latest reqId 对应键
      if (sendText) {
        const m = sendText.match(/reqId=([a-z0-9-]+)/);
        if (m) await kvDel(host, `llmdesk.req.${m[1]}`).catch(() => undefined);
      }
      // 终验：meta 应已消失
      const meta = await kvGet(host, 'llmdesk.meta');
      if (meta && meta.ok && meta.result && meta.result.value) throw new Error('meta 仍在，清理失败');
    });
  } finally {
    try { mcp.kill(); } catch (_) { /* 忽略 */ }
    try { svc.kill(); } catch (_) { /* 忽略 */ }
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) { /* 句柄延迟 */ }
  }

  const pass = results.filter((x) => x.pass).length;
  for (const r of results) console.log(`${r.pass ? '✔' : '✖'} ${r.name}${r.pass ? '' : ` — ${r.detail}`}`);
  console.log(`\n${pass}/${results.length} passed`);
  if (pass !== results.length) process.exit(1);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
