'use strict';
/**
 * abacus-core —— AI 用量账的纯计算核心（服务 / 面板 / MCP 三方共用同一权威，口径不漂移）
 *
 * 职责：口径归一（三源两种 input 语义 → 统一台账条目）、计价（USD/Mtok）、
 *       聚合（summary/daily/models/projects/quality/sessions）、漏钱洞察。
 * 铁律：本文件零 IO、零宿主依赖（node 内置除外），可在 node --test 与浏览器
 *       bundle 中同等运行。
 *
 * ── 口径地图（2026-10 实测定案，改口径必先重测）────────────────────────────
 * | 源                 | input_tokens 语义            | 全价输入 =                  |
 * | zcode model_usage  | 含 cacheRead+cacheWrite       | input − cacheRead − cacheWrite |
 * |   （实证：input=73451, cacheRead=70464, computed=73692=input+out）       |
 * | claude JSONL       | 不含（Anthropic API 惯例）    | input                        |
 * | polaris tokenUsage | 不含（ai_event.rs「未命中缓存的输入 token（全价）」） | input |
 * ──────────────────────────────────────────────────────────────────────────
 * 台账条目（entry）统一为归一后口径：fin=全价输入，cr=缓存读，cw=缓存写，
 * out=输出（含 reasoning）。成本 = (fin×in + cr×cr价 + cw×cw价 + out×out价)/1e6。
 */

const DAY_MS = 86400000;
const PREFIX = 'abacus';

const K = {
  meta: `${PREFIX}.meta`,
  summary: `${PREFIX}.summary`,
  daily: `${PREFIX}.daily`,
  models: `${PREFIX}.models`,
  projects: `${PREFIX}.projects`,
  quality: `${PREFIX}.quality`,
  sessions: `${PREFIX}.sessions`,
  prices: `${PREFIX}.prices`,
  settings: `${PREFIX}.settings`,
  cmdPrefix: `${PREFIX}.cmd.`,
  resultPrefix: `${PREFIX}.result.`,
};

/** LiteLLM 社区价目表（唯一外网同步点，服务进程 fetch + SSRF 守卫） */
const LITELLM_PRICE_URL = 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';

/** 内置预设价（USD / 百万 token）。≈公开牌价的占位值，面板可改、可从 LiteLLM 同步覆盖。 */
const DEFAULT_PRICES = {
  'GLM-5.3-Flash': { in: 0.06, cacheRead: 0.006, cacheWrite: 0.06, out: 0.22, preset: true },
  'GLM-5.3': { in: 0.85, cacheRead: 0.085, cacheWrite: 0.85, out: 3.4, preset: true },
  'GLM-4.6': { in: 0.6, cacheRead: 0.06, cacheWrite: 0.6, out: 2.2, preset: true },
  'GLM-4.5': { in: 0.6, cacheRead: 0.06, cacheWrite: 0.6, out: 2.2, preset: true },
  'deepseek-v4-flash': { in: 0.07, cacheRead: 0.007, cacheWrite: 0.07, out: 0.28, preset: true },
  'deepseek-v4': { in: 0.28, cacheRead: 0.028, cacheWrite: 0.28, out: 1.1, preset: true },
  'claude-opus-4': { in: 15, cacheRead: 1.5, cacheWrite: 18.75, out: 75, preset: true },
  'claude-sonnet-4': { in: 3, cacheRead: 0.3, cacheWrite: 3.75, out: 15, preset: true },
  'claude-haiku-4': { in: 1, cacheRead: 0.1, cacheWrite: 1.25, out: 5, preset: true },
  'gpt-5': { in: 1.25, cacheRead: 0.125, cacheWrite: 1.25, out: 10, preset: true },
  'gpt-5-mini': { in: 0.25, cacheRead: 0.025, cacheWrite: 0.25, out: 2, preset: true },
  'gemini-2.5-flash': { in: 0.3, cacheRead: 0.075, cacheWrite: 0.3, out: 2.5, preset: true },
};

const DEFAULT_SETTINGS = {
  sources: { zcode: true, claude: true, polaris: true },
  fxRate: 7.2, // USD→CNY 显示折算，仅显示用
  autoRescanMin: 5,
  priceSyncUrl: LITELLM_PRICE_URL,
};

const SRC_LIST = ['zcode', 'claude', 'polaris'];

