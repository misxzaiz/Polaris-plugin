'use strict';
/**
 * decision-core.js —— 决策日志共享核心（单一权威，零依赖）
 *
 * 被 MCP server（CJS require）与面板（esbuild 打包进 bundle）共用：
 * 键空间、决策归一化、状态机守卫、到期判定、校准数学（分桶命中率/Brier/bias）、
 * JSON 导出。所有"计算"必须放这里，两侧只做 IO（cap.kv 读写），防止口径漂移。
 *
 * 数据契约（cap.kv `decision.*` 键空间，权威描述见 README）：
 *   decision.settings  → { schemaVersion, reviewDefaultDays }
 *   decision.d.<id>    → Decision（按 id 幂等写入）
 *
 * 方法论（接口即约束）：
 *   - decided 态必须带 expected.text（可检验预期）+ confidence（0-100 真实把握），
 *     缺失即报错——把「决策日记方法论」变成接口约束而非文档劝告。
 *   - 复盘四态：hit 兑现(1) / partial 部分(0.5) / miss 落空(0) / void 作废(不计分)。
 *   - 校准：把握分 4 桶，每桶实际命中率 vs 自称把握；Brier = mean((score-p)²)；
 *     bias = 命中率 − 平均把握（负=系统性过度自信）。
 */

// ── 键空间 ─────────────────────────────────────────────────────────────────
const K = {
  settings: 'decision.settings',
  d: (id) => `decision.d.${id}`,
  dPrefix: 'decision.d.',
};

const DEFAULT_SETTINGS = {
  schemaVersion: 1,
  /** decided 时未显式给 reviewInDays 的默认复盘期限（天） */
  reviewDefaultDays: 90,
};

const DAY_MS = 24 * 3600 * 1000;

const OUTCOME_META = {
  hit: { score: 1, label: '兑现', cls: 'good' },
  partial: { score: 0.5, label: '部分兑现', cls: 'warn' },
  miss: { score: 0, label: '落空', cls: 'bad' },
  void: { score: null, label: '作废', cls: 'muted' },
};

const STATUS_META = {
  open: { label: '纠结中', cls: 'open' },
  decided: { label: '存照中', cls: 'live' },
  resolved: { label: '已复盘', cls: 'done' },
  shelved: { label: '已搁置', cls: 'muted' },
};

/** 校准分桶（闭开区间，最后桶闭到 100）：50 → '50-69'，70 → '70-84'，85 → '85-100' */
const BUCKETS = [
  { key: '<50', label: '<50%', min: 0, max: 49 },
  { key: '50-69', label: '50-69%', min: 50, max: 69 },
  { key: '70-84', label: '70-84%', min: 70, max: 84 },
  { key: '85-100', label: '85-100%', min: 85, max: 100 },
];

/** 校准样本量门槛：低于此值面板/统计提示「样本不足」 */
const CALIBRATION_MIN_SAMPLE = 5;

// ── 基础工具 ───────────────────────────────────────────────────────────────
const pad2 = (n) => String(n).padStart(2, '0');

