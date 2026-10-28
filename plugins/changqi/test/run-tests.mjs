/**
 * 常契离线单测（node test/run-tests.mjs）
 * 覆盖：月末 clamp anniversary 语义 / 闰年 / weekly·quarterly·custom 步进 /
 * 锚点在未来与当天 / trial 优先 / cancelled 无下期 / urgency 分级边界 /
 * 月度化换算 / 透视聚合 / 归一化校验与补丁合并 / CSV / 取消引导。
 * 全部使用显式合成 today，不依赖真实时钟。
 */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const core = require('../shared/subs-core.js');

let passCount = 0;
function ok(name, fn) {
  try { fn(); passCount++; console.log(`✓ ${name}`); }
  catch (e) { console.error(`✗ ${name}: ${e.message}`); process.exitCode = 1; }
}

// ── nextChargeDateFrom：月度 anniversary 语义 ──────────────────────────────
ok('monthly 月末 clamp：1/31 → 2/28 → 3/31（名义日不漂移）', () => {
  assert.equal(core.nextChargeDateFrom('2026-01-31', 'monthly', undefined, '2026-02-15'), '2026-02-28');
  assert.equal(core.nextChargeDateFrom('2026-01-31', 'monthly', undefined, '2026-03-01'), '2026-03-31');
  assert.equal(core.nextChargeDateFrom('2026-01-31', 'monthly', undefined, '2026-04-01'), '2026-04-30');
});
ok('monthly 普通日期不受 clamp 影响', () => {
  assert.equal(core.nextChargeDateFrom('2026-01-15', 'monthly', undefined, '2026-05-20'), '2026-06-15');
});
ok('yearly 闰年 2/29：平年落 2/28、闰年回 2/29', () => {
  assert.equal(core.nextChargeDateFrom('2024-02-29', 'yearly', undefined, '2025-01-01'), '2025-02-28');
  assert.equal(core.nextChargeDateFrom('2024-02-29', 'yearly', undefined, '2026-06-01'), '2027-02-28');
  assert.equal(core.nextChargeDateFrom('2024-02-29', 'yearly', undefined, '2028-01-01'), '2028-02-29');
});
ok('quarterly：1/31 → 4/30（clamp）→ 7/31', () => {
  assert.equal(core.nextChargeDateFrom('2026-01-31', 'quarterly', undefined, '2026-02-20'), '2026-04-30');
  assert.equal(core.nextChargeDateFrom('2026-01-31', 'quarterly', undefined, '2026-05-01'), '2026-07-31');
});
ok('weekly 步进：恰逢今天返回今天', () => {
  assert.equal(core.nextChargeDateFrom('2026-10-01', 'weekly', undefined, '2026-10-29'), '2026-10-29');
  assert.equal(core.nextChargeDateFrom('2026-10-01', 'weekly', undefined, '2026-10-30'), '2026-11-05');
});
ok('custom 每 90 天：跨月步进', () => {
  assert.equal(core.nextChargeDateFrom('2026-07-01', 'custom', 90, '2026-10-29'), '2026-12-28');
  assert.equal(core.nextChargeDateFrom('2026-07-01', 'custom', 90, '2026-09-29'), '2026-09-29');
});
ok('锚点在未来：直接作为下次扣费日', () => {
  assert.equal(core.nextChargeDateFrom('2027-01-01', 'monthly', undefined, '2026-10-29'), '2027-01-01');
});
ok('锚点=今天：今天将扣', () => {
  assert.equal(core.nextChargeDateFrom('2026-10-29', 'monthly', undefined, '2026-10-29'), '2026-10-29');
});
ok('日期比较与天数差', () => {
  assert.equal(core.cmpDate('2026-01-01', '2026-01-02'), -1);
  assert.equal(core.cmpDate('2026-01-01', '2026-01-01'), 0);
  assert.equal(core.diffDays('2026-10-29', '2026-11-02'), 4);
  assert.equal(core.diffDays('2026-10-29', '2026-10-01'), -28);
});

// ── nextChargeDateOf：状态语义 ────────────────────────────────────────────
ok('trial 下次扣费=试用期截止日（忽略锚点推导）', () => {
  const sub = { status: 'trial', trialEndsAt: '2026-11-10', anchorDate: '2026-10-01', cycle: 'monthly', amount: 10 };
  assert.equal(core.nextChargeDateOf(sub, '2026-10-29'), '2026-11-10');
});
ok('cancelled 无下次扣费', () => {
  const sub = { status: 'cancelled', anchorDate: '2026-10-01', cycle: 'monthly', amount: 10 };
  assert.equal(core.nextChargeDateOf(sub, '2026-10-29'), null);
});

