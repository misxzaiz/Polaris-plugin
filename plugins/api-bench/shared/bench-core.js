'use strict';
/**
 * bench-core.js —— 接口压测台共享纯逻辑（service 与 MCP 共用，零依赖）
 *
 * 职责：目标配置校验与归一（sanitizeTarget）、敏感头掩码（maskHeaders）、
 * 目标圈层判定（scopeOf）、实时分位窗口（windowPercentiles）、
 * 报告摘要与中文结论文案（summarize/verdictOf）、A/B 对比语义（compareReports）。
 *
 * 纯函数原则：不做 IO、不打日志，便于单测覆盖全部边界。
 */

const VERSION = '0.1.0';

// ── 护栏常量（防失控：单机压测的合理上限）────────────────────────────────────
const LIMITS = {
  connections: { min: 1, max: 1000, default: 10 },
  durationS: { min: 1, max: 300, default: 10 },
  pipelining: { min: 1, max: 10, default: 1 },
  rate: { min: 1, max: 1000000 },
  timeoutS: { min: 0.5, max: 60, default: 10 },
  urlMaxLen: 2048,
  headersMaxEntries: 64,
  headerNameMaxLen: 128,
  headerValueMaxBytes: 8192,
  bodyMaxBytes: 1024 * 1024,
  samplesMax: 400,        // 实时采样点上限（约 6 分钟 @1s）
  latRingMax: 20000,      // 实时分位窗口容量（响应数）
  reportSamplesKeep: 120, // 报告内保留的采样点数（图表用）
};

// 落 kv / 报告前必须掩码的敏感头（大小写不敏感）
const SENSITIVE_HEADERS = ['authorization', 'cookie', 'proxy-authorization', 'x-api-key', 'x-auth-token', 'set-cookie'];
// 交给 autocannon 前剔除的托管头（由客户端自身管理，用户设置会破坏请求）
const FORBIDDEN_HEADERS = ['host', 'content-length', 'connection'];

// ── 小工具 ──────────────────────────────────────────────────────────────────
function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function fmtMs(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n)) return '?';
  if (n >= 10000) return `${(n / 1000).toFixed(1)}s`;
  if (n >= 100) return `${Math.round(n)}ms`;
  return `${n.toFixed(n < 10 ? 1 : 0)}ms`;
}

function fmtRate(rps) {
  const n = Number(rps);
  if (!Number.isFinite(n)) return '?';
  if (n >= 10000) return `${Math.round(n / 1000)}k/s`;
  return `${n.toFixed(n >= 100 ? 0 : 1)}/s`;
}

function fmtBytes(bps) {
  const n = Number(bps);
  if (!Number.isFinite(n)) return '?';
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)}MB/s`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)}KB/s`;
  return `${Math.round(n)}B/s`;
}

// ── 敏感头掩码（落 kv / 报告 前必经；内存中的完整值永不外泄）────────────────
function maskValue(v) {
  const s = String(v || '');
  if (!s) return '';
  if (s.length <= 4) return '****';
  return `****${s.slice(-4)}`;
}

function maskHeaders(headers) {
  const out = {};
  for (const [k, v] of Object.entries(headers || {})) {
    out[k] = SENSITIVE_HEADERS.includes(String(k).toLowerCase()) ? maskValue(v) : String(v);
  }
  return out;
}

// ── 目标圈层判定（best-effort，按主机名串判定，不做 DNS）─────────────────────
function scopeOf(urlStr) {
  try {
    const u = new URL(urlStr);
    const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (h === 'localhost' || h === '::1' || /^127\./.test(h) || h === '::ffff:127.0.0.1') return 'loopback';
    if (/^10\./.test(h)) return 'private';
    if (/^192\.168\./.test(h)) return 'private';
    if (/^169\.254\./.test(h)) return 'private';
    if (/^fe80:/i.test(h) || /^fc00:/i.test(h) || /^fd[0-9a-f]{2}:/i.test(h)) return 'private';
    const m172 = /^172\.(\d+)\./.exec(h);
    if (m172) { const second = Number(m172[1]); if (second >= 16 && second <= 31) return 'private'; }
    if (/\.local$/i.test(h)) return 'private';
    return 'public';
  } catch (_) { return 'invalid'; }
}

// ── 目标配置校验与归一（唯一入口；错误给中文原因）────────────────────────────
function clampInt(v, lim, fallback) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(lim.max, Math.max(lim.min, n));
}

/** 小数允许的钳制（timeoutS 支持 0.5s 档） */
function clampNum(v, lim, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(lim.max, Math.max(lim.min, n));
}