/** epoch ms → 'YYYY-MM-DD'（本地时区，仅展示用） */
function dayKeyOf(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** epoch ms → 'YYYY-MM'（本地时区，复盘时间线用） */
function monthKeyOf(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function makeId(now) {
  const t = typeof now === 'number' ? now : Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return 'd' + t.toString(36) + rand;
}

const clampInt = (v, lo, hi, fallback) => {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
};

const cut = (v, max) => String(v ?? '').slice(0, max);

// ── 归一化 ─────────────────────────────────────────────────────────────────
/**
 * 归一化选项数组。raw 接受 ['A','B'] 或 [{name,note?}]；
 * 非法返回 { error }，合法返回 { options: [{id,name,note}] }。≤6 项。
 */
function normalizeOptions(raw) {
  if (raw == null) return { options: [] };
  const arr = Array.isArray(raw) ? raw : [raw];
  if (arr.length > 6) return { error: '选项最多 6 个' };
  const options = [];
  for (let i = 0; i < arr.length; i++) {
    const it = arr[i];
    const name = cut(typeof it === 'string' ? it : it && it.name, 40).trim();
    if (!name) return { error: `第 ${i + 1} 个选项名为空` };
    const note = typeof it === 'object' && it ? cut(it.note, 200) : '';
    options.push({ id: `o${i + 1}`, name, note });
  }
  return { options };
}

/**
 * 把「chosen」用户输入解析为 options 里的选项 id。
 * 接受选项 id（o1）、1 基序号（1/2/3）、或选项名（精确匹配）。
 * 返回 { chosenId } 或 { error }。
 */
function resolveChosen(chosen, options) {
  if (chosen == null || chosen === '') return { chosenId: null };
  const s = String(chosen).trim();
  if (!options.length) return { error: '记录了 chosen 但该决策没有选项，请先补 options' };
  const byId = options.find((o) => o.id === s);
  if (byId) return { chosenId: byId.id };
  const byName = options.find((o) => o.name === s);
  if (byName) return { chosenId: byName.id };
  const idx = /^\d+$/.test(s) ? Number(s) : 0;
  if (idx >= 1 && idx <= options.length) return { chosenId: options[idx - 1].id };
  return { error: `chosen「${s}」不匹配任何选项（可选：${options.map((o) => o.name).join('/')}）` };
}

/** 归一化预期：{ text, confidence }；decided 态必填。 */
function normalizeExpected(raw) {
  if (raw == null) return { expected: null };
  const text = cut(typeof raw === 'string' ? raw : raw.text, 300).trim();
  const confidence = clampInt(typeof raw === 'object' && raw ? raw.confidence : undefined, 0, 100, NaN);
  if (!text && !Number.isFinite(confidence)) return { expected: null };
  if (text && !Number.isFinite(confidence)) return { error: '预期缺 confidence（0-100 的真实把握，方法论必填）' };
  if (!text && Number.isFinite(confidence)) return { error: '预期缺 text（必须是可检验的具体陈述，如「X 在 N 天内发生」）' };
  return { expected: { text, confidence } };
}

/**
 * 归一化一条决策（create 输入）。
 * raw: { id?, createdAt?, title, question?, context?, options?, chosen?, rationale?,
 *        expected?, tags?, links?, source?, reviewAt?, reviewInDays?, status? }
 * 返回 { error } 或 { decision }。status 缺省：有 chosen → decided，否则 open。
 */
function normalizeDecision(raw, { now = Date.now(), defaultReviewDays = 90 } = {}) {
  if (!raw || typeof raw !== 'object') return { error: '缺少决策数据' };
  const title = cut(raw.title, 80).trim();
  if (!title) return { error: 'title 必填（一句短语概括这个决定，如「迁移 RouterBus」）' };

  const normOpt = normalizeOptions(raw.options);
  if (normOpt.error) return normOpt;
  const options = normOpt.options;

  const chosenRes = resolveChosen(raw.chosen, options);
  if (chosenRes.error) return { error: chosenRes.error };
  const chosenId = chosenRes.chosenId;

  const normExp = normalizeExpected(raw.expected);
  if (normExp.error) return normExp;
  const expected = normExp.expected;

  let status = raw.status;
  if (!['open', 'decided'].includes(status)) status = chosenId ? 'decided' : 'open';
  if (status === 'decided' && !chosenId && options.length) {
    return { error: 'decided 态需要 chosen（选了哪个选项）' };
  }
  if (status === 'decided' && !expected) {
    return { error: '立此存照需要可检验的预期（expected.text）与把握（expected.confidence 0-100）——没有预期就无法复盘与校准。请与用户确认：「这个决定你预期的具体结果是什么？几成把握？」' };
  }
  if (status === 'open' && !cut(raw.question, 500).trim() && !options.length) {
    return { error: 'open 态需要 question（在纠结什么）或 options' };
  }

  // 复盘期限：显式 reviewAt > reviewInDays（0 = 不定期）> defaultReviewDays（decided）/ null（open）
  let reviewAt = null;
  if (Number.isFinite(Number(raw.reviewAt)) && Number(raw.reviewAt) > 0) {
    reviewAt = Number(raw.reviewAt);
  } else if (raw.reviewInDays !== undefined) {
    const days = Number(raw.reviewInDays);
    if (!Number.isFinite(days) || days < 0) return { error: 'reviewInDays 应为非负数字（0 = 不定期）' };
    reviewAt = days > 0 ? now + days * DAY_MS : null;
  } else if (status === 'decided') {
    reviewAt = now + (Number.isFinite(defaultReviewDays) && defaultReviewDays > 0 ? defaultReviewDays : 90) * DAY_MS;
  }

  const tags = (Array.isArray(raw.tags) ? raw.tags : [])
    .map((t) => cut(t, 20).trim()).filter(Boolean).slice(0, 8);
  const links = (Array.isArray(raw.links) ? raw.links : [])
    .map((t) => cut(t, 40).trim()).filter(Boolean).slice(0, 12);

  const id = typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 40) : makeId(now);
  const createdAt = Number.isFinite(Number(raw.createdAt)) && Number(raw.createdAt) > 0 ? Number(raw.createdAt) : now;
  const decision = {
    id,
    schemaVersion: 1,
    createdAt,
    updatedAt: now,
    title,
    question: cut(raw.question, 500),
    context: cut(raw.context, 2000),
    options,
    chosenId: status === 'open' ? null : chosenId,
    rationale: cut(raw.rationale, 1000),
    expected: status === 'decided' ? expected : null,
    tags,
    links,
    source: raw.source === 'panel' || raw.source === 'import' ? raw.source : 'ai',
    status,
    decidedAt: status === 'decided' ? now : null,
    reviewAt: status === 'decided' ? reviewAt : null,
    shelvedReason: '',
    resolution: null,
  };
  return { decision };
}

// ── 状态机（迁移守卫）────────────────────────────────────────────────────
/**
 * settle：open → decided。patch: { chosen, rationale?, expected, reviewAt?, reviewInDays? }
 * 返回 { error } 或 { decision }（新对象，不改入参）。
 */
function settleDecision(existing, patch, { now = Date.now(), defaultReviewDays = 90 } = {}) {
  if (!existing || typeof existing !== 'object') return { error: '决策不存在' };
  if (existing.status !== 'open') return { error: `只有纠结中（open）的决策能定案，当前：${STATUS_META[existing.status].label}` };
  const normOpt = normalizeOptions(existing.options);
  const chosenRes = resolveChosen(patch && patch.chosen, normOpt.options || []);
  if (chosenRes.error) return { error: chosenRes.error };
  if (!chosenRes.chosenId) return { error: '定案需要 chosen（选了哪个选项）' };
  const normExp = normalizeExpected(patch && patch.expected);
  if (normExp.error) return normExp;
  if (!normExp.expected) {
    return { error: '定案需要可检验的预期（expected.text + confidence 0-100）——没有预期就无法复盘与校准。请与用户确认。' };
  }
  const base = { ...existing, options: normOpt.options };
  const rn = normalizeDecision(
    {
      ...base, status: 'decided', chosen: chosenRes.chosenId, expected: normExp.expected, createdAt: existing.createdAt,
      // settle 允许显式改复盘期限（0 = 不定期）
      ...(patch && patch.reviewInDays !== undefined ? { reviewInDays: patch.reviewInDays } : {}),
      ...(patch && patch.reviewAt !== undefined ? { reviewAt: patch.reviewAt } : {}),
    },
    { now, defaultReviewDays },
  );
  if (rn.error) return rn;
  const d = rn.decision;
  // settle 允许显式 reviewInDays=0（不定期）：normalizeDecision 已处理 reviewAt
  if (patch && patch.rationale != null) d.rationale = cut(patch.rationale, 1000);
  if (patch && patch.question != null) d.question = cut(patch.question, 500);
  return { decision: d };
}

/** outcome → score 映射（void → null 不计分） */
function outcomeScore(outcome) {
  const m = OUTCOME_META[outcome];
  return m ? m.score : undefined;
}

/**
 * resolve：decided → resolved（或 resolved 重复盘=覆盖）。
 * patch: { outcome, note?, surprise?, lesson? }
 */
function resolveDecision(existing, patch, { now = Date.now() } = {}) {
  if (!existing || typeof existing !== 'object') return { error: '决策不存在' };
  if (!['decided', 'resolved'].includes(existing.status)) {
    return { error: existing.status === 'open'
      ? '该决策还没定案（open），先 settle 立此存照再复盘'
      : `已搁置的决策不复盘（如需继续请先更新）` };
  }
  const outcome = patch && patch.outcome;
  if (!OUTCOME_META[outcome]) {
    return { error: 'outcome 必须是 hit（兑现）/ partial（部分兑现）/ miss（落空）/ void（作废，不计分）之一' };
  }
  const score = outcomeScore(outcome);
  return {
    decision: {
      ...existing,
      status: 'resolved',
      updatedAt: now,
      resolution: {
        outcome,
        score,
        note: cut(patch.note, 1000),
        surprise: cut(patch.surprise, 500),
        lesson: cut(patch.lesson, 500),
        resolvedAt: now,
      },
    },
  };
}

/** shelve：open|decided → shelved */
function shelveDecision(existing, reason, { now = Date.now() } = {}) {
  if (!existing || typeof existing !== 'object') return { error: '决策不存在' };
  if (!['open', 'decided'].includes(existing.status)) {
    return { error: `已复盘的决策不搁置（如需可删除重录），当前：${STATUS_META[existing.status].label}` };
  }
  return {
    decision: {
      ...existing,
      status: 'shelved',
      shelvedReason: cut(reason, 200),
      updatedAt: now,
    },
  };
}

/**
 * update：只改字段，不改状态。可改：title/question/context/options/rationale/
 * expected(text+confidence)/reviewAt/reviewInDays/tags/links。
 * expected 传 null 显式清空仅对 open 合法（decided 必须保有预期）。
 */
function updateDecision(existing, patch, { now = Date.now(), defaultReviewDays = 90 } = {}) {
  if (!existing || typeof existing !== 'object') return { error: '决策不存在' };
  if (existing.status === 'resolved' || existing.status === 'shelved') {
    return { error: `${STATUS_META[existing.status].label}的决策用 resolve/delete 处理，不做字段编辑` };
  }
  const next = { ...existing, updatedAt: now };
  if (patch.title != null) {
    const t = cut(patch.title, 80).trim();
    if (!t) return { error: 'title 不能为空' };
    next.title = t;
  }
  if (patch.question != null) next.question = cut(patch.question, 500);
  if (patch.context != null) next.context = cut(patch.context, 2000);
  if (patch.rationale != null) next.rationale = cut(patch.rationale, 1000);
  if (patch.options != null) {
    const normOpt = normalizeOptions(patch.options);
    if (normOpt.error) return normOpt;
    next.options = normOpt.options;
    if (next.chosenId && !next.options.some((o) => o.id === next.chosenId)) {
      return { error: '更新后的 options 不含当前 chosenId，请一并更新 chosen 或保留原选项' };
    }
  }
  if (patch.expected !== undefined) {
    if (patch.expected === null || patch.expected === '') {
      if (next.status === 'decided') return { error: 'decided 态不能清空预期（可改为 shelve 搁置）' };
      next.expected = null;
    } else {
      const normExp = normalizeExpected(patch.expected);
      if (normExp.error) return normExp;
      if (next.status === 'decided' && !normExp.expected) return { error: 'decided 态不能清空预期' };
      next.expected = normExp.expected;
    }
  }
  if (patch.reviewAt !== undefined) {
    if (patch.reviewAt === null) next.reviewAt = null;
    else {
      const t = Number(patch.reviewAt);
      if (!Number.isFinite(t) || t <= 0) return { error: 'reviewAt 应为正整数 epoch ms 或 null' };
      next.reviewAt = t;
    }
  } else if (patch.reviewInDays !== undefined) {
    const days = Number(patch.reviewInDays);
    if (!Number.isFinite(days) || days < 0) return { error: 'reviewInDays 应为非负数字（0 = 不定期）' };
    next.reviewAt = days > 0 ? now + days * DAY_MS : null;
  }
  // 注意：不改 reviewAt 相关字段时保持原值——「不定期」（null）是用户显式选择，
  // 不得在编辑标题等无关字段时被重置回默认期限。
  if (patch.tags != null) {
    if (!Array.isArray(patch.tags)) return { error: 'tags 应为字符串数组' };
    next.tags = patch.tags.map((t) => cut(t, 20).trim()).filter(Boolean).slice(0, 8);
  }
  if (patch.links != null) {
    if (!Array.isArray(patch.links)) return { error: 'links 应为决策 id 数组' };
    next.links = patch.links.map((t) => cut(t, 40).trim()).filter(Boolean).slice(0, 12);
  }
  if (next.status === 'open') { next.chosenId = null; next.expected = null; next.reviewAt = null; next.decidedAt = null; }
  return { decision: next };
}

// ── 到期与视图 ─────────────────────────────────────────────────────────────
/** 是否到期待复盘：decided 且 reviewAt 非空且 reviewAt ≤ now */
function isDue(d, now = Date.now()) {
  return !!d && d.status === 'decided' && d.reviewAt != null && d.reviewAt <= now;
}

/** 逾期天数（≥0；未到期/不定期返回 0） */
function overdueDays(d, now = Date.now()) {
  if (!isDue(d, now)) return 0;
  return Math.floor((now - d.reviewAt) / DAY_MS);
}

/**
 * 全库视图：分状态计数 + 到期清单（reviewAt 升序）+ 各状态列表（updatedAt 降序）。
 * decisions: Decision[]（调用方从 kv 汇齐）。
 */
function buildOverview(decisions, now = Date.now()) {
  const list = (decisions || []).filter((d) => d && typeof d === 'object' && d.id);
  const counts = { open: 0, decided: 0, resolved: 0, shelved: 0 };
  for (const d of list) if (counts[d.status] !== undefined) counts[d.status] += 1;
  const due = list.filter((d) => isDue(d, now)).sort((a, b) => a.reviewAt - b.reviewAt);
  const upcoming = list
    .filter((d) => d.status === 'decided' && d.reviewAt != null && d.reviewAt > now && d.reviewAt <= now + 7 * DAY_MS)
    .sort((a, b) => a.reviewAt - b.reviewAt);
  const byStatus = (s) => list.filter((d) => d.status === s).sort((a, b) => b.updatedAt - a.updatedAt);
  return { counts, due, upcoming, byStatus, all: list.slice().sort((a, b) => b.updatedAt - a.updatedAt) };
}

/** 摘要行（列表/MCP list 共用口径） */
function summarize(d, now = Date.now()) {
  const chosen = d.chosenId && d.options ? (d.options.find((o) => o.id === d.chosenId) || {}).name : '';
  const due = isDue(d, now);
  return [
    `[${d.id}] ${d.title}`,
    `  状态：${STATUS_META[d.status].label}${d.status === 'decided' && d.expected ? `（把握 ${d.expected.confidence}%）` : ''}` +
      `${d.status === 'resolved' && d.resolution ? `（${OUTCOME_META[d.resolution.outcome].label}）` : ''}`,
    chosen ? `  已选：${chosen}${d.expected ? ` · 预期：${d.expected.text}` : ''}` : (d.question ? `  问题：${d.question}` : ''),
    d.reviewAt && d.status === 'decided'
      ? `  复盘期限：${dayKeyOf(d.reviewAt)}${due ? ` ⚠️ 已到期${overdueDays(d, now) ? ` ${overdueDays(d, now)} 天` : ''}` : ''}`
      : '',
    d.tags.length ? `  标签：${d.tags.join('/')}` : '',
  ].filter(Boolean).join('\n');
}

// ── 校准数学 ───────────────────────────────────────────────────────────────
/**
 * 校准统计。resolved（含重复盘）且 outcome ≠ void 的进计分；void 只计数。
 * 返回：
 *   { nScored, nVoid, avgConf, hitRate, brier, bias, verdict, buckets: [
 *       { key,label,n,avgConf,hitRate,brier } ], byMonth: [{month,n,avgScore,avgConf}],
 *   }
 */
function computeCalibration(decisions) {
  const list = (decisions || []).filter(
    (d) => d && d.status === 'resolved' && d.resolution && typeof d.resolution === 'object',
  );
  const scored = list.filter((d) => d.resolution.outcome !== 'void' && d.expected);
  const nVoid = list.length - scored.length;

  let confSum = 0, scoreSum = 0, brierSum = 0;
  const bucketAcc = new Map(BUCKETS.map((b) => [b.key, { n: 0, confSum: 0, scoreSum: 0, brierSum: 0 }]));
  const monthAcc = new Map();
  for (const d of scored) {
    const p = d.expected.confidence / 100;
    const s = d.resolution.score;
    confSum += p;
    scoreSum += s;
    brierSum += (p - s) * (p - s);
    const bk = BUCKETS.find((b) => d.expected.confidence >= b.min && d.expected.confidence <= b.max);
    if (bk) {
      const a = bucketAcc.get(bk.key);
      a.n += 1; a.confSum += p; a.scoreSum += s; a.brierSum += (p - s) * (p - s);
    }
    const mk = monthKeyOf(d.resolution.resolvedAt);
    const m = monthAcc.get(mk) || { month: mk, n: 0, scoreSum: 0, confSum: 0 };
    m.n += 1; m.scoreSum += s; m.confSum += p;
    monthAcc.set(mk, m);
  }

  const r1 = (x) => Math.round(x * 1000) / 1000;
  const n = scored.length;
  const avgConf = n ? confSum / n : 0;
  const hitRate = n ? scoreSum / n : 0;
  const brier = n ? brierSum / n : 0;
  const bias = n ? hitRate - avgConf : 0;

  let verdict;
  if (n === 0) verdict = '还没有已复盘的可计分决策——先立照，再复盘，曲线自然长出来。';
  else if (n < CALIBRATION_MIN_SAMPLE) verdict = `样本还少（${n} < ${CALIBRATION_MIN_SAMPLE}），曲线仅供参考，继续攒。`;
  else if (bias <= -0.1) verdict = '系统性过度自信：自称的把握高于实际兑现率，重大决定建议把把握往下修一档。';
  else if (bias >= 0.1) verdict = '系统性保守：实际兑现率高于自称把握，你比你以为的更准。';
  else verdict = '校准良好：自称把握与实际兑现率基本吻合。';

  return {
    nScored: n,
    nVoid,
    avgConf: r1(avgConf),
    hitRate: r1(hitRate),
    brier: r1(brier),
    bias: r1(bias),
    verdict,
    buckets: BUCKETS.map((b) => {
      const a = bucketAcc.get(b.key);
      const bn = a.n;
      return {
        key: b.key, label: b.label, n: bn,
        avgConf: bn ? r1(a.confSum / bn) : 0,
        hitRate: bn ? r1(a.scoreSum / bn) : 0,
        brier: bn ? r1(a.brierSum / bn) : 0,
      };
    }),
    byMonth: [...monthAcc.values()]
      .map((m) => ({ month: m.month, n: m.n, avgScore: r1(m.scoreSum / m.n), avgConf: r1(m.confSum / m.n) }))
      .sort((a, b) => (a.month < b.month ? -1 : 1)),
  };
}

/** 最近教训（resolved 且 lesson 非空，resolvedAt 降序取前 n） */
function recentLessons(decisions, limit = 5) {
  return (decisions || [])
    .filter((d) => d && d.status === 'resolved' && d.resolution && cut(d.resolution.lesson, 1))
    .sort((a, b) => b.resolution.resolvedAt - a.resolution.resolvedAt)
    .slice(0, limit)
    .map((d) => ({
      id: d.id,
      title: d.title,
      lesson: d.resolution.lesson,
      outcome: d.resolution.outcome,
      confidence: d.expected ? d.expected.confidence : null,
      resolvedAt: d.resolution.resolvedAt,
    }));
}

// ── 导出 ───────────────────────────────────────────────────────────────────
function exportJson(decisions, settings) {
  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    app: 'decision-journal',
    schemaVersion: 1,
    settings: settings || DEFAULT_SETTINGS,
    decisions: (decisions || []).slice().sort((a, b) => a.createdAt - b.createdAt),
  }, null, 2);
}

module.exports = {
  K, DEFAULT_SETTINGS, DAY_MS, OUTCOME_META, STATUS_META, BUCKETS, CALIBRATION_MIN_SAMPLE,
  dayKeyOf, monthKeyOf, makeId, clampInt,
  normalizeOptions, resolveChosen, normalizeExpected, normalizeDecision,
  settleDecision, resolveDecision, shelveDecision, updateDecision, outcomeScore,
  isDue, overdueDays, buildOverview, summarize,
  computeCalibration, recentLessons, exportJson,
};
