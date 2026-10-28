/**
 * 韦编 MCP 全流程验收（node test/mcp-verify.mjs）
 * 真 spawn 后台服务 + 真 spawn stdio MCP + 内存桥：
 *   initialize → tools/list(4) → status → search → read（含越界拒绝）→
 *   空命中口径 → reindex → 服务死后诚实报错。
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import zlib from 'node:zlib';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIR = path.resolve(HERE, '..');

// ── 内存桥 ───────────────────────────────────────────────────────────────────
const store = new Map();
const bridge = http.createServer((req, res) => {
  const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
  if (req.method === 'GET' && (req.url || '').split('?')[0] === '/api/health') { send(200, { ok: true }); return; }
  if (req.method !== 'POST' || !(req.url || '').startsWith('/api/router-dispatch')) { send(404, { ok: false, error: 'nope' }); return; }
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    try {
      const { req: { target, payload } } = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (payload.action === 'get') send(200, { ok: true, result: { value: store.has(payload.key) ? store.get(payload.key) : null } });
      else if (payload.action === 'set') { store.set(payload.key, payload.value); send(200, { ok: true, result: {} }); }
      else if (payload.action === 'delete') { store.delete(payload.key); send(200, { ok: true, result: {} }); }
      else if (payload.action === 'list') send(200, { ok: true, result: { keys: [...store.keys()] } });
      else send(400, { ok: false, error: 'unknown action' });
    } catch (e) { send(400, { ok: false, error: e.message }); }
  });
});

function buildPdf(textLines) {
  const esc = (s) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  let content = 'BT /F1 14 Tf 72 720 Td\n';
  textLines.forEach((l, i) => { content += (i ? '0 -22 Td\n' : '') + `(${esc(l + ' ')}) Tj\n`; });
  content += 'ET';
  const objs = [];
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objs[2] = '<< /Type /Pages /Kids [3 0 R] /Count 1 >>';
  objs[3] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>';
  objs[4] = { stream: content };
  objs[5] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  let out = '%PDF-1.4\n';
  const offsets = [];
  for (let i = 1; i <= 5; i++) {
    offsets[i] = Buffer.byteLength(out, 'latin1');
    const o = objs[i];
    if (typeof o === 'string') out += `${i} 0 obj\n${o}\nendobj\n`;
    else out += `${i} 0 obj\n<< /Length ${Buffer.byteLength(o.stream, 'latin1')} >>\nstream\n${o.stream}\nendstream\nendobj\n`;
  }
  const xrefOff = Buffer.byteLength(out, 'latin1');
  out += 'xref\n0 6\n0000000000 65535 f \n';
  for (let i = 1; i <= 5; i++) out += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  out += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOff}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'weibian-mcp-'));
const APP_DIR = path.join(TMP, 'app');
const LIB = path.join(TMP, 'library');
fs.mkdirSync(APP_DIR, { recursive: true });
fs.mkdirSync(path.join(LIB, 'notes'), { recursive: true });
fs.mkdirSync(path.join(LIB, 'papers'), { recursive: true });
fs.writeFileSync(path.join(LIB, 'notes', '架构决策.md'), '# 架构决策\n\n两条总线：cap 总线管权限与审计，事件流管时序。McpBridgeToken 是检索测试词。\n');
fs.writeFileSync(path.join(LIB, 'papers', 'report.pdf'), buildPdf(['McpPdfProbe', 'second line content']));

await new Promise((r) => bridge.listen(0, '127.0.0.1', r));
const bridgePort = bridge.address().port;
store.set('weibian.settings', { roots: [LIB], maxDocs: 200 });

const child = spawn(process.execPath, [path.join(PLUGIN_DIR, 'service', 'weibian.js'), '0', APP_DIR], {
  env: { ...process.env, POLARIS_HOST: '127.0.0.1', POLARIS_PORT: String(bridgePort), POLARIS_TOKEN: 'bridge-test-token' },
  stdio: ['ignore', 'ignore', 'ignore'],
});
async function kvGet(key) {
  const res = await fetch(`http://127.0.0.1:${bridgePort}/api/router-dispatch`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ req: { target: 'cap.kv', payload: { action: 'get', key } } }),
  });
  const j = await res.json();
  return j.result ? j.result.value : null;
}
let META = null;
for (let i = 0; i < 120 && !(META && META.port); i++) {
  await new Promise((r) => setTimeout(r, 250));
  const m = await kvGet('weibian.meta');
  if (m && m.port) META = m;
}
assert.ok(META && META.port, '服务就绪');
// 等首扫完成
for (let i = 0; i < 60; i++) {
  const res = await fetch(`http://127.0.0.1:${META.port}/api/progress`, { headers: { 'x-weibian-token': META.token } });
  const j = await res.json();
  if (j.ok && !j.scanning && j.docs >= 2) break;
  await new Promise((r) => setTimeout(r, 300));
}

// ── MCP stdio 客户端 ─────────────────────────────────────────────────────────
const mcp = spawn(process.execPath, [path.join(PLUGIN_DIR, 'mcp', 'server.js', ), APP_DIR], {
  env: { ...process.env, POLARIS_HOST: '127.0.0.1', POLARIS_PORT: String(bridgePort), POLARIS_TOKEN: 'bridge-test-token' },
  stdio: ['pipe', 'pipe', 'pipe'],
});
let mcpErr = '';
mcp.stderr.on('data', (c) => { mcpErr += String(c); });
const pending = new Map();
let rpcBuf = '';
let nextId = 1;
mcp.stdout.setEncoding('utf8');
mcp.stdout.on('data', (chunk) => {
  rpcBuf += chunk;
  for (;;) {
    const i = rpcBuf.indexOf('\n');
    if (i === -1) break;
    const line = rpcBuf.slice(0, i).trim();
    rpcBuf = rpcBuf.slice(i + 1);
    if (!line) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.id != null && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    } catch (_) { /* 忽略非 JSON 行 */ }
  }
});
function rpc(method, params, timeoutMs = 20000) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`RPC 超时：${method}（stderr 尾：${mcpErr.slice(-300)}）`)); }, timeoutMs);
    pending.set(id, (msg) => { clearTimeout(timer); resolve(msg); });
    mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}