// ── 时间与键 ────────────────────────────────────────────────────────────────

function dayKeyOf(ts) {
  if (!Number.isFinite(ts) || ts <= 0) return '';
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function periodStartMs(period, nowMs) {
  const now = Number.isFinite(nowMs) ? nowMs : Date.now();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  if (period === 'today') return today.getTime();
  if (period === 'd7') return today.getTime() - 6 * DAY_MS;
  if (period === 'd30') return today.getTime() - 29 * DAY_MS;
  return 0; // all
}

/** 价目键匹配：全等 → 小写 → 去日期后缀前缀匹配（claude-sonnet-4-5-20250929 → claude-sonnet-4-5） */
function resolvePriceKey(prices, model) {
  if (!model || typeof model !== 'string') return '';
  if (prices[model]) return model;
  const lower = model.toLowerCase();
  const keys = Object.keys(prices);
  for (const k of keys) if (k.toLowerCase() === lower) return k;
  const stem = lower.replace(/[-_]\d{8}$/, '');
  for (const k of keys) {
    const kl = k.toLowerCase();
    if (lower === kl || stem === kl) return k;
  }
  for (const k of keys) {
    const kl = k.toLowerCase();
    if (stem.startsWith(kl) || kl.startsWith(stem)) return k;
  }
  return '';
}

/** model → {in, cacheRead, cacheWrite, out, known, key}（USD/Mtok） */
function priceFor(prices, model) {
  const key = resolvePriceKey(prices || {}, model);
  if (!key) return { known: false, key: '' };
  const p = prices[key] || {};
  return {
    known: true,
    key,
    in: Number(p.in) || 0,
    cacheRead: Number(p.cacheRead) || 0,
    cacheWrite: Number(p.cacheWrite) || 0,
    out: Number(p.out) || 0,
  };
}

// ── 归一化：各源 → 台账条目 ────────────────────────────────────────────────

function basename(p) {
  if (!p || typeof p !== 'string') return '';
  const norm = p.replace(/[\\/]+$/, '');
  const i = Math.max(norm.lastIndexOf('\\'), norm.lastIndexOf('/'));
  return i >= 0 ? norm.slice(i + 1) : norm;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * zcode model_usage 行 → entry。input 含缓存（见口径地图），此处归一为 fin。
 * r: model_usage 行；sess: {title, directory}
 */
function normalizeZcodeRow(r, sess) {
  if (!r) return null;
  const input = num(r.input_tokens);
  const cr = num(r.cache_read_input_tokens);
  const cw = num(r.cache_creation_input_tokens);
  const fin = Math.max(0, input - cr - cw);
  const out = num(r.output_tokens);
  const ts = Number(r.started_at) || 0;
  const errType = r.error_type ? String(r.error_type) : '';
  const rowId = r.id !== undefined ? r.id : `${r.turn_id}|${r.assistant_message_id}`;
  return {
    k: `z:${r.session_id}:${rowId}:${r.attempt_index !== undefined ? r.attempt_index : 0}`,
    src: 'zcode',
    ts,
    day: dayKeyOf(ts),
    sid: String(r.session_id || ''),
    title: sess && sess.title ? String(sess.title).slice(0, 80) : '',
    proj: basename(sess && sess.directory),
    model: String(r.model_id || ''),
    provider: String(r.provider_id || ''),
    agent: String(r.agent || ''),
    mode: String(r.mode || ''),
    fin,
    cr,
    cw,
    out,
    req: 1,
    err: errType ? 1 : 0,
    etype: errType,
    retry: num(r.retry_count) > 0 ? 1 : 0,
    ttft: num(r.time_to_first_token_ms),
    dur: num(r.duration_ms),
    hostCost: 0,
  };
}

/**
 * claude JSONL assistant 行（已剥出 usage）→ entry。input 不含缓存（Anthropic 惯例）。
 * m: {id, ts, model, title?, usage:{input,output,cacheRead,cacheWrite}, isSidechain, cwd, sessionId}
 * 注意：成本账必须计入子 agent 侧链（isSidechain）——这与拾光机「索引跳过侧链」
 * 的口径相反且是有意为之：侧链的真实花费不记就是漏账。
 */
function normalizeClaudeMsg(m, fileHint) {
  if (!m || !m.usage) return null;
  const ts = Number(m.ts) || 0;
  return {
    k: `c:${fileHint || m.sessionId || ''}:${m.id || `${ts}|${num(m.usage.output)}`}`,
    src: 'claude',
    ts,
    day: dayKeyOf(ts),
    sid: String(m.sessionId || ''),
    title: String(m.title || '').slice(0, 80),
    proj: basename(m.cwd),
    model: String(m.model || ''),
    provider: 'anthropic',
    agent: m.isSidechain ? 'claude-subagent' : 'claude-main',
    mode: '',
    fin: num(m.usage.input),
    cr: num(m.usage.cacheRead),
    cw: num(m.usage.cacheWrite),
    out: num(m.usage.output),
    req: 1,
    err: 0,
    etype: '',
    retry: 0,
    ttft: 0,
    dur: 0,
    hostCost: 0,
  };
}

/**
 * polaris dialogs meta → entry。tokenUsage 的 input 不含缓存；
 * costUsd 由宿主网关算得（有则为本源权威成本，插件不重算）。
 */
function normalizePolarisMeta(meta) {
  if (!meta) return null;
  const tu = meta.tokenUsage || {};
  const ts = Number(meta.updatedAt) || 0;
  const hasTokens = num(tu.input) || num(tu.output) || num(tu.cacheRead) || num(tu.cacheCreation);
  if (!hasTokens && !num(tu.costUsd)) return null;
  return {
    k: `p:${meta.externalId || ts}`,
    src: 'polaris',
    ts,
    day: dayKeyOf(ts),
    sid: String(meta.externalId || ''),
    title: String(meta.title || '').slice(0, 80),
    proj: basename(meta.workspacePath || meta.workspaceId || ''),
    model: '',
    provider: 'polaris-host',
    agent: String(meta.engineId || ''),
    mode: '',
    fin: num(tu.input),
    cr: num(tu.cacheRead),
    cw: num(tu.cacheCreation),
    out: num(tu.output),
    req: 1,
    err: 0,
    etype: '',
    retry: 0,
    ttft: 0,
    dur: 0,
    hostCost: num(tu.costUsd),
  };
}

// ── 计价 ───────────────────────────────────────────────────────────────────

/**
 * entry → { costUsd|null, savingsUsd|null, priced:bool }
 * - polaris 且宿主 costUsd>0：cost=宿主值（权威），savings 不估（模型未知）。
 * - 价目命中：按口径地图公式计算；savings = cr×(in−cr价)/1e6。
 * - 未命中：双 null（只记 token，不编数）。
 */
function priceEntry(entry, prices) {
  if (!entry) return { costUsd: null, savingsUsd: null, priced: false };
  if (entry.src === 'polaris' && entry.hostCost > 0) {
    return { costUsd: entry.hostCost, savingsUsd: null, priced: true };
  }
  const p = priceFor(prices, entry.model);
  if (!p.known) return { costUsd: null, savingsUsd: null, priced: false };
  const cost = (entry.fin * p.in + entry.cr * p.cacheRead + entry.cw * p.cacheWrite + entry.out * p.out) / 1e6;
  const savings = entry.cr > 0 && p.in > p.cacheRead ? (entry.cr * (p.in - p.cacheRead)) / 1e6 : 0;
  return { costUsd: cost, savingsUsd: savings, priced: true };
}

// ── 聚合 ───────────────────────────────────────────────────────────────────

function emptyBucket() {
  return { req: 0, fin: 0, cr: 0, cw: 0, out: 0, costUsd: 0, priced: 0, unpricedTokens: 0, cacheSavings: 0 };
}

function addEntry(b, e, priced) {
  b.req += 1;
  b.fin += e.fin;
  b.cr += e.cr;
  b.cw += e.cw;
  b.out += e.out;
  if (priced.costUsd !== null) {
    b.costUsd += priced.costUsd;
    b.priced += 1;
  } else {
    b.unpricedTokens += e.fin + e.cr + e.cw + e.out;
  }
  if (priced.savingsUsd) b.cacheSavings += priced.savingsUsd;
}

function round6(n) {
  return Math.round(n * 1e6) / 1e6;
}

function percentile(sorted, q) {
  if (!sorted.length) return null;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)));
  return sorted[i];
}