// ── urgencyOf 分级边界 ────────────────────────────────────────────────────
const S3 = { remindDays: 3, trialWarnDays: 3 };
ok('urgency remindDays=3 边界：0 天 today、1~3 天 soon、4~7 天 week、8 天起 calm', () => {
  // 锚点在未来 → 锚点本身即下次扣费日，精确控制天数差
  const mk = (d) => {
    const dt = new Date(Date.UTC(2026, 2, 10) + d * 86400000);
    const anchor = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
    return { status: 'active', cycle: 'monthly', anchorDate: anchor, amount: 10 };
  };
  assert.equal(core.urgencyOf(mk(0), S3, '2026-03-10'), 'today');
  assert.equal(core.urgencyOf(mk(1), S3, '2026-03-10'), 'soon');
  assert.equal(core.urgencyOf(mk(3), S3, '2026-03-10'), 'soon');
  assert.equal(core.urgencyOf(mk(4), S3, '2026-03-10'), 'week');
  assert.equal(core.urgencyOf(mk(7), S3, '2026-03-10'), 'week');
  assert.equal(core.urgencyOf(mk(8), S3, '2026-03-10'), 'calm');
});
ok('urgency：trial 临近转正 → trial；远期 → calm；cancelled → null', () => {
  const t = (ends) => ({ status: 'trial', trialEndsAt: ends, anchorDate: '2026-10-01', cycle: 'monthly', amount: 10 });
  assert.equal(core.urgencyOf(t('2026-11-01'), S3, '2026-10-29'), 'trial');
  assert.equal(core.urgencyOf(t('2026-12-01'), S3, '2026-10-29'), 'calm');
  assert.equal(core.urgencyOf({ status: 'cancelled', anchorDate: '2026-01-01', cycle: 'monthly', amount: 10 }, S3, '2026-10-29'), null);
});

// ── monthlyEquivalent 口径 ───────────────────────────────────────────────
ok('月度化换算五口径', () => {
  assert.equal(core.monthlyEquivalent({ amount: 12, cycle: 'weekly' }), 52);      // 12*52/12
  assert.equal(core.monthlyEquivalent({ amount: 30, cycle: 'monthly' }), 30);
  assert.equal(core.monthlyEquivalent({ amount: 90, cycle: 'quarterly' }), 30);
  assert.equal(core.monthlyEquivalent({ amount: 360, cycle: 'yearly' }), 30);
  assert.equal(core.monthlyEquivalent({ amount: 100, cycle: 'custom', cycleDays: 30 }), 101.46); // 100*30.4375/30
  assert.equal(core.monthlyEquivalent({ amount: 88, cycle: 'yearly' }), 7.33);
});

