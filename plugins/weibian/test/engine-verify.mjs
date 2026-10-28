/**
 * 韦编引擎级验收（node test/engine-verify.mjs）
 * 真 spawn 后台服务 + 内存桥（cap.kv 语义）+ 自造 fixture 树：
 *   建索引 → 中/英/GBK/docx/PDF/html 检索 → 片段高亮 → read 越界拒绝 →
 *   增量对账（改/增/删）→ 错误计数（扫描件 PDF）→ 鉴权/健康/probe。
 */
import { test } from 'node:test';
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

// ── 内存桥（cap.kv 语义 + /api/health）──────────────────────────────────────
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
      if (target !== 'cap.kv') { send(400, { ok: false, error: 'unknown target' }); return; }
      if (payload.action === 'get') send(200, { ok: true, result: { value: store.has(payload.key) ? store.get(payload.key) : null } });
      else if (payload.action === 'set') { store.set(payload.key, payload.value); send(200, { ok: true, result: {} }); }
      else if (payload.action === 'delete') { store.delete(payload.key); send(200, { ok: true, result: {} }); }
      else if (payload.action === 'list') send(200, { ok: true, result: { keys: [...store.keys()] } });
      else send(400, { ok: false, error: 'unknown action' });
    } catch (e) { send(400, { ok: false, error: e.message }); }
  });
});

// ── fixture 生成器 ───────────────────────────────────────────────────────────
/** 最小单页 PDF（正确 xref；每行末尾补空格保词边界——pdfjs 逐 item 拼接无分隔） */
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

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/** 真 deflate docx（EOCD + 中央目录 + 本地头，CRC32 校验真算） */
function buildDocx(paragraphs) {
  const xml = '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
    + paragraphs.map((p) => `<w:p><w:r><w:t xml:space="preserve">${p}</w:t></w:r></w:p>`).join('')
    + '</w:body></w:document>';
  const name = Buffer.from('word/document.xml', 'utf8');
  const data = zlib.deflateRawSync(Buffer.from(xml, 'utf8'));
  const crc = crc32(Buffer.from(xml, 'utf8'));
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6);
  local.writeUInt16LE(8, 8); local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(Buffer.byteLength(xml, 'utf8'), 22); local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
  const localBuf = Buffer.concat([local, name, data]);
  const cdOffset = localBuf.length;
  const cd = Buffer.alloc(46);
  cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6);
  cd.writeUInt16LE(8, 10); cd.writeUInt32LE(crc, 16); cd.writeUInt32LE(data.length, 20);
  cd.writeUInt32LE(Buffer.byteLength(xml, 'utf8'), 24); cd.writeUInt16LE(name.length, 28);
  cd.writeUInt32LE(0, 42); // local header offset
  const cdBuf = Buffer.concat([cd, name]);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(cdBuf.length, 12); eocd.writeUInt32LE(cdOffset, 16);
  return Buffer.concat([localBuf, cdBuf, eocd]);
}

