/**
 * abacus-core 单元测试（node --test，零外部依赖）
 *
 * 覆盖：口径归一（三源 input 语义）→ 计价（缓存节省公式 / hostCost 权威 /
 * 未计价不编数）→ 聚合（去重 / 时段桶 / 模型别名归并 / 项目分源 / 洞察触发）。
 * 口径地图的实证基础见 shared/abacus-core.js 头注释，改口径必先改这里的断言。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../shared/abacus-core.js');
const { K, DEFAULT_PRICES, DEFAULT_SETTINGS } = core;

// ── 时间与键 ────────────────────────────────────────────────────────────────

test('dayKeyOf：本地时区天键 + 非法输入空串', () => {
  const d = new Date(2026, 9, 28, 7, 30).getTime(); // 2026-10-28 本地
  assert.equal(core.dayKeyOf(d), '2026-10-28');
  assert.equal(core.dayKeyOf(0), '');
  assert.equal(core.dayKeyOf(NaN), '');
});

test('periodStartMs：today/d7/d30/all 边界', () => {
  const now = new Date(2026, 9, 28, 15, 0).getTime();
  const today = new Date(2026, 9, 28, 0, 0, 0, 0).getTime();
  assert.equal(core.periodStartMs('today', now), today);
  assert.equal(core.periodStartMs('d7', now), today - 6 * core.DAY_MS);
  assert.equal(core.periodStartMs('d30', now), today - 29 * core.DAY_MS);
  assert.equal(core.periodStartMs('all', now), 0);
  assert.equal(core.periodStartMs('today'), core.periodStartMs('today')); // 无 nowMs 用当前时间
});

test('键空间契约：abacus.* 全前缀且 cmd/result 是前缀不是定键', () => {
  for (const key of [K.meta, K.summary, K.daily, K.models, K.projects, K.quality, K.sessions, K.prices, K.settings]) {
    assert.ok(key.startsWith('abacus.'), key);
  }
  assert.equal(K.cmdPrefix, 'abacus.cmd.');
  assert.equal(K.resultPrefix, 'abacus.result.');
});

// ── 价目解析 ────────────────────────────────────────────────────────────────

test('resolvePriceKey：全等/大小写/日期后缀/前缀，未命中空串', () => {
  const prices = { 'GLM-5.3-Flash': DEFAULT_PRICES['GLM-5.3-Flash'], 'claude-sonnet-4-5': DEFAULT_PRICES['claude-sonnet-4'] };
  assert.equal(core.resolvePriceKey(prices, 'GLM-5.3-Flash'), 'GLM-5.3-Flash');
  assert.equal(core.resolvePriceKey(prices, 'glm-5.3-flash'), 'GLM-5.3-Flash');
  assert.equal(core.resolvePriceKey(prices, 'claude-sonnet-4-5-20250929'), 'claude-sonnet-4-5');
  assert.equal(core.resolvePriceKey(prices, 'unknown-model'), '');
  assert.equal(core.resolvePriceKey(prices, ''), '');
  assert.equal(core.resolvePriceKey(prices, null), '');
});

test('priceFor：命中给全价四元组，未命中 known=false', () => {
  const p = core.priceFor(DEFAULT_PRICES, 'GLM-5.3-Flash');
  assert.equal(p.known, true);
  assert.equal(p.in, 0.06);
  assert.equal(p.cacheRead, 0.006);
  assert.equal(p.out, 0.22);
  assert.equal(core.priceFor(DEFAULT_PRICES, 'nope').known, false);
});

// ── 口径归一（spec 口径地图的代码形态）────────────────────────────────────

test('normalizeZcodeRow：input 含缓存 → fin = input − cacheRead − cacheWrite', () => {
  const e = core.normalizeZcodeRow({
    id: 42, session_id: 's1', turn_id: 't1', assistant_message_id: 'm1', attempt_index: 0,
    model_id: 'GLM-5.3-Flash', provider_id: 'zhipu', agent: 'main', mode: 'ask',
    input_tokens: 73451, cache_read_input_tokens: 70464, cache_creation_input_tokens: 0,
    output_tokens: 241, started_at: 1790000000000, retry_count: 1,
    time_to_first_token_ms: 812, duration_ms: 5200,
  }, { title: '重构账房', directory: 'D:\\work\\Polaris' });
  assert.ok(e);
  assert.equal(e.fin, 73451 - 70464); // 口径实证：73451−70464=2987
  assert.equal(e.cr, 70464);
  assert.equal(e.out, 241);
  assert.equal(e.proj, 'Polaris');
  assert.equal(e.retry, 1);
  assert.equal(e.ttft, 812);
  assert.equal(e.k, 'z:s1:42:0');
  assert.equal(e.day, core.dayKeyOf(1790000000000));
});

test('normalizeZcodeRow：错误行与 attempt 计入键', () => {
  const e = core.normalizeZcodeRow({
    id: 9, session_id: 's2', attempt_index: 2, model_id: 'x', input_tokens: 10,
    output_tokens: 0, started_at: 1790000000000, error_type: 'rate_limited',
  }, null);
  assert.equal(e.err, 1);
  assert.equal(e.etype, 'rate_limited');
  assert.equal(e.k, 'z:s2:9:2');
  assert.equal(core.normalizeZcodeRow(null, null), null);
});

test('normalizeClaudeMsg：input 不含缓存（Anthropic 惯例）+ 侧链标 agent', () => {
  const e = core.normalizeClaudeMsg({
    id: 'u1', ts: 1790000000000, model: 'claude-sonnet-4', title: '修宽', isSidechain: true,
    cwd: '/home/u/projA', sessionId: 's-c1',
    usage: { input: 100, output: 50, cacheRead: 900, cacheWrite: 10 },
  }, 'p1/a');
  assert.equal(e.fin, 100); // 不做减法——口径差异的关键断言
  assert.equal(e.cr, 900);
  assert.equal(e.agent, 'claude-subagent');
  assert.equal(e.proj, 'projA');
  assert.equal(e.provider, 'anthropic');
  assert.equal(e.k, 'c:p1/a:u1');
  assert.equal(core.normalizeClaudeMsg({ id: 'u2' }, 'p1/a'), null); // 无 usage 不入账
});

test('normalizePolarisMeta：hostCost 权威 + 无 token 无成本跳过', () => {
  const e = core.normalizePolarisMeta({
    externalId: 'p1', title: '记账', engineId: 'zcode', workspacePath: 'D:\\work\\projB',
    updatedAt: '2026-10-28T02:00:00.000Z',
    tokenUsage: { input: 200, output: 80, cacheRead: 50, cacheCreation: 10, costUsd: 0.0123 },
  });
  assert.equal(e.fin, 200); // 不含缓存语义
  assert.equal(e.cw, 10);
  assert.equal(e.hostCost, 0.0123);
  assert.equal(e.provider, 'polaris-host');
  assert.equal(e.proj, 'projB');
  assert.equal(core.normalizePolarisMeta({ externalId: 'p2', tokenUsage: {} }), null);
  assert.equal(core.normalizePolarisMeta(null), null);
});

// ── 计价 ───────────────────────────────────────────────────────────────────

test('priceEntry：公式与缓存节省 = cr × (in − cacheRead价) / 1e6', () => {
  const entry = { src: 'zcode', model: 'GLM-5.3-Flash', fin: 2987, cr: 70464, cw: 0, out: 241, hostCost: 0 };
  const r = core.priceEntry(entry, DEFAULT_PRICES);
  const p = DEFAULT_PRICES['GLM-5.3-Flash'];
  const expectCost = (2987 * p.in + 70464 * p.cacheRead + 241 * p.out) / 1e6;
  assert.ok(Math.abs(r.costUsd - expectCost) < 1e-9);
  const expectSave = (70464 * (p.in - p.cacheRead)) / 1e6;
  assert.ok(Math.abs(r.savingsUsd - expectSave) < 1e-9);
  assert.equal(r.priced, true);
});

test('priceEntry：polaris 且 hostCost>0 时宿主结算为权威，不重算', () => {
  const entry = { src: 'polaris', model: '', fin: 200, cr: 50, cw: 10, out: 80, hostCost: 0.0123 };
  const r = core.priceEntry(entry, DEFAULT_PRICES);
  assert.equal(r.costUsd, 0.0123);
  assert.equal(r.savingsUsd, null); // 模型未知，不估节省
  assert.equal(r.priced, true);
});

test('priceEntry：未计价模型双 null 不编数', () => {
  const entry = { src: 'zcode', model: 'mystery-model', fin: 500, cr: 0, cw: 0, out: 10, hostCost: 0 };
  const r = core.priceEntry(entry, DEFAULT_PRICES);
  assert.equal(r.costUsd, null);
  assert.equal(r.savingsUsd, null);
  assert.equal(r.priced, false);
});

// ── 聚合 ───────────────────────────────────────────────────────────────────

function mkEntry(over) {
  return {
    k: 'z:s1:1:0', src: 'zcode', ts: Date.now(), day: core.dayKeyOf(Date.now()),
    sid: 's1', title: 't', proj: 'projA', model: 'GLM-5.3-Flash', provider: 'zhipu',
    agent: 'main', mode: '', fin: 100, cr: 900, cw: 0, out: 50,
    req: 1, err: 0, etype: '', retry: 0, ttft: 0, dur: 0, hostCost: 0,
    ...over,
  };
}

test('aggregate：同 k 去重保后到；时段桶口径正确', () => {
  const now = Date.now();
  const e1 = mkEntry({ k: 'k1', fin: 100, cr: 900, out: 50 });
  const e1dup = mkEntry({ k: 'k1', fin: 200, cr: 0, out: 10 }); // 后到者胜
  const old = mkEntry({ k: 'k2', ts: now - 40 * core.DAY_MS, day: core.dayKeyOf(now - 40 * core.DAY_MS) });
  const agg = core.aggregate([e1, e1dup, old], DEFAULT_PRICES, { nowMs: now });
  assert.equal(agg.summary.all.req, 2);
  assert.equal(agg.summary.all.fin, 200 + 100); // k1 取 dup 的 200
  assert.equal(agg.summary.d30.req, 1); // 40 天前不入 d30
  assert.equal(agg.summary.today.req, 1);
  assert.equal(agg.daily.length, 2);
});

test('aggregate：模型按小写归并别名，展示名取多数派', () => {
  const now = Date.now();
  const agg = core.aggregate([
    mkEntry({ k: 'a', model: 'GLM-5.3-Flash' }),
    mkEntry({ k: 'b', model: 'glm-5.3-flash', ts: now - 1 }),
    mkEntry({ k: 'c', model: 'glm-5.3-flash', ts: now - 2 }),
  ], DEFAULT_PRICES, { nowMs: now });
  assert.equal(agg.models.length, 1);
  assert.equal(agg.models[0].model, 'glm-5.3-flash'); // 2:1 多数派
  assert.equal(agg.models[0].req, 3);
  assert.ok(agg.models[0].cacheHit > 80); // 900/(100+900)=90%
});

test('aggregate：未计价 token 归桶且 insights 提示补价', () => {
  const agg = core.aggregate([mkEntry({ k: 'a', model: 'mystery-model' })], DEFAULT_PRICES, {});
  assert.equal(agg.summary.all.priced, 0);
  assert.equal(agg.summary.all.unpricedTokens, 100 + 900 + 50);
  const unpriced = agg.quality.insights.find((i) => i.code === 'unpriced');
  assert.ok(unpriced, '应有 unpriced 洞察');
  const noPrices = agg.quality.insights.find((i) => i.code === 'no_prices');
  assert.ok(noPrices, '全部不可计价时应有 no_prices 警告');
});

test('aggregate：缓存疑似失效洞察（全价输入>100k 且缓存占比<20%）', () => {
  const weak = mkEntry({ k: 'w', sid: 'sw', fin: 200000, cr: 10000, title: '长上下文' });
  const agg = core.aggregate([weak], DEFAULT_PRICES, {});
  const hit = agg.quality.insights.find((i) => i.code === 'weak_cache');
  assert.ok(hit, '应识别缓存疑似失效会话');
  const strong = mkEntry({ k: 's', sid: 'ss', fin: 5000, cr: 200000 }); // 占比 97%，不应触发
  const agg2 = core.aggregate([strong], DEFAULT_PRICES, {});
  assert.ok(!agg2.quality.insights.find((i) => i.code === 'weak_cache'));
});

test('aggregate：错误/重试/工具遥测进 quality；分源与项目分源不混账', () => {
  const now = Date.now();
  const agg = core.aggregate([
    mkEntry({ k: 'a', etype: 'rate_limited', err: 1, retry: 1, ttft: 800, dur: 5000 }),
    mkEntry({ k: 'b', src: 'polaris', sid: 'p1', proj: 'projB', model: '', provider: 'polaris-host', hostCost: 0.02, title: '记账', ts: now }),
    mkEntry({ k: 'c', proj: 'projA', model: 'GLM-5.3-Flash' }),
  ], DEFAULT_PRICES, { nowMs: now, tools: { total: 6, byName: [{ name: 'Read', n: 3, destructive: 1, avgDurMs: 12 }], destructive: 2 } });
  assert.equal(agg.quality.errorsByType.rate_limited, 1);
  assert.equal(agg.quality.retriedRows, 1);
  assert.equal(agg.quality.zcodeRows, 2);
  assert.equal(agg.quality.ttftP50, 800);
  assert.equal(agg.quality.tools.total, 6);
  assert.equal(agg.summary.bySrc.polaris.costUsd, 0.02);
  const projRows = agg.projects.map((p) => `${p.proj}|${p.src}`);
  assert.ok(projRows.includes('projA|zcode'));
  assert.ok(projRows.includes('projB|polaris'));
  const rl = agg.quality.insights.find((i) => i.code === 'rate_limited');
  assert.ok(rl);
});

test('aggregate：daily 按 maxDaily 截断保最近', () => {
  const now = Date.now();
  const entries = [];
  for (let i = 0; i < 150; i++) {
    const ts = now - i * core.DAY_MS;
    entries.push(mkEntry({ k: `k${i}`, ts, day: core.dayKeyOf(ts) }));
  }
  const agg = core.aggregate(entries, DEFAULT_PRICES, { nowMs: now, maxDaily: 120 });
  assert.equal(agg.daily.length, 120);
  assert.equal(agg.daily[0].day, core.dayKeyOf(now - 119 * core.DAY_MS));
  assert.equal(agg.daily[119].day, core.dayKeyOf(now));
});

test('aggregate：polaris hostCost 入账时 savings 不估、cacheSavings 只来自估价源', () => {
  const agg = core.aggregate([
    mkEntry({ k: 'a' }),
    mkEntry({ k: 'b', src: 'polaris', sid: 'p1', model: '', provider: 'polaris-host', hostCost: 0.05 }),
  ], DEFAULT_PRICES, {});
  assert.equal(agg.summary.all.cacheSavings, (900 * (0.06 - 0.006)) / 1e6);
  assert.equal(agg.summary.bySrc.polaris.cacheSavings, 0);
});

test('DEFAULT_SETTINGS 与 DEFAULT_PRICES 契约', () => {
  assert.equal(DEFAULT_SETTINGS.fxRate, 7.2);
  assert.deepEqual(DEFAULT_SETTINGS.sources, { zcode: true, claude: true, polaris: true });
  for (const [m, p] of Object.entries(DEFAULT_PRICES)) {
    assert.ok(p.in > 0 && p.out > 0, `${m} 价目应为正`);
    assert.ok(p.cacheRead <= p.in, `${m} 缓存读价不应高于全价`);
  }
});