/**
 * @param input {{url?:string, method?:string, headers?:object, body?:string|object,
 *                connections?:number, durationS?:number, pipelining?:number, rate?:number, timeoutS?:number}}
 * @param defaults {{connections?:number, durationS?:number, timeoutS?:number}}
 * @returns {{ok:true, value:object}|{ok:false, error:string}}
 */
function sanitizeTarget(input, defaults) {
  const d = defaults || {};
  const out = {
    method: 'GET',
    headers: {},
    body: '',
    connections: clampInt(d.connections, LIMITS.connections, LIMITS.connections.default),
    durationS: clampInt(d.durationS, LIMITS.durationS, LIMITS.durationS.default),
    pipelining: LIMITS.pipelining.default,
    rate: null,
    timeoutS: clampNum(d.timeoutS, LIMITS.timeoutS, LIMITS.timeoutS.default),
  };
  const src = isPlainObject(input) ? input : {};

  // URL
  const urlRaw = String(src.url || '').trim();
  if (!urlRaw) return { ok: false, error: '缺少目标 URL' };
  if (urlRaw.length > LIMITS.urlMaxLen) return { ok: false, error: `URL 过长（>${LIMITS.urlMaxLen} 字符）` };
  let u;
  try { u = new URL(urlRaw); } catch (_) { return { ok: false, error: `URL 无法解析：${urlRaw.slice(0, 80)}` }; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { ok: false, error: `仅支持 http/https 目标（收到 ${u.protocol.replace(':', '')}）` };
  }
  if (!u.hostname) return { ok: false, error: 'URL 缺少主机名' };
  out.url = u.toString();

  // method
  if (src.method !== undefined && src.method !== '') {
    const m = String(src.method).trim().toUpperCase();
    if (!/^[A-Z]{1,10}$/.test(m)) return { ok: false, error: `method 非法：${m.slice(0, 20)}` };
    out.method = m;
  }

  // headers
  if (src.headers !== undefined && src.headers !== null) {
    if (!isPlainObject(src.headers)) return { ok: false, error: 'headers 必须是对象（{名: 值}）' };
    const entries = Object.entries(src.headers);
    if (entries.length > LIMITS.headersMaxEntries) return { ok: false, error: `headers 过多（>${LIMITS.headersMaxEntries} 项）` };
    for (const [k, v] of entries) {
      const name = String(k).trim();
      if (!/^[!-~]+$/.test(name) || name.length > LIMITS.headerNameMaxLen) {
        return { ok: false, error: `header 名非法：${name.slice(0, 40)}` };
      }
      if (FORBIDDEN_HEADERS.includes(name.toLowerCase())) {
        return { ok: false, error: `header「${name}」由压测客户端托管，请移除（避免破坏请求）` };
      }
      const val = typeof v === 'string' ? v : String(v);
      if (Buffer.byteLength(val, 'utf8') > LIMITS.headerValueMaxBytes) {
        return { ok: false, error: `header「${name}」值过大（>${LIMITS.headerValueMaxBytes} 字节）` };
      }
      out.headers[name] = val;
    }
  }

  // body（GET/HEAD 拒绝，语义更友好）
  if (src.body !== undefined && src.body !== null && src.body !== '') {
    if (out.method === 'GET' || out.method === 'HEAD') {
      return { ok: false, error: `${out.method} 请求不应携带 body（如需提交数据请用 POST/PUT/PATCH）` };
    }
    const body = typeof src.body === 'string' ? src.body : JSON.stringify(src.body);
    if (Buffer.byteLength(body, 'utf8') > LIMITS.bodyMaxBytes) {
      return { ok: false, error: `body 过大（>${LIMITS.bodyMaxBytes / 1024}KB）` };
    }
    out.body = body;
  }

  // 数值护栏
  if (src.connections !== undefined) out.connections = clampInt(src.connections, LIMITS.connections, out.connections);
  if (src.durationS !== undefined) out.durationS = clampInt(src.durationS, LIMITS.durationS, out.durationS);
  if (src.pipelining !== undefined) out.pipelining = clampInt(src.pipelining, LIMITS.pipelining, LIMITS.pipelining.default);
  if (src.timeoutS !== undefined) out.timeoutS = clampNum(src.timeoutS, LIMITS.timeoutS, out.timeoutS);
  if (src.rate !== undefined && src.rate !== null && src.rate !== '') {
    const r = Math.round(Number(src.rate));
    if (!Number.isFinite(r)) return { ok: false, error: 'rate（每秒请求数上限）必须是数字' };
    if (r < LIMITS.rate.min || r > LIMITS.rate.max) {
      return { ok: false, error: `rate 超出范围（${LIMITS.rate.min}~${LIMITS.rate.max}）` };
    }
    out.rate = r;
  }

  out.scope = scopeOf(out.url);
  out.bodyBytes = out.body ? Buffer.byteLength(out.body, 'utf8') : 0;
  return { ok: true, value: out };
}

