/**
 * 纸坊 MCP 全流程验证（node test/mcp-verify.mjs）
 * spawn 真实 stdio server（fixture 目录当 appConfigDir，桥不可达=降级路径）：
 *   initialize → tools/list（5 工具）→ 五工具真实文件操作 → 产物断言 →
 *   错误路径（不存在/相对路径/非 PDF/损坏）isError 中文提示 → 永不覆盖（二次合并 -2）。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { PDFDocument, StandardFonts } = require('../vendor/pdf-lib.min.js');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'zhifang-mcp-'));
const FIX = path.join(TMP, 'fix');
fs.mkdirSync(FIX, { recursive: true });

async function makePdf(n, base = 1000) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= n; i++) {
    doc.addPage([595, 842]).drawText(`Mcp page ${i} marker-${base + i}`, { x: 40, y: 700, size: 18, font });
  }
  return Buffer.from(await doc.save());
}

const a = path.join(FIX, '合同A.pdf');
const b = path.join(FIX, '合同B.pdf');
fs.writeFileSync(a, await makePdf(2, 1000));
fs.writeFileSync(b, await makePdf(2, 2000));
const notPdf = path.join(FIX, '假文件.pdf');
fs.writeFileSync(notPdf, Buffer.from('this is definitely not a pdf'));
const broken = path.join(FIX, '损坏.pdf');
fs.writeFileSync(broken, Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from('garbage'.repeat(50))]));

// ── stdio 驱动 ───────────────────────────────────────────────────────────────

const child = spawn('node', [path.join(APP_ROOT, 'mcp', 'server.js'), TMP], { stdio: ['pipe', 'pipe', 'pipe'] });
child.stderr.on('data', () => { /* stderr 仅日志，不参与断言 */ });

let buf = '';
const pending = [];
child.stdout.on('data', (c) => {
  buf += c.toString('utf8');
  let idx;
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    const resolve = pending.shift();
    if (resolve) resolve(JSON.parse(line));
  }
});

let nextId = 1;
function rpc(method, params) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => reject(new Error('rpc 超时: ' + method)), 30000);
    pending.push((msg) => { clearTimeout(timer); resolve(msg); });
    child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
  });
}

async function call(name, args) {
  const res = await rpc('tools/call', { name, arguments: args });
  assert.ok(res.result, 'tools/call 必须有 result: ' + JSON.stringify(res).slice(0, 200));
  const text = res.result.content && res.result.content[0] && res.result.content[0].text;
  return { text: String(text || ''), isError: res.result.isError === true };
}

let failed = 0;
async function step(name, fn) {
  try {
    await fn();
    console.log('  ✔', name);
  } catch (e) {
    failed++;
    console.log('  ✖', name, '\n    ', String(e && e.message || e).split('\n')[0]);
  }
}

console.log('zhifang mcp-verify（fixtures: ' + FIX + '）');

await step('initialize：握手返回 zhifang serverInfo', async () => {
  const res = await rpc('initialize', {});
  assert.equal(res.result.serverInfo.name, 'zhifang');
  assert.ok(res.result.capabilities.tools);
});

await step('notifications/initialized 不崩溃', async () => {
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  await new Promise((r) => setTimeout(r, 100));
});

await step('tools/list：恰好 5 个 zhifang_* 工具', async () => {
  const res = await rpc('tools/list', {});
  const names = res.result.tools.map((t) => t.name);
  assert.deepEqual(names.sort(), ['zhifang_images2pdf', 'zhifang_info', 'zhifang_merge', 'zhifang_pages', 'zhifang_text']);
  for (const t of res.result.tools) assert.ok(t.description.length > 30, t.name + ' description 过短');
  const pages = res.result.tools.find((t) => t.name === 'zhifang_pages');
  assert.deepEqual(pages.inputSchema.properties.action.enum, ['extract', 'split', 'rotate', 'delete']);
});

await step('zhifang_info：中文摘要带页数', async () => {
  const { text, isError } = await call('zhifang_info', { path: a });
  assert.ok(!isError);
  assert.match(text, /2 页/);
  assert.match(text, /合同A\.pdf/);
});

await step('zhifang_merge：中文文件名输入 → 落盘 + 页数', async () => {
  const { text, isError } = await call('zhifang_merge', { paths: [a, b] });
  assert.ok(!isError, text);
  assert.match(text, /4 页/);
  const outPath = /输出：(.+\.pdf)/.exec(text)[1].trim();
  assert.ok(fs.existsSync(outPath), '输出存在: ' + outPath);
  const doc = await PDFDocument.load(fs.readFileSync(outPath));
  assert.equal(doc.getPageCount(), 4);
});

await step('zhifang_merge：二次执行不覆盖（-2 后缀）', async () => {
  const { text } = await call('zhifang_merge', { paths: [a, b] });
  const outPath = /输出：(.+\.pdf)/.exec(text)[1].trim();
  assert.match(path.basename(outPath), /-2\.pdf$/, '第二次输出自动改名');
  const doc = await PDFDocument.load(fs.readFileSync(outPath));
  assert.equal(doc.getPageCount(), 4);
});