const textOf = (r) => (r.result && r.result.content && r.result.content[0] && r.result.content[0].text) || '';

let passed = 0, failed = 0;
const okIf = (cond, label) => { if (cond) { passed++; console.log('  ✔', label); } else { failed++; console.log('  ✖', label); } };

console.log('weibian mcp-verify');

const init = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'verify', version: '0' } });
okIf(init.result && init.result.serverInfo && init.result.serverInfo.name === 'weibian', 'initialize：serverInfo=weibian');
mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

const list = await rpc('tools/list', {});
const names = (list.result.tools || []).map((t) => t.name);
okIf(names.length === 4 && ['weibian_search', 'weibian_read', 'weibian_status', 'weibian_reindex'].every((n) => names.includes(n)), `tools/list：4 工具（${names.join(',')}）`);

const st = await rpc('tools/call', { name: 'weibian_status', arguments: {} });
okIf(!st.result.isError, 'status：非错误');
okIf(textOf(st).includes('文档 2'), `status：文档计数（${textOf(st).split('\n')[1] || ''}）`);
okIf(textOf(st).includes('检索语法'), 'status：带检索语法提示');

const sr = await rpc('tools/call', { name: 'weibian_search', arguments: { query: '架构 总线' } });
okIf(!sr.result.isError, 'search：中文命中非错误');
okIf(textOf(sr).includes('架构决策.md'), 'search：命中文件名');
okIf(textOf(sr).includes('路径：'), 'search：给出完整路径');

const sr2 = await rpc('tools/call', { name: 'weibian_search', arguments: { query: 'McpPdfProbe' } });
okIf(textOf(sr2).includes('report.pdf'), 'search：PDF 文字层可检索');

const rd = await rpc('tools/call', { name: 'weibian_read', arguments: { path: path.join(LIB, 'notes', '架构决策.md') } });
okIf(!rd.result.isError && textOf(rd).includes('McpBridgeToken'), 'read：目录内读取并含原文');

const rdOut = await rpc('tools/call', { name: 'weibian_read', arguments: { path: 'C:\\Windows\\win.ini' } });
okIf(rdOut.result.isError && textOf(rdOut).includes('不在索引目录内'), 'read：越界诚实拒绝');

const empty = await rpc('tools/call', { name: 'weibian_search', arguments: { query: 'zzqq 完全不存在' } });
okIf(!empty.result.isError && textOf(empty).includes('没有命中'), 'search：空命中是正常输出（非错误）');

const noArgs = await rpc('tools/call', { name: 'weibian_search', arguments: {} });
okIf(noArgs.result.isError && textOf(noArgs).includes('缺少 query'), 'search：缺参诚实报错');

const re = await rpc('tools/call', { name: 'weibian_reindex', arguments: {} });
okIf(!re.result.isError, 'reindex：触发成功');

// 服务死后：诚实报错
child.kill();
await new Promise((r) => setTimeout(r, 800));
const dead = await rpc('tools/call', { name: 'weibian_status', arguments: {} }, 30000);
okIf(dead.result.isError && /服务不可达|未就绪|超时/.test(textOf(dead)), '服务死后：status 诚实报错');

mcp.kill();
bridge.close();
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) { /* 句柄延迟容忍 */ }

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