// ── computeOverview 聚合 ─────────────────────────────────────────────────
ok('透视：月度化总额/本月将扣/今天将扣/渠道/分类/Top/即将窗口', () => {
  const today = '2026-10-29';
  const subs = [
    { id: 'a', name: '网易云黑胶', amount: 15, cycle: 'monthly', anchorDate: '2026-10-29', channel: 'wechat', category: '影视音乐', status: 'active' },
    { id: 'b', name: 'iCloud 2T', amount: 68, cycle: 'monthly', anchorDate: '2026-11-01', channel: 'apple', category: '云存储', status: 'active' },
    { id: 'c', name: 'Office 365', amount: 398, cycle: 'yearly', anchorDate: '2026-11-05', channel: 'card', category: '软件工具', status: 'active' },
    { id: 'd', name: 'ChatGPT Plus', amount: 20, cycle: 'monthly', anchorDate: '2026-11-03', channel: 'card', category: 'AI 订阅', status: 'trial', trialEndsAt: '2026-11-03' },
    { id: 'e', name: '旧视频会员', amount: 25, cycle: 'monthly', anchorDate: '2026-09-01', channel: 'alipay', category: '影视音乐', status: 'cancelled' },
  ];
  const ov = core.computeOverview(subs, S3, today, '2026-10');
  assert.equal(ov.activeCount, 4);
  assert.equal(ov.cancelledCount, 1);
  // 月度化：15 + 68 + 398/12=33.17 + 20 = 136.17
  assert.equal(ov.monthlyTotal, 136.17);
  assert.equal(ov.yearlyTotal, 1634.04);
  // 本月（10 月）将扣：a（10-29）1 笔 15；d 的下期 11-03 不在本月；c 11-05 不在
  assert.deepEqual(ov.monthCharge, { count: 1, sum: 15 });
  // 今天将扣：a
  assert.deepEqual(ov.todayCharge, { count: 1, sum: 15 });
  // upcoming 7 天窗口：a（0 天 today）、b（11-01，3 天）、d 试用转正（11-03，5 天）、c（11-05，7 天）
  assert.deepEqual(ov.upcoming.map((u) => u.id), ['a', 'b', 'd', 'c']);
  assert.equal(ov.upcoming[0].urgency, 'today');
  assert.equal(ov.upcoming[2].isTrial, true);
  // trial 预警：d 转正日 11-03 距今 5 天 > 3 → 不预警
  assert.equal(ov.trialExpiring.length, 0);
  // 渠道聚合：wechat 15、apple 68、card 33.17+20=53.17
  const card = ov.byChannel.find((c) => c.channel === 'card');
  assert.equal(card.monthlySum, 53.17);
  assert.equal(card.count, 2);
  // 分类聚合：影视音乐 15、云存储 68、软件工具 33.17、AI 订阅 20
  assert.equal(ov.byCategory.length, 4);
  // Top3 按月均：b(68) > c(33.17) > a/d(20)
  assert.equal(ov.top[0].id, 'b');
  assert.equal(ov.top.length, 3);
});
ok('透视：trial 转正预警进入 trialExpiring', () => {
  const today = '2026-10-29';
  const subs = [{ id: 't', name: '试用期服务', amount: 30, cycle: 'monthly', anchorDate: '2026-10-20', channel: 'apple', category: '其他', status: 'trial', trialEndsAt: '2026-10-31' }];
  const ov = core.computeOverview(subs, S3, today, '2026-10');
  assert.equal(ov.trialExpiring.length, 1);
  assert.equal(ov.trialExpiring[0].id, 't');
  assert.equal(ov.upcoming.length, 1); // 11 月窗口内？10-31 距 2 天 ≤7 → 在 upcoming
  assert.equal(ov.upcoming[0].isTrial, true);
});
ok('透视：空池不炸', () => {
  const ov = core.computeOverview([], S3, '2026-10-29', '2026-10');
  assert.equal(ov.monthlyTotal, 0);
  assert.equal(ov.activeCount, 0);
  assert.deepEqual(ov.byChannel, []);
});

// ── normalizeSub / applyPatch ────────────────────────────────────────────
ok('归一化：合法入册与默认值', () => {
  const r = core.normalizeSub({ name: ' 网易云黑胶 ', amount: 15, cycle: 'monthly', anchorDate: '2026-10-01', channel: 'wechat' }, 1000);
  assert.ok(!r.error);
  assert.equal(r.sub.name, '网易云黑胶');
  assert.equal(r.sub.category, '其他');
  assert.equal(r.sub.status, 'active');
  assert.equal(r.sub.currency, 'CNY');
  assert.ok(r.sub.id.startsWith('sub_'));
});
ok('归一化：trialEndsAt 提供即 trial；trial 缺日期拒绝', () => {
  const r1 = core.normalizeSub({ name: 'x', amount: 1, cycle: 'monthly', anchorDate: '2026-10-01', trialEndsAt: '2026-11-01' }, 1000);
  assert.ok(!r1.error && r1.sub.status === 'trial');
  const r2 = core.normalizeSub({ name: 'x', amount: 1, cycle: 'monthly', anchorDate: '2026-10-01', status: 'trial' }, 1000);
  assert.ok(r2.error && r2.error.includes('trialEndsAt'));
});
ok('归一化：非法输入逐一拒绝', () => {
  const base = { name: 'x', amount: 10, cycle: 'monthly', anchorDate: '2026-10-01' };
  assert.ok(core.normalizeSub({ ...base, name: '  ' }, 1).error.includes('name'));
  assert.ok(core.normalizeSub({ ...base, amount: -1 }, 1).error.includes('正数'));
  assert.ok(core.normalizeSub({ ...base, amount: 0 }, 1).error.includes('正数'));
  assert.ok(core.normalizeSub({ ...base, cycle: 'daily' }, 1).error.includes('cycle'));
  assert.ok(core.normalizeSub({ ...base, cycle: 'custom' }, 1).error.includes('cycleDays'));
  assert.ok(core.normalizeSub({ ...base, cycle: 'custom', cycleDays: 0 }, 1).error.includes('cycleDays'));
  assert.ok(core.normalizeSub({ ...base, anchorDate: '2026/10/01' }, 1).error.includes('anchorDate'));
  assert.ok(core.normalizeSub({ ...base, anchorDate: '2026-13-40' }, 1).error.includes('anchorDate'));
  assert.ok(core.normalizeSub({ ...base, channel: 'paypal' }, 1).error.includes('channel'));
  assert.ok(core.normalizeSub({ ...base, trialEndsAt: '明天' }, 1).error.includes('trialEndsAt'));
  assert.ok(core.normalizeSub(null, 1).error);
});
ok('补丁合并：白名单字段生效、trialEndsAt 置空退出试用', () => {
  const n = core.normalizeSub({ name: 'x', amount: 10, cycle: 'monthly', anchorDate: '2026-10-01', trialEndsAt: '2026-11-01' }, 1000);
  const p1 = core.applyPatch(n.sub, { amount: 20 }, 2000);
  assert.ok(!p1.error && p1.sub.amount === 20 && p1.sub.status === 'trial');
  const p2 = core.applyPatch(n.sub, { trialEndsAt: '' }, 2000);
  assert.ok(!p2.error && p2.sub.status === 'active' && p2.sub.trialEndsAt === undefined);
  // 非法补丁值被拒（负金额）
  const p3 = core.applyPatch(n.sub, { amount: -5 }, 2000);
  assert.ok(p3.error);
  // 非白名单字段不透传（如 id 不可被改）
  const p4 = core.applyPatch(n.sub, { id: 'sub_hack' }, 2000);
  assert.ok(!p4.error && p4.sub.id === n.sub.id);
});

