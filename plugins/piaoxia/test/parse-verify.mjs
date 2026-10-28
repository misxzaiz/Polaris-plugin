'use strict';
/**
 * parse-verify.mjs —— 解析引擎对 fixture 的断言（核心假设验证：本地纯解析成功率）
 *
 * fixture 由 make-fixtures.mjs 生成（真实 CID 字体 + ToUnicode + FlateDecode 路径）。
 * 运行：node test/parse-verify.mjs
 */
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const engine = require(path.join(HERE, '..', 'service', 'engine.js'));
const core = require(path.join(HERE, '..', 'shared', 'core.js'));

const FIX = path.join(HERE, 'fixtures');
let pass = 0;
let fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.log('  ✗', name, extra === undefined ? '' : '—— ' + JSON.stringify(extra).slice(0, 300)); }
}

async function parseFixture(name) {
  const bytes = readFileSync(path.join(FIX, name));
  return engine.parseAuto({ name, bytes });
}

console.log('== PDF：数电普票 ==');
{
  const r = await parseFixture('shudian-common.pdf');
  ok('解析成功', r.ok, r.error);
  if (r.ok) {
    const d = r.draft;
    ok('号码=24312000000123456789', d.number === '24312000000123456789', d.number);
    ok('kind=dpt_common', d.kind === 'dpt_common', d.kind);
    ok('日期=2026-10-15', d.date === '2026-10-15', d.date);
    ok('买方名称', d.buyer.name === '杭州某某网络科技有限公司', d.buyer);
    ok('买方税号', d.buyer.taxId === '91330106MA27XW1234', d.buyer);
    ok('卖方名称', d.seller.name === '杭州某某餐饮管理有限公司', d.seller);
    ok('卖方税号', d.seller.taxId === '91330105MA2ABCD1XY', d.seller);
    ok('金额=280.00', d.amount === 280, d.amount);
    ok('税额=16.80', d.tax === 16.8, d.tax);
    ok('价税合计=296.80', d.total === 296.8, d.total);
    ok('项目名=午餐费', (d.items[0] && d.items[0].name).indexOf('午餐费') !== -1, d.items);
    ok('标题含电子发票', d.title.indexOf('电子发票') !== -1, d.title);
  }
}

console.log('== PDF：旧版增值税电子普通发票（买卖方同行） ==');
{
  const r = await parseFixture('old-e-common.pdf');
  ok('解析成功', r.ok, r.error);
  if (r.ok) {
    const d = r.draft;
    ok('号码=12345678', d.number === '12345678', d.number);
    ok('代码=044032000110', d.code === '044032000110', d.code);
    ok('kind=e_common', d.kind === 'e_common', d.kind);
    ok('日期=2026-09-30', d.date === '2026-09-30', d.date);
    ok('买方名称', d.buyer.name === '杭州某某网络科技有限公司', d.buyer);
    ok('卖方名称', d.seller.name === '上海某某软件技术有限公司', d.seller);
    ok('卖方税号', d.seller.taxId === '91310000MA1FL8888X', d.seller);
    ok('金额=5100.00', d.amount === 5100, d.amount);
    ok('税额=163.00', d.tax === 163, d.tax);
    ok('价税合计=5263.00', d.total === 5263, d.total);
    ok('项目含软件开发服务费', d.items.some((x) => x.name.indexOf('软件开发服务费') !== -1), d.items);
    ok('项目含复印纸', d.items.some((x) => x.name.indexOf('复印纸') !== -1), d.items);
  }
}

console.log('== PDF：数电专票（含规格列） ==');
{
  const r = await parseFixture('shudian-special.pdf');
  ok('解析成功', r.ok, r.error);
  if (r.ok) {
    const d = r.draft;
    ok('号码=24122000000198765432', d.number === '24122000000198765432', d.number);
    ok('kind=dpt_special', d.kind === 'dpt_special', d.kind);
    ok('价税合计=11300.00', d.total === 11300, d.total);
    ok('卖方=深圳某某电子设备有限公司', d.seller.name === '深圳某某电子设备有限公司', d.seller);
  }
}