await step('zhifang_pages extract：保序重排 2,1 + 产物页数', async () => {
  const { text, isError } = await call('zhifang_pages', { path: a, action: 'extract', pages: '2,1' });
  assert.ok(!isError, text);
  assert.match(text, /2 页/);
  const outPath = /输出：(.+\.pdf)/.exec(text)[1].trim();
  assert.match(path.basename(outPath), /p2,1/);
  const doc = await PDFDocument.load(fs.readFileSync(outPath));
  assert.equal(doc.getPageCount(), 2);
});

await step('zhifang_pages split：every=1 → 两份', async () => {
  const { text, isError } = await call('zhifang_pages', { path: a, action: 'split', every: 1 });
  assert.ok(!isError, text);
  assert.match(text, /part01-of-02/);
  assert.match(text, /part02-of-02/);
  const outs = text.split('\n').map((l) => {
    const m = /^(?:输出：)?(.+\.pdf)（/.exec(l.trim());
    return m && m[1].startsWith(FIX) ? m[1] : '';
  }).filter(Boolean);
  assert.equal(outs.length, 2, '两份输出: ' + text);
  for (const p of outs) {
    const doc = await PDFDocument.load(fs.readFileSync(p));
    assert.equal(doc.getPageCount(), 1);
  }
});

await step('zhifang_pages rotate：90 度读回', async () => {
  const { text, isError } = await call('zhifang_pages', { path: a, action: 'rotate', pages: '1', angle: 90 });
  assert.ok(!isError, text);
  const outPath = /输出：(.+\.pdf)/.exec(text)[1].trim();
  const doc = await PDFDocument.load(fs.readFileSync(outPath));
  assert.equal(doc.getPage(0).getRotation().angle, 90);
  assert.equal(doc.getPage(1).getRotation().angle, 0);
});

await step('zhifang_pages delete：删后剩 1 页', async () => {
  const { text, isError } = await call('zhifang_pages', { path: a, action: 'delete', pages: '1' });
  assert.ok(!isError, text);
  assert.match(text, /剩余 1 页|1 页/);
  const outPath = /输出：(.+\.pdf)/.exec(text)[1].trim();
  const doc = await PDFDocument.load(fs.readFileSync(outPath));
  assert.equal(doc.getPageCount(), 1);
});

await step('zhifang_images2pdf：PNG/JPG 合成（fixture 经引擎生成）', async () => {
  // 经 engine 造一个带真实图片的 PDF 再抽页为 PNG 源不可行——直接用最小 fixture
  const PNG_1PX_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const pngPath = path.join(FIX, 'shot.png');
  fs.writeFileSync(pngPath, Buffer.from(PNG_1PX_B64, 'base64'));
  const { text, isError } = await call('zhifang_images2pdf', { paths: [pngPath] });
  assert.ok(!isError, text);
  assert.match(text, /1 页/);
  const outPath = /输出：(.+\.pdf)/.exec(text)[1].trim();
  const doc = await PDFDocument.load(fs.readFileSync(outPath));
  assert.equal(doc.getPage(0).getWidth(), 1);
});

await step('zhifang_text：返回可读文本（AI 续答用）', async () => {
  const { text, isError } = await call('zhifang_text', { path: a });
  assert.ok(!isError, text);
  assert.match(text, /marker-100[12]/);
});

await step('zhifang_text：writeTxt 落盘全文', async () => {
  const { text, isError } = await call('zhifang_text', { path: a, writeTxt: true });
  assert.ok(!isError, text);
  assert.match(text, /已落盘/);
  const txtPath = /已落盘：(.+\.txt)/.exec(text)[1].trim();
  assert.ok(fs.existsSync(txtPath));
  assert.match(fs.readFileSync(txtPath, 'utf8'), /marker-1001/);
});

await step('错误路径：不存在文件 → isError 中文', async () => {
  const { text, isError } = await call('zhifang_info', { path: path.join(FIX, '不存在.pdf') });
  assert.ok(isError);
  assert.match(text, /失败：.*不存在/);
});

await step('错误路径：相对路径 → isError 引导绝对路径', async () => {
  const { text, isError } = await call('zhifang_info', { path: 'a.pdf' });
  assert.ok(isError);
  assert.match(text, /绝对路径/);
});

await step('错误路径：非 PDF 内容 → isError 指出文件头', async () => {
  const { text, isError } = await call('zhifang_info', { path: notPdf });
  assert.ok(isError);
  assert.match(text, /不是 PDF/);
});

await step('错误路径：损坏 PDF → isError 可操作提示（非英文堆栈）', async () => {
  const { text, isError } = await call('zhifang_info', { path: broken });
  assert.ok(isError);
  assert.match(text, /失败：.*(无法解析|损坏|处理失败)/);
  assert.doesNotMatch(text, /at .*\(/);
});

await step('错误路径：merge 单文件 → isError 需要两个', async () => {
  const { text, isError } = await call('zhifang_merge', { paths: [a] });
  assert.ok(isError);
  assert.match(text, /至少需要 2 个/);
});

await step('降级路径：桥不可达（无宿主）时全部工具照常工作', async () => {
  // 整个测试跑在无宿主环境：以上每一步都已在降级下成功，这里再显式确认进程仍活
  const res = await rpc('tools/list', {});
  assert.equal(res.result.tools.length, 5);
});

child.kill();
fs.rmSync(TMP, { recursive: true, force: true });

if (failed) {
  console.log(`\nmcp-verify: ${failed} 步失败`);
  process.exit(1);
}
console.log('\nmcp-verify: 全部通过（stdio 生命周期 + 5 工具 + 错误口径 + 降级）');