/**
 * 全量聚合。entries: 台账条目数组（同 k 重复时保后到）；prices: 价目表；
 * opts: {nowMs, maxDaily, topSessions, topProjects, tools}
 */
function aggregate(entries, prices, opts) {
  const o = opts || {};
  const nowMs = Number.isFinite(o.nowMs) ? o.nowMs : Date.now();
  const maxDaily = o.maxDaily || 120;
  const topSessions = o.topSessions || 30;
  const topProjects = o.topProjects || 60;

  const all = emptyBucket();
  const today = emptyBucket();
  const d7 = emptyBucket();
  const d30 = emptyBucket();
  const bySrc = { zcode: emptyBucket(), claude: emptyBucket(), polaris: emptyBucket() };
  const dailyMap = new Map(); // day → bucket
  const modelMap = new Map(); // model → 行
  const projMap = new Map(); // proj|src → 行
  const sessionMap = new Map(); // src|sid → 行
  const errorsByType = {};
  const ttftAll = [];
  const durAll = [];
  let zcodeRows = 0;
  let retriedRows = 0;

  const tToday = periodStartMs('today', nowMs);
  const t7 = periodStartMs('d7', nowMs);
  const t30 = periodStartMs('d30', nowMs);

  const dedup = new Map(); // 同 k 后到者胜（与服务层 Map 覆盖语义一致）
  for (const raw of entries) {
    if (!raw || !raw.k) continue;
    dedup.set(raw.k, raw);
  }
  for (const e of dedup.values()) {
    const priced = priceEntry(e, prices);

    addEntry(all, e, priced);
    addEntry(bySrc[e.src] || (bySrc[e.src] = emptyBucket()), e, priced);
    if (e.ts >= tToday) addEntry(today, e, priced);
    if (e.ts >= t7) addEntry(d7, e, priced);
    if (e.ts >= t30) addEntry(d30, e, priced);

    let db = dailyMap.get(e.day);
    if (!db) dailyMap.set(e.day, (db = emptyBucket()));
    addEntry(db, e, priced);

    // models（按小写归并别名：GLM-5.3-Flash / glm-5.3-flash 是同一模型；
    // (未记录) 收容无模型名的源，如 polaris）
    const mkLower = e.model ? e.model.toLowerCase() : '(未记录)';
    let mr = modelMap.get(mkLower);
    if (!mr) {
      mr = {
        model: e.model || '(未记录)',
        nameCount: new Map(),
        provider: e.provider || '',
        req: 0, fin: 0, cr: 0, cw: 0, out: 0, costUsd: 0, priced: 0, savings: 0,
        d30Req: 0, d30Cost: 0, err: 0, ttft: [], dur: [],
      };
      modelMap.set(mkLower, mr);
    }
    if (e.model) mr.nameCount.set(e.model, (mr.nameCount.get(e.model) || 0) + 1);
    if (!mr.provider && e.provider) mr.provider = e.provider;
    mr.req += 1;
    mr.fin += e.fin;
    mr.cr += e.cr;
    mr.cw += e.cw;
    mr.out += e.out;
    if (priced.costUsd !== null) { mr.costUsd += priced.costUsd; mr.priced += 1; }
    if (priced.savingsUsd) mr.savings += priced.savingsUsd;
    if (e.err) mr.err += 1;
    if (e.ts >= t30) { mr.d30Req += 1; if (priced.costUsd !== null) mr.d30Cost += priced.costUsd; }
    if (e.ttft > 0) { mr.ttft.push(e.ttft); ttftAll.push(e.ttft); }
    if (e.dur > 0) { mr.dur.push(e.dur); durAll.push(e.dur); }
    if (e.src === 'zcode') {
      zcodeRows += 1;
      if (e.retry) retriedRows += 1;
      if (e.etype) errorsByType[e.etype] = (errorsByType[e.etype] || 0) + 1;
    }

    // projects（项目 × 源 归组，避免同名目录混账）
    const pk = `${e.proj || '(未归项目)'}|${e.src}`;
    let pr = projMap.get(pk);
    if (!pr) {
      pr = { proj: e.proj || '(未归项目)', src: e.src, sessions: new Set(), req: 0, tokens: 0, costUsd: 0, lastDay: '', d30Cost: 0 };
      projMap.set(pk, pr);
    }
    pr.sessions.add(e.sid);
    pr.req += 1;
    pr.tokens += e.fin + e.cr + e.cw + e.out;
    if (priced.costUsd !== null) pr.costUsd += priced.costUsd;
    if (e.ts >= t30 && priced.costUsd !== null) pr.d30Cost += priced.costUsd;
    if (e.day && e.day > pr.lastDay) pr.lastDay = e.day;

    // sessions
    const sk = `${e.src}|${e.sid}`;
    let sr = sessionMap.get(sk);
    if (!sr) {
      sr = {
        src: e.src, sid: e.sid, title: '', proj: '',
        req: 0, fin: 0, cr: 0, tokens: 0, costUsd: 0, firstDay: e.day || '', lastDay: e.day || '',
      };
      sessionMap.set(sk, sr);
    }
    sr.req += 1;
    sr.fin += e.fin;
    sr.cr += e.cr;
    sr.tokens += e.fin + e.cr + e.cw + e.out;
    if (priced.costUsd !== null) sr.costUsd += priced.costUsd;
    if (e.day) {
      if (!sr.firstDay || e.day < sr.firstDay) sr.firstDay = e.day;
      if (e.day > sr.lastDay) sr.lastDay = e.day;
    }
    if (!sr.title && e.title) sr.title = e.title;
    if (!sr.proj && e.proj) sr.proj = e.proj;
  }

  const daily = [...dailyMap.entries()]
    .filter(([d]) => d)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .slice(-maxDaily)
    .map(([day, b]) => ({
      day,
      req: b.req, fin: round6(b.fin), cr: round6(b.cr), cw: round6(b.cw), out: round6(b.out),
      costUsd: round6(b.costUsd), cacheSavings: round6(b.cacheSavings),
    }));

  const models = [...modelMap.values()]
    .map((m) => {
      // 展示名取请求数最多的原始大小写
      let displayName = m.model;
      let best = -1;
      for (const [name, n] of m.nameCount) {
        if (n > best) {
          best = n;
          displayName = name;
        }
      }
      return {
        model: displayName,
        provider: m.provider,
        req: m.req, fin: round6(m.fin), cr: round6(m.cr), cw: round6(m.cw), out: round6(m.out),
        costUsd: round6(m.costUsd),
        priced: m.priced,
        savings: round6(m.savings),
        cacheHit: m.fin + m.cr + m.cw > 0 ? Math.round((m.cr / (m.fin + m.cr + m.cw)) * 1000) / 10 : null,
        ttftP50: percentile(m.ttft.slice().sort((a, b) => a - b), 0.5),
        ttftP90: percentile(m.ttft.slice().sort((a, b) => a - b), 0.9),
        err: m.err,
        d30Req: m.d30Req,
        d30Cost: round6(m.d30Cost),
      };
    })
    .sort((a, b) => b.costUsd - a.costUsd || b.fin + b.cr + b.out - (a.fin + a.cr + a.out));

  const projects = [...projMap.values()]
    .map((p) => ({
      proj: p.proj,
      src: p.src,
      sessions: p.sessions.size,
      req: p.req,
      tokens: round6(p.tokens),
      costUsd: round6(p.costUsd),
      d30Cost: round6(p.d30Cost),
      lastDay: p.lastDay,
    }))
    .sort((a, b) => b.tokens - a.tokens)
    .slice(0, topProjects);

  const sessions = [...sessionMap.values()]
    .map((s) => ({
      src: s.src, sid: s.sid, title: s.title, proj: s.proj,
      req: s.req, tokens: round6(s.tokens), costUsd: round6(s.costUsd),
      firstDay: s.firstDay, lastDay: s.lastDay,
    }))
    .sort((a, b) => b.costUsd - a.costUsd || b.tokens - a.tokens)
    .slice(0, topSessions);

  const quality = {
    errorsByType,
    zcodeRows,
    retriedRows,
    ttftP50: percentile(ttftAll.slice().sort((a, b) => a - b), 0.5),
    ttftP90: percentile(ttftAll.slice().sort((a, b) => a - b), 0.9),
    durP50: percentile(durAll.slice().sort((a, b) => a - b), 0.5),
    durP90: percentile(durAll.slice().sort((a, b) => a - b), 0.9),
    tools: o.tools || { total: 0, byName: [], destructive: 0 },
    insights: buildInsights({ all, errorsByType, models, sessions: [...sessionMap.values()], prices }),
  };

  const roundBucket = (b) => ({
    req: b.req, fin: round6(b.fin), cr: round6(b.cr), cw: round6(b.cw), out: round6(b.out),
    costUsd: round6(b.costUsd), priced: b.priced, unpricedTokens: round6(b.unpricedTokens),
    cacheSavings: round6(b.cacheSavings),
  });

  return {
    summary: {
      all: roundBucket(all),
      today: roundBucket(today),
      d7: roundBucket(d7),
      d30: roundBucket(d30),
      bySrc: {
        zcode: roundBucket(bySrc.zcode),
        claude: roundBucket(bySrc.claude),
        polaris: roundBucket(bySrc.polaris),
      },
      generatedAt: nowMs,
    },
    daily,
    models,
    projects,
    quality,
    sessions,
  };
}

