/**
 * 格致真桥冒烟（node test/smoke-real.mjs；需要本机 Polaris 宿主在跑）
 * 流程：直连读原设置 → 临时 exportDir → spawn mcp/server.js（无 env，走真实自发现：
 * anchor.json → config.json → 端口向上扫描）→ build 落盘 → recent → forget →
 * 恢复原设置并清理临时文件。宿主不可达时 exit 2（如实标注 skip，不虚报通过）。
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const here = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

// ── 复刻服务端自发现，找到宿主端点 ─────────────────────────────────────────
function loadWebConfig() {
  const cands = [];
  try {
    const anchor = JSON.parse(fs.readFileSync(path.join(process.env.APPDATA || '', 'Polaris', 'anchor.json'), 'utf8'));
    if (anchor.dataRoot) cands.push(path.join(anchor.dataRoot, 'config.json'));
  } catch (_) { /* 跳过 */ }
  if (process.env.APPDATA) cands.push(path.join(process.env.APPDATA, 'Polaris', 'config.json'));
  cands.push(path.join(os.homedir(), '.config', 'Polaris', 'config.json'));
  for (const p of cands) {
    try {
      const root = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (root.web && typeof root.web.port === 'number') return { host: '127.0.0.1', port: root.web.port, token: root.web.token || '' };
    } catch (_) { /* 跳过 */ }
  }
  return null;
}

function health(host, port) {
  return new Promise((resolve) => {
    const req = http.get({ hostname: host, port, path: '/api/health', timeout: 1200 }, (res) => { res.resume(); resolve(res.statusCode === 200); });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

function ipc(command, args) {
  return new Promise((resolve, reject) => {
    const cfg = loadWebConfig();
    const data = JSON.stringify(args);
    const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) };
    if (cfg && cfg.token) headers.Authorization = `Bearer ${crypto.createHash('md5').update(cfg.token).digest('hex')}`;
    const req = http.request({ hostname: cfg.host, port: cfg.port, path: `/api/${command.replace(/_/g, '-')}`, method: 'POST', headers, timeout: 15000 }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (_) { resolve(body); } });
    });
    req.on('error', reject);
    req.write(data); req.end();
  });
}

async function kvGet(key) {
  const res = await ipc('router_dispatch', { req: { target: 'cap.kv', payload: { action: 'get', key } } });
  if (!res || res.ok === false) throw new Error(`cap.kv get ${key} 失败: ${JSON.stringify(res).slice(0, 120)}`);
  return res.result ? res.result.value : null;
}
async function kvSet(key, value) {
  const res = await ipc('router_dispatch', { req: { target: 'cap.kv', payload: { action: 'set', key, value } } });
  if (!res || res.ok === false) throw new Error(`cap.kv set ${key} 失败`);
}
async function kvDel(key) {
  const res = await ipc('router_dispatch', { req: { target: 'cap.kv', payload: { action: 'delete', key } } });
  if (!res || res.ok === false) throw new Error(`cap.kv delete ${key} 失败`);
}

// ── 宿主可达性 ─────────────────────────────────────────────────────────────
const cfg = loadWebConfig();
let hostUp = false;
if (cfg) {
  for (let i = 0; i < 25 && !hostUp; i++) hostUp = await health(cfg.host, cfg.port + i);
}
if (!hostUp) {
  console.log('SKIP: Polaris 宿主不可达（9820..9844 均无 /api/health）——真桥冒烟未执行，其余验证见 README');
  process.exit(2);
}
console.log(`宿主可达（端口扫描命中）。开始真桥冒烟…`);

// ── 设置保护：读原值 → 临时导出目录 ────────────────────────────────────────
const originalSettings = await kvGet('gezhi.settings');
const tmpOut = fs.mkdtempSync(path.join(os.tmpdir(), 'gezhi-smoke-'));
await kvSet('gezhi.settings', { schemaVersion: 1, exportDir: tmpOut, theme: 'slate' });

