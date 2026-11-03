'use strict';
/**
 * core.js —— 链路追踪台纯函数核心（零 node 内置依赖；会被 esbuild 打进面板
 * browser bundle，禁止 require os/path/fs——路径组装收敛到 server.js 单侧）
 *
 * 职责：
 *   - OTLP/HTTP-JSON（ExportTraceServiceRequest）→ 归一化 span（双方言容忍）
 *   - UnixNano → ms 用 BigInt 精确换算（1.7e18 超 Number.MAX_SAFE_INTEGER，
 *     Number 直转会丢微秒级精度，根因见 needs/017）
 *   - span 组树（孤儿挂根，不丢数据）、瀑布布局、trace 概览与搜索
 *   - JSONL 行解析 / kv 分块投影（与 webhook-station 同形状）
 */

const CHUNK_SIZE = 20;        // tl.rec.* 每块 trace 概览条数
const RING_LIMIT = 60;        // 概览 ring 上限（新在前）
const TRACE_FULL_KV_LIMIT = 12; // tl.trace.<id> 全文投影上限（LRU，服务侧维护）

const KINDS = ['unspecified', 'internal', 'server', 'client', 'producer', 'consumer'];
const KIND_NAMES = { unspecified: 0, internal: 1, server: 2, client: 3, producer: 4, consumer: 5 };

// ── 时间：UnixNano → ms（BigInt 精确）───────────────────────────────────────
/** 容忍 string / number / 非法输入；非法返回 null（调用方决定丢弃或兜底） */
function nanoToMs(nano) {
  if (nano === null || nano === undefined || nano === '') return null;
  try {
    const b = BigInt(nano); // string/number 都能转；负数/小数 number 会抛或截断——抛则 null
    if (b < 0n) return null;
    return Number(b / 1000000n); // 向下取整到 ms；观测场景可接受
  } catch (_) {
    return null;
  }
}

// ── OTLP AnyValue → 字符串（attributes/events 全转字符串，显示与搜索口径一致）──
function attrValueToString(v) {
  if (!v || typeof v !== 'object') return v === undefined || v === null ? '' : String(v);
  if ('stringValue' in v) return String(v.stringValue);
  if ('intValue' in v) return String(v.intValue);
  if ('doubleValue' in v) return String(v.doubleValue);
  if ('boolValue' in v) return v.boolValue ? 'true' : 'false';
  if ('bytesValue' in v) return `<bytes ${String(v.bytesValue).length}b>`;
  if ('arrayValue' in v && v.arrayValue && Array.isArray(v.arrayValue.values)) {
    return `[${v.arrayValue.values.map(attrValueToString).join(', ')}]`;
  }
  if ('kvlistValue' in v && v.kvlistValue && Array.isArray(v.kvlistValue.values)) {
    const inner = normalizeAttributes(v.kvlistValue.values);
    return `{${Object.keys(inner).map((k) => `${k}=${inner[k]}`).join(', ')}}`;
  }
  return '';
}

/** [{key, value}] → { key: string }；非法项跳过 */
function normalizeAttributes(arr) {
  const out = {};
  if (!Array.isArray(arr)) return out;
  for (const a of arr) {
    if (!a || typeof a.key !== 'string' || !a.key) continue;
    out[a.key] = attrValueToString(a.value);
  }
  return out;
}

// ── kind / status 双方言（数字枚举 / OTLP 名 / 简写名）───────────────────────
function kindOf(raw) {
  if (typeof raw === 'number' && KINDS[raw]) return KINDS[raw];
  const s = String(raw || '').trim().toUpperCase().replace(/^SPAN_KIND_/, '');
  return KINDS.includes(s.toLowerCase()) ? s.toLowerCase() : 'unspecified';
}
function statusOf(raw) {
  // OTLP: code 0=UNSET 1=OK 2=ERROR（数字或 STATUS_CODE_* / ok|error 字符串）
  if (raw && typeof raw === 'object') {
    let code = raw.code;
    if (typeof code === 'number') code = code === 2 ? 'error' : code === 1 ? 'ok' : 'unset';
    else {
      const s = String(code || '').trim().toUpperCase().replace(/^STATUS_CODE_/, '');
      code = s === 'ERROR' ? 'error' : s === 'OK' ? 'ok' : 'unset';
    }
    return { code, message: typeof raw.message === 'string' ? raw.message : '' };
  }
  if (typeof raw === 'number') return { code: raw === 2 ? 'error' : raw === 1 ? 'ok' : 'unset', message: '' };
  const s = String(raw || '').trim().toUpperCase().replace(/^STATUS_CODE_/, '');
  return { code: s === 'ERROR' ? 'error' : s === 'OK' ? 'ok' : 'unset', message: '' };
}