/**
 * 漏钱洞察。只报实测事实，不臆断原因。
 * ctx: {all, errorsByType, models(原始行), sessions(原始行含 fin/cr), prices}
 */
function buildInsights(ctx) {
  const out = [];
  const { errorsByType, models, sessions, all, prices } = ctx;

  const rl = (errorsByType && errorsByType.rate_limited) || 0;
  if (rl > 0) {
    out.push({ code: 'rate_limited', level: 'warn', text: `上游限流 ${rl} 次请求（rate_limited）——排队与重试拖慢会话，一般不产生计费 token。` });
  }
  const otherErrs = errorsByType
    ? Object.entries(errorsByType).filter(([k]) => k !== 'rate_limited').reduce((s, [, n]) => s + n, 0)
    : 0;
  if (otherErrs > 0) {
    out.push({ code: 'errors', level: 'warn', text: `非限流错误 ${otherErrs} 次请求（网络/超时/取消等），白耗等待时间。` });
  }

  const unpriced = models.filter((m) => m.priced === 0 && m.fin + m.cr + m.cw + m.out > 0);
  const unpricedTokens = unpriced.reduce((s, m) => s + m.fin + m.cr + m.cw + m.out, 0);
  if (unpricedTokens > 0) {
    const names = unpriced.map((m) => m.model).slice(0, 3).join('、');
    out.push({ code: 'unpriced', level: 'info', text: `有 ${Math.round(unpricedTokens).toLocaleString('en-US')} token 发生在未计价模型（${names}）——在设置里补价目即可入账。` });
  }

  // 缓存疑似失效：会话输入体量大但缓存读占比过低（<20%），全价输入 >100k
  const weak = sessions
    .filter((s) => s.fin > 100000 && s.fin + s.cr > 0 && s.cr / (s.fin + s.cr) < 0.2)
    .sort((a, b) => b.fin - a.fin)
    .slice(0, 3);
  if (weak.length > 0) {
    const first = weak[0];
    out.push({
      code: 'weak_cache',
      level: 'info',
      text: `${weak.length} 个会话缓存命中率异常偏低（如「${first.title || first.sid.slice(0, 12)}」全价输入 ${Math.round(first.fin).toLocaleString('en-US')}、缓存读 ${Math.round(first.cr).toLocaleString('en-US')}）——长上下文反复全价计费，值得一看。`,
    });
  }

  // 缓存总节省：给一句「值回票价」的正面账
  if (all.cacheSavings > 0) {
    out.push({ code: 'cache_savings', level: 'good', text: `缓存累计帮你省下约 $${round6(all.cacheSavings)}（cacheRead × 全价差），这是账面外看不见的钱。` });
  }

  if (all.req > 0 && all.priced === 0 && all.unpricedTokens > 0) {
    out.push({ code: 'no_prices', level: 'warn', text: '当前价目表下没有一笔可计价——打开设置检查价目表或模型名。' });
  }
  return out.filter((i) => i.text);
}

module.exports = {
  DAY_MS,
  PREFIX,
  K,
  SRC_LIST,
  LITELLM_PRICE_URL,
  DEFAULT_PRICES,
  DEFAULT_SETTINGS,
  dayKeyOf,
  periodStartMs,
  resolvePriceKey,
  priceFor,
  normalizeZcodeRow,
  normalizeClaudeMsg,
  normalizePolarisMeta,
  priceEntry,
  aggregate,
};