// ── 实时分位（对延迟数组做最近邻秩分位；窗口语义由调用方裁剪）───────────────
function percentileOf(sortedArr, p) {
  const n = sortedArr.length;
  if (!n) return null;
  if (n === 1) return sortedArr[0];
  const idx = Math.min(n - 1, Math.max(0, Math.ceil((p / 100) * n) - 1));
  return sortedArr[idx];
}

/**
 * 滚动窗口实时分位：从响应样本环（[{t,v}]）取最近 windowMs 的值。
 * @returns {{mean:number,p50:number,p90:number,p97_5:number,p99:number,count:number}|null}
 */
function windowPercentiles(ring, windowMs, now) {
  const cut = (now || Date.now()) - windowMs;
  const vals = [];
  for (let i = ring.length - 1; i >= 0; i--) {
    if (ring[i].t < cut) break; // ring 按时间追加，遇到窗口外即止
    vals.push(ring[i].v);
  }
  if (!vals.length) return null;
  vals.sort((a, b) => a - b);
  let sum = 0;
  for (const v of vals) sum += v;
  return {
    mean: sum / vals.length,
    p50: percentileOf(vals, 50),
    p90: percentileOf(vals, 90),
    p97_5: percentileOf(vals, 97.5),
    p99: percentileOf(vals, 99),
    count: vals.length,
  };
}

// ── 报告摘要（autocannon result → 我方稳定 schema）──────────────────────────
function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : (fallback === undefined ? null : fallback);
}

function round1(v) { return Math.round(v * 10) / 10; }

/** 对外导出的四舍五入（实时快照用，避免浮点长尾） */
function fmtRound1(v) { return round1(Number(v)); }

/**
 * @param result autocannon done(result)
 * @param liveSamples 引擎采集的实时采样 [{t,rps,bytes,latMean,latP97_5,errs}]
 * @param target sanitizeTarget 产物
 * @param aborted 是否被中止
 */
function summarize(result, liveSamples, target, aborted) {
  const lat = result.latency || {};
  const req = result.requests || {};
  const thr = result.throughput || {};
  const statusDist = {};
  for (const [code, st] of Object.entries(result.statusCodeStats || {})) {
    statusDist[code] = num(st && st.count, 0);
  }
  const total2xx = num(result['2xx'], 0) + num(result['1xx'], 0);
  const finished = num(result.requests && result.requests.total, 0);
  const non2xx = num(result.non2xx, 0);
  const samples = (Array.isArray(liveSamples) ? liveSamples : []).slice(-LIMITS.reportSamplesKeep);
  const rpsPeak = samples.length ? Math.max(...samples.map((s) => s.rps || 0)) : num(req.mean, 0);
  return {
    durationS: num(result.duration, target.durationS),
    totalRequests: finished,
    sentRequests: num(result.requests && result.requests.sent, 0),
    rpsMean: round1(num(req.mean, 0)),
    rpsPeak: round1(rpsPeak),
    bytesMean: Math.round(num(thr.mean, 0)),
    bytesTotal: num(thr.total, 0),
    errors: num(result.errors, 0),
    timeouts: num(result.timeouts, 0),
    mismatches: num(result.mismatches, 0),
    resets: num(result.resets, 0),
    non2xx,
    non2xxPct: finished ? round1((non2xx / finished) * 100) : 0,
    ok2xx: total2xx,
    statusDist,
    latencies: {
      mean: round1(num(lat.mean, 0)),
      stddev: round1(num(lat.stddev, 0)),
      min: round1(num(lat.min, 0)),
      max: round1(num(lat.max, 0)),
      p50: round1(num(lat.p50, 0)),
      p75: round1(num(lat.p75, 0)),
      p90: round1(num(lat.p90, 0)),
      p97_5: round1(num(lat.p97_5, 0)),
      p99: round1(num(lat.p99, 0)),
      p99_9: round1(num(lat.p99_9, 0)),
    },
    aborted: !!aborted,
    samples,
  };
}

