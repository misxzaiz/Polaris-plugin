#!/usr/bin/env node
/**
 * 盘哨测试套件（node --test，零依赖）
 *
 * 覆盖：
 *   - 代码规范化 / 交易时段（normalize.js）
 *   - 腾讯/东财行情解析、搜索解析、分时解析（providers.js，对真实接口字节录制样本断言）
 *   - 提醒引擎触发/去重/暂停/日期门控（alerts.js）
 *   - 设置规范化（quotes.js）
 *   - 端到端：内存 kv + 注入 fetch（真实夹具字节）跑 createService 主流程，
 *     断言 state 写入、命令消费（搜索/即时查/分时）、提醒触发与 feed 落盘
 *
 * 运行：node --test test/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(here, 'fixtures');
const readBin = (f) => fs.readFileSync(path.join(fixtures, f));
const readText = (f) => fs.readFileSync(path.join(fixtures, f), 'utf8');

const norm = require('../service/normalize.js');
const providers = require('../service/providers.js');
const alerts = require('../service/alerts.js');
const { createService, normalizeSettings, DEFAULT_SETTINGS } = require('../service/quotes.js');

// ── normalize.js：代码规范化 ────────────────────────────────────────────────
test('normalizeCode: 显式前缀优先（指数与股票同码消歧）', () => {
  assert.equal(norm.normalizeCode('sh000001').id, 'sh000001');
  assert.equal(norm.normalizeCode('SZ000001').id, 'sz000001');
  assert.equal(norm.normalizeCode('bj 430047').id, 'bj430047');
});

test('normalizeCode: 裸 6 位按号段推断', () => {
  assert.equal(norm.normalizeCode('600519').id, 'sh600519');
  assert.equal(norm.normalizeCode('688981').id, 'sh688981');
  assert.equal(norm.normalizeCode('510300').id, 'sh510300');
  assert.equal(norm.normalizeCode('563360').id, 'sh563360');
  assert.equal(norm.normalizeCode('000001').id, 'sz000001'); // 裸 000xxx 默认深市股票
  assert.equal(norm.normalizeCode('300750').id, 'sz300750');
  assert.equal(norm.normalizeCode('159915').id, 'sz159915');
  assert.equal(norm.normalizeCode('430047').id, 'bj430047');
  assert.equal(norm.normalizeCode('920002').id, 'bj920002');
});

test('normalizeCode: 非法输入返回 error', () => {
  assert.ok(norm.normalizeCode('').error);
  assert.ok(norm.normalizeCode('茅台').error);
  assert.ok(norm.normalizeCode('60051').error);
  assert.ok(norm.normalizeCode('700001').error); // 无法推断的号段
});

test('inTradingSession: 时段边界（北京时间）', () => {
  const bj = (h, m, weekday = 3) => {
    // 构造 UTC 毫秒：北京时间 = UTC+8
    const base = new Date(Date.UTC(2026, 9, 28, 0, 0)); // 2026-10-28 周三
    const dayShift = (weekday - 3) * 24 * 3600 * 1000;
    return base.getTime() + dayShift + (h * 60 + m - 8 * 60) * 60 * 1000;
  };
  assert.equal(norm.inTradingSession(bj(9, 30)), true, '9:30 盘中');
  assert.equal(norm.inTradingSession(bj(9, 14)), false, '9:14 未开盘');
  assert.equal(norm.inTradingSession(bj(11, 34)), true, '11:34 午前缓冲');
  assert.equal(norm.inTradingSession(bj(11, 36)), false, '11:36 午休');
  assert.equal(norm.inTradingSession(bj(13, 0)), true, '13:00 午后');
  assert.equal(norm.inTradingSession(bj(15, 9)), true, '15:09 收盘缓冲');
  assert.equal(norm.inTradingSession(bj(15, 11)), false, '15:11 已收盘');
  assert.equal(norm.inTradingSession(bj(10, 0, 6)), false, '周六');
  assert.equal(norm.inTradingSession(bj(10, 0, 0)), false, '周日');
});

test('tradeDateOf: 从行情时间取日期，缺省回退今天', () => {
  assert.equal(norm.tradeDateOf('20261028161454'), '20261028');
  assert.equal(norm.tradeDateOf('').length, 8);
});

test('fmt 辅助', () => {
  assert.equal(norm.fmtNum(1330.75), '1330.75');
  assert.equal(norm.fmtNum(null), '—');
  assert.equal(norm.fmtAmountWan(518732), '51.87 亿');
  assert.equal(norm.fmtVolumeHand(10986237), '10.99 百万手');
  assert.equal(norm.fmtQuoteTime('20261028161454'), '10-28 16:14');
});

// ── providers.js：腾讯解析（真实 GBK 字节）──────────────────────────────────
test('parseTencentQuotes: 真实样本（股票/ETF/指数/北交所）', () => {
  const quotes = providers.parseTencentQuotes(readBin('tencent_quotes.txt'));
  assert.ok(quotes.size >= 4, `应解析出多只，实际 ${quotes.size}`);
  const mt = quotes.get('sh600519');
  assert.ok(mt, '应含 sh600519');
  assert.equal(mt.name, '贵州茅台');
  assert.equal(mt.price, 1330.75);
  assert.equal(mt.prevClose, 1355.90);
  assert.equal(mt.chg, -25.15);
  assert.equal(mt.pct, -1.85);
  assert.equal(mt.high, 1354.98);
  assert.equal(mt.low, 1322.60);
  assert.equal(mt.volume, 38805);
  assert.equal(mt.amount, 518732);
  assert.equal(mt.time, '20261028161454');
  assert.equal(mt.source, 'tencent');
  const etf = quotes.get('sh510300');
  assert.ok(etf, '应含 ETF');
  assert.equal(etf.name, '沪深300ETF华泰柏瑞');
  assert.equal(etf.price, 4.152);
  const bj = quotes.get('bj430047');
  assert.ok(bj, '应含北交所');
  assert.equal(bj.name, '诺思兰德');
  const idx = quotes.get('sh000001');
  assert.ok(idx, '应含上证指数');
});

test('parseTencentQuotes: 停牌无价/空串防御', () => {
  const empty = providers.parseTencentQuotes('v_pv_none="1";');
  assert.equal(empty.size, 0);
  const zero = providers.parseTencentQuotes('v_sh600000="1~浦发银行~600000~0.00~10.00~0.00~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~~20261028150000~0.00~0.00~0.00~0.00~0/0/0~0~0~0~0~~0.00~0.00~0~0~0~0~0~0~0~0~~~";');
  assert.equal(zero.size, 0, '价格为 0 的停牌行应跳过');
});

test('decodeGbk: GBK 名称解码（ICU 可用时）', () => {
  const text = providers.decodeGbk(readBin('tencent_quotes.txt'));
  if (text.includes('贵州茅台')) {
    assert.ok(text.includes('贵州茅台'));
  } else {
    // ICU 受限环境的降级路径：ASCII 键仍可解析
    assert.ok(text.includes('v_sh600519'));
  }
});

// ── providers.js：东财解析 ──────────────────────────────────────────────────
test('parseEastmoneyQuotes: 真实样本（sh/sz 同码双市场映射）', () => {
  const quotes = providers.parseEastmoneyQuotes(JSON.parse(readText('eastmoney_quotes.json')));
  assert.equal(quotes.size, 3);
  const mt = quotes.get('sh600519');
  assert.equal(mt.name, '贵州茅台');
  assert.equal(mt.price, 1330.75);
  assert.equal(mt.pct, -1.85);
  const pa = quotes.get('sz000001');
  assert.equal(pa.name, '平安银行');
  const idx = quotes.get('sh000001');
  assert.equal(idx.name, '上证指数');
  assert.equal(idx.prevClose, 3648.3);
  assert.equal(idx.amount, +(751019235601.9 / 1e4).toFixed(2), '东财 f6 元 → 万元');
  assert.ok(/^(sh|sz)/.test(mt.id));
});

// ── providers.js：搜索解析（真实样本，\uXXXX 转义 + ^ 分隔）─────────────────
test('parseSearch: 单结果与多结果', () => {
  const one = providers.parseSearch(readBin('search_maotai.txt'));
  assert.equal(one.length, 1);
  assert.equal(one[0].id, 'sh600519');
  assert.equal(one[0].name, '贵州茅台');
  assert.equal(one[0].tradable, true);
  const many = providers.parseSearch(readBin('search_300.txt'));
  assert.ok(many.length >= 8, `多结果应 ≥8，实际 ${many.length}`);
  const zs = many.find((x) => x.id === 'sh000300');
  assert.ok(zs, '应含沪深300指数');
  assert.equal(zs.type, 'ZS');
  const jj = many.find((x) => x.market === 'jj');
  assert.ok(jj, '应含场外基金（jj 市场）');
  assert.equal(jj.tradable, false, '场外基金标记不可行情');
  const empty = providers.parseSearch('v_hint=""');
  assert.equal(empty.length, 0);
});

// ── providers.js：分时解析（真实样本）───────────────────────────────────────
test('parseMinute: 真实样本（date/昨收/点列）', () => {
  const m = providers.parseMinute(JSON.parse(readText('minute.json')), 'sh600519');
  assert.ok(m, '应解析成功');
  assert.equal(m.date, '20261028');
  assert.equal(m.prevClose, 1355.90);
  assert.ok(m.points.length > 200, `分时应 >200 点，实际 ${m.points.length}`);
  assert.equal(m.points[0].t, '0930');
  assert.equal(m.points[0].p, 1354.98);
  for (const p of m.points) assert.ok(Number.isFinite(p.p) && p.p > 0);
});

// ── alerts.js：提醒引擎 ─────────────────────────────────────────────────────
const Q = (over = {}) => ({
  id: 'sh600519', name: '贵州茅台', price: 1330.75, prevClose: 1355.9, pct: -1.85,
  time: '20261028150000', source: 'tencent', ...over,
});

test('shouldFire: 四种类型边界', () => {
  const today = '20261028';
  assert.ok(alerts.shouldFire({ id: 'a1', code: 'sh600519', type: 'price_above', value: 1330, enabled: true }, Q(), today));
  assert.equal(alerts.shouldFire({ id: 'a1', code: 'sh600519', type: 'price_above', value: 1400, enabled: true }, Q(), today), null);
  assert.ok(alerts.shouldFire({ id: 'a2', code: 'sh600519', type: 'price_below', value: 1331, enabled: true }, Q(), today));
  assert.ok(alerts.shouldFire({ id: 'a3', code: 'sh600519', type: 'pct_above', value: -2, enabled: true }, Q(), today));
  assert.equal(alerts.shouldFire({ id: 'a3', code: 'sh600519', type: 'pct_above', value: -1, enabled: true }, Q(), today), null);
  assert.ok(alerts.shouldFire({ id: 'a4', code: 'sh600519', type: 'pct_below', value: -1.5, enabled: true }, Q(), today));
});

test('shouldFire: 单日去重 / 暂停 / 非今日数据 / 非法类型', () => {
  const today = '20261028';
  const a = { id: 'a1', code: 'sh600519', type: 'price_above', value: 1000, enabled: true, lastFiredDate: today };
  assert.equal(alerts.shouldFire(a, Q(), today), null, '当日已触发不重复');
  // 次日重新武装：行情时间也须是次日（日期门控双条件）
  assert.ok(alerts.shouldFire(a, Q({ time: '20261029150000' }), '20261029'), '次日重新武装');
  assert.equal(alerts.shouldFire({ ...a, enabled: false }, Q(), '20261029'), null, '暂停不触发');
  const stale = Q({ time: '20261024150000' });
  assert.equal(alerts.shouldFire({ id: 'a5', code: 'sh600519', type: 'price_above', value: 1000, enabled: true }, stale, today), null, '非今日行情不评估');
  assert.equal(alerts.shouldFire({ id: 'a6', code: 'sh600519', type: 'hack', value: 1, enabled: true }, Q(), today), null);
});

test('evaluateAlerts: 批量与缺行情', () => {
  const today = '20261028';
  const states = new Map([['sh600519', Q()]]);
  const fires = alerts.evaluateAlerts([
    { id: 'a1', code: 'sh600519', type: 'price_above', value: 1330, enabled: true },
    { id: 'a2', code: 'sz000001', type: 'price_above', value: 1, enabled: true }, // 无行情
  ], states, today);
  assert.equal(fires.length, 1);
  assert.equal(fires[0].alert.id, 'a1');
});

test('normalizeAlert/describeAlert', () => {
  // normalizeAlert 入参的 code 须为已规范 secid（调用方先过 normalizeCode）
  const a = alerts.normalizeAlert({ id: 'abc', code: 'sh600519', type: 'price_above', value: '1350' });
  assert.equal(a.code, 'sh600519');
  assert.equal(a.value, 1350);
  assert.equal(alerts.normalizeAlert({ id: 'x', code: 'nope', type: 'price_above', value: 1 }), null);
  assert.equal(alerts.normalizeAlert({ id: 'x', code: 'sh600519', type: 'other', value: 1 }), null);
  assert.equal(alerts.describeAlert({ type: 'pct_below', value: -3 }), '跌幅 ≥ 3%（-3%）');
});

// ── quotes.js：设置规范化 ───────────────────────────────────────────────────
test('normalizeSettings: clamp 与默认', () => {
  const s = normalizeSettings({ pollSec: 1, offHoursPollSec: 99999, redUp: false, indexes: ['600519', 'sh000001', 'bad'] });
  assert.equal(s.pollSec, 10);
  assert.equal(s.offHoursPollSec, 3600);
  assert.equal(s.redUp, false);
  assert.deepEqual(s.indexes, ['sh600519', 'sh000001']);
  assert.deepEqual(normalizeSettings(null), DEFAULT_SETTINGS);
});

// ── 端到端：内存 kv + 注入 fetch ────────────────────────────────────────────
/** 内存 cap.kv 桥（模拟 cap.kv 动作语义：set/get/delete/list） */
function fakeKv() {
  const store = new Map();
  return {
    store,
    async kvGet(k) { return store.has(k) ? store.get(k) : null; },
    async kvSet(k, v) { store.set(k, v === undefined ? null : v); return true; },
    async kvDel(k) { store.delete(k); return true; },
    async kvKeys() { return [...store.keys()]; },
    endpoint: () => ({ host: '127.0.0.1', port: 0 }),
  };
}

