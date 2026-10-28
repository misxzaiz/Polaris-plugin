'use strict';
/**
 * smoke-real.mjs —— 真实宿主冒烟：spawn 真 MCP server 与真服务进程，
 * 经真实 RouterBus（anchor.json 自发现）读写真实 cap.kv，再快照式清理。
 *
 * 前置：Polaris 宿主正在运行。清理策略：对比前后键集只删本次新建的 piaoxia.* 键；
 * 归档文件按 collect 返回路径逐一删除。
 * 运行：node test/smoke-real.mjs
 */
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const FIX = path.join(HERE, 'fixtures');

// ── 真实端点自发现（与 kvclient 同链路）────────────────────────────────────
function md5(s) { return crypto.createHash('md5').update(String(s)).digest('hex'); }
function discover() {
  const anchorPath = process.env.APPDATA ? path.join(process.env.APPDATA, 'Polaris', 'anchor.json') : '';
  let dataRoot = '';
  try {
    const a = JSON.parse(fs.readFileSync(anchorPath, 'utf8'));
    dataRoot = a.dataRoot || '';
  } catch (_) { /* fallthrough */ }
  const cfgPath = dataRoot ? path.join(dataRoot, 'config.json') : '';
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  return { host: '127.0.0.1', port: cfg.web.port, token: cfg.web.token, dataRoot };
}

let ep;
try {
  ep = discover();
} catch (e) {
  console.log('SMOKE SKIP: 无法发现真实宿主（' + e.message + '）——本测试需要 Polaris 运行中');
  process.exit(0);
}

function dispatch(target, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ req: { target, payload } });
    const req = http.request({
      hostname: ep.host, port: ep.port, path: '/api/router-dispatch', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), Authorization: 'Bearer ' + md5(ep.token) },
      timeout: 30000,
    }, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => { try { resolve(JSON.parse(buf)); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}
async function kvKeys() {
  const r = await dispatch('cap.kv', { action: 'list' });
  return (r.result && r.result.keys) || [];
}
async function kvDel(key) {
  await dispatch('cap.kv', { action: 'delete', key });
}

let pass = 0;
let fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.log('  ✗', name, extra === undefined ? '' : '—— ' + JSON.stringify(extra).slice(0, 260)); }
}

// ── 快照 ────────────────────────────────────────────────────────────────────
const keysBefore = new Set(await kvKeys());
const archiveBefore = new Set(fs.existsSync(path.join(ep.dataRoot, 'piaoxia'))
  ? fs.readdirSync(path.join(ep.dataRoot, 'piaoxia'))
  : []);
console.log('真实宿主: ' + ep.host + ':' + ep.port + '，数据根: ' + ep.dataRoot + '，现有 piaoxia 键 ' +
  Array.from(keysBefore).filter((k) => k.startsWith('piaoxia.')).length + ' 个');

// ── spawn 真 MCP server（生产同款：无 env 注入，纯自发现）───────────────────
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'piaoxia-smoke-'));
const smokeDir = path.join(tmpDir, 'inbox');
fs.mkdirSync(smokeDir, { recursive: true });
fs.copyFileSync(path.join(FIX, 'shudian-special.pdf'), path.join(smokeDir, 'smoke-服务器发票.pdf'));

const child = spawn(process.execPath, [path.join(ROOT, 'mcp', 'server.js')], {
  env: Object.assign({}, process.env), // 不注入 POLARIS_*：验证自发现
  stdio: ['pipe', 'pipe', 'pipe'],
});
let childErr = '';
child.stderr.on('data', (d) => { childErr += String(d); });
let buf = '';
child.stdout.setEncoding('utf8');
child.stdout.on('data', (d) => { buf += d; });
let rpcId = 0;
const pendingMap = new Map();
child.stdout.on('data', () => {
  let idx;
  while ((idx = buf.indexOf('\n')) !== -1) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.id && pendingMap.has(msg.id)) {
        pendingMap.get(msg.id)(msg);
        pendingMap.delete(msg.id);
      }
    } catch (_) { /* 忽略 */ }
  }
});
function rpc(method, params) {
  return new Promise((resolve, reject) => {
    const id = ++rpcId;
    pendingMap.set(id, resolve);
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    setTimeout(() => { if (pendingMap.has(id)) { pendingMap.delete(id); reject(new Error('rpc timeout: ' + method)); } }, 60000);
  });
}
function textOf(resp) {
  return resp && resp.result && resp.result.content && resp.result.content[0] ? resp.result.content[0].text : '';
}

const createdArchives = [];
try {
  console.log('== 真 MCP：自发现 + 全流程 ==');
  const init = await rpc('initialize', {});
  ok('initialize', init.result && init.result.serverInfo && init.result.serverInfo.name === 'piaoxia', childErr.slice(0, 200));

  const add = await rpc('tools/call', {
    name: 'piaoxia_add',
    arguments: { total: 88.8, date: '2026-10-28', number: '99999999999999990001', sellerName: '冒烟测试销方', items: [{ name: '冒烟品名' }] },
  });
  ok('真宿主入账', !(add.result && add.result.isError), textOf(add));

  const q = await rpc('tools/call', { name: 'piaoxia_query', arguments: { type: 'search', q: '冒烟测试销方' } });
  ok('真宿主查询', textOf(q).indexOf('99999999999999990001') !== -1, textOf(q).slice(0, 160));

  const st = await rpc('tools/call', { name: 'piaoxia_set_status', arguments: { number: '99999999999999990001', action: 'submit', reimburseId: 'SMOKE-R1' } });
  ok('真宿主状态流转', textOf(st).indexOf('已提交') !== -1, textOf(st));

  const col = await rpc('tools/call', { name: 'piaoxia_collect', arguments: { path: smokeDir } });
  const colText = textOf(col);
  ok('真宿主收票（fixture 解析 + 归档）', colText.indexOf('新增 1 张') !== -1, colText.slice(0, 220));
  const m = colText.match(/归档|原件/g);
  const archDir = path.join(ep.dataRoot, 'piaoxia');
  const archNow = fs.existsSync(archDir) ? fs.readdirSync(archDir) : [];
  const newArchives = archNow.filter((n) => !archiveBefore.has(n));
  createdArchives.push(...newArchives.map((n) => path.join(archDir, n)));
  ok('真数据根出现归档原件', newArchives.some((n) => n.startsWith('24122000000198765432')), newArchives);

  const del = await rpc('tools/call', { name: 'piaoxia_delete', arguments: { number: '99999999999999990001', confirm: true } });
  ok('真宿主删除', !(del.result && del.result.isError), textOf(del));
} catch (e) {
  fail++;
  console.log('  ✗ 冒烟异常：' + (e && e.stack || e));
}
child.kill();

// ── 快照式清理（只删本次新建）───────────────────────────────────────────────
const keysAfter = await kvKeys();
const created = keysAfter.filter((k) => !keysBefore.has(k) && k.startsWith('piaoxia.'));
for (const k of created) await kvDel(k);
for (const f of createdArchives) {
  try { fs.unlinkSync(f); } catch (_) { /* 已不在 */ }
}
fs.rmSync(tmpDir, { recursive: true, force: true });
console.log('清理: 删除 ' + created.length + ' 个新建键、' + createdArchives.length + ' 个归档文件');

console.log('\n' + pass + ' 通过, ' + fail + ' 失败');
process.exitCode = fail ? 1 : 0;
