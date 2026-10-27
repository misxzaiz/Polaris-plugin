/**
 * 算盘 core 逻辑测试（node --test test/run-tests.mjs）
 * 覆盖：日键/时段、价目键匹配、三源口径归一（重点：zcode input 含缓存）、
 *       计价与缓存节省、聚合（去重/分源/分日/模型别名归并/项目×源/会话 Top）、
 *       漏钱洞察触发条件。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../shared/abacus-core.js');

const NOW = new Date(2026, 9, 28, 12, 0, 0).getTime(); // 2026-10-28 12:00 本地

const PRICES = {
  'GLM-5.3-Flash': { in: 0.06, cacheRead: 0.006, cacheWrite: 0.06, out: 0.22, preset: true },
  'glm-5.3': { in: 0.85, cacheRead: 0.085, cacheWrite: 0.85, out: 3.4, preset: true },
};

// ── 日键与时段 ─────────────────────────────────────────────────────────────

test('dayKeyOf/periodStartMs', () => {
  assert.equal(core.dayKeyOf(new Date(2026, 9, 28, 23, 59).getTime()), '2026-10-28');
  assert.equal(core.dayKeyOf(new Date(2026, 0, 1).getTime()), '2026-01-01');
  assert.equal(core.dayKeyOf(0), '');
  const todayStart = core.periodStartMs('today', NOW);
  assert.equal(new Date(todayStart).getHours(), 0);
  assert.equal(core.periodStartMs('d7', NOW), todayStart - 6 * core.DAY_MS);
  assert.equal(core.periodStartMs('d30', NOW), todayStart - 29 * core.DAY_MS);
  assert.equal(core.periodStartMs('all', NOW), 0);
});

// ── 价目键匹配 ─────────────────────────────────────────────────────────────

test('resolvePriceKey：全等/小写/日期后缀/未命中', () => {
  const prices = { 'claude-sonnet-4': { in: 3 }, 'GLM-5.3': { in: 1 } };
  assert.equal(core.resolvePriceKey(prices, 'claude-sonnet-4'), 'claude-sonnet-4');
  assert.equal(core.resolvePriceKey(prices, 'glm-5.3'), 'GLM-5.3');
  assert.equal(core.resolvePriceKey(prices, 'claude-sonnet-4-20250929'), 'claude-sonnet-4');
  assert.equal(core.resolvePriceKey(prices, 'unknown-model'), '');
  assert.equal(core.resolvePriceKey(prices, ''), '');
});

test('priceFor：命中返回四价，未命中 known=false', () => {
  const p = core.priceFor(PRICES, 'GLM-5.3-Flash');
  assert.equal(p.known, true);
  assert.equal(p.in, 0.06);
  assert.equal(core.priceFor(PRICES, 'nope').known, false);
});

// ── 口径归一（本插件的命门）──────────────────────────────────────────────

test('normalizeZcodeRow：input 含缓存 → fin=input−cr−cw', () => {
  const e = core.normalizeZcodeRow({
    id: 42, session_id: 's1', turn_id: 't1', attempt_index: 0,
    input_tokens: 73451, output_tokens: 241,
    cache_read_input_tokens: 70464, cache_creation_input_tokens: 0,
    started_at: new Date(2026, 9, 28, 10, 0).getTime(),
    model_id: 'GLM-5.3-Flash', provider_id: 'account:x', agent: 'zcode-agent', mode: 'yolo',
    error_type: null, retry_count: 0,
    time_to_first_token_ms: 3169, duration_ms: 4096,
  }, { title: '某会话', directory: 'D:\\space\\base\\Polaris' });
  assert.equal(e.fin, 73451 - 70464); // 口径地图：input 含缓存
  assert.equal(e.cr, 70464);
  assert.equal(e.out, 241);
  assert.equal(e.day, '2026-10-28');
  assert.equal(e.proj, 'Polaris');
  assert.equal(e.k, 'z:s1:42:0');
  assert.equal(e.err, 0);
  assert.equal(e.retry, 0);
  assert.equal(e.ttft, 3169);
});

test('normalizeZcodeRow：错误与重试标记', () => {
  const e = core.normalizeZcodeRow({
    session_id: 's1', input_tokens: 0, output_tokens: 0, error_type: 'rate_limited', retry_count: 2,
  }, null);
  assert.equal(e.err, 1);
  assert.equal(e.etype, 'rate_limited');
  assert.equal(e.retry, 1);
  assert.equal(e.fin + e.cr + e.cw + e.out, 0);
});

test('normalizeClaudeMsg：input 不含缓存（fin=input）；侧链标记', () => {
  const base = {
    id: 'u1', ts: new Date(2026, 9, 27, 9, 0).getTime(), model: 'claude-sonnet-4-20250929',
    cwd: '/home/user/Polaris', sessionId: 'cs1',
    usage: { input: 20295, output: 300, cacheRead: 5000, cacheWrite: 0 },
  };
  const main = core.normalizeClaudeMsg({ ...base, isSidechain: false }, 'proj/f1');
  assert.equal(main.fin, 20295); // Anthropic 口径：input 即全价
  assert.equal(main.agent, 'claude-main');
  assert.equal(main.proj, 'Polaris');
  assert.equal(main.k, 'c:proj/f1:u1');
  const sub = core.normalizeClaudeMsg({ ...base, isSidechain: true }, 'proj/f1');
  assert.equal(sub.agent, 'claude-subagent');
});

test('normalizePolarisMeta：fin=input、hostCost 权威、空 tokenUsage 跳过', () => {
  const e = core.normalizePolarisMeta({
    externalId: 'dlg1', title: '你好', engineId: 'simple-ai', workspacePath: 'D:\\proj',
    updatedAt: new Date(2026, 8, 27, 8, 0).getTime(),
    tokenUsage: { input: 125175, output: 6618, cacheCreation: 0, cacheRead: 62976, costUsd: 0.822813 },
  });
  assert.equal(e.fin, 125175);
  assert.equal(e.hostCost, 0.822813);
  assert.equal(e.src, 'polaris');
  assert.equal(e.day, '2026-09-27');
  assert.equal(core.normalizePolarisMeta({ tokenUsage: {} }), null);
  assert.equal(core.normalizePolarisMeta(null), null);
});

// ── 计价 ───────────────────────────────────────────────────────────────────

test('priceEntry：公式与缓存节省；未知模型不编数', () => {
  const e = { src: 'zcode', hostCost: 0, fin: 1000000, cr: 1000000, cw: 0, out: 100000, model: 'GLM-5.3-Flash' };
  const r = core.priceEntry(e, PRICES);
  // (1M×0.06 + 1M×0.006 + 0.1M×0.22)/1e6 = 0.06+0.006+0.022 = 0.088
  assert.ok(Math.abs(r.costUsd - 0.088) < 1e-9);
  // savings = cr×(in−cr价)/1e6 = 1×(0.06−0.006) = 0.054
  assert.ok(Math.abs(r.savingsUsd - 0.054) < 1e-9);
  assert.equal(r.priced, true);

  const u = core.priceEntry({ ...e, model: 'mystery-model' }, PRICES);
  assert.equal(u.costUsd, null);
  assert.equal(u.savingsUsd, null);
  assert.equal(u.priced, false);
});

test('priceEntry：polaris 宿主 costUsd 是权威，不重算不估节省', () => {
  const e = { src: 'polaris', hostCost: 0.822813, fin: 125175, cr: 62976, cw: 0, out: 6618, model: '' };
  const r = core.priceEntry(e, PRICES);
  assert.ok(Math.abs(r.costUsd - 0.822813) < 1e-9);
  assert.equal(r.savingsUsd, null);
  assert.equal(r.priced, true);
});

// ── 聚合 ───────────────────────────────────────────────────────────────────

function zRow(over = {}) {
  return core.normalizeZcodeRow({
    id: over.id || 'r1', session_id: 's1', input_tokens: 70000, output_tokens: 100,
    cache_read_input_tokens: 60000, cache_creation_input_tokens: 0,
    started_at: over.ts ?? NOW - 3600000, model_id: 'GLM-5.3-Flash', provider_id: 'account:x',
    error_type: over.etype || null, retry_count: over.retry || 0,
  }, { title: '标题', directory: 'D:\\proj\\Polaris' });
}
function cMsg(over = {}) {
  return core.normalizeClaudeMsg({
    id: over.id || 'm1', ts: over.ts ?? NOW - 26 * 3600000, model: over.model || 'GLM-5.3-Flash',
    cwd: 'D:\\proj\\Polaris', sessionId: 'cs1', title: over.title || 'claude标题',
    isSidechain: !!over.side, usage: over.usage || { input: 5000, output: 50, cacheRead: 50000, cacheWrite: 0 },
  }, over.hint || 'proj/f1');
}

test('aggregate：去重、分源、分日、模型小写归并', () => {
  const entries = [zRow({ id: 'r1' }), zRow({ id: 'r1' }), cMsg({ id: 'm1' }), cMsg({ id: 'm2', model: 'glm-5.3-flash', hint: 'proj/f2' })];
  const agg = core.aggregate(entries, PRICES, { nowMs: NOW });
  const s = agg.summary;
  assert.equal(s.all.req, 3); // 重复 k 只计一次
  assert.ok(s.all.fin > 0);
  assert.equal(s.bySrc.zcode.req, 1);
  assert.equal(s.bySrc.claude.req, 2);
  assert.equal(s.bySrc.polaris.req, 0);
  // GLM-5.3-Flash 与 glm-5.3-flash 归并为一行
  assert.equal(agg.models.length, 1);
  assert.equal(agg.models[0].model, 'GLM-5.3-Flash');
  assert.equal(agg.models[0].req, 3);
  // 日账：两天（zcode 今天，claude 昨天）
  assert.equal(agg.daily.length, 2);
  // 项目 × 源：同名目录分两行
  const projKeys = agg.projects.map((p) => `${p.proj}|${p.src}`).sort();
  assert.deepEqual(projKeys, ['Polaris|claude', 'Polaris|zcode']);
  // 会话 Top：两源各一
  assert.equal(agg.sessions.length, 2);
});

test('aggregate：today/d7/d30 时段切割', () => {
  const entries = [zRow({ id: 'r1' }), cMsg({ id: 'm1' })];
  const agg = core.aggregate(entries, PRICES, { nowMs: NOW });
  assert.equal(agg.summary.today.req, 1); // zcode 在 11:00（今天）
  assert.equal(agg.summary.d30.req, 2);
  assert.equal(agg.summary.d7.req, 2);
});

test('aggregate：insights 触发（限流/未计价/弱缓存/缓存节省）', () => {
  const weak = core.normalizeClaudeMsg({
    id: 'w1', ts: NOW, model: 'GLM-5.3-Flash', cwd: 'D:\\p', sessionId: 'ws',
    usage: { input: 200000, output: 10, cacheRead: 0, cacheWrite: 0 },
  }, 'w/f');
  const rl = core.normalizeZcodeRow({
    id: 'rl1', session_id: 's9', input_tokens: 0, output_tokens: 0, error_type: 'rate_limited',
    started_at: NOW, model_id: 'GLM-5.3-Flash',
  }, null);
  const unpriced = core.normalizeClaudeMsg({
    id: 'up1', ts: NOW, model: 'mystery-9', cwd: 'D:\\p', sessionId: 'us',
    usage: { input: 1000, output: 10, cacheRead: 0, cacheWrite: 0 },
  }, 'u/f');
  const cached = cMsg({ id: 'ok1' }); // 带缓存读的计费条目 → 有节省
  const agg = core.aggregate([weak, rl, unpriced, cached], PRICES, { nowMs: NOW });
  const codes = agg.quality.insights.map((i) => i.code);
  assert.ok(codes.includes('rate_limited'));
  assert.equal(codes.includes('errors'), false); // 只有 rate_limited 一类
  assert.ok(codes.includes('unpriced'));
  assert.ok(codes.includes('weak_cache'));
  assert.ok(codes.includes('cache_savings'));
  const weakInsight = agg.quality.insights.find((i) => i.code === 'weak_cache');
  assert.ok(weakInsight.text.includes('个会话'));
});

test('aggregate：无错无节省时不出杂音', () => {
  const agg = core.aggregate([zRow({ id: 'r1' })], PRICES, { nowMs: NOW });
  const codes = agg.quality.insights.map((i) => i.code);
  assert.equal(codes.includes('rate_limited'), false);
  assert.equal(codes.includes('errors'), false);
  assert.ok(codes.includes('cache_savings')); // 有缓存读就有节省
});

test('aggregate：daily 只保留 maxDaily 天且升序', () => {
  const entries = [];
  for (let i = 0; i < 130; i++) {
    const e = core.normalizeClaudeMsg({
      id: `d${i}`, ts: NOW - i * core.DAY_MS, model: 'GLM-5.3-Flash', cwd: 'D:\\p', sessionId: 's',
      usage: { input: 1000, output: 10, cacheRead: 0, cacheWrite: 0 },
    }, `f${i}`);
    entries.push(e);
  }
  const agg = core.aggregate(entries, PRICES, { nowMs: NOW, maxDaily: 120 });
  assert.equal(agg.daily.length, 120);
  for (let i = 1; i < agg.daily.length; i++) {
    assert.ok(agg.daily[i - 1].day < agg.daily[i].day);
  }
});
