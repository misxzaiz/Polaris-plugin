/**
 * 表格提取台 MCP 全流程验证（node test/mcp-verify.mjs）
 * spawn 真实 stdio server（fixture 目录当 appConfigDir，桥不可达=降级路径）：
 *   initialize → tools/list（3 工具）→ 真实文件操作（fixture 流水表）→ 产物断言 →
 *   错误路径（不存在/相对路径/非 PDF/损坏/无表格/扫描件）isError 中文提示 → 永不覆盖（二次提取 -2）。
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
const { makeTableDoc, statementCols, statementRows, STATEMENT_HEADER } = require('./fixtures.mjs');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-tables-mcp-'));
const FIX = path.join(TMP, 'fix');
fs.mkdirSync(FIX, { recursive: true });

const HEADER_ROW = { cells: STATEMENT_HEADER, kind: 'header' };
const stmt = path.join(FIX, '银行流水.pdf');
fs.writeFileSync(stmt, await makeTableDoc({
  pages: [
    { cols: statementCols(), rows: [HEADER_ROW, ...statementRows(6).map((r) => ({ cells: r }))] },
    { cols: statementCols(), rows: [HEADER_ROW, ...statementRows(3, 50000).map((r) => ({ cells: r }))] },
  ],
}));
const para = path.join(FIX, '声明页.pdf');
fs.writeFileSync(para, await makeTableDoc({
  pages: [{
    cols: [{ left: 40 }],
    rows: [{ cells: ['本声明一式两份，具有同等法律效力，自签署之日起生效。'] }, { cells: ['特此声明。'] }],
    rowH: 18,
  }],
  withLines: false,
}));
const { PDFDocument } = require('pdf-lib');
const scanDoc = await PDFDocument.create();
scanDoc.addPage([595, 842]);
const scan = path.join(FIX, '扫描件.pdf');
fs.writeFileSync(scan, Buffer.from(await scanDoc.save()));
const notPdf = path.join(FIX, '假文件.pdf');
fs.writeFileSync(notPdf, Buffer.from('this is definitely not a pdf'));
const broken = path.join(FIX, '损坏.pdf');
fs.writeFileSync(broken, Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from('garbage'.repeat(200))]));

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
    const timer = setTimeout(() => reject(new Error('rpc 超时: ' + method)), 60000);
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
    console.log('  ✖', name, '\n    ', String(e && e.message || e).split('\n')[0].slice(0, 300));
  }
}

console.log('pdf-tables mcp-verify（fixtures: ' + FIX + '）');

await step('initialize：握手返回 pdf-tables serverInfo', async () => {
  const res = await rpc('initialize', {});
  assert.equal(res.result.serverInfo.name, 'pdf-tables');
  assert.ok(res.result.capabilities.tools);
});

await step('notifications/initialized 不崩溃', async () => {
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  await new Promise((r) => setTimeout(r, 100));
});

await step('tools/list：恰好 3 个 pdf_tables_* 工具', async () => {
  const res = await rpc('tools/list', {});
  const names = res.result.tools.map((t) => t.name);
  assert.deepEqual(names.sort(), ['pdf_tables_extract', 'pdf_tables_info', 'pdf_tables_preview']);
  for (const t of res.result.tools) assert.ok(t.description.length > 30, t.name + ' description 过短');
});

await step('pdf_tables_info：逐页表格摘要（中文，行列数/表头）', async () => {
  const { text, isError } = await call('pdf_tables_info', { path: stmt });
  assert.ok(!isError, text);
  assert.match(text, /共 2 页，检出 2 张表格/);
  assert.match(text, /交易日期 \| 摘要/);
  assert.match(text, /6 行 × 5 列/);
  assert.match(text, /3 行 × 5 列/);
  assert.match(text, /工资代发/);
});

await step('pdf_tables_preview：markdown 表可读（跨页合并 10 行=表头+9 数据）', async () => {
  const { text, isError } = await call('pdf_tables_preview', { path: stmt });
  assert.ok(!isError, text);
  assert.match(text, /第 1\/2 页/);
  assert.match(text, /\| 交易日期/);
  assert.match(text, /\| --- \|/);
  assert.match(text, /工资代发/);
  assert.match(text, /10 行 × 5 列/);
});

await step('pdf_tables_preview：tsv 格式 + maxRows 截断', async () => {
  const { text, isError } = await call('pdf_tables_preview', { path: stmt, format: 'tsv', maxRows: 4 });
  assert.ok(!isError, text);
  const lines = text.split('\n').filter((l) => l.includes('\t'));
  assert.equal(lines.length, 4, 'tsv 行数');
});

await step('pdf_tables_extract：xlsx 落盘 + 数字列（产物存在）', async () => {
  const { text, isError } = await call('pdf_tables_extract', { path: stmt, format: 'xlsx' });
  assert.ok(!isError, text);
  assert.match(text, /1 张表、共 10 行/);
  const outPath = /输出：(.+\.xlsx)/.exec(text)[1].trim();
  assert.ok(fs.existsSync(outPath), '输出存在: ' + outPath);
  assert.ok(fs.statSync(outPath).size > 1000, 'xlsx 非空');
});

await step('pdf_tables_extract：二次执行不覆盖（-2 后缀）', async () => {
  const first = await call('pdf_tables_extract', { path: stmt, format: 'csv' });
  assert.ok(!first.isError, first.text);
  const firstPath = /输出：(.+\.csv)/.exec(first.text)[1].trim();
  assert.ok(fs.existsSync(firstPath));
  const second = await call('pdf_tables_extract', { path: stmt, format: 'csv' });
  const secondPath = /输出：(.+\.csv)/.exec(second.text)[1].trim();
  assert.match(path.basename(secondPath), /-2\.csv$/, '第二次输出自动改名');
  const content = fs.readFileSync(secondPath, 'utf8');
  assert.ok(content.startsWith('\ufeff'), 'CSV 带 BOM');
});

await step('pdf_tables_extract：format=all 三份输出', async () => {
  const { text, isError } = await call('pdf_tables_extract', { path: stmt, format: 'all' });
  assert.ok(!isError, text);
  assert.match(text, /\.csv/);
  assert.match(text, /\.json/);
  assert.match(text, /\.xlsx/);
});

await step('错误路径：不存在文件 → isError 中文', async () => {
  const { text, isError } = await call('pdf_tables_info', { path: path.join(FIX, '不存在.pdf') });
  assert.ok(isError);
  assert.match(text, /失败：.*不存在/);
});

await step('错误路径：相对路径 → isError 引导绝对路径', async () => {
  const { text, isError } = await call('pdf_tables_info', { path: 'a.pdf' });
  assert.ok(isError);
  assert.match(text, /绝对路径/);
});

await step('错误路径：非 PDF 内容 → isError 指出文件头', async () => {
  const { text, isError } = await call('pdf_tables_info', { path: notPdf });
  assert.ok(isError);
  assert.match(text, /不是 PDF/);
});

await step('错误路径：损坏 PDF → isError 可操作提示（非英文堆栈）', async () => {
  const { text, isError } = await call('pdf_tables_info', { path: broken });
  assert.ok(isError);
  assert.match(text, /失败：.*(损坏|无法解析|处理失败)/);
  assert.doesNotMatch(text, /at .*\(/);
});

await step('错误路径：无表格页 → isError 明确说明（不硬造）', async () => {
  const { text, isError } = await call('pdf_tables_extract', { path: para });
  assert.ok(isError);
  assert.match(text, /未检出表格/);
});

await step('错误路径：扫描件（无文字层）→ isError 明示不做 OCR', async () => {
  const { text, isError } = await call('pdf_tables_preview', { path: scan });
  assert.ok(isError);
  assert.match(text, /没有可提取的文字层.*OCR/);
});

await step('降级路径：桥不可达（无宿主）时全部工具照常工作', async () => {
  const res = await rpc('tools/list', {});
  assert.equal(res.result.tools.length, 3);
});

child.kill();
fs.rmSync(TMP, { recursive: true, force: true });

if (failed) {
  console.log(`\nmcp-verify: ${failed} 步失败`);
  process.exit(1);
}
console.log('\nmcp-verify: 全部通过（stdio 生命周期 + 3 工具 + 错误口径 + 降级）');
