#!/usr/bin/env node
/**
 * 真实桥冒烟（node test/smoke-real.mjs）：
 * 对运行中的 Polaris 宿主（默认 127.0.0.1:9829，可 POLARIS_PORT 覆盖），
 * 用真实 mcp/server.js 子进程 + 真实 cap.kv 走全链路：
 * 漏项检查 → 标准模板 → 录预算 → 记账（增项/幂等）→ 预算对比 → 对账小结 → 自清理。
 * 自清理纪律：只删本次会话新建的 zhuangxiu.* 键（前后键集差集），绝不触碰他键。
 * 宿主未运行时 SKIP（exit 0），不谎报通过。
 */
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const pluginDir = path.resolve(here, '..');

const PORT = Number(process.env.POLARIS_PORT || 9829);
const HOST = process.env.POLARIS_HOST || '127.0.0.1';

// token：env 优先，否则尝试 anchor→dataRoot/config、APPDATA 候选
function findToken() {
  if (process.env.POLARIS_TOKEN) return process.env.POLARIS_TOKEN;
  const cands = [];
  if (process.env.APPDATA) cands.push(path.join(process.env.APPDATA, 'Polaris', 'anchor.json'));
  try {
    const a = JSON.parse(fs.readFileSync(cands[0], 'utf8').replace(/^\uFEFF/, ''));
    cands.push(path.join(a.dataRoot, 'config.json'));
  } catch (_) { /* 忽略 */ }
  if (process.env.APPDATA) cands.push(path.join(process.env.APPDATA, 'Polaris', 'config.json'));
  if (process.env.APPDATA) cands.push(path.join(process.env.APPDATA, 'Polaris-dev', 'config.json'));
  for (const p of cands) {
    try {
      const c = JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
      if (c.web && c.web.token) return c.web.token;
    } catch (_) { /* 下一个 */ }
  }
  return '';
}
const TOKEN = findToken();
const md5 = (s) => crypto.createHash('md5').update(String(s)).digest('hex');

function dispatchRaw(target, payload) {
  return new Promise((resolve) => {
    const data = JSON.stringify({ req: { target, payload } });
    const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) };
    if (TOKEN) headers.Authorization = `Bearer ${md5(TOKEN)}`;
    const req = http.request({ hostname: HOST, port: PORT, path: '/api/router-dispatch', method: 'POST', headers, timeout: 5000 }, (res) => {
      let b = '';
      res.on('data', (c) => { b += c; });
      res.on('end', () => { try { resolve(JSON.parse(b)); } catch (_) { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.write(data);
    req.end();
  });
}
const health = await new Promise((resolve) => {
  const req = http.get({ hostname: HOST, port: PORT, path: '/api/health', timeout: 3000 }, (res) => { res.resume(); resolve(res.statusCode === 200); });
  req.on('error', () => resolve(false));
  req.on('timeout', () => { req.destroy(); resolve(false); });
});
if (!health) {
  console.log(`SKIP：宿主 ${HOST}:${PORT} 未运行（/api/health 不通）——真桥冒烟需先启动 Polaris`);
  process.exit(0);
}
const probe = await dispatchRaw('cap.kv', { action: 'list' });
if (!probe || probe.ok !== true) {
  console.log(`SKIP：cap.kv 探测失败（${probe ? 'ok=false' : '无响应'}）——token 或端口不对`);
  process.exit(0);
}

// ── 键集快照（自清理基线）─────────────────────────────────────────────────────
const keysBefore = new Set((probe.result?.keys || []).filter((k) => k.startsWith('zhuangxiu.')));

// ── 起 MCP 子进程（env 直连真桥）─────────────────────────────────────────────
const child = spawn(process.execPath, [path.join(pluginDir, 'mcp', 'server.js'), ''], {
  env: { ...process.env, POLARIS_HOST: HOST, POLARIS_PORT: String(PORT), POLARIS_TOKEN: TOKEN },
  stdio: ['pipe', 'pipe', 'pipe'],
});
let buf = '';
const pending = new Map();
let nextId = 1;
child.stdout.setEncoding('utf8');
child.stdout.on('data', (chunk) => {
  buf += chunk;
  let idx;
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.id !== undefined && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    } catch (_) { /* 忽略 */ }
  }
});
function rpc(method, params) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, resolve);
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error(`RPC 超时: ${method}`)); } }, 15000);
  });
}
async function call(name, args) {
  const res = await rpc('tools/call', { name, arguments: args });
  return { isError: !!res.result?.isError, text: res.result?.content?.[0]?.text || '' };
}

const failures = [];
const okIf = (cond, label, detail) => {
  console.log(`  ${cond ? '✓' : '✗'} ${label}${cond || !detail ? '' : ` —— ${detail}`}`);
  if (!cond) failures.push(label);
};

console.log(`[smoke-real] 真桥 ${HOST}:${PORT}`);
await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } });
child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

const list = await rpc('tools/list', {});
okIf((list.result?.tools || []).length === 8, `tools/list 8 工具（${(list.result?.tools || []).length}）`);

let r = await call('zx_category', { action: 'template', projectName: '冒烟测试项目' });
okIf(!r.isError && r.text.includes('新建'), '真桥标准模板采用', r.text);

r = await call('zx_category', { action: 'project', totalBudget: 300000 });
okIf(!r.isError && r.text.includes('300,000'), '真桥项目总预算', r.text);

r = await call('zx_category', { action: 'set', name: '瓷砖', budget: 8000 });
okIf(!r.isError, '真桥录科目预算', r.text);

r = await call('zx_record', { amount: 3200, categoryName: '瓷砖', vendorName: '冒烟供应商', id: 'smoke-1' });
okIf(!r.isError && r.text.includes('已记录') && r.text.includes('【绿】'), '真桥记账（瓷砖 3200 → 绿）', r.text);

r = await call('zx_record', { amount: 3200, categoryName: '瓷砖', id: 'smoke-1' });
okIf(!r.isError && r.text.includes('已覆盖更新'), '真桥同 id 幂等覆盖', r.text);

r = await call('zx_record', { amount: 600, categoryName: '冒烟增项项', asExtra: true });
okIf(!r.isError && r.text.includes('增项科目') && r.text.includes('计入增项合计'), '真桥 asExtra 增项', r.text);

r = await call('zx_query', { view: 'budget' });
okIf(!r.isError && r.text.includes('300,000') && r.text.includes('瓷砖'), '真桥预算执行视图', r.text);

r = await call('zx_summary', {});
okIf(!r.isError && r.text.includes('装修对账小结') && r.text.includes('增项合计'), '真桥对账小结', r.text.slice(0, 120));

// ── 自清理：只删本次新建的 zhuangxiu.* 键 ────────────────────────────────────
child.kill();
const after = await dispatchRaw('cap.kv', { action: 'list' });
const keysAfter = new Set((after.result?.keys || []).filter((k) => k.startsWith('zhuangxiu.')));
const created = [...keysAfter].filter((k) => !keysBefore.has(k));
let cleaned = 0;
for (const k of created) {
  const res = await dispatchRaw('cap.kv', { action: 'delete', key: k });
  if (res && res.ok) cleaned += 1;
}
console.log(`[smoke-real] 自清理：新建 ${created.length} 键，已删 ${cleaned}`);
okIf(cleaned === created.length, '自清理完成（不留测试数据）');

console.log('');
if (failures.length) {
  console.error(`❌ 真桥冒烟 ${failures.length} 项失败`);
  process.exit(1);
}
console.log('✅ 真桥冒烟通过（真实宿主 cap.kv 全链路 + 自清理）');
process.exit(0);