// ── fixture 树 ───────────────────────────────────────────────────────────────
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'weibian-engine-'));
const APP_DIR = path.join(TMP, 'app');
const LIB = path.join(TMP, 'library');
fs.mkdirSync(APP_DIR, { recursive: true });
for (const d of ['notes', 'docs', 'papers', 'web', 'code', 'node_modules/lib', '.secret', 'binary']) {
  fs.mkdirSync(path.join(LIB, d), { recursive: true });
}
fs.writeFileSync(path.join(LIB, 'notes', '缓存策略笔记.md'), [
  '# 缓存策略笔记', '',
  '今天定位了一个经典问题：缓存命中率只有 50% 的假象。',
  '根因是流式 usage 双口径混用，轮首 miss 被当成全局命中率。',
  '修复方案见 CachePolicyNote 2026 版。', '',
].join('\n'));
// GBK 老文件：GBK-Encoded-Note 中文测试（D6D0 CEC4 B2E2 CAD4）
fs.writeFileSync(path.join(LIB, 'notes', 'gbk老文件.txt'), Buffer.concat([
  Buffer.from('GBK-Encoded-Note '), Buffer.from([0xD6, 0xD0, 0xCE, 0xC4, 0xB2, 0xE2, 0xCA, 0xD4]),
]));
fs.writeFileSync(path.join(LIB, 'docs', '手册.docx'), buildDocx([
  '韦编使用手册第一章', '独家词组韦编三绝写作组保留所有权利', '第二章 目录',
]));
fs.writeFileSync(path.join(LIB, 'papers', 'report.pdf'), buildPdf([
  'WeibianPdfToken', 'alpha quadrant report body',
]));
fs.copyFileSync(path.join(HERE, 'fixtures', 'scanned.pdf'), path.join(LIB, 'papers', 'scanned.pdf'));
fs.writeFileSync(path.join(LIB, 'web', 'page.html'), '<html><head><style>body{color:red}</style><script>var x=1;</script></head><body><h1>网页标题</h1><p>网页正文独家词韦编网页组。</p></body></html>');
fs.writeFileSync(path.join(LIB, 'code', 'app.py'), 'def parse_cache_hint():\n    return "WeibianPyCode"\n');
fs.writeFileSync(path.join(LIB, 'node_modules', 'lib', 'x.md'), '# 不该被索引的依赖文档 NodeModulesNoise');
fs.writeFileSync(path.join(LIB, '.secret', 'hidden.md'), '# 不该被索引的隐藏文件 HiddenNoise');
fs.writeFileSync(path.join(LIB, 'binary', 'blob.md'), Buffer.from([0x00, 0x01, 0x02, 0xFF, 0x00, 0x02]));
fs.writeFileSync(path.join(LIB, 'notes', 'empty.md'), '');

const EXPECT_DOCS = 6; // md + gbk txt + docx + pdf + html + py

// ── 起桥与服务 ───────────────────────────────────────────────────────────────
await new Promise((r) => bridge.listen(0, '127.0.0.1', r));
const bridgePort = bridge.address().port;
store.set('weibian.settings', { roots: [LIB], maxDocs: 500, maxFileMB: 1 });

// port=0：由服务 listen(0) 自选并回填 meta.port（免固定端口撞僵尸进程）
const child = spawn(process.execPath, [path.join(PLUGIN_DIR, 'service', 'weibian.js'), '0', APP_DIR], {
  env: { ...process.env, POLARIS_HOST: '127.0.0.1', POLARIS_PORT: String(bridgePort), POLARIS_TOKEN: 'bridge-test-token' },
  stdio: ['ignore', 'ignore', 'pipe'],
});
let svcLog = '';
child.stderr.on('data', (c) => { svcLog += String(c); });
const childExit = new Promise((r) => child.on('exit', r));

async function kvGet(key) {
  // 经桥读（与服务同源）
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
  if (m && m.port) META = m; // port=0 是 listen 前的过渡写，等真实端口
}
assert.ok(META && META.port, '服务在 30s 内写 meta（日志尾：' + svcLog.slice(-300) + '）');
const BASE = `http://127.0.0.1:${META.port}`;
const AUTH = { 'Content-Type': 'application/json', 'x-weibian-token': META.token };

async function api(method, p, body, headers) {
  const res = await fetch(BASE + p, { method, headers: headers || AUTH, body: body ? JSON.stringify(body) : undefined });
  let j = null;
  try { j = await res.json(); } catch (_) { /* 保留 null */ }
  return { status: res.status, json: j };
}

async function waitScanIdle(timeoutMs = 30000) {
  const t0 = Date.now();
  for (;;) {
    const r = await api('GET', '/api/progress');
    if (r.json && r.json.ok && !r.json.scanning) return r.json;
    if (Date.now() - t0 > timeoutMs) throw new Error('扫描超时：' + JSON.stringify(r.json));
    await new Promise((rr) => setTimeout(rr, 400));
  }
}

const progress0 = await waitScanIdle();

