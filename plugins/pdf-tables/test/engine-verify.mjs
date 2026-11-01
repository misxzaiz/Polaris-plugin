/**
 * 表格提取台引擎产物级验收（node test/engine-verify.mjs）
 *
 * 「真 PDF → 真 pdfjs 坐标 → 真网格 → 真 xlsx/csv/json 字节」全链路：
 *   - 自造中文流水表 fixture（pdf-lib + 等线字体，右对齐金额 + 格线）
 *   - detect：逐页表格候选（行列数/表头/金额单元格逐值断言）
 *   - extract xlsx：exceljs 回读（数字列必须是 number 类型可直接 SUM）
 *   - extract csv：BOM + RFC4180 回读
 *   - extract json：结构回读
 *   - 跨页续表：mergePages 开/关两种口径
 *   - 边界：无表格页 / 扫描件（无文字层）/ 损坏 PDF / 纯对齐无格线表
 *   - 纯函数单测：右对齐列聚类 / 续行合并（合成坐标，不依赖 PDF）
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const engine = require('../service/table-engine.js');
const core = require('../shared/core.js');
const ExcelJS = require('../vendor/exceljs.min.js');
const { makeTableDoc, statementCols, statementRows, STATEMENT_HEADER, loadCjkFont } = require('./fixtures.mjs');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-tables-engine-'));

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

console.log('pdf-tables engine-verify（fixtures: ' + TMP + '）');

// ── fixture 准备 ────────────────────────────────────────────────────────────

const HEADER_ROW = { cells: STATEMENT_HEADER, kind: 'header' };
const DATA_ROWS = statementRows(8, 10000);
const page1Spec = { cols: statementCols(), rows: [HEADER_ROW, ...DATA_ROWS.map((r) => ({ cells: r }))], footer: '第 1 页 / 共 2 页' };

const stmtA = path.join(TMP, '流水A.pdf');
fs.writeFileSync(stmtA, await makeTableDoc({ pages: [page1Spec] }));

// 纯对齐无格线（一些导出器不打线）
const stmtB = path.join(TMP, '流水B-无格线.pdf');
fs.writeFileSync(stmtB, await makeTableDoc({ pages: [page1Spec], withLines: false }));

// 跨页续表：第 2 页重复表头 + 4 行
const moreRows = statementRows(4, 99999).map((r) => ({ cells: r }));
const stmtC = path.join(TMP, '流水C-跨页.pdf');
fs.writeFileSync(stmtC, await makeTableDoc({
  pages: [page1Spec, { cols: statementCols(), rows: [HEADER_ROW, ...moreRows], footer: '第 2 页 / 共 2 页' }],
}));

// 无表格页（段落文字）
const paraDoc = await makeTableDoc({
  pages: [{
    cols: [{ left: 40 }],
    rows: [
      { cells: ['本人同意上述授权条款，并确认以下信息真实有效。如有虚假，愿承担相应法律责任。'] },
      { cells: ['本声明适用于 2026 年 1 月 1 日至 2026 年 12 月 31 日期间的全部业务办理。'] },
      { cells: ['特此声明。'] },
    ],
    rowH: 18,
  }],
  withLines: false,
});
const para = path.join(TMP, '声明页.pdf');
fs.writeFileSync(para, paraDoc);

// 扫描件模拟：只有一页、零文字
const { PDFDocument } = require('pdf-lib');
const scanDoc = await PDFDocument.create();
scanDoc.addPage([595, 842]);
const scan = path.join(TMP, '扫描件.pdf');
fs.writeFileSync(scan, Buffer.from(await scanDoc.save()));

// 损坏 PDF
const broken = path.join(TMP, '损坏.pdf');
fs.writeFileSync(broken, Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from('garbage'.repeat(200))]));

const asInput = (p) => ({ name: path.basename(p), bytes: fs.readFileSync(p) });

// ── A：带格线流水表 ─────────────────────────────────────────────────────────

let gridA = null;
await step('A.detect：检出 1 张表（8 行×5 列，表头逐格相等）', async () => {
  const r = await engine.runOp('detect', [asInput(stmtA)], {});
  assert.equal(r.totalTables, 1, 'totalTables=' + r.totalTables);
  const t = r.pageResults[0].tables[0];
  assert.equal(t.colCount, 5);
  assert.equal(t.rowsCount, 8);
  assert.deepEqual(t.header, STATEMENT_HEADER);
  assert.ok(t.fillRatio >= 0.6, 'fillRatio=' + t.fillRatio);
  gridA = t.preview;
});

await step('A.detect：金额/日期单元格逐值正确（含中文摘要与千分位）', async () => {
  const body = gridA.slice(1);
  assert.equal(body[0][0], '2026-01-02');
  assert.equal(body[0][1], '工资代发');
  assert.equal(body[0][2], '12,500.00');
  assert.equal(body[0][4], '22500.00', '余额=期初 10000+收入 12500');
  assert.equal(body[1][1], '超市购物');
  assert.equal(body[1][3], '286.50');
});

await step('A.extract xlsx：exceljs 回读，数字列是 number 类型', async () => {
  const r = await engine.runOp('extract', [asInput(stmtA)], { format: 'xlsx' });
  assert.equal(r.outputs.length, 1);
  fs.mkdirSync(path.join(TMP, 'out'), { recursive: true });
  fs.writeFileSync(path.join(TMP, 'out', r.outputs[0].name), r.outputs[0].bytes);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(r.outputs[0].bytes);
  const ws = wb.worksheets[0];
  assert.equal(ws.name, '表格1');
  assert.equal(ws.getCell('A1').value, '交易日期');
  assert.equal(ws.getCell('A2').value, '2026-01-02');
  const c2 = ws.getCell('C2').value;
  assert.equal(typeof c2, 'number', 'C2 类型=' + typeof c2);
  assert.equal(c2, 12500);
  assert.equal(ws.getCell('E2').value, 22500, '余额列数值化');
  // 可直接求和：收入列 8 行
  let sum = 0;
  for (let row = 2; row <= 9; row++) {
    const v = ws.getCell('C' + row).value;
    if (typeof v === 'number') sum += v;
  }
  assert.equal(sum, 18388, '收入列 SUM=' + sum);
});

await step('A.extract csv：BOM + 回读行数/内容', async () => {
  const r = await engine.runOp('extract', [asInput(stmtA)], { format: 'csv' });
  assert.equal(r.outputs.length, 1);
  assert.match(r.outputs[0].name, /\.csv$/);
  const buf = r.outputs[0].bytes;
  assert.equal(buf[0], 0xef && 0xef, 'BOM byte1');
  assert.equal(buf[1], 0xbb);
  assert.equal(buf[2], 0xbf);
  const text = buf.toString('utf8').replace(/^\ufeff/, '');
  const lines = text.trim().split('\r\n');
  assert.equal(lines.length, 9, 'csv 行数=' + lines.length);
  assert.ok(lines[0].startsWith('交易日期,摘要'));
  assert.ok(lines[1].includes('工资代发'));
  assert.ok(lines[1].includes('12,500.00'));
});

await step('A.extract json：结构回读', async () => {
  const r = await engine.runOp('extract', [asInput(stmtA)], { format: 'json' });
  const json = JSON.parse(r.outputs[0].bytes.toString('utf8'));
  assert.ok(Array.isArray(json) && json.length === 1);
  assert.deepEqual(json[0].header, STATEMENT_HEADER);
  assert.equal(json[0].rows.length, 8);
  assert.equal(json[0].rows[2][2], '');
});

await step('A.extract all：三种格式共 3 份输出', async () => {
  const r = await engine.runOp('extract', [asInput(stmtA)], { format: 'all' });
  assert.equal(r.outputs.length, 3);
  const exts = r.outputs.map((o) => path.extname(o.name)).sort();
  assert.deepEqual(exts, ['.csv', '.json', '.xlsx']);
});

await step('A.extract：mergePages 默认开（单页不受影响）', async () => {
  const r = await engine.runOp('extract', [asInput(stmtA)], { format: 'xlsx' });
  assert.equal(r.mergedPages, true);
  assert.equal(r.tablesExtracted, 1);
});

// ── B：无格线纯对齐 ────────────────────────────────────────────────────────

await step('B.detect：无格线表同样检出（对齐策略）', async () => {
  const r = await engine.runOp('detect', [asInput(stmtB)], {});
  assert.equal(r.totalTables, 1, 'totalTables=' + r.totalTables);
  const t = r.pageResults[0].tables[0];
  assert.equal(t.colCount, 5);
  assert.deepEqual(t.header, STATEMENT_HEADER);
  assert.equal(t.preview[1][1], '工资代发');
});

// ── C：跨页续表 ─────────────────────────────────────────────────────────────

await step('C.detect：两页各检出 1 张表', async () => {
  const r = await engine.runOp('detect', [asInput(stmtC)], {});
  assert.equal(r.totalTables, 2);
  assert.equal(r.pageResults[0].tables[0].rowsCount, 8);
  assert.equal(r.pageResults[1].tables[0].rowsCount, 4);
});

await step('C.extract：跨页合并 → 1 张表 12 行数据（表头去重）', async () => {
  const r = await engine.runOp('extract', [asInput(stmtC)], { format: 'xlsx', mergePages: true });
  assert.equal(r.tablesExtracted, 1);
  assert.equal(r.rowsTotal, 13, '表头+12 数据行，rowsTotal=' + r.rowsTotal);
  const out = path.join(TMP, 'out', r.outputs[0].name);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, r.outputs[0].bytes);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(r.outputs[0].bytes);
  const ws = wb.worksheets[0];
  assert.equal(ws.actualRowCount >= 13, true, '实际行数 ' + ws.actualRowCount);
  assert.equal(ws.getCell('A10').value, '2026-01-02', '第 2 页首行接在第 1 页 8 行之后');
});

await step('C.extract：mergePages=false → 2 张表独立输出（sheet 名带页号）', async () => {
  const r = await engine.runOp('extract', [asInput(stmtC)], { format: 'xlsx', mergePages: false });
  assert.equal(r.tablesExtracted, 2);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(r.outputs[0].bytes);
  const names = wb.worksheets.map((w) => w.name);
  assert.ok(names.some((n) => n.includes('第1页')), 'sheet 名含页号: ' + names.join(','));
  assert.ok(names.some((n) => n.includes('第2页')), 'sheet 名含页号: ' + names.join(','));
});

await step('C.read：跨页合并读出 markdown 表（首行为表头分隔）', async () => {
  const r = await engine.runOp('read', [asInput(stmtC)], {});
  assert.ok(r.text.startsWith('| 交易日期'));
  assert.ok(r.text.includes('| --- |'));
  assert.equal(r.rowsTotal, 13);
  assert.deepEqual(r.sourcePages, [1, 2]);
  assert.ok(r.text.includes('工资代发'));
});

await step('C.read：tsv 格式 + maxRows 截断', async () => {
  const r = await engine.runOp('read', [asInput(stmtC)], { format: 'tsv', maxRows: 5 });
  assert.equal(r.truncated, true);
  const lines = r.text.split('\n');
  assert.equal(lines.length, 5);
  assert.ok(lines[0].includes('\t'));
});

// ── 边界 ────────────────────────────────────────────────────────────────────

await step('边界.detect：纯段落页 → 0 张表 + note 说明', async () => {
  const r = await engine.runOp('detect', [asInput(para)], {});
  assert.equal(r.totalTables, 0);
  assert.match(r.note, /未检出表格/);
});

await step('边界.extract：纯段落页 → 明确中文拒绝（不硬造表格）', async () => {
  await assert.rejects(
    () => engine.runOp('extract', [asInput(para)], { format: 'xlsx' }),
    /未检出表格/,
  );
});

await step('边界.detect：无文字层（扫描件）→ 明确拒绝不做 OCR', async () => {
  await assert.rejects(
    () => engine.runOp('detect', [asInput(scan)], {}),
    /没有可提取的文字层.*OCR/,
  );
  await assert.rejects(
    () => engine.runOp('extract', [asInput(scan)], {}),
    /没有可提取的文字层/,
  );
});

await step('边界：损坏 PDF → 可操作中文错误（非英文堆栈）', async () => {
  await assert.rejects(
    () => engine.runOp('detect', [asInput(broken)], {}),
    (e) => {
      const m = String(e && e.message || e);
      return /损坏|无法解析|处理失败|加密/.test(m) && !/at \w+ \(/.test(m);
    },
  );
});

await step('边界：非 PDF 字节 → 文件头拒绝', async () => {
  await assert.rejects(
    () => engine.runOp('detect', [{ name: 'x.pdf', bytes: Buffer.from('hello world') }], {}),
    /不是 PDF/,
  );
});

await step('边界：未知 op → 中文报错', async () => {
  await assert.rejects(() => engine.runOp('compress', [asInput(stmtA)], {}), /未知操作/);
});

// ── 纯函数：列聚类 / 续行合并（合成坐标）───────────────────────────────────

await step('纯函数：右对齐数字列按区间重叠聚成一列', async () => {
  // 同一列的三段：x1 恒为 500，x0 因位数不同而漂移；另一列在左侧
  const rows = [
    [{ text: '日期', x0: 40, x1: 70, cy: 100, h: 10 }, { text: '1.00', x0: 490, x1: 500, cy: 100, h: 10 }],
    [{ text: '摘要', x0: 40, x1: 70, cy: 80, h: 10 }, { text: '123.00', x0: 467, x1: 500, cy: 80, h: 10 }],
    [{ text: '备注', x0: 40, x1: 70, cy: 60, h: 10 }, { text: '1,234.56', x0: 444, x1: 500, cy: 60, h: 10 }],
  ];
  const rowSegList = rows.map((r) => engine.rowSegments(r));
  const cols = engine.buildColumns(rowSegList.flat());
  assert.equal(cols.length, 2, '聚出列数=' + cols.length);
  const gridRows = engine.assignRows(rowSegList, cols);
  assert.equal(gridRows[0].cells[1], '1.00');
  assert.equal(gridRows[2].cells[1], '1,234.56');
  const blocks = engine.findBlocks(gridRows, {});
  assert.equal(blocks.length, 1);
  const m = engine.materializeBlock(gridRows, blocks[0]);
  assert.deepEqual(m.rows[0], ['日期', '1.00']);
});

await step('纯函数：块内 1 格行（续文）并入上方同列', async () => {
  const rows = [
    [{ text: '日期', x0: 40, x1: 70, cy: 100, h: 10 }, { text: '金额', x0: 200, x1: 240, cy: 100, h: 10 }],
    [{ text: '01-02', x0: 40, x1: 70, cy: 80, h: 10 }, { text: '10.00', x0: 200, x1: 240, cy: 80, h: 10 }],
    [{ text: '（备注续文）', x0: 200, x1: 260, cy: 60, h: 10 }],
    [{ text: '01-03', x0: 40, x1: 70, cy: 40, h: 10 }, { text: '20.00', x0: 200, x1: 240, cy: 40, h: 10 }],
  ];
  const rowSegList = rows.map((r) => engine.rowSegments(r));
  const cols = engine.buildColumns(rowSegList.flat());
  const gridRows = engine.assignRows(rowSegList, cols);
  const blocks = engine.findBlocks(gridRows, {});
  const m = engine.materializeBlock(gridRows, blocks[0]);
  // 续文行并进 01-02 行的第 2 列
  assert.equal(m.rows.length, 3, '行数=' + m.rows.length);
  assert.ok(m.rows[1][1].includes('10.00') && m.rows[1][1].includes('备注续文'), '续文并入: ' + m.rows[1][1]);
  assert.deepEqual(m.rows[2], ['01-03', '20.00']);
});

await step('纯函数：buildRows 按视觉 y 分行', async () => {
  const engine2 = engine;
  const items = [
    { text: 'a', x0: 10, x1: 20, cy: 100, h: 10 },
    { text: 'b', x0: 30, x1: 40, cy: 99, h: 10 },
    { text: 'c', x0: 10, x1: 20, cy: 80, h: 10 },
  ];
  const rows = engine2.buildRows(items);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0].map((i) => i.text), ['a', 'b']);
});

try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) { /* Windows 句柄容忍 */ }

if (failed) {
  console.log(`\nengine-verify: ${failed} 步失败`);
  process.exit(1);
}
console.log('\nengine-verify: 全部通过（真 PDF→坐标→网格→xlsx/csv/json 产物级）');
