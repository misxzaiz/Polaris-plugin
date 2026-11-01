/**
 * 表格提取台 core 逻辑测试（node --test test/run-tests.mjs）
 * 覆盖：数值归一（金额/括号负数/币符/账号拒判）、CSV 转义与 BOM、单元格清洗、
 *       同构表头判断、输出命名冲突链、stem 消毒、魔数、输入校验、设置归一化、
 *       页码规格、sheet 名消毒、列宽估算。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../shared/core.js');

// ── parseNumeric ────────────────────────────────────────────────────────────

test('parseNumeric：金额形态归一', () => {
  assert.equal(core.parseNumeric('1,234.56'), 1234.56);
  assert.equal(core.parseNumeric('-12.00'), -12);
  assert.equal(core.parseNumeric('¥3,000'), 3000);
  assert.equal(core.parseNumeric('$1,000.10'), 1000.1);
  assert.equal(core.parseNumeric('(500)'), -500, '财务括号负数');
  assert.equal(core.parseNumeric('(1,234.56)'), -1234.56);
  assert.equal(core.parseNumeric('0.00'), 0);
  assert.equal(core.parseNumeric(' 42 '), 42, '首尾空白容忍');
});

test('parseNumeric：非数值一律 null（保留原文不猜）', () => {
  assert.equal(core.parseNumeric('2026-01-02'), null);
  assert.equal(core.parseNumeric('工资代发'), null);
  assert.equal(core.parseNumeric('12,34.56.78'), null);
  assert.equal(core.parseNumeric(''), null);
  assert.equal(core.parseNumeric('   '), null);
  assert.equal(core.parseNumeric('12a'), null);
  assert.equal(core.parseNumeric('1.2.3'), null);
  assert.equal(core.parseNumeric('-'), null);
  assert.equal(core.parseNumeric('6222020200112233445'), null, '19 位账号不判金额');
  assert.equal(core.parseNumeric('13800138000'), null, '11 位手机号不判金额');
});

test('parseNumeric：ID 形态护栏（≥11 位无分隔纯整数保留原文）', () => {
  assert.equal(core.parseNumeric('123456789012345'), null, '15 位无分隔=ID 形态');
  assert.equal(core.parseNumeric('12345678901'), null, '11 位无分隔=ID 形态');
  assert.equal(core.parseNumeric('1234567890'), 1234567890, '10 位仍判数值');
  assert.equal(core.parseNumeric('1,234,567,890'), 1234567890, '有千分位分隔=金额口径');
  assert.equal(core.parseNumeric('999999999.99'), 999999999.99, '有小数点=金额口径');
});

// ── CSV ─────────────────────────────────────────────────────────────────────

test('csvEscape：引号/逗号/换行包裹，普通值裸放', () => {
  assert.equal(core.csvEscape('abc'), 'abc');
  assert.equal(core.csvEscape('a,b'), '"a,b"');
  assert.equal(core.csvEscape('say "hi"'), '"say ""hi"""');
  assert.equal(core.csvEscape('line1\nline2'), '"line1\nline2"');
  assert.equal(core.csvEscape(''), '');
  assert.equal(core.csvEscape(null), '');
});

test('gridToCSV：CRLF 行尾 + 全网格', () => {
  const csv = core.gridToCSV([['a', 'b'], ['c', 'd,e']]);
  assert.equal(csv, 'a,b\r\nc,"d,e"\r\n');
});

test('csvBytes：UTF-8 BOM 头（中文 Excel 双击直开）', () => {
  const buf = core.csvBytes([['交易日期', '金额']]);
  assert.equal(buf[0], 0xef);
  assert.equal(buf[1], 0xbb);
  assert.equal(buf[2], 0xbf);
  assert.ok(buf.toString('utf8').includes('交易日期'));
});

// ── 单元格清洗与表头同构 ────────────────────────────────────────────────────

test('cleanCell：内部换行折空格、去首尾', () => {
  assert.equal(core.cleanCell('转账\n房租'), '转账 房租');
  assert.equal(core.cleanCell('  a  b  '), 'a  b');
  assert.equal(core.cleanCell(null), '');
  assert.equal(core.cleanCell('x\n\ny'), 'x y');
});

test('sameHeader：跨页续表判据', () => {
  assert.ok(core.sameHeader(['日期', '金额'], ['日期', '金额']));
  assert.ok(core.sameHeader(['日期', '金 额'], ['日期', '金  额']), '空白差异容忍');
  assert.ok(!core.sameHeader(['日期', '金额'], ['日期', '余额']));
  assert.ok(!core.sameHeader(['日期', '金额'], ['日期', '金额', '备注']), '列数不同不同构');
  assert.ok(!core.sameHeader(['', ''], ['', '']), '全空表头不算同构');
  assert.ok(!core.sameHeader([], ['日期']));
  assert.ok(!core.sameHeader(null, ['日期']));
});

// ── 输出命名 ────────────────────────────────────────────────────────────────

test('pickOutputName：冲突自动 -2/-3 递增（永不覆盖）', () => {
  const existing = new Set(['D:\\out\\a.xlsx']);
  const exists = (p) => existing.has(p);
  const first = core.pickOutputName('D:\\out', 'a', '.xlsx', exists);
  assert.equal(first, 'D:\\out\\a-2.xlsx');
  existing.add(first);
  assert.equal(core.pickOutputName('D:\\out', 'a', '.xlsx', exists), 'D:\\out\\a-3.xlsx');
  assert.equal(core.pickOutputName('D:\\out', 'b', '.csv', exists), 'D:\\out\\b.csv', '无冲突直接用');
});

test('sanitizeStem：路径成分/非法字符/Windows 保留名/空名', () => {
  assert.equal(core.sanitizeStem('a b.pdf'), 'a b');
  assert.equal(core.sanitizeStem('C:\\evil\\path\\name.pdf'), 'name', '取最后一段');
  assert.equal(core.sanitizeStem('..\\..\\boot.ini'), 'boot', '目录穿越成分剥离');
  assert.equal(core.sanitizeStem('a<b>:c?.pdf'), 'a_b__c_');
  assert.equal(core.sanitizeStem('CON.xlsx'), '_CON', 'Windows 保留设备名');
  assert.equal(core.sanitizeStem(''), 'output');
  assert.equal(core.sanitizeStem('流水 2026.pdf'), '流水 2026', '中文保留');
});

// ── 魔数与校验 ──────────────────────────────────────────────────────────────

test('isPdfBytes：容忍前导垃圾、拒绝非 PDF', () => {
  assert.ok(core.isPdfBytes(Buffer.from('%PDF-1.7 rest')));
  assert.ok(core.isPdfBytes(Buffer.concat([Buffer.from('\ufeffjunk...'), Buffer.from('%PDF-1.4')])));
  const late = Buffer.concat([Buffer.alloc(1100, 0x41), Buffer.from('%PDF-1.4')]);
  assert.ok(!core.isPdfBytes(late));
  assert.ok(!core.isPdfBytes(Buffer.from('plain text')));
  assert.ok(!core.isPdfBytes(Buffer.alloc(0)));
});

test('validateInputs：总量上限/类型过滤/空单拒绝', () => {
  assert.throws(() => core.validateInputs([], { maxBytes: 100 }), /没有收到任何输入/);
  assert.throws(() => core.validateInputs([{ name: 'a.pdf', size: 10 }], { maxBytes: 5 }), /超过上限/);
  assert.throws(() => core.validateInputs([{ name: 'a.txt', size: 1 }], { maxBytes: 100 }), /不是 PDF/);
  assert.throws(() => core.validateInputs([{ name: '', size: 1 }], { maxBytes: 100 }), /缺少文件名/);
  const ok = core.validateInputs([{ name: 'a.PDF', size: 1 }], { maxBytes: 100 });
  assert.equal(ok.length, 1);
  const tooMany = Array.from({ length: 51 }, (_, i) => ({ name: 'f' + i + '.pdf', size: 0 }));
  assert.throws(() => core.validateInputs(tooMany, { maxBytes: 1e9 }), /最多处理 50/);
});

// ── 设置归一化 ──────────────────────────────────────────────────────────────

test('normalizeSettings：钳制与默认（含格式/合并默认值）', () => {
  assert.deepEqual(core.normalizeSettings(null), { outDir: '', maxUploadMB: 128, historyCap: 200, format: 'xlsx', mergePages: true });
  assert.deepEqual(core.normalizeSettings({ outDir: ' D:\\x ', maxUploadMB: 99999, historyCap: 0, format: 'weird' }),
    { outDir: 'D:\\x', maxUploadMB: 1024, historyCap: 10, format: 'xlsx', mergePages: true });
  assert.deepEqual(core.normalizeSettings({ format: 'csv', mergePages: false }), { outDir: '', maxUploadMB: 128, historyCap: 200, format: 'csv', mergePages: false });
  assert.deepEqual(core.normalizeSettings({ maxUploadMB: '64' }), { outDir: '', maxUploadMB: 64, historyCap: 200, format: 'xlsx', mergePages: true });
});

// ── 页码规格 ────────────────────────────────────────────────────────────────

test('parsePageSpec：单页/区间/all/end/越界中文报错', () => {
  assert.deepEqual(core.parsePageSpec('1-3,7', 10), [1, 2, 3, 7]);
  assert.deepEqual(core.parsePageSpec('all', 4), [1, 2, 3, 4]);
  assert.deepEqual(core.parsePageSpec('3-end', 6), [3, 4, 5, 6]);
  assert.deepEqual(core.parsePageSpec(4, 6), [4]);
  assert.throws(() => core.parsePageSpec('0', 10), /从 1 开始/);
  assert.throws(() => core.parsePageSpec('1-11', 10), /超过文档总页数/);
  assert.throws(() => core.parsePageSpec('abc', 10), /无法识别/);
  assert.throws(() => core.parsePageSpec('', 10), /为空/);
});

test('compactRanges：压缩连续页', () => {
  assert.equal(core.compactRanges([1, 2, 3, 7]), '1-3,7');
  assert.equal(core.compactRanges([5]), '5');
  assert.equal(core.compactRanges([]), '');
});

// ── sheet 名与列宽 ──────────────────────────────────────────────────────────

test('safeSheetName：Excel 非法字符消毒 + 去重 + 31 字符上限', () => {
  const used = new Set();
  assert.equal(core.joinPath ? 'ok' : 'ok', 'ok');
  // safeSheetName 在引擎模块，这里间接从引擎拿（避免重复实现漂移）
  return import('../service/table-engine.js').then((engine) => {
    assert.equal(engine.safeSheetName('表格-第1页', used), '表格-第1页');
    assert.equal(engine.safeSheetName('表格-第1页', used), '表格-第1页_2', '重名去重');
    const long = 'x'.repeat(40);
    assert.ok(engine.safeSheetName(long, used).length <= 31);
    assert.equal(engine.safeSheetName('a[b]:c*?d/e\\f', new Set()), 'a_b__c__d_e_f');
  });
});

test('displayWidth：CJK 算 2', async () => {
  const engine = await import('../service/table-engine.js');
  assert.equal(engine.displayWidth('abc'), 3);
  assert.equal(engine.displayWidth('交易日期'), 8);
  assert.equal(engine.displayWidth('a金b'), 4);
});