/** 按域名路由的假 fetch：腾讯→夹具字节，东财/分时→夹具 JSON，smartbox→夹具文本 */
function fakeFetch({ tencentOverride } = {}) {
  return async (url) => {
    const u = String(url);
    const okRes = (body, type = 'application/octet-stream') => ({
      ok: true, status: 200,
      arrayBuffer: async () => (body instanceof Buffer ? body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) : new TextEncoder().encode(body).buffer),
      json: async () => JSON.parse(body),
    });
    if (u.startsWith('https://qt.gtimg.cn/')) {
      if (tencentOverride) return tencentOverride(u);
      return okRes(readBin('tencent_quotes.txt'));
    }
    if (u.startsWith('https://push2.eastmoney.com/')) return okRes(readText('eastmoney_quotes.json'));
    if (u.startsWith('https://smartbox.gtimg.cn/')) {
      const q = decodeURIComponent(u.match(/q=([^&]+)/)[1]);
      return okRes(q === '300' ? readBin('search_300.txt') : readBin('search_maotai.txt'));
    }
    if (u.startsWith('https://web.ifzq.gtimg.cn/')) return okRes(readText('minute.json'));
    throw new Error('fake fetch: 未预期的 URL ' + u);
  };
}

test('端到端：轮询写 state → 提醒触发 → feed 落盘', async () => {
  const kv = fakeKv();
  const today = norm.bjNow(Date.now()).date;
  // 自选 + 一条必触发提醒（价格远低于现价）
  await kv.kvSet('qsent.watch.sh600519', { id: 'sh600519', code: '600519', market: 'sh', name: '贵州茅台', createdAt: 1 });
  await kv.kvSet('qsent.alert.atest1', { id: 'atest1', code: 'sh600519', type: 'price_above', value: 100, enabled: true, createdAt: 1 });
  // 合成今日行情时间，避免夹具日期过期后测试失真。
  // 字节级补丁：latin1 保字节往返（TextEncoder 会把 >127 字节重编为 UTF-8，破坏 GBK）
  const tencentOverride = () => {
    const raw = readBin('tencent_quotes.txt').toString('latin1');
    const patched = raw.replace(/~20261028\d{6}~/g, `~${today}150000~`);
    const bytes = Buffer.from(patched, 'latin1');
    return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
  };
  const svc = createService({ kv, fetchImpl: fakeFetch({ tencentOverride }) });
  await svc.refreshDefinitions();
  await svc.pollQuotes();
  // state 已写入
  const st = await kv.kvGet('qsent.state.sh600519');
  assert.ok(st && st.price === 1330.75, 'state.sh600519 应写入');
  assert.equal(st.source, 'tencent');
  // 指数条默认含 sh000001（夹具里有）→ 也应有 state
  const idx = await kv.kvGet('qsent.state.sh000001');
  assert.ok(idx, '指数 state 应写入');
  // 提醒触发：规则标 lastFiredDate、feed 有一条
  const rule = await kv.kvGet('qsent.alert.atest1');
  assert.equal(rule.lastFiredDate, today);
  const feed = await kv.kvGet('qsent.alert.feed');
  assert.ok(Array.isArray(feed) && feed.length === 1);
  assert.equal(feed[0].alertId, 'atest1');
  assert.ok(feed[0].msg.includes('贵州茅台'));
  // 再轮询一轮：不重复触发
  await svc.pollQuotes();
  const feed2 = await kv.kvGet('qsent.alert.feed');
  assert.equal(feed2.length, 1, '单日单次去重');
});