// ── OTLP 请求归一化 ─────────────────────────────────────────────────────────
/**
 * @param body ExportTraceServiceRequest JSON
 * @param opts {{decodeId?: (id:string, byteLen:number)=>string}} decodeId 注入：
 *        node 侧传 Buffer 版（兼容 base64 bytes），默认原样（hex 直通）
 * @returns {{spans: Array, dropped: number, error: string}}
 */
function normalizeOtlpRequest(body, opts) {
  const decodeId = (opts && opts.decodeId) || ((id) => id);
  const spans = [];
  let dropped = 0;
  if (!body || typeof body !== 'object' || !Array.isArray(body.resourceSpans)) {
    return { spans, dropped: 0, error: '缺少 resourceSpans 数组（非 OTLP traces JSON）' };
  }
  for (const rs of body.resourceSpans) {
    if (!rs || typeof rs !== 'object') { dropped += 1; continue; }
    const resAttrs = normalizeAttributes(rs.resource && rs.resource.attributes);
    const service = resAttrs['service.name'] || 'unknown';
    const scopeSpans = Array.isArray(rs.scopeSpans) ? rs.scopeSpans : (Array.isArray(rs.instrumentationLibrarySpans) ? rs.instrumentationLibrarySpans : []);
    for (const ss of scopeSpans) {
      const list = ss && Array.isArray(ss.spans) ? ss.spans : [];
      for (const raw of list) {
        const span = normalizeSpan(raw, service, resAttrs, decodeId);
        if (span) spans.push(span);
        else dropped += 1;
      }
    }
  }
  return { spans, dropped, error: '' };
}

/** 单 span 归一化；缺 traceId/spanId/时间的丢弃（无法定位与排序，宁缺毋滥） */
function normalizeSpan(raw, service, resAttrs, decodeId) {
  if (!raw || typeof raw !== 'object') return null;
  const traceId = decodeId(String(raw.traceId || ''), 16).toLowerCase();
  const spanId = decodeId(String(raw.spanId || ''), 8).toLowerCase();
  const parentSpanId = decodeId(String(raw.parentSpanId || ''), 8).toLowerCase();
  const startMs = nanoToMs(raw.startTimeUnixNano);
  const endMs = nanoToMs(raw.endTimeUnixNano);
  if (!traceId || !spanId || startMs === null || endMs === null || endMs < startMs) return null;
  const st = statusOf(raw.status);
  const attrs = { ...normalizeAttributes(raw.attributes) };
  // resource 属性以 res. 前缀并入（搜索/诊断有用且不与 span 属性撞名）；超大 resource 截断在调用方控制
  for (const k of Object.keys(resAttrs)) {
    if (!(k in attrs)) attrs[`res.${k}`] = resAttrs[k];
  }
  const events = (Array.isArray(raw.events) ? raw.events : [])
    .map((ev) => ({
      at: nanoToMs(ev && ev.timeUnixNano) || startMs,
      name: String((ev && ev.name) || ''),
      attrs: normalizeAttributes(ev && ev.attributes),
    }))
    .filter((ev) => ev.name);
  const durationMs = endMs - startMs;
  return {
    traceId,
    spanId,
    parentSpanId,
    name: String(raw.name || '(unnamed)'),
    kind: kindOf(raw.kind),
    service: String(service || 'unknown'),
    startMs,
    endMs,
    durationMs,
    status: st,
    attrs,
    events,
  };
}

// ── 组树（孤儿挂根；DFS 稳定序）──────────────────────────────────────────────
/**
 * @param spans 归一化 span 数组（可跨批次同 trace 混入）
 * @returns {{ordered: Array, depthBySpanId: Object, rootCount: number, orphanCount: number}}
 *          ordered = DFS 序（父先于子），孤儿 span（父不在集）视作根并计数
 */
function buildTrace(spans) {
  const byId = {};
  const children = {};
  const roots = [];
  let orphanCount = 0;
  const list = (spans || []).slice().sort((a, b) => a.startMs - b.startMs || String(a.spanId).localeCompare(String(b.spanId)));
  for (const s of list) byId[s.spanId] = s;
  for (const s of list) {
    const parent = s.parentSpanId ? byId[s.parentSpanId] : null;
    if (parent && parent !== s) {
      (children[parent.spanId] = children[parent.spanId] || []).push(s);
    } else {
      if (s.parentSpanId) orphanCount += 1; // 有 parentId 但父缺失——孤儿，当根不丢数据
      roots.push(s);
    }
  }
  const ordered = [];
  const depthBySpanId = {};
  const walk = (s, depth) => {
    ordered.push(s);
    depthBySpanId[s.spanId] = depth;
    const kids = (children[s.spanId] || []).slice().sort((a, b) => a.startMs - b.startMs);
    for (const k of kids) walk(k, depth + 1);
  };
  for (const r of roots) walk(r, 0);
  return { ordered, depthBySpanId, rootCount: roots.length, orphanCount };
}