// ── 中文结论（基于同一报告派生，不虚构评分）──────────────────────────────────
function verdictOf(summary, target) {
  const notes = [];
  const l = summary.latencies;
  const errTotal = summary.errors + summary.timeouts;
  if (summary.aborted) notes.push('本次为手动中止的部分结果，指标仅代表已完成区间');
  if (summary.timeouts > 0) {
    notes.push(`${summary.timeouts} 次超时——目标处理能力不足或 timeoutS（当前 ${target.timeoutS}s）偏紧`);
  }
  if (summary.errors > 0) notes.push(`${summary.errors} 次连接/请求错误（拒绝连接、断连或响应非法）`);
  if (summary.non2xx > 0) {
    const top = Object.entries(summary.statusDist)
      .filter(([c]) => !c.startsWith('2'))
      .sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([c, n]) => `${c}×${n}`).join(' ');
    notes.push(`${summary.non2xx} 个非 2xx 响应（${top}）——若非预期，检查目标在压力下的行为`);
  }
  if (target.scope === 'public') notes.push('目标是公网地址：请确认你拥有对该目标的压测授权');
  if (target.rate) notes.push(`已启用速率上限 ${target.rate}/s：结果是限速后的表现，不反映目标极限`);
  if (l.p99 >= 1000 && summary.rpsMean < target.connections * 2) {
    notes.push('高延迟、低吞吐：目标可能阻塞在慢操作（外部 IO/锁/单线程瓶颈）上');
  }
  if (!notes.length && summary.timeouts === 0 && summary.errors === 0) {
    notes.push(`目标在 ${target.connections} 连接压力下返回全部 ${summary.ok2xx} 个 2xx，表现稳定`);
  }
  const oneLine = `${fmtRate(summary.rpsMean)}（峰值 ${fmtRate(summary.rpsPeak)}）· 延迟 ${fmtMs(l.p50)} / p97.5 ${fmtMs(l.p97_5)} / p99 ${fmtMs(l.p99)} · 非 2xx ${summary.non2xx}（${summary.non2xxPct}%）· 错误 ${errTotal}`;
  return { oneLine, notes };
}

// ── A/B 对比（方向语义：吞吐升好、延迟/错误降好）────────────────────────────
const COMPARE_METRICS = [
  { key: 'rpsMean', label: '平均吞吐', unit: '/s', dir: 'up' },
  { key: 'lat.p50', label: 'p50 延迟', unit: 'ms', dir: 'down' },
  { key: 'lat.p97_5', label: 'p97.5 延迟', unit: 'ms', dir: 'down' },
  { key: 'lat.p99', label: 'p99 延迟', unit: 'ms', dir: 'down' },
  { key: 'lat.mean', label: '平均延迟', unit: 'ms', dir: 'down' },
  { key: 'errors', label: '错误+超时', unit: '', dir: 'down' },
  { key: 'non2xx', label: '非 2xx', unit: '', dir: 'down' },
];

function getMetric(report, path) {
  if (path.startsWith('lat.')) return num(report.latencies && report.latencies[path.slice(4)], 0);
  return num(report.summary && report.summary[path], 0);
}

/**
 * @param a {{runId, summary, latencies}} 报告（基准/改前）
 * @param b {{runId, summary, latencies}} 报告（改后）
 * @returns {{rows: Array<{key,label,unit,dir,a,b,deltaPct,better:'a'|'b'|'tie'|'na'}>, bWins:number, aWins:number, ties:number}}
 */
function compareReports(a, b) {
  const rows = COMPARE_METRICS.map((m) => {
    const va = getMetric(a, m.key);
    const vb = getMetric(b, m.key);
    const deltaPct = va === 0 ? (vb === 0 ? 0 : null) : round1(((vb - va) / Math.abs(va)) * 100);
    let better = 'tie';
    if (deltaPct === null || (va === 0 && vb === 0)) better = 'na';
    else if (deltaPct === 0) better = 'tie';
    else if (m.dir === 'up') better = deltaPct > 0 ? 'b' : 'a';
    else better = deltaPct < 0 ? 'b' : 'a';
    return { key: m.key, label: m.label, unit: m.unit, dir: m.dir, a: va, b: vb, deltaPct, better };
  });
  const bWins = rows.filter((r) => r.better === 'b').length;
  const aWins = rows.filter((r) => r.better === 'a').length;
  const ties = rows.filter((r) => r.better === 'tie').length;
  return { rows, bWins, aWins, ties };
}

module.exports = {
  VERSION,
  LIMITS,
  SENSITIVE_HEADERS,
  FORBIDDEN_HEADERS,
  fmtMs,
  fmtRate,
  fmtBytes,
  fmtRound1,
  maskValue,
  maskHeaders,
  scopeOf,
  sanitizeTarget,
  percentileOf,
  windowPercentiles,
  summarize,
  verdictOf,
  compareReports,
  COMPARE_METRICS,
};