// ── advance 推进（applyPatch 场景）────────────────────────────────────────
ok('advance 语义：lastConfirmedDate 为排他下限，红条消退、名义日永久保留', () => {
  const n = core.normalizeSub({ name: 'x', amount: 15, cycle: 'monthly', anchorDate: '2026-09-29' }, 1000);
  // 确认前：今天 10-29 正好是推导扣费日（红条）
  assert.equal(core.nextChargeDateOf(n.sub, '2026-10-29'), '2026-10-29');
  // advance（已扣 10-29）：当天不再报警，下期顺延到 11-29
  const p = core.applyPatch(n.sub, { lastConfirmedDate: '2026-10-29' }, 2000);
  assert.ok(!p.error);
  assert.equal(core.nextChargeDateOf(p.sub, '2026-10-29'), '2026-11-29');
  // 锚点 1/31 月付，确认 2/28（clamp 日）后，下期仍回 3/31（名义日保留）
  const m = core.normalizeSub({ name: 'y', amount: 15, cycle: 'monthly', anchorDate: '2026-01-31' }, 1000);
  const pm = core.applyPatch(m.sub, { lastConfirmedDate: '2026-02-28' }, 2000);
  assert.equal(core.nextChargeDateOf(pm.sub, '2026-03-01'), '2026-03-31');
});

// ── CSV / 引导 / 展示 ────────────────────────────────────────────────────
ok('CSV：BOM + 表头 + 引号转义', () => {
  const n = core.normalizeSub({ name: '含"引号"的服务', amount: 10, cycle: 'monthly', anchorDate: '2026-10-01', note: '备注,带逗号' }, 1000);
  const csv = core.toCsv([n.sub], '2026-10-29');
  assert.ok(csv.startsWith('\ufeff'));
  assert.ok(csv.includes('"含""引号""的服务"'));
  assert.ok(csv.includes('"备注,带逗号"'));
  assert.ok(csv.includes('下期') === false); // 表头是英文
  const head = csv.split('\r\n')[0];
  assert.ok(head.includes('nextChargeDate') && head.includes('monthlyEquivalent'));
});
ok('取消引导五渠道齐备', () => {
  for (const ch of core.CHANNELS) {
    const g = core.cancelGuide(ch);
    assert.ok(g && g.length > 10, `${ch} 引导过短`);
  }
  assert.ok(core.cancelGuide('alipay').includes('免密支付'));
  assert.ok(core.cancelGuide('apple').includes('订阅'));
  assert.equal(core.cancelGuide('unknown'), core.CANCEL_GUIDES.other);
});
ok('fmtSubLine：取消态与试用期文案', () => {
  const n = core.normalizeSub({ name: 'x', amount: 15, cycle: 'monthly', anchorDate: '2026-10-01', channel: 'wechat', trialEndsAt: '2026-11-01' }, 1000);
  const line = core.fmtSubLine(n.sub, S3, '2026-10-29');
  assert.ok(line.includes('试用至 2026-11-01'));
  assert.ok(line.includes('月均'));
  const c = core.applyPatch(n.sub, { status: 'cancelled' }, 2000);
  assert.ok(core.fmtSubLine(c.sub, S3, '2026-10-29').includes('已取消'));
});
ok('fmtMoney 千分位与负数', () => {
  assert.equal(core.fmtMoney(1234.5), '¥1,234.50');
  assert.equal(core.fmtMoney(-9), '-¥9.00');
  assert.equal(core.fmtMoney(0, '$'), '$0.00');
});

console.log(`\n常契 core 单测：${passCount} 组通过`);