/** trace 时间包络 */
function traceEnvelope(spans) {
  let base = Infinity;
  let end = 0;
  for (const s of spans) {
    if (s.startMs < base) base = s.startMs;
    if (s.endMs > end) end = s.endMs;
  }
  if (!Number.isFinite(base)) return { base: 0, end: 0, durationMs: 0 };
  return { base, end, durationMs: Math.max(0, end - base) };
}

/** trace 概览（ring / 列表行） */
function traceSummary(traceId, spans, extra) {
  const { ordered } = buildTrace(spans);
  const env = traceEnvelope(spans);
  const services = [];
  for (const s of ordered) {
    if (!services.includes(s.service)) services.push(s.service);
    if (services.length >= 4) break;
  }
  const root = ordered[0] || null;
  const errCount = spans.filter((s) => s.status.code === 'error').length;
  return {
    traceId: String(traceId || ''),
    rootName: root ? root.name : '(unknown)',
    rootService: root ? root.service : (services[0] || 'unknown'),
    spanCount: spans.length,
    durationMs: env.durationMs,
    hasError: errCount > 0,
    errCount,
    startedAt: env.base,
    services,
    ...(extra || {}),
  };
}

// ── 瀑布布局（面板用；百分比相对整条 trace 包络）─────────────────────────────
function waterfallLayout(ordered, depthBySpanId) {
  const env = traceEnvelope(ordered);
  const total = env.durationMs || 1;
  return ordered.map((s) => ({
    spanId: s.spanId,
    depth: depthBySpanId[s.spanId] || 0,
    offsetPct: ((s.startMs - env.base) / total) * 100,
    widthPct: Math.max((s.durationMs / total) * 100, 0.75),
    isRoot: s.spanId === (ordered[0] && ordered[0].spanId),
  }));
}

// ── 搜索与摘要 ──────────────────────────────────────────────────────────────
function formatDuration(ms) {
  const v = Number(ms) || 0;
  if (v < 1) return `${(v * 1000).toFixed(0)}μs`;
  if (v < 1000) return `${v % 1 === 0 ? v : v.toFixed(1)}ms`;
  if (v < 60000) return `${(v / 1000).toFixed(v < 10000 ? 2 : 1)}s`;
  const m = Math.floor(v / 60000);
  const s = Math.round((v % 60000) / 1000);
  return `${m}m${String(s).padStart(2, '0')}s`;
}

function fmtTime(ms) {
  if (!ms) return '-';
  return new Date(ms).toISOString().replace('T', ' ').slice(0, 23);
}

/** span 是否命中关键词（name / service / 状态消息 / 属性键值 / 事件名，大小写不敏感） */
function matchSpan(span, qLower) {
  if (span.name.toLowerCase().includes(qLower)) return true;
  if (span.service.toLowerCase().includes(qLower)) return true;
  if (span.status && String(span.status.message || '').toLowerCase().includes(qLower)) return true;
  for (const k of Object.keys(span.attrs)) {
    if (k.toLowerCase().includes(qLower) || String(span.attrs[k]).toLowerCase().includes(qLower)) return true;
  }
  for (const ev of span.events) {
    if (ev.name.toLowerCase().includes(qLower)) return true;
  }
  return false;
}

/**
 * @param spans 同一 trace 的全部 span
 * @param opts {{q?: string, hasError?: boolean, slowerThanMs?: number}}
 */
function matchTrace(spans, opts) {
  const o = opts || {};
  if (o.hasError && !spans.some((s) => s.status.code === 'error')) return false;
  if (o.slowerThanMs) {
    const env = traceEnvelope(spans);
    if (env.durationMs < o.slowerThanMs) return false;
  }
  const q = String(o.q || '').trim().toLowerCase();
  if (!q) return true;
  return spans.some((s) => matchSpan(s, q));
}

/** MCP 瀑布单行文本 */
function spanLine(s, depth, env) {
  const pad = '  '.repeat(depth);
  const branch = depth > 0 ? '└ ' : '';
  const kindTag = s.kind === 'unspecified' ? '' : `[${s.kind.toUpperCase()}] `;
  const err = s.status.code === 'error' ? `  ⨯ ${s.status.message || 'error'}` : '';
  const slow = env.durationMs > 0 && s.durationMs >= env.durationMs * 0.5 && s.durationMs >= 50 ? '  ⚠ 慢' : '';
  const off = `+${formatDuration(s.startMs - env.base)}`;
  return `${pad}${branch}${kindTag}${s.name}  ${s.service}  ${off} / ${formatDuration(s.durationMs)}${err}${slow}`;
}