console.log('== PDF：铁路电子客票（无卖方税号） ==');
{
  const r = await parseFixture('rail.pdf');
  ok('解析成功', r.ok, r.error);
  if (r.ok) {
    const d = r.draft;
    ok('号码=24319000000011234567', d.number === '24319000000011234567', d.number);
    ok('价税合计=73.35', d.total === 73.35, d.total);
    ok('无卖方税号→空', d.seller.taxId === '', d.seller);
  }
}

console.log('== PDF：航空行程单（合计行路径） ==');
{
  const r = await parseFixture('air.pdf');
  ok('解析成功', r.ok, r.error);
  if (r.ok) {
    const d = r.draft;
    ok('kind=air', d.kind === 'air', d.kind);
    ok('号码=9992412345678', d.number === '9992412345678', d.number);
    ok('合计=970.00', d.total === 970, d.total);
  }
}

console.log('== PDF：扫描件（无文字层）==');
{
  const r = await parseFixture('scanned.pdf');
  ok('解析失败（预期）', !r.ok, r);
  if (!r.ok) ok('错误提及 OCR/手动录入', /OCR|手动录入/.test(r.error), r.error);
}

console.log('== PDF：非发票（购物清单）==');
{
  const r = await parseFixture('not-invoice.pdf');
  ok('解析失败（预期）', !r.ok, r);
}

console.log('== XML：数电票官方风格标签 ==');
{
  const r = await parseFixture('shudian-common.xml');
  ok('解析成功', r.ok, r.error);
  if (r.ok) {
    const d = r.draft;
    ok('号码', d.number === '24312000000123456789', d.number);
    ok('日期=2026-10-15', d.date === '2026-10-15', d.date);
    ok('买方名称', d.buyer.name === '杭州某某网络科技有限公司', d.buyer);
    ok('卖方名称', d.seller.name === '杭州某某餐饮管理有限公司', d.seller);
    ok('金额=280', d.amount === 280, d.amount);
    ok('税额=16.80', d.tax === 16.8, d.tax);
    ok('价税合计=296.80', d.total === 296.8, d.total);
    ok('项目含午餐费', d.items.some((x) => x.name.indexOf('午餐费') !== -1), d.items);
  }
}

console.log('== XML：中文标签变体 ==');
{
  const r = await parseFixture('alt-tags.xml');
  ok('解析成功', r.ok, r.error);
  if (r.ok) {
    ok('号码', r.draft.number === '24312000000123456789', r.draft.number);
    ok('价税合计=296.80', r.draft.total === 296.8, r.draft.total);
    ok('卖方名称', r.draft.seller.name === '杭州某某餐饮管理有限公司', r.draft.seller);
  }
}

console.log('== XML：GBK 编码 ==');
{
  const p = path.join(FIX, 'gbk.xml');
  if (!existsSync(p)) {
    console.log('  （gbk.xml 未生成，跳过）');
  } else {
    const r = await parseFixture('gbk.xml');
    ok('解析成功', r.ok, r.error);
    if (r.ok) ok('卖方名称（GBK 解码正确）', r.draft.seller.name === '杭州某某餐饮管理有限公司', r.draft.seller);
  }
}

console.log('== 归一化 + id 幂等 ==');
{
  const r = await parseFixture('shudian-common.pdf');
  if (r.ok) {
    const inv1 = core.normalizeInvoice({ ...r.draft, source: 'collect', fileName: 'shudian-common.pdf' }, null);
    const inv2 = core.normalizeInvoice({ ...r.draft, source: 'collect', fileName: 'another-name.pdf' }, null);
    ok('同票不同文件名 → 同 id（判重键=发票号码）', inv1.id === inv2.id && inv1.id.length === 13, [inv1.id, inv2.id]);
    ok('分类器命中餐饮', inv1.category === 'meal', inv1.category);
    ok('id 前缀 p', inv1.id[0] === 'p');
  }
}

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exitCode = fail ? 1 : 0;