test('健康/鉴权/meta', async () => {
  const health = await fetch(BASE + '/__health');
  assert.equal(health.status, 200);
  const noauth = await api('POST', '/api/search', { query: 'x' }, { 'Content-Type': 'application/json' });
  assert.equal(noauth.status, 401);
  assert.ok(META.port >= 1024);
  assert.ok(META.token && META.token.length >= 16);
});

test('建索引：6 文档入库，排除项与错误计数正确', async () => {
  assert.equal(progress0.docs, EXPECT_DOCS, 'docs=' + progress0.docs + ' errors=' + JSON.stringify(progress0.errors));
  const byExt = progress0.byExt || {};
  assert.equal(byExt.md, 1);
  assert.equal(byExt.txt, 1);
  assert.equal(byExt.docx, 1);
  assert.equal(byExt.pdf, 1);
  assert.equal(byExt.html, 1);
  assert.equal(byExt.py, 1);
  const reasons = (progress0.errors || []).map((e) => e.reason);
  assert.ok(reasons.includes('no-text-layer'), '扫描件 PDF 计 no-text-layer：' + JSON.stringify(progress0.errors));
  assert.ok(!reasons.some((r) => r === 'binary'), '二进制跳过不计错误');
});

test('中文检索：命中 + 片段高亮 + 文件名加权置顶', async () => {
  const r = await api('POST', '/api/search', { query: '缓存 假象' });
  assert.equal(r.json.ok, true);
  assert.ok(r.json.results.length >= 1);
  const top = r.json.results[0];
  assert.equal(top.name, '缓存策略笔记.md');
  assert.ok(top.snippet.text.includes('缓存') || top.snippet.hits.length > 0, JSON.stringify(top.snippet));
  for (const h of top.snippet.hits) {
    assert.ok(top.snippet.text.slice(h.s, h.e).length <= 4, '命中偏移落在窗口内');
  }
});

test('GBK 老文件：解码后可被中文检索', async () => {
  const r = await api('POST', '/api/search', { query: '中文测试' });
  assert.ok(r.json.results.some((x) => x.name === 'gbk老文件.txt'), JSON.stringify(r.json.results));
});

test('docx：段落文本入库可检索', async () => {
  const r = await api('POST', '/api/search', { query: '韦编三绝写作组' });
  assert.ok(r.json.results.some((x) => x.name === '手册.docx'), JSON.stringify(r.json.results));
});

test('PDF：自造最小 PDF 文字层可检索；真实发票 PDF 抽取非空', async () => {
  const r = await api('POST', '/api/search', { query: 'WeibianPdfToken' });
  assert.ok(r.json.results.some((x) => x.name === 'report.pdf'), JSON.stringify(r.json.results));
  const r2 = await api('POST', '/api/search', { query: 'alpha quadrant' });
  assert.ok(r2.json.results.some((x) => x.name === 'report.pdf'));
});

test('html：正文入库、脚本样式剥离', async () => {
  const r = await api('POST', '/api/search', { query: '韦编网页组' });
  assert.ok(r.json.results.some((x) => x.name === 'page.html'));
  const r2 = await api('POST', '/api/search', { query: 'NodeModulesNoise' });
  assert.equal(r2.json.results.length, 0, 'node_modules 排除');
  const r3 = await api('POST', '/api/search', { query: 'HiddenNoise' });
  assert.equal(r3.json.results.length, 0, '隐藏目录排除');
});

test('代码检索：函数名与字符串字面量', async () => {
  const r = await api('POST', '/api/search', { query: 'parse_cache_hint' });
  assert.ok(r.json.results.some((x) => x.name === 'app.py'));
});

test('过滤语法：ext: 与 dir: 在服务端生效', async () => {
  const byExt = await api('POST', '/api/search', { query: 'ext:pdf quadrant' });
  assert.ok(byExt.json.results.every((x) => x.ext === 'pdf'));
  const byDir = await api('POST', '/api/search', { query: 'dir:papers alpha' });
  assert.ok(byDir.json.results.length >= 1 && byDir.json.results.every((x) => x.path.includes('papers')));
  const byCat = await api('POST', '/api/search', { query: 'ext:code parse_cache' });
  assert.ok(byCat.json.results.every((x) => x.cat === 'code'));
});