test('端到端：命令消费（搜索/即时查/分时）', async () => {
  const kv = fakeKv();
  const svc = createService({ kv, fetchImpl: fakeFetch() });
  await svc.refreshDefinitions();
  await kv.kvSet('qsent.cmd.search.n1', { q: '茅台', at: 1 });
  await kv.kvSet('qsent.cmd.quote.n2', { codes: ['600519', '510300'], at: 1 });
  await kv.kvSet('qsent.cmd.minute.sh600519', { op: 'minute', at: 1 });
  const keys = await kv.kvKeys();
  await svc.tick();
  svc.stop();
  // 命令键均被消费删除
  assert.ok(!(await kv.kvGet('qsent.cmd.search.n1')), '搜索命令应被消费');
  assert.ok(!(await kv.kvGet('qsent.cmd.quote.n2')), '即时查命令应被消费');
  assert.ok(!(await kv.kvGet('qsent.cmd.minute.sh600519')), '分时命令应被消费');
  // 结果写入
  const sr = await kv.kvGet('qsent.search.n1');
  assert.ok(sr && sr.ok && sr.results[0].id === 'sh600519');
  const qr = await kv.kvGet('qsent.quote.n2');
  assert.ok(qr && qr.ok && qr.quotes.length === 2 && qr.source === 'tencent');
  assert.ok(qr.quotes.some((q) => q.id === 'sh600519') && qr.quotes.some((q) => q.id === 'sh510300'));
  const mr = await kv.kvGet('qsent.minute.sh600519');
  assert.ok(mr && mr.ok && mr.points.length > 200);
  // 即时查顺带更新了 lastStates（缓存兜底可用）
  assert.ok(svc.S.lastStates.get('sh600519'));
});