/**
 * MCP get：trace 全文瀑布文本（树 + 错误详情 + 属性 + 事件）
 * @param traceId string
 * @param spans 归一化 span 数组
 */
function traceDetailText(traceId, spans) {
  const { ordered, depthBySpanId } = buildTrace(spans);
  const env = traceEnvelope(spans);
  const sum = traceSummary(traceId, spans);
  const head = [
    `trace ${traceId.slice(0, 16)}${traceId.length > 16 ? '…' : ''}  root=${sum.rootName}  服务 ${sum.rootService}`,
    `${sum.spanCount} spans  全链 ${formatDuration(env.durationMs)}  开始 ${fmtTime(env.base)}${sum.hasError ? `  ⨯ ${sum.errCount} 个错误 span` : ''}${sum.services.length > 1 ? `  跨服务 ${sum.services.join('→')}` : ''}`,
    '',
  ];
  const tree = ordered.map((s) => spanLine(s, depthBySpanId[s.spanId], env));
  const errSpans = ordered.filter((s) => s.status.code === 'error');
  const errBlock = [];
  for (const s of errSpans.slice(0, 5)) {
    errBlock.push('', `⨯ ${s.name}（${s.kind}，${formatDuration(s.durationMs)}）`, `    ${s.status.message || '（无错误消息）'}`);
    const pairs = Object.keys(s.attrs).slice(0, 12).map((k) => `${k}=${oneLine(s.attrs[k], 120)}`);
    if (pairs.length) errBlock.push(`    属性: ${pairs.join('  ')}`);
    for (const ev of s.events.slice(0, 5)) {
      const evPairs = Object.keys(ev.attrs).map((k) => `${k}=${oneLine(ev.attrs[k], 120)}`).join('  ');
      errBlock.push(`    事件 ${ev.name}${evPairs ? `: ${evPairs}` : ''}`);
    }
  }
  // 根 span 属性（请求参数常在这里）
  const root = ordered[0];
  let rootBlock = [];
  if (root) {
    const pairs = Object.keys(root.attrs).filter((k) => !k.startsWith('res.')).slice(0, 15)
      .map((k) => `${k}=${oneLine(root.attrs[k], 100)}`);
    if (pairs.length) rootBlock = ['', `根属性: ${pairs.join('  ')}`];
  }
  return head.concat(tree, rootBlock, errBlock).join('\n');
}

function oneLine(s, n) {
  const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

/** trace 概览单行（recent 列表） */
function summarizeTrace(sum) {
  const err = sum.hasError ? `  ⨯${sum.errCount}` : '';
  return `${fmtTime(sum.startedAt)}  ${sum.rootName}（${sum.rootService}）  ${sum.spanCount}spans ${formatDuration(sum.durationMs)}${err}  id=${sum.traceId.slice(0, 12)}`;
}

// ── JSONL / kv 分块（与 webhook-station 同形状）──────────────────────────────
/** 单行解析：空行/坏行返回 null，不抛 */
function parseJsonlLine(line) {
  const t = String(line || '').trim();
  if (!t) return null;
  try {
    const o = JSON.parse(t);
    return o && typeof o === 'object' ? o : null;
  } catch (_) {
    return null;
  }
}

/** ring 变更 → kv 写入计划（多出的旧块删除） */
function planChunkWrites(ring, prevChunkCount) {
  const plan = [];
  const nowChunks = Math.ceil(ring.length / CHUNK_SIZE);
  for (let i = 0; i < nowChunks; i++) {
    plan.push({ key: `tl.rec.${i}`, value: ring.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE) });
  }
  for (let i = nowChunks; i < (prevChunkCount || 0); i++) {
    plan.push({ key: `tl.rec.${i}`, value: null });
  }
  return plan;
}

/** kv 分块 map → ring（新在前；镜像时 ring[0] 最新 → 块 0 是最新切片，按块号升序拼） */
function readRing(map) {
  const keys = Object.keys(map).filter((k) => /^tl\.rec\.\d+$/.test(k))
    .sort((a, b) => Number(a.split('.')[2]) - Number(b.split('.')[2]));
  const out = [];
  for (const k of keys) {
    if (Array.isArray(map[k])) out.push(...map[k]);
  }
  return out;
}

module.exports = {
  CHUNK_SIZE,
  RING_LIMIT,
  TRACE_FULL_KV_LIMIT,
  KINDS,
  nanoToMs,
  attrValueToString,
  normalizeAttributes,
  kindOf,
  statusOf,
  normalizeOtlpRequest,
  normalizeSpan,
  buildTrace,
  traceEnvelope,
  traceSummary,
  waterfallLayout,
  formatDuration,
  fmtTime,
  matchTrace,
  matchSpan,
  spanLine,
  traceDetailText,
  summarizeTrace,
  parseJsonlLine,
  planChunkWrites,
  readRing,
  oneLine,
};