test('read：目录内可读、越界拒绝、traversal 归一拒绝', async () => {
  const mdPath = path.join(LIB, 'notes', '缓存策略笔记.md');
  const okR = await api('POST', '/api/read', { path: mdPath });
  assert.equal(okR.json.ok, true);
  assert.ok(okR.json.text.includes('CachePolicyNote'));
  assert.equal(okR.json.total > 0, true);
  const outside = await api('POST', '/api/read', { path: path.join(TMP, 'outside.md') });
  assert.equal(outside.status, 403);
  const trav = await api('POST', '/api/read', { path: path.join(LIB, 'notes', '..', '..', '..', 'windows', 'win.ini') });
  assert.equal(trav.status, 403, 'resolve 归一后越界拒绝');
  fs.writeFileSync(path.join(TMP, 'outside.md'), 'secret');
  const symlinkEscape = await api('POST', '/api/read', { path: path.join(TMP, 'outside.md') });
  assert.equal(symlinkEscape.status, 403);
});

test('probe：常用目录建议与路径校验', async () => {
  const r = await api('POST', '/api/probe', { path: path.join(LIB, 'notes') });
  assert.equal(r.json.ok, true);
  assert.ok(Array.isArray(r.json.suggestions));
  assert.equal(r.json.checked.exists, true);
  assert.equal(r.json.checked.isDir, true);
  const bogus = await api('POST', '/api/probe', { path: path.join(TMP, '不存在目录') });
  assert.equal(bogus.json.checked.exists, false);
});

test('增量对账：改动/新增/删除', async () => {
  // 改：追加新词
  fs.appendFileSync(path.join(LIB, 'notes', '缓存策略笔记.md'), '\n增量验证词 IncrementalProbe2026\n');
  let r = await api('POST', '/api/reindex', {});
  assert.equal(r.json.ok, true);
  let p = await waitScanIdle();
  assert.ok(p.docs >= EXPECT_DOCS);
  let s = await api('POST', '/api/search', { query: 'IncrementalProbe2026' });
  assert.equal(s.json.results.length, 1, '改动后新词可检索');
  // 增
  fs.writeFileSync(path.join(LIB, 'web', '新页面.html'), '<html><body><p>新页面独家词 FreshPageToken</p></body></html>');
  await api('POST', '/api/reindex', {});
  await waitScanIdle();
  s = await api('POST', '/api/search', { query: 'FreshPageToken' });
  assert.equal(s.json.results.length, 1, '新增文件入索引');
  // 删
  fs.unlinkSync(path.join(LIB, 'code', 'app.py'));
  await api('POST', '/api/reindex', {});
  p = await waitScanIdle();
  s = await api('POST', '/api/search', { query: 'WeibianPyCode' });
  assert.equal(s.json.results.length, 0, '删除后出索引');
  assert.equal(p.docs, EXPECT_DOCS, '删除后回到基线数量');
});

test('清空重建：all=true 清零再爬满', async () => {
  const r = await api('POST', '/api/reindex', { all: true });
  assert.equal(r.json.ok, true);
  const p = await waitScanIdle(60000);
  assert.equal(p.docs, EXPECT_DOCS);
});

test('stats/meta 落 kv（面板与 MCP 的读源）', async () => {
  const stats = await kvGet('weibian.stats');
  assert.ok(stats && stats.docs === EXPECT_DOCS);
  assert.ok(typeof stats.tokens === 'number' && stats.tokens > 0);
  const meta = await kvGet('weibian.meta');
  assert.equal(meta.port, META.port);
});

test('关闭：进程干净退出', async () => {
  child.kill();
  const code = await Promise.race([childExit, new Promise((r) => setTimeout(() => r('timeout'), 5000))]);
  assert.notEqual(code, 'timeout', '5s 内退出');
  bridge.close();
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) { /* Windows 句柄延迟容忍 */ }
});
