import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const core = require('../shared/core.js');

const lines = [
  '微信支付账单明细',
  '微信昵称：[测试]',
  '起始时间：[2025-09-01 00:00:00] 终止时间：[2025-10-31 23:59:59]',
  '导出类型：[全部]',
  '导出时间：[2025-11-01 12:00:00]',
  '共 5 笔记录',
  '----------------------微信支付账单明细--------------------',
  '交易时间,交易类型,交易对方,商品,收/支,金额(元),支付方式,当前状态,交易单号,商户单号,备注',
  '2025-09-05 08:30:11,商户消费,瑞幸咖啡,瑞幸咖啡-拿铁,支出,¥15.90,零钱,支付成功,420001111,MO001,"/"',
  '2025-09-06 12:00:00,商户消费,美团平台商户,"外卖,黄焖鸡米饭",支出,¥28.50,零钱,支付成功,420002222,MO002,"/"',
  '2025-09-06 12:00:05,退款,美团平台商户,退款-外卖,中性交易,¥28.50,零钱,已全额退款,420003333,MO003,"/"',
  '2025-10-01 09:00:00,微信红包,老王,红包-中秋,支出,¥100.00,零钱,支付成功,420004444,MO004,"/"',
  '2025-10-02 10:00:00,零钱充值,/,零钱充值-招商银行,中性交易,¥500.00,招商银行(1234),已存入零钱,420005555,MO005,"/"',
];
const text = lines.join('\r\n');
const r = core.parseWechatCsv(text);
console.log('rows:', r.length);
if (r.length !== 5) throw new Error('expect 5 rows');
if (r[1].item !== '外卖,黄焖鸡米饭') throw new Error('quoted comma broken: ' + r[1].item);
const txns = core.buildTxns(r, 'wechat', 'test-import', '2026-01-01T00:00:00Z');
for (const t of txns) console.log(t.id, t.date, t.dir, t.amountFen, 'ref=' + t.refundFen, t.type, '|', t.name, '|', core.categorize(t, [], null));
if (txns[0].amountFen !== 1590) throw new Error('money');
if (txns[2].refundFen !== 2850) throw new Error('refund row');
if (txns[4].dir !== 'neutral') throw new Error('neutral');
const agg = core.aggregate(txns, { userRules: [], overrides: null });
console.log('totals', JSON.stringify(agg.totals), 'neutral:', agg.neutralCount);
// out = 1590 + 2850 + 10000 = 14440; refund = 2850; in = 0; net = -11590
if (agg.totals.outFen !== 14440) throw new Error('outFen ' + agg.totals.outFen);
if (agg.totals.refundFen !== 2850) throw new Error('refundFen ' + agg.totals.refundFen);
if (agg.totals.netFen !== -11590) throw new Error('netFen ' + agg.totals.netFen);
console.log('months:', agg.months.map((m) => `${m.ym}: out=${m.outFen} ref=${m.refundFen}`).join('  '));
console.log('cats:', agg.categories.map((c) => `${c.cat}=${c.outFen}`).join(' '));
console.log('merchants:', agg.merchants.map((m) => `${m.name}=${m.outFen}`).join(' '));
if (agg.categories[0].cat !== '人情往来') throw new Error('cat top should be 人情往来');
// idempotent merge
const merged = core.mergeTxns(txns, core.buildTxns(r, 'wechat', 'other-batch', 'x'));
if (merged.added.length !== 0 || merged.dup !== 5) throw new Error('merge idempotency');
// month shard pack
const shards = core.packShards(Array.from({ length: 1200 }, (_, i) => ({ ...txns[0], id: 'id' + i })));
if (shards.length !== 3 || shards[2].txns.length !== 200) throw new Error('packShards');
console.log('shards:', shards.map((s) => s.part + '=' + s.txns.length).join(' '));
console.log('OK');