// ── spawn MCP（无 env：走真实自发现）───────────────────────────────────────
const child = spawn(process.execPath, ['mcp/server.js'], { cwd: here, stdio: ['pipe', 'pipe', 'pipe'] });
let nextId = 1;
const pending = new Map();
let buf = '';
child.stdout.setEncoding('utf8');
child.stdout.on('data', (c) => {
  buf += c;
  while (true) {
    const i = buf.indexOf('\n');
    if (i === -1) break;
    const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    const p = pending.get(msg.id);
    if (p) { pending.delete(msg.id); p(msg); }
  }
});
function rpc(method, params) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`rpc timeout: ${method}`)); }, 45000);
    pending.set(id, (msg) => { clearTimeout(timer); resolve(msg); });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) }) + '\n');
  });
}
async function callTool(name, args) {
  const res = await rpc('tools/call', { name, arguments: args || {} });
  return { text: res.result.content[0].text, isError: res.result.isError === true };
}

let failed = 0;
function check(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`);
  else { failed++; console.log(`  ✗ ${msg}`); }
}

try {
  await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } });
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

  // 1. 真桥构建落盘
  const build = await callTool('xlsx_build', {
    title: '真桥冒烟台账', theme: 'forest',
    sheets: [{
      name: '明细',
      columns: [{ h: '品名', type: 'text' }, { h: '金额', type: 'money' }, { h: '占比', type: 'percent' }],
      rows: [['房租', 3500, 0.6], ['餐饮', 1200, 0.25], ['交通', 300, 0.05]],
      stats: [{ type: 'sum' }],
      conditional: [{ col: 1, op: 'gt', value: 2000, style: 'warn' }],
    }],
  });
  check(!build.isError, `xlsx_build 真桥成功：${(build.text.match(/已生成 [^\n]+/) || ['?'])[0]}`);
  const filePath = (build.text.split('\n').find((l) => l.startsWith('路径：')) || '').replace('路径：', '').split('（')[0].trim();
  check(filePath.startsWith(tmpOut) && fs.existsSync(filePath), '文件落在临时导出目录且真实存在');

  // 2. recent 看到登记
  const recent = await callTool('xlsx_recent', { limit: 5 });
  check(recent.text.includes('真桥冒烟台账'), 'xlsx_recent 登记可见');

  // 3. reveal 护栏（未登记路径拒绝；不弹窗验证已登记路径）
  const guard = await callTool('xlsx_reveal', { path: 'C:\\Windows\\notepad.exe' });
  check(guard.isError, 'xlsx_reveal 拒绝未登记路径');

  // 4. forget 清登记（文件保留）
  const keys = await kvGet('__keys__').catch(() => null); // 占位：list 走 kvKeys 语义
  const id = (build.text.match(/\[([a-z0-9]+)\]/) || [])[1];
  if (!id) {
    // 从登记反查：set 一个可读键不合适，直接用 forget 前先读 list
    const res = await ipc('router_dispatch', { req: { target: 'cap.kv', payload: { action: 'list' } } });
    const bk = (res.result.keys || []).find((k) => k.startsWith('gezhi.book.'));
    if (bk) {
      const entry = await kvGet(bk);
      const forget = await callTool('xlsx_forget', { id: entry.id, confirm: true });
      check(!forget.isError, 'xlsx_forget 确认后删除登记');
    } else check(false, '未找到登记键');
  } else {
    const forget = await callTool('xlsx_forget', { id, confirm: true });
    check(!forget.isError, 'xlsx_forget 确认后删除登记');
  }
  check(fs.existsSync(filePath), 'forget 后文件本身保留');

  console.log(failed === 0 ? 'PASS: 真桥冒烟全绿' : `FAIL: ${failed} 项未过`);
  process.exitCode = failed === 0 ? 0 : 1;
} finally {
  child.kill();
  // 恢复原设置（原本无设置则删除键）
  try {
    if (originalSettings === null || originalSettings === undefined) await kvDel('gezhi.settings');
    else await kvSet('gezhi.settings', originalSettings);
  } catch (e) { console.log('  ! 恢复设置失败：', e.message); }
  fs.rmSync(tmpOut, { recursive: true, force: true });
}
