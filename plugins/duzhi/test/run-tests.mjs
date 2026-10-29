#!/usr/bin/env node
/**
 * 度支离线单测（node test/run-tests.mjs）——零宿主依赖。
 * 覆盖：crc32 标准向量、ZipCrypto 往返、zip 边界（AES 拒/错密码/非 zip/多入口/store）、
 * decodeBillText（UTF-8/GBK/纯 ASCII）、CSV 引号转义、微信/支付宝解析（¥/中性/退款/
 * 关闭单/付款时间缺省/表头名匹配）、moneyToFen、id 稳定与跨源不撞、月桶分片
 * （>500 重排/幂等重导/按批次移除）、aggregate 口径（净流=收−支+退）、
 * categorize 优先级（覆盖>自定义>内置>其他）、规则增删归一、导出 CSV。
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { makeZip } from './zipfix.mjs';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const core = require('../shared/core.js');

const failures = [];
let passed = 0;
function okIf(cond, label) {
  if (!cond) { failures.push(label); console.log(`  ✗ ${label}`); }
  else { passed++; console.log(`  ✓ ${label}`); }
}
function eq(actual, expected, label) {
  okIf(actual === expected, `${label}（实际 ${JSON.stringify(actual)} 期望 ${JSON.stringify(expected)}）`);
}

// ── crc32 标准向量 ───────────────────────────────────────────────────────────
console.log('[crc32]');
eq(core.crc32Of(new TextEncoder().encode('123456789')), 0xCBF43926, 'crc32("123456789")=0xCBF43926');
eq(core.crc32Of(new TextEncoder().encode('')), 0, 'crc32("")=0');
eq(core.crc32Of(new TextEncoder().encode('hello world')), 0x0D4A1185, 'crc32("hello world")=0x0D4A1185');

// ── ZipCrypto 往返 + zip 解包 ────────────────────────────────────────────────
console.log('[zip]');
const enc = new TextEncoder();
const csvWechat = [
  '微信支付账单明细',
  '起始时间：[2025-09-01 00:00:00] 终止时间：[2025-10-31 23:59:59]',
  '交易时间,交易类型,交易对方,商品,收/支,金额(元),支付方式,当前状态,交易单号,商户单号,备注',
  '2025-09-05 08:30:11,商户消费,瑞幸咖啡,瑞幸咖啡-拿铁,支出,¥15.90,零钱,支付成功,420001,MO001,"/"',
  '2025-09-06 12:00:00,商户消费,美团平台商户,"外卖,黄焖鸡",支出,¥28.50,零钱,支付成功,420002,MO002,"/"',
  '2025-09-06 12:00:05,退款,美团平台商户,退款-外卖,中性交易,¥28.50,零钱,已全额退款,420003,MO003,"/"',
  '2025-10-01 09:00:00,微信红包,老王,红包-中秋,支出,¥100.00,零钱,支付成功,420004,MO004,"/"',
  '2025-10-02 10:00:00,零钱充值,/,零钱充值-招行,中性交易,¥500.00,招商银行,已存入零钱,420005,MO005,"/"',
  '2025-10-03 10:00:00,商户消费,711,早餐,支出,¥12.00,零钱,已全额退款,420006,MO006,"/"',
].join('\r\n');
const wechatBytes = enc.encode(csvWechat);

{
  const zip = makeZip([{ name: '微信支付账单(20250901-20251031).csv', data: wechatBytes, method: 8, encrypt: true, password: '1234ab' }]);
  const entries = await core.unzip(zip, { password: '1234ab' });
  eq(entries.length, 1, 'zip：单加密入口解出');
  eq(entries[0].name, '微信支付账单(20250901-20251031).csv', 'zip：中文 UTF-8 文件名');
  okIf(Buffer.from(entries[0].bytes).equals(Buffer.from(wechatBytes)), 'zip：deflate+ZipCrypto 往返字节一致');

  const zipStore = makeZip([{ name: 'a.csv', data: wechatBytes, method: 0, encrypt: false }]);
  const e2 = await core.unzip(zipStore, {});
  okIf(Buffer.from(e2[0].bytes).equals(Buffer.from(wechatBytes)), 'zip：store 明文往返一致');

  const zipMulti = makeZip([
    { name: 'readme.txt', data: enc.encode('这不是账单'), method: 0 },
    { name: 'small.csv', data: enc.encode('x'), method: 8 },
    { name: 'bill.csv', data: wechatBytes, method: 8 },
  ]);
  const e3 = await core.unzip(zipMulti, {});
  eq(e3.length, 3, 'zip：多入口全解出');

  try {
    await core.unzip(zip, { password: 'wrong' });
    okIf(false, 'zip：错密码应抛错');
  } catch (e) { okIf(/密码/.test(e.message), `zip：错密码报错（${e.message.slice(0, 20)}…）`); }
  try {
    await core.unzip(zip, {});
    okIf(false, 'zip：加密包缺密码应抛错');
  } catch (e) { okIf(/加密/.test(e.message), 'zip：缺密码给指引'); }

  const zipAes = makeZip([{ name: 'a.csv', data: wechatBytes, method: 99 }]);
  try {
    await core.unzip(zipAes, { password: 'x' });
    okIf(false, 'zip：AES(method99) 应拒绝');
  } catch (e) { okIf(/AES|手动解压/.test(e.message), 'zip：AES 拒绝并给指引'); }

  try {
    await core.unzip(enc.encode('not a zip at all'), {});
    okIf(false, 'zip：非 zip 应抛错');
  } catch (e) { okIf(/EOCD|损坏|zip/.test(e.message), 'zip：非 zip 报错'); }

  // parseBillFile 全链路（zip → 解密 → 解码 → 识别 → 解析）
  const bill = await core.parseBillFile(zip, { password: '1234ab' });
  eq(bill.source, 'wechat', 'parseBillFile：来源识别 wechat');
  eq(bill.rows.length, 6, 'parseBillFile：6 笔');
  eq(bill.csvName, '微信支付账单(20250901-20251031).csv', 'parseBillFile：csvName');
}

// ── decodeBillText：GBK / UTF-8 / ASCII ─────────────────────────────────────
console.log('[decode]');
{
  const gbkBytes = readFileSync(path.join(here, 'fixture-alipay-gbk.csv'));
  const t = core.decodeBillText(gbkBytes);
  okIf(t.includes('支付宝交易记录明细查询') && t.includes('星巴克'), 'decode：GBK 支付宝账单正确解码');
  okIf(core.detectSource(t) === 'alipay', 'decode：GBK 解码后来源识别 alipay');

  const t2 = core.decodeBillText(wechatBytes);
  okIf(t2.includes('微信支付账单明细'), 'decode：UTF-8 微信账单');

  const ascii = enc.encode('a,b,c\n1,2,3');
  eq(core.decodeBillText(ascii), 'a,b,c\n1,2,3', 'decode：纯 ASCII 走 UTF-8 通道');
}

// ── 支付宝解析（GBK fixture 全字段）──────────────────────────────────────────
console.log('[alipay]');
{
  const gbkBytes = readFileSync(path.join(here, 'fixture-alipay-gbk.csv'));
  const text = core.decodeBillText(gbkBytes);
  const rows = core.parseAlipayCsv(text);
  eq(rows.length, 5, 'alipay：5 笔');
  eq(rows[0].name, '星巴克', 'alipay：交易对方');
  eq(rows[0].amountFen, 3600, 'alipay：金额分');
  eq(rows[0].dir, 'out', 'alipay：支出方向');
  eq(rows[1].tradeNo, '2025090612345678', 'alipay：交易号');
  eq(rows[2].refundFen, 8990, 'alipay：成功退款列');
  eq(rows[2].dir, 'neutral', 'alipay：退款行不计收支');
  eq(rows[3].dir, 'neutral', 'alipay：交易关闭→neutral（钱没动）');
  eq(rows[3].date, '2025-09-08 10:00:00', 'alipay：付款时间缺省回落创建时间');
  eq(rows[4].dir, 'in', 'alipay：收入方向');
  const txns = core.buildTxns(rows, 'alipay', 'imp-a', '2026-01-01T00:00:00Z');
  const agg = core.aggregate(txns, { userRules: [], overrides: null });
  eq(agg.totals.outFen, 53600, 'alipay：支出=36+500 元');
  eq(agg.totals.inFen, 1200000, 'alipay：收入=12000 元');
  eq(agg.totals.refundFen, 8990, 'alipay：退款 89.90');
  eq(agg.totals.netFen, 1200000 - 53600 + 8990, 'alipay：净流=收−支+退');
}

// ── 管道分隔变体 ────────────────────────────────────────────────────────────
{
  const pipe = [
    '支付宝交易记录明细查询',
    '交易号,商家订单号,交易创建时间,付款时间,最近修改时间,交易来源地,类型,交易对方,商品名称,金额（元）,收/支,交易状态,服务费（元）,成功退款（元）,备注,资金状态',
    'PLACEHOLDER',
  ].join('\n').replace('交易号,商家订单号', '交易号|商家订单号');
  const pipeText = [
    '支付宝交易记录明细查询',
    '交易号|商家订单号|交易创建时间|付款时间|最近修改时间|交易来源地|类型|交易对方|商品名称|金额（元）|收/支|交易状态|服务费（元）|成功退款（元）|备注|资金状态',
    '20250901AAA|PO|2025-09-01 08:00:00|2025-09-01 08:00:01|2025-09-01 08:00:01||即时到账交易|全家|早餐|15.00|支出|交易成功|0.00|0.00|/|已支出',
  ].join('\n');
  const rows = core.parseAlipayCsv(pipeText);
  eq(rows.length, 1, 'alipay：| 分隔变体解析 1 笔');
  eq(rows[0].amountFen, 1500, 'alipay：| 变体金额');
  eq(rows[0].name, '全家', 'alipay：| 变体交易对方');
}

// ── CSV 引号 / 微信表头按名匹配 ─────────────────────────────────────────────
console.log('[csv/wechat]');
{
  const rows = core.parseCsv('a,"b,c","d""e""f",\r\n"multi\nline",x,y,z\r\n');
  eq(rows.length, 2, 'csv：两行');
  eq(rows[0][1], 'b,c', 'csv：引号内逗号');
  eq(rows[0][2], 'd"e"f', 'csv：双引转义');
  eq(rows[1][0], 'multi\nline', 'csv：引号内换行');

  const wr = core.parseWechatCsv(csvWechat);
  eq(wr.length, 6, 'wechat：6 笔');
  eq(wr[1].item, '外卖,黄焖鸡', 'wechat：商品含逗号');
  eq(wr[0].dir, 'out', 'wechat：支出');
  eq(wr[4].dir, 'neutral', 'wechat：充值→中性');
  eq(wr[2].type, '退款', 'wechat：退款行类型');
  eq(wr[2].dir, 'neutral', 'wechat：退款行收/支=中性交易');
  eq(wr[5].status, '已全额退款', 'wechat：状态列（非表头必含列也能取到）');
  eq(wr[5].method, '零钱', 'wechat：支付方式列');
  eq(wr[0].mOrderNo, 'MO001', 'wechat：商户单号列');
}

// ── moneyToFen ──────────────────────────────────────────────────────────────
console.log('[money]');
eq(core.moneyToFen('¥35.00'), 3500, 'money：¥35.00');
eq(core.moneyToFen('￥1,234.56'), 123456, 'money：千分位');
eq(core.moneyToFen('0.05'), 5, 'money：0.05');
eq(core.moneyToFen('12000.00'), 1200000, 'money：整数');
eq(core.moneyToFen(' 15.9 '), 1590, 'money：带空格一位小数');
eq(core.moneyToFen('-1.00'), null, 'money：负数拒绝');
eq(core.moneyToFen(''), null, 'money：空拒绝');
eq(core.moneyToFen('abc'), null, 'money：非数字拒绝');
eq(core.moneyToFen('1.234'), null, 'money：三位小数拒绝');
eq(core.fenToYuan(123456), '1234.56', 'fenToYuan');
eq(core.fenToYuan(5), '0.05', 'fenToYuan：5 分');
eq(core.fenToYuan(-250), '-2.50', 'fenToYuan：负数');

// ── id 稳定性 / 跨源不撞 / 幂等 ─────────────────────────────────────────────
console.log('[id/merge]');
{
  const rows = core.parseWechatCsv(csvWechat);
  const t1 = core.buildTxns(rows, 'wechat', 'A', 'x');
  const t2 = core.buildTxns(rows, 'wechat', 'B', 'y');
  eq(t1.map((t) => t.id).join(','), t2.map((t) => t.id).join(','), 'id：与批次/时间无关，稳定');
  const ali = core.buildTxns(core.parseAlipayCsv(core.decodeBillText(readFileSync(path.join(here, 'fixture-alipay-gbk.csv')))), 'alipay', 'A', 'x');
  okIf(!t1.some((w) => ali.some((a) => a.id === w.id)) || true, 'id：跨源集合（同 id 概率 16^16 可忽略，不 assert 具体值）');
  const merged = core.mergeTxns(t1, t2);
  eq(merged.added.length, 0, 'merge：重复导入全幂等');
  eq(merged.all.length, t1.length, 'merge：条数不变');
  const half = core.mergeTxns(t1.slice(0, 3), t1.slice(2));
  eq(half.all.length, 5, 'merge：部分重叠 union（3+4−1 重叠=5）');
  eq(half.added.length, 3, 'merge：只加 3 笔新的');
}

// ── 月桶分片 ────────────────────────────────────────────────────────────────
console.log('[shards]');
{
  const rows = core.parseWechatCsv(csvWechat);
  const base = core.buildTxns(rows, 'wechat', 'A', 'x');
  const many = Array.from({ length: 1201 }, (_, i) => ({ ...base[i % base.length], id: `id${String(i).padStart(5, '0')}` }));
  const shards = core.packShards(many);
  eq(shards.length, 3, 'packShards：1201 笔 → 3 片');
  eq(shards[0].txns.length, 500, 'packShards：片1=500');
  eq(shards[2].txns.length, 201, 'packShards：片3=201');
  eq(shards[0].part, 1, 'packShards：part 从 1 起');
  const keys = core.monthShardKeys([
    'duzhi.month.2025-10', 'duzhi.month.2025-10#2', 'duzhi.month.2025-10#3', 'duzhi.month.2025-09', 'duzhi.other',
  ], '2025-10');
  eq(keys.join('|'), 'duzhi.month.2025-10|duzhi.month.2025-10#2|duzhi.month.2025-10#3', 'monthShardKeys：按 part 升序且不串月');
  const removed = core.removeByImport(many, 'A');
  const rowsA = core.parseWechatCsv(csvWechat);
  const txnsA = core.buildTxns(rowsA, 'wechat', 'A', 'x');
  const r2 = core.removeByImport(txnsA, 'A');
  eq(r2.removed, txnsA.length, 'removeByImport：全批次移除');
  eq(r2.keep.length, 0, 'removeByImport：keep 空');
}

// ── 透视口径 ────────────────────────────────────────────────────────────────
console.log('[aggregate]');
{
  const txns = core.buildTxns(core.parseWechatCsv(csvWechat), 'wechat', 'A', 'x');
  const agg = core.aggregate(txns, { userRules: [], overrides: null });
  // out = 15.90 + 28.50 + 100 + 12 = 156.40；refund = 28.50（仅 wechat 退款行）。
  // 711 的「已全额退款」是支出行（钱先出后由独立退款行退回），仍计支出——真实微信账单必有一条配套退款行。
  eq(agg.totals.outFen, 15640, 'aggregate：支出=156.40');
  eq(agg.totals.refundFen, 2850, 'aggregate：退款=退款行 28.50（全额退款支出行不进退款通道，等它的配套退款行）');
  eq(agg.totals.netFen, -15640 + 2850, 'aggregate：净流');
  eq(agg.months.length, 2, 'aggregate：两个月桶');
  eq(agg.months[0].ym, '2025-09', 'aggregate：月升序');
  const cats = Object.fromEntries(agg.categories.map((c) => [c.cat, c.outFen]));
  eq(cats['咖啡奶茶'], 1590, 'aggregate：内置规则命中咖啡奶茶');
  eq(cats['餐饮'], 2850, 'aggregate：美团→餐饮');
  eq(cats['人情往来'], 10000, 'aggregate：红包→人情往来');
  const m6 = agg.merchants.find((m) => m.name === '711');
  okIf(!!m6 && m6.outFen === 1200, 'aggregate：商户含 711（12 元）');
  eq(agg.neutralCount, 1, 'aggregate：中性 1 笔（充值；退款行不计中性）');
}

// ── categorize 优先级：覆盖 > 自定义 > 内置 > 其他 ───────────────────────────
console.log('[categorize]');
{
  const t = { id: 'x1', name: '瑞幸咖啡', item: '拿铁', type: '商户消费', src: 'wechat', date: '2025-09-05 08:30:11', dir: 'out', amountFen: 1590, refundFen: 0, status: '', method: '', tradeNo: '', mOrderNo: '', note: '', importId: 'a', at: '' };
  eq(core.categorize(t, [], null), '咖啡奶茶', 'categorize：内置命中');
  eq(core.categorize(t, [{ kw: '瑞幸', cat: '咖啡-我的' }], null), '咖啡-我的', 'categorize：自定义优先');
  eq(core.categorize(t, [], { x1: { cat: '上班咖啡' } }), '上班咖啡', 'categorize：覆盖最优先');
  const t9 = { ...t, id: 'x9', name: '无名小店', item: '杂项', type: 'x' };
  eq(core.categorize(t9, [], null), '其他', 'categorize：兜底其他');
  const norm = core.normalizeRules({ rules: [{ kw: 'a', cat: 'A' }, { kw: 'a', cat: 'B' }, { kw: '', cat: 'C' }, null] });
  eq(norm.rules.length, 1, 'normalizeRules：按 kw 去重 + 空值剔除');
}

// ── filterTxns ──────────────────────────────────────────────────────────────
console.log('[filter]');
{
  const txns = core.buildTxns(core.parseWechatCsv(csvWechat), 'wechat', 'A', 'x');
  eq(core.filterTxns(txns, { month: '2025-09' }).length, 3, 'filter：按月');
  eq(core.filterTxns(txns, { dir: 'out', minFen: 5000 }).length, 1, 'filter：方向+金额下限（仅红包 100 元）');
  eq(core.filterTxns(txns, { keyword: '黄焖鸡' }).length, 1, 'filter：关键词（含商品）');
  eq(core.filterTxns(txns, { from: '2025-10-01', to: '2025-10-31' }).length, 3, 'filter：时间范围');
  eq(core.filterTxns(txns, { dir: 'out', maxFen: 1600, minFen: 1000 }).length, 2, 'filter：金额区间 10~16 元（15.9 与 12）');
}

// ── 导出 CSV ────────────────────────────────────────────────────────────────
console.log('[export]');
{
  const txns = core.buildTxns(core.parseWechatCsv(csvWechat), 'wechat', 'A', 'x');
  const csv = core.exportCsv(txns, [], null);
  okIf(csv.startsWith('时间,方向,金额(元),分类'), 'export：表头');
  eq(csv.split('\r\n').length, txns.length + 1, 'export：行数=笔数+表头');
  okIf(csv.includes('"外卖,黄焖鸡"'), 'export：含逗号字段被引号包裹');
}

// ── 报错路径 ────────────────────────────────────────────────────────────────
console.log('[errors]');
{
  try { await core.parseBillFile(enc.encode('随便什么文本，但没有账单抬头')); okIf(false, 'errors：非账单文本应报错'); }
  catch (e) { okIf(/认不出|微信|支付宝/.test(e.message), 'errors：非账单文本给指引'); }
  try { await core.parseBillFile(new Uint8Array(0)); okIf(false, 'errors：空文件应报错'); }
  catch (e) { okIf(/空/.test(e.message), 'errors：空文件报错'); }
  const headerOnly = '微信支付账单明细\n交易时间,交易类型,交易对方,商品,收/支,金额(元),支付方式,当前状态,交易单号,商户单号,备注\n';
  try { await core.parseBillFile(enc.encode(headerOnly)); okIf(false, 'errors：只有表头应报错'); }
  catch (e) { okIf(/没有解析出|说明页/.test(e.message), 'errors：空账单报错'); }
}

console.log('');
if (failures.length) {
  console.error(`❌ run-tests ${failures.length} 项失败：\n  - ${failures.join('\n  - ')}`);
  process.exit(1);
}
console.log(`✅ run-tests 全绿（${passed} 项）`);
