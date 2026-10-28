'use strict';
/**
 * service-verify.mjs —— 后台服务 HTTP 全流程（spawn 子进程 + 真实 HTTP 请求）
 * 覆盖：健康检查、token 鉴权（401/时序安全）、文件字节收票、目录扫描收票、归档落盘、meta 心跳。
 * 运行：node test/service-verify.mjs
 */
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const FIX = path.join(HERE, 'fixtures');

// ── 内存 kv 桥（承接 meta 心跳）────────────────────────────────────────────
const store = new Map();
const bridge = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    try {
      const { req: inner } = JSON.parse(body);
      const p = inner.payload || {};
      if (p.action === 'get') var result = { value: store.has(p.key) ? store.get(p.key) : null };
      else if (p.action === 'set') { store.set(p.key, p.value); var result = { ok: true }; }
      else if (p.action === 'delete') { store.delete(p.key); var result = { ok: true }; }
      else if (p.action === 'list') var result = { keys: Array.from(store.keys()) };
      else throw new Error('未知 action');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, result }));
    } catch (e) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: String(e.message) }));
    }
  });
});
await new Promise((r) => bridge.listen(0, '127.0.0.1', r));
const bridgePort = bridge.address().port;

// ── 隔离环境 ────────────────────────────────────────────────────────────────
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'piaoxia-service-'));
const fakeAppdata = path.join(tmp, 'appdata');
const dataRoot = path.join(tmp, 'dataroot');
const scanDir = path.join(tmp, 'inbox');
fs.mkdirSync(path.join(fakeAppdata, 'Polaris'), { recursive: true });
fs.mkdirSync(dataRoot, { recursive: true });
fs.mkdirSync(scanDir, { recursive: true });
fs.writeFileSync(path.join(fakeAppdata, 'Polaris', 'anchor.json'), JSON.stringify({ schemaVersion: 1, dataRoot }));
// 扫描目录里放两张真 fixture + 一个干扰文件
fs.copyFileSync(path.join(FIX, 'shudian-special.pdf'), path.join(scanDir, '发票1.pdf'));
fs.copyFileSync(path.join(FIX, 'shudian-common.xml'), path.join(scanDir, '发票2.xml'));
fs.writeFileSync(path.join(scanDir, 'readme.txt'), 'not an invoice');
fs.mkdirSync(path.join(scanDir, 'sub'));
fs.copyFileSync(path.join(FIX, 'old-e-common.pdf'), path.join(scanDir, 'sub', 'nested.pdf'));

// ── spawn 服务（随机端口）───────────────────────────────────────────────────
const PORT = 19870 + Math.floor(Math.random() * 1000);
const child = spawn(process.execPath, [path.join(ROOT, 'service', 'main.js'), String(PORT), fakeAppdata], {
  env: Object.assign({}, process.env, {
    POLARIS_HOST: '127.0.0.1',
    POLARIS_PORT: String(bridgePort),
    POLARIS_TOKEN: 'bridge-token',
    APPDATA: fakeAppdata,
  }),
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serviceLog = '';
child.stderr.on('data', (d) => { serviceLog += String(d); });
child.on('exit', (code) => { if (code) serviceLog += 'EXIT ' + code; });

let pass = 0;
let fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.log('  ✗', name, extra === undefined ? '' : '—— ' + JSON.stringify(extra).slice(0, 300)); }
}

function httpReq(method, p, token, body) {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (token) headers.Authorization = 'Bearer ' + token;
    let data = null;
    if (body !== undefined) {
      data = JSON.stringify(body);
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(data);
    }
    const req = http.request({ hostname: '127.0.0.1', port: PORT, path: p, method, headers, timeout: 60000 }, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, json: JSON.parse(buf) }); }
        catch (_) { resolve({ status: res.statusCode, json: null, raw: buf }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    if (data) req.write(data);
    req.end();
  });
}

// 等服务起来
let up = false;
for (let i = 0; i < 40 && !up; i++) {
  try {
    const r = await httpReq('GET', '/__health', null);
    up = r.status === 200;
  } catch (_) { await new Promise((r2) => setTimeout(r2, 250)); }
}

