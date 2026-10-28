/**
 * 格致 core 逻辑测试（node --test test/run-tests.mjs）
 * 覆盖：CSV/TSV 解析（RFC4180 引号/内嵌换行/定界符探测）、编码探测（UTF-8/GB18030/BOM）、
 *       类型推断与值转换、spec 归一化（护栏/公式模板/sheet 名合法性/查重）、
 *       布局数学（列宽/区间/汇总公式/条件格式 ref）、文件名净化、列字母。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const core = require('../shared/core.js');

// ── CSV / DSV 解析 ─────────────────────────────────────────────────────────
test('parseDSV：RFC4180 引号转义与内嵌换行/定界符', () => {
  const r = core.parseDSV('a,"b,1","he said ""hi""\nok",c\n1,2,3,4', ',');
  assert.equal(r.errors.length, 0);
  assert.deepEqual(r.rows[0], ['a', 'b,1', 'he said "hi"\nok', 'c']);
  assert.deepEqual(r.rows[1], ['1', '2', '3', '4']);
});

test('parseDSV：内嵌换行不切行、拖尾换行不产空记录、未闭合引号报错', () => {
  const r1 = core.parseDSV('a,"多\n行",b\n', ',');
  assert.equal(r1.rows.length, 1);
  assert.equal(r1.rows[0].length, 3);
  const r2 = core.parseDSV('x,y\n"未闭合', ',');
  assert.ok(r2.errors.length >= 1);
});

test('detectDelimiter：Tab/分号/竖线/逗号四选一', () => {
  assert.equal(core.detectDelimiter('a\tb\tc\n1\t2\t3'), '\t');
  assert.equal(core.detectDelimiter('a;b;c\n1;2;3'), ';');
  assert.equal(core.detectDelimiter('a|b|c\n1|2|3'), '|');
  assert.equal(core.detectDelimiter('a,b,c\n1,2,3'), ',');
  // 引号内的定界符不计票
  assert.equal(core.detectDelimiter('"a,b"\t"x"\n1\t2'), '\t');
});

// ── 编码探测 ───────────────────────────────────────────────────────────────
test('decodeTableBytes：UTF-8 / BOM / UTF-16LE 直通；GB18030 回退', () => {
  const utf8 = Buffer.from('品名,金额\n苹果,3.5', 'utf8');
  assert.deepEqual(core.decodeTableBytes(utf8), { text: '品名,金额\n苹果,3.5', encoding: 'utf-8' });
  const bom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), utf8]);
  assert.equal(core.decodeTableBytes(bom).encoding, 'utf-8-sig');
  const u16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('品名,金额\n苹果,3.5', 'utf16le')]);
  assert.equal(core.decodeTableBytes(u16).encoding, 'utf-16le');
  // GB18030：手工构造「品名」的 GBK 字节（0xC6 0xB7 0xC3 0xFB）
  const gbk = Buffer.concat([Buffer.from([0xc6, 0xb7, 0xc3, 0xfb]), Buffer.from(',3.5', 'latin1')]);
  const dec = core.decodeTableBytes(gbk);
  assert.equal(dec.encoding, 'gb18030');
  assert.ok(dec.text.startsWith('品名'), dec.text);
});

test('decodeTableBytes：真 GBK 文件（python 生成 fixture；无 python 则跳过）', () => {
  try {
    const out = execFileSync('python', ['-c', "import sys; sys.stdout.buffer.write('日期,城市\\n2026-03-01,杭州\\n2026-03-02,西安'.encode('gbk'))"], { maxBuffer: 1024 * 64 });
    const dec = core.decodeTableBytes(out);
    assert.equal(dec.encoding, 'gb18030');
    assert.ok(dec.text.includes('杭州') && dec.text.includes('西安'));
    // 中文 CSV 直接可解析（乱码根治路径）
    const ing = core.ingestTable(dec.text);
    assert.equal(ing.error, undefined);
    assert.equal(ing.sheet.columns[1].h, '城市');
  } catch (e) {
    if (!String(e).includes('ENOENT') && !String(e).includes('spawn')) throw e;
    console.log('   (python 不可用，跳过 GBK fixture 测试)');
  }
});

// ── 类型推断与转换 ─────────────────────────────────────────────────────────
test('inferColumnType：money/percent/date/int/number/text 判定与混合回退', () => {
  assert.equal(core.inferColumnType(['¥3.5', '¥12', '￥2']).type, 'money');
  assert.equal(core.inferColumnType(['15%', '0.2', '30%']).type, 'percent');
  assert.equal(core.inferColumnType(['2026-03-05', '2026/3/8', '2026年3月12日']).type, 'date');
  assert.equal(core.inferColumnType([1, 2, 3]).type, 'int');
  assert.equal(core.inferColumnType([1.5, 2, '3,000']).type, 'number');
  assert.equal(core.inferColumnType(['苹果', '香蕉', '3']).type, 'text');
  assert.equal(core.inferColumnType([]).type, 'text');
});

test('coerceCell：货币/千分位/百分号/日期 → 规范值；空串/转不动 → null（保留原文由 normalizeBook 层负责）', () => {
  assert.equal(core.coerceCell('¥3,560.50', 'money'), 3560.5);
  assert.equal(core.coerceCell('15%', 'percent'), 0.15);
  assert.ok(core.coerceCell('2026-03-05', 'date') instanceof Date);
  assert.equal(core.coerceCell('  ', 'money'), null);
  assert.equal(core.coerceCell('N/A', 'money'), null);
  const d = core.coerceCell('2026/3/8', 'date');
  assert.equal(`${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`, '2026-3-8');
});

test('normalizeBook：数值列转不动的值保留原文（文本显示，不吞数据）', () => {
  const r = core.normalizeBook({
    title: '保留原文',
    sheets: [{ name: 'S', columns: [{ h: '金额', type: 'money' }], rows: [['¥3.5'], ['N/A'], ['']] }],
  });
  assert.equal(r.error, undefined);
  assert.equal(r.book.sheets[0].rows[0][0], 3.5);
  assert.equal(r.book.sheets[0].rows[1][0], 'N/A');
  assert.equal(r.book.sheets[0].rows[2][0], null);
});

// ── ingestTable ────────────────────────────────────────────────────────────
test('ingestTable：首行表头 + 列类型推断 + 警告收集', () => {
  const r = core.ingestTable('日期,品名,单价\n2026-03-05,红富士苹果,¥3.5\n2026-03-08,香蕉,¥2\n');
  assert.equal(r.error, undefined);
  assert.equal(r.delimiter, ',');
  assert.deepEqual(r.sheet.columns.map((c) => c.h), ['日期', '品名', '单价']);
  assert.deepEqual(r.sheet.columns.map((c) => c.type), ['date', 'text', 'money']);
  assert.equal(r.sheet.rows.length, 2);
  assert.equal(core.ingestTable('').error.includes('空'), true);
});

// ── normalizeBook ──────────────────────────────────────────────────────────
function goodBook(over = {}) {
  return {
    title: '三月采购台账',
    theme: 'slate',
    sheets: [{
      name: '明细',
      columns: [{ h: '品名', type: 'text' }, { h: '数量', type: 'int' }, { h: '单价', type: 'money' }, { h: '小计', type: 'money', formula: '=B{r}*C{r}' }],
      rows: [['苹果', 12, 3.5, null], ['香蕉', 20, 2, null]],
      stats: [{ type: 'sum', cols: [1, 2, 3] }],
      conditional: [{ col: 3, op: 'gt', value: 50, style: 'warn' }],
    }],
    ...over,
  };
}

test('normalizeBook：必填/未知主题回退警告/公式模板校验/非法 sheet 名/查重', () => {
  assert.ok(core.normalizeBook(null).error.includes('spec'));
  assert.ok(core.normalizeBook({ title: 'x' }).error.includes('sheets'));
  const r1 = core.normalizeBook(goodBook({ theme: '不存在的' }));
  assert.equal(r1.book.theme, 'slate');
  assert.equal(r1.warnings.length, 1);
  const badFormula = goodBook();
  badFormula.sheets[0].columns[3].formula = 'B{r}*C{r}';
  assert.ok(core.normalizeBook(badFormula).error.includes('='));
  const noR = goodBook();
  noR.sheets[0].columns[3].formula = '=B*C';
  assert.ok(core.normalizeBook(noR).error.includes('{r}'));
  const badName = goodBook();
  badName.sheets[0].name = 'a/b';
  assert.ok(core.normalizeBook(badName).error.includes('禁用字符'));
  const dup = goodBook();
  dup.sheets.push({ ...dup.sheets[0] });
  assert.ok(core.normalizeBook(dup).error.includes('重复'));
});

test('normalizeBook：容量护栏逐类报错 + 行长超列数报错 + 值类型转换', () => {
  const many = goodBook();
  many.sheets = Array.from({ length: 7 }, (_, i) => ({ ...many.sheets[0], name: `S${i}` }));
  assert.ok(core.normalizeBook(many).error.includes('上限'));
  const wide = goodBook();
  wide.sheets[0].rows[0] = ['a', 1, 2, null, 5];
  assert.ok(core.normalizeBook(wide).error.includes('超过列数'));
  const coerced = core.normalizeBook(goodBook());
  assert.equal(coerced.error, undefined);
});

// ── layout ─────────────────────────────────────────────────────────────────
test('layout：caption 行号/数据区间/公式展开/汇总公式/条件 ref/列宽', () => {
  const book = core.normalizeBook({
    ...goodBook(),
    sheets: [{
      name: '明细', caption: '生成于 2026-10-29',
      columns: goodBook().sheets[0].columns,
      rows: [['苹果', 12, 3.5, null], ['香蕉', 20, 2, null], ['橙子', 8, 6.8, null]],
      stats: [{ label: '合计', type: 'sum', cols: [1, 2, 3] }],
      conditional: [{ col: 3, op: 'gt', value: 50, style: 'warn' }, { col: 0, op: 'contains', value: '即期', style: 'bad' }],
    }],
  }).book;
  const g = core.layout(book);
  const sh = g.sheets[0];
  assert.equal(sh.headerRow, 2);
  assert.equal(sh.dataStart, 3);
  assert.equal(sh.dataEnd, 5);
  assert.deepEqual(sh.ranges, { header: 'A2:D2', data: 'A3:D5', full: 'A2:D6' });
  // 公式行号展开：{r} → 3..5
  assert.equal(sh.rows[0][3], '=B3*C3');
  assert.equal(sh.rows[2][3], '=B5*C5');
  // 汇总：真实 SUM 公式
  assert.equal(sh.statsRows[0].cells[0], '合计');
  assert.equal(sh.statsRows[0].cells[1], '=SUM(B3:B5)');
  assert.equal(sh.statsRows[0].cells[3], '=SUM(D3:D5)');
  // 条件格式 ref 与表达式
  assert.equal(sh.conditional[0].ref, 'D3:D5');
  assert.equal(sh.conditional[0].formula, 'D3>50');
  assert.ok(sh.conditional[1].formula.startsWith('ISNUMBER(SEARCH('));
  // 列宽：中文表头按 2 宽计算
  const wA = sh.columns[0].width;
  assert.ok(wA >= 7 && wA <= 55, `列宽应夹取：${wA}`);
  assert.ok(sh.columns[0].width >= sh.columns[1].width, '「品名」列应不窄于「数量」');
});

test('layout：无 caption 时表头在第 1 行', () => {
  const book = core.normalizeBook(goodBook()).book;
  const g = core.layout(book);
  assert.equal(g.sheets[0].headerRow, 1);
  assert.equal(g.sheets[0].dataStart, 2);
});

// ── 工具 ───────────────────────────────────────────────────────────────────
test('safeFileName：路径穿越/非法字符剥除、CJK 保留、时间戳', () => {
  const r = core.safeFileName('../..\\坏:名字*?"<>|  测试 ', 1730000000000);
  assert.ok(!r.file.includes('..'));
  assert.ok(!/[\\/:*?"<>|]/.test(r.name));
  assert.ok(r.file.startsWith('gezhi-') && r.file.endsWith('.xlsx'));
  assert.ok(r.name.includes('坏名字'));
  assert.equal(core.safeFileName('', 0).name, '未命名表格');
  const long = core.safeFileName('x'.repeat(80), 0);
  assert.ok(long.name.length <= core.CAPS.fileName);
});

test('colLetter：A..Z..AA..BA', () => {
  assert.equal(core.colLetter(0), 'A');
  assert.equal(core.colLetter(25), 'Z');
  assert.equal(core.colLetter(26), 'AA');
  assert.equal(core.colLetter(52), 'BA');
});

test('dispWidth/computeWidth：CJK 记 2、ASCII 记 1、数字用千分位预览', () => {
  assert.equal(core.dispWidth('品名'), 4);
  assert.equal(core.dispWidth('abc'), 3);
  assert.ok(core.computeWidth('品名', ['红富士苹果（一级）']) > core.computeWidth('品名', ['苹果']));
});

// ── 渲染产物级验收（真实 xlsx + openpyxl 断言）─────────────────────────────
test('render-verify：spec → xlsx → python openpyxl 逐项断言', async () => {
  const render = require('../shared/render.js');
  const spec = {
    title: '三月采购台账', theme: 'indigo',
    sheets: [
      {
        name: '采购明细', caption: '生成于 2026-10-29',
        columns: [
          { h: '品名', type: 'text' }, { h: '数量', type: 'int' }, { h: '单价', type: 'money' },
          { h: '小计', type: 'money', formula: '=B{r}*C{r}' }, { h: '到货日', type: 'date' }, { h: '毛利率', type: 'percent' },
        ],
        rows: [
          ['红富士苹果', 12, 3.5, null, '2026-03-05', '15%'],
          ['香蕉', 20, 2, null, '2026/3/8', 0.22],
          ['=危险公式', 1, 9.9, null, '', 'text'],
          ['即期品（促销）', 3, 1.2, null, '2026-03-12', 0.3],
        ],
        stats: [{ label: '合计', type: 'sum', cols: [1, 2, 3] }],
        conditional: [{ col: 3, op: 'gt', value: 50, style: 'warn' }, { col: 0, op: 'contains', value: '即期', style: 'bad' }],
      },
      { name: '汇总', columns: [{ h: '指标', type: 'text' }, { h: '值', type: 'number' }], rows: [['品项数', 3], ['平均单价', 4.15]] },
    ],
  };
  const norm = core.normalizeBook(spec);
  assert.equal(norm.error, undefined);
  const buf = await render.renderToBuffer(norm.book, core.layout(norm.book));
  const out = path.join(os.tmpdir(), `gezhi-verify-${process.pid}.xlsx`);
  fs.writeFileSync(out, Buffer.from(buf));
  try {
    execFileSync('python', [new URL('./verify-book.py', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), out], { stdio: 'inherit' });
  } finally {
    fs.rmSync(out, { force: true });
  }
});