test('端到端：两源全挂 → 缓存兜底 + source=cache（不冒充实时）', async () => {
  const kv = fakeKv();
  const deadFetch = async () => { throw new Error('ECONNREFUSED'); };
  const svc = createService({ kv, fetchImpl: deadFetch });
  // 预置缓存
  svc.S.lastStates.set('sh600519', { id: 'sh600519', name: '贵州茅台', price: 1300, prevClose: 1290, pct: 0.77, chg: 10, high: 1310, low: 1295, open: 1291, volume: 100, amount: 100, turnover: 1, time: norm.bjNow(Date.now()).date + '150000', mktcap: null, source: 'tencent' });
  await svc.pollQuotes();
  assert.ok(svc.S.lastError.includes('行情源不可用'), '应记录源不可用');
  assert.equal(svc.S.lastStates.get('sh600519').price, 1300, '缓存保留');
  // 即时查命令走缓存返回
  await kv.kvSet('qsent.cmd.quote.n3', { codes: ['600519'], at: 1 });
  await svc.tick();
  svc.stop();
  const qr = await kv.kvGet('qsent.quote.n3');
  assert.ok(qr && qr.ok && qr.source === 'cache' && qr.quotes[0].price === 1300);
});

test('端到端：东财备源自动补缺', async () => {
  const kv = fakeKv();
  // 腾讯只回茅台 → 平安银行(夹具中不存在，但东财夹具有 000001/600519/上证)
  // 场景：请求 sh600519 + sz000001，腾讯夹具只有 sh600519 → sz000001 走东财补
  const tencentOverride = (u) => {
    assert.ok(u.includes('sz000001'), '腾讯请求应包含全部代码');
    return { ok: true, status: 200, arrayBuffer: async () => {
      const lines = readText('tencent_quotes.txt').split(';').filter((l) => l.includes('v_sh600519'));
      return new TextEncoder().encode(lines.join(';')).buffer;
    } };
  };
  const svc = createService({ kv, fetchImpl: fakeFetch({ tencentOverride }) });
  await kv.kvSet('qsent.watch.sh600519', { id: 'sh600519', code: '600519', market: 'sh', name: 'x', createdAt: 1 });
  await kv.kvSet('qsent.watch.sz000001', { id: 'sz000001', code: '000001', market: 'sz', name: 'x', createdAt: 2 });
  await svc.refreshDefinitions();
  await svc.pollQuotes();
  svc.stop();
  const pa = await kv.kvGet('qsent.state.sz000001');
  assert.ok(pa, 'sz000001 应由东财备源补齐');
  assert.equal(pa.source, 'eastmoney');
  assert.equal(pa.name, '平安银行');
  assert.equal(svc.S.lastSource, 'tencent+eastmoney');
});