try {
  console.log('== 健康与鉴权 ==');
  ok('服务就绪', up, serviceLog.slice(0, 400));
  const health = await httpReq('GET', '/__health', null);
  ok('/__health 200', health.status === 200 && health.json && health.json.status === 'ok', health);
  const noAuth = await httpReq('GET', '/api/probe', null);
  ok('无 token 401', noAuth.status === 401, noAuth);
  const badAuth = await httpReq('GET', '/api/probe', 'wrong-token');
  ok('错 token 401', badAuth.status === 401, badAuth);

  // meta 心跳里拿真 token（面板的取法）
  let token = '';
  for (let i = 0; i < 20 && !token; i++) {
    const m = store.get('piaoxia.meta');
    if (m && m.token) token = m.token;
    else await new Promise((r) => setTimeout(r, 300));
  }
  ok('meta 心跳已发布（port+token）', token && store.get('piaoxia.meta').port === PORT, store.get('piaoxia.meta'));

  const probe = await httpReq('GET', '/api/probe', token);
  ok('probe OK + 归档目录', probe.status === 200 && probe.json.ok && /piaoxia$/.test(probe.json.archiveDir), probe.json);

  console.log('== 目录扫描收票（递归 + 跳过干扰文件）==');
  const col = await httpReq('POST', '/api/collect', token, { dir: scanDir, recursive: true });
  ok('collect 200', col.status === 200 && col.json.ok, col.json && col.json.error);
  const results = col.json.results || [];
  ok('扫到 3 张（txt 被跳过）', results.length === 3, results.map((r) => r.name));
  ok('全部解析成功', results.every((r) => r.ok), results.filter((r) => !r.ok).map((r) => r.name + ':' + r.error));
  const nums = results.map((r) => r.invoice.number).sort();
  ok('三张票号码正确', JSON.stringify(nums) === JSON.stringify(['12345678', '24122000000198765432', '24312000000123456789'].sort()), nums);
  ok('归档路径已填', results.every((r) => r.archivedPath && fs.existsSync(r.archivedPath)), results.map((r) => r.archivedPath));
  ok('归档目录=数据根/piaoxia', results.every((r) => path.dirname(r.archivedPath) === path.join(dataRoot, 'piaoxia')));
  const specInv = results.find((r) => r.invoice.number === '24122000000198765432');
  ok('数电专票金额 11300', specInv && specInv.invoice.total === 11300, specInv && specInv.invoice);

  console.log('== 文件字节收票（模拟面板拖拽）==');
  const bytes = fs.readFileSync(path.join(FIX, 'rail.pdf'));
  const col2 = await httpReq('POST', '/api/collect', token, {
    files: [{ name: 'rail.pdf', b64: bytes.toString('base64') }],
  });
  const r2 = (col2.json.results || [])[0];
  ok('字节收票成功（同号码判重语义留给面板，服务原样返回）', r2 && r2.ok && r2.invoice.number === '24319000000011234567', r2 && (r2.error || r2.warnings));
  ok('无 srcPath（面板拖拽无路径）', r2.ok && r2.invoice.srcPath === '');

  console.log('== 异常路径 ==');
  const col3 = await httpReq('POST', '/api/collect', token, { dir: path.join(tmp, 'nope') });
  ok('目录不存在 → 明确错误', col3.json.results && col3.json.results[0] && /目录不存在/.test(col3.json.results[0].error), col3.json);
  const col4 = await httpReq('POST', '/api/collect', token, {});
  ok('空请求 400', col4.status === 400, col4);
  const col5 = await httpReq('POST', '/api/collect', token, { files: [{ name: 'fake.pdf', b64: Buffer.from('hello world').toString('base64') }] });
  ok('非 PDF 内容拒绝', col5.json.results[0] && !col5.json.results[0].ok, col5.json.results[0] && col5.json.results[0].error);
} catch (e) {
  fail++;
  console.log('  ✗ 流程异常：' + (e && e.stack || e));
}

child.kill();
bridge.close();
fs.rmSync(tmp, { recursive: true, force: true });

console.log('\n' + pass + ' 通过, ' + fail + ' 失败');
process.exitCode = fail ? 1 : 0;
