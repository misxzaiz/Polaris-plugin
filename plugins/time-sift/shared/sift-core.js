'use strict';
/**
 * sift-core.js —— 拾光机纯函数核心（shared core 模式）
 *
 * 服务 / MCP / 单测三方共用同一份实现，保证检索口径永远一致。
 * 全部为纯函数：不给 fs、不给网络；crypto 仅用 node 内置（makeSid）。
 *
 * 领域概念：
 *   session（统一会话）= 四路数据源（polaris/v2/claude/zcode）归一化后的产物
 *   entry（目录条目）  = 会话元数据（进 cap.kv 分块 + catalog.json）
 *   blob               = 会话散文正文（\u0000i\trole\tts\n text 分段，进 blobs/<sid>.txt）
 *   postings           = term → sid[] 倒排（超上限的 term 晋级 commonTerms，查询时放弃该约束）
 */

const crypto = require('crypto');

// ── 常量 ────────────────────────────────────────────────────────────────────

const POSTINGS_CAP = 512; // term 倒排上限：超出视为「几乎所有会话都有」，过滤无意义
const SID_PREFIX = { polaris: 'p', v2: 'v', claude: 'c', zcode: 'z' };
const SOURCES = ['polaris', 'v2', 'claude', 'zcode'];

// CJK 统一表意文字区 + 扩展A + 兼容表意 + 假名（日文原文会话也能检索）
const CJK_RUN_RE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]+/g;
const LATIN_RUN_RE = /[a-z0-9_][a-z0-9_]*/g;

// ── 基础工具 ────────────────────────────────────────────────────────────────

function sha256hex(s) {
  return crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');
}

/** 稳定会话 id：<源字母> + sha256(稳定键) 前 10 位 */
function makeSid(source, stableKey) {
  const p = SID_PREFIX[source];
  if (!p) throw new Error(`unknown source: ${source}`);
  return p + sha256hex(`${source}|${stableKey}`).slice(0, 10);
}

function safeJson(s) {
  if (typeof s !== 'string' || !s) return null;
  try {
    return JSON.parse(s);
  } catch (_) {
    return null;
  }
}

/**
 * 时间归一：秒/毫秒/ISO 字符串 → 毫秒数字；解析不出返回 null。
 * 阈值 1e11（1973-03 in ms）：小于它按秒处理（zcode time_created 是秒级可能，
 * state.db 是毫秒级——两处口径不一，靠这里统一）。
 */
function normalizeTs(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v < 1e11 ? v * 1000 : v;
  if (typeof v === 'string') {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n < 1e11 ? n * 1000 : n;
    const d = Date.parse(v);
    if (Number.isFinite(d)) return d;
  }
  return null;
}

/** 本地时区日期键 YYYY-MM-DD（足迹/时光列表的「天」以服务机器本地时区为准） */
function localDayKey(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '';
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ── 分词 ────────────────────────────────────────────────────────────────────

/**
 * 检索分词（唯一术语集合）：
 * - CJK 连续段 → 双元 bigram（如「忘记密码」→ 忘记/记密/密码）；单字成段保留单字
 * - 拉丁/数字段（≥2 字符）→ 小写 token
 * 查询与索引用同一函数——口径一致性是检索正确性的根。
 */
function tokenize(text) {
  const out = new Set();
  const s = String(text || '').toLowerCase();
  for (const run of s.match(CJK_RUN_RE) || []) {
    if (run.length === 1) {
      out.add(run);
    } else {
      for (let k = 0; k < run.length - 1; k++) out.add(run.slice(k, k + 2));
    }
  }
  for (const run of s.match(LATIN_RUN_RE) || []) {
    if (run.length >= 2) out.add(run);
  }
  return [...out];
}

// ── 倒排索引操作 ────────────────────────────────────────────────────────────

/** 把 sid 登记进各 term 的倒排；列表超上限的 term 晋级 commonTerms（单调，不回落） */
function indexSessionTerms(postings, commonTerms, sid, terms) {
  for (const term of terms) {
    if (commonTerms.has(term)) continue;
    let list = postings.get(term);
    if (!list) {
      list = [];
      postings.set(term, list);
    } else if (list.includes(sid)) {
      continue;
    }
    list.push(sid);
    if (list.length > POSTINGS_CAP) {
      postings.delete(term);
      commonTerms.add(term);
    }
  }
}

/** 把 sid 从倒排摘除（会话被删/重扫时调用）；commonTerms 单调不清除 */
function unindexSessionTerms(postings, commonTerms, sid, terms) {
  for (const term of terms) {
    if (commonTerms.has(term)) continue;
    const list = postings.get(term);
    if (!list) continue;
    const idx = list.indexOf(sid);
    if (idx >= 0) list.splice(idx, 1);
    if (list.length === 0) postings.delete(term);
  }
}

/**
 * 查询求交。返回：
 *   { candidates: Set|null, present: string[], missing: string[], relaxed: boolean }
 * - candidates=null 表示无过滤条件（全部 common/无 present），调用方需全量验证
 * - 交集为空但 present 非空时 relaxed=true：退化用最稀有 term 的列表（OR 语义兜底）
 */
function queryCandidates(postings, commonTerms, terms) {
  const present = [];
  const missing = [];
  let commonCount = 0;
  for (const t of terms) {
    if (postings.has(t)) present.push(t);
    else if (commonTerms.has(t)) commonCount++;
    else missing.push(t);
  }
  if (present.length === 0) {
    return { candidates: commonCount > 0 ? null : new Set(), present, missing, relaxed: false };
  }
  const lists = present.map((t) => postings.get(t)).sort((a, b) => a.length - b.length);
  let candidates = new Set(lists[0]);
  for (let i = 1; i < lists.length && candidates.size > 0; i++) {
    const other = new Set(lists[i]);
    candidates = new Set([...candidates].filter((sid) => other.has(sid)));
  }
  let relaxed = false;
  if (candidates.size === 0) {
    candidates = new Set(lists[0]);
    relaxed = true;
  }
  return { candidates, present, missing, relaxed };
}

// ── blob 编解码（散文正文缓存格式）─────────────────────────────────────────

/** [{role,ts,text}] → blob 字符串。text 里的 \u0000 会破坏分段，编码前剥除 */
function encodeBlob(messages) {
  return messages
    .map((m, i) => `\u0000${i}\t${m.role || ''}\t${m.ts === null || m.ts === undefined ? '' : m.ts}\n${String(m.text || '').split('\u0000').join('')}\n`)
    .join('');
}

/** blob → [{i, role, ts, text}]（读片段/阅读器共用） */
function parseBlob(blob) {
  const msgs = [];
  for (const part of String(blob || '').split('\u0000')) {
    if (!part) continue;
    const nl = part.indexOf('\n');
    if (nl < 0) continue;
    const head = part.slice(0, nl).split('\t');
    msgs.push({
      i: Number.parseInt(head[0], 10) || msgs.length,
      role: head[1] || '',
      ts: head[2] || '',
      text: part.slice(nl + 1).replace(/\n$/, ''),
    });
  }
  return msgs;
}

// ── 片段与高亮 ──────────────────────────────────────────────────────────────

/** 在文本里找 terms 最早出现处，取 ±radius 字符窗口（面板端按 hitTerms 自行高亮） */
function makeSnippet(text, terms, radius = 160) {
  const s = String(text || '');
  let best = -1;
  let bestTerm = '';
  for (const t of terms) {
    const idx = s.indexOf(t);
    if (idx >= 0 && (best < 0 || idx < best)) {
      best = idx;
      bestTerm = t;
    }
  }
  if (best < 0) return { text: s.slice(0, radius * 2) + (s.length > radius * 2 ? '…' : ''), hit: false, offset: 0 };
  const start = Math.max(0, best - radius);
  const end = Math.min(s.length, best + bestTerm.length + radius);
  const body = s.slice(start, end);
  return {
    text: (start > 0 ? '…' : '') + body + (end < s.length ? '…' : ''),
    hit: true,
    offset: best,
  };
}

// ── 会话装配 ────────────────────────────────────────────────────────────────

/**
 * 归一化消息数组 → { entry, blob, terms }
 * - 按 id 去重（保首个；dialogs JSONL 有重复行、v2 有多版本，上游去重后这里再兜底）
 * - 空文本丢弃；单消息按 maxMsgChars 截断（散文索引不需要整篇工具输出）
 */
function assembleSession(opts) {
  const maxChars = opts.maxMsgChars > 0 ? opts.maxMsgChars : 4000;
  const seen = new Set();
  const messages = [];
  for (const m of opts.messages || []) {
    const text = String(m.text || '').trim();
    if (!text) continue;
    if (m.id !== undefined && m.id !== null && m.id !== '') {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
    }
    messages.push({ role: m.role === 'user' ? 'user' : 'assistant', ts: m.ts, text: text.length > maxChars ? text.slice(0, maxChars) + '…' : text });
  }
  const proseChars = messages.reduce((n, m) => n + m.text.length, 0);
  const entry = {
    sid: opts.sid,
    source: opts.source,
    title: String(opts.title || '').slice(0, 200) || '(无标题)',
    engineId: opts.engineId || '',
    workspace: String(opts.workspace || '').slice(0, 300),
    createdAt: opts.createdAt || 0,
    updatedAt: opts.updatedAt || 0,
    msgCount: messages.length,
    proseChars,
  };
  if (opts.tokens && (opts.tokens.input || opts.tokens.output || opts.tokens.cacheRead || opts.tokens.cacheWrite)) {
    entry.tokens = {
      input: opts.tokens.input || 0,
      output: opts.tokens.output || 0,
      cacheRead: opts.tokens.cacheRead || 0,
      cacheWrite: opts.tokens.cacheWrite || 0,
    };
  }
  if (Number.isFinite(opts.costUsd) && opts.costUsd > 0) entry.costUsd = Math.round(opts.costUsd * 1e6) / 1e6;
  const blob = encodeBlob(messages);
  const terms = tokenize(`${entry.title}\n${messages.map((m) => m.text).join('\n')}`);
  return { entry, blob, terms };
}

// ── 四路数据源解析器（行/行 JSON → 归一化消息；容错：坏行静默跳过）─────────

/** dialogs JSONL v3：首行 meta */
function parsePolarisMetaLine(line) {
  const o = safeJson(line);
  if (!o || o.type !== 'meta') return null;
  const tu = o.tokenUsage || {};
  return {
    externalId: String(o.externalId || ''),
    engineId: String(o.engineId || ''),
    title: String(o.title || o.firstUserText || ''),
    workspace: String(o.workspacePath || o.workspaceId || ''),
    createdAt: normalizeTs(o.createdAt) || 0,
    updatedAt: normalizeTs(o.updatedAt) || 0,
    messageCount: Number(o.messageCount) || 0,
    tokens: {
      input: Number(tu.input) || 0,
      output: Number(tu.output) || 0,
      cacheRead: Number(tu.cacheRead) || 0,
      cacheWrite: Number(tu.cacheCreation) || 0,
    },
    costUsd: Number(tu.costUsd) || 0,
  };
}

/** dialogs JSONL 消息行 → 归一化消息（user/assistant 文本之外全跳过） */
function parsePolarisMsgLine(line) {
  const o = safeJson(line);
  if (!o || o.type !== 'msg' || !o.message) return null;
  const msg = o.message;
  const role = msg.type === 'user' ? 'user' : msg.type === 'assistant' ? 'assistant' : null;
  if (!role) return null;
  const text = extractDialogText(msg.content !== undefined ? msg.content : msg.blocks);
  if (!text) return null;
  return { id: msg.id || `${o.seq}`, role, ts: normalizeTs(msg.timestamp) || '', text };
}

/** dialogs / v2 blocks 的文本抽取：string | [{type:'text',content|text}] | {content} */
function extractDialogText(content) {
  if (typeof content === 'string') return content.trim();
  if (!Array.isArray(content)) {
    if (content && typeof content === 'object' && typeof content.content === 'string') return content.content.trim();
    return '';
  }
  const parts = [];
  for (const b of content) {
    if (!b || typeof b !== 'object') continue;
    if (b.type === 'text') {
      if (typeof b.content === 'string' && b.content.trim()) parts.push(b.content.trim());
      else if (typeof b.text === 'string' && b.text.trim()) parts.push(b.text.trim());
    }
  }
  return parts.join('\n').trim();
}

/** Claude Code 原生 JSONL 行 → summary | 消息 | null */
function parseClaudeLine(line) {
  const o = safeJson(line);
  if (!o) return null;
  if (o.type === 'summary' && typeof o.summary === 'string' && o.summary) {
    return { kind: 'summary', summary: o.summary };
  }
  if (o.type !== 'user' && o.type !== 'assistant') return null;
  if (o.isSidechain === true) return null; // 子 agent 侧链不入索引
  const msg = o.message;
  if (!msg) return null;
  const role = o.type;
  let text = '';
  if (typeof msg.content === 'string') {
    text = msg.content.trim();
  } else if (Array.isArray(msg.content)) {
    const parts = [];
    for (const b of msg.content) {
      if (b && b.type === 'text' && typeof b.text === 'string' && b.text.trim()) parts.push(b.text.trim());
    }
    text = parts.join('\n');
  }
  if (!text) return null;
  // 命令注入类伪用户消息降噪
  if (role === 'user' && /^<(command-name|local-command|ide_[a-z]+)/.test(text)) return null;
  // Claude Code Stop-hook 包装消息：剥壳保留 condition 里的真实意图（28/214 实测会话的标题靠它）
  if (role === 'user') {
    text = text
      .replace(/^A session-scoped Stop hook is now active with condition:\s*"?/, '')
      .replace(/"\s*$/, '')
      .trim();
    if (!text) return null;
  }
  const usage = msg.usage || null;
  return {
    kind: 'msg',
    id: o.uuid || `${o.timestamp}|${text.slice(0, 40)}`,
    role,
    ts: normalizeTs(o.timestamp) || '',
    text,
    usage: usage
      ? {
          input: Number(usage.input_tokens) || 0,
          output: Number(usage.output_tokens) || 0,
          cacheRead: Number(usage.cache_read_input_tokens) || 0,
          cacheWrite: Number(usage.cache_creation_input_tokens) || 0,
        }
      : null,
  };
}

/** session-v2 messages.db 行 → 归一化消息（content 是 JSON blocks） */
function parseV2Row(row) {
  const o = safeJson(row.content);
  if (!o) return null;
  const role = o.type === 'user' ? 'user' : o.type === 'assistant' ? 'assistant' : row.role === 'user' ? 'user' : row.role === 'assistant' ? 'assistant' : null;
  if (!role) return null;
  const text = extractDialogText(o.blocks);
  if (!text) return null;
  return { id: row.id, role, ts: normalizeTs(row.timestamp_ms) || '', text };
}

/** session-v2 版本去重：同 id 取 version 最大（deleted 行上游 SQL 已排除） */
function dedupeV2Rows(rows) {
  const byId = new Map();
  for (const r of rows || []) {
    const prev = byId.get(r.id);
    if (!prev || (Number(r.version) || 0) > (Number(prev.version) || 0)) byId.set(r.id, r);
  }
  return [...byId.values()];
}

/** zcode message.data → {role, ts, hidden} | null（uiVisibility:hidden 的模型内部消息不入索引） */
function parseZcodeMessage(dataJson) {
  const o = safeJson(dataJson);
  if (!o || (o.role !== 'user' && o.role !== 'assistant')) return null;
  const sem = o.semantics || {};
  const hidden = sem.uiVisibility === 'hidden' || sem.transcriptVisibility === 'hidden';
  return { role: o.role, ts: normalizeTs(o.time && o.time.created) || '', hidden };
}

/** zcode part.data → text part 才返回文本（reasoning/tool 不入索引） */
function parseZcodePart(dataJson) {
  const o = safeJson(dataJson);
  if (!o || o.type !== 'text' || typeof o.text !== 'string') return null;
  return o.text.trim() ? o.text.trim() : null;
}

// ── 排序与打分 ──────────────────────────────────────────────────────────────

/** 候选排序：标题命中 +3；新近加分（1 天 +4 / 7 天 +3 / 30 天 +2 / 180 天 +1）；再按 updatedAt 降序 */
function rankCandidates(entriesById, sids, now) {
  const t = now || Date.now();
  const scored = [];
  for (const sid of sids) {
    const e = entriesById.get(sid);
    if (!e) continue;
    let score = 0;
    const ageDays = e.updatedAt > 0 ? (t - e.updatedAt) / 86400000 : Infinity;
    if (ageDays <= 1) score += 4;
    else if (ageDays <= 7) score += 3;
    else if (ageDays <= 30) score += 2;
    else if (ageDays <= 180) score += 1;
    scored.push({ sid, score, updatedAt: e.updatedAt || 0 });
  }
  scored.sort((a, b) => b.score - a.score || b.updatedAt - a.updatedAt);
  return scored.map((s) => s.sid);
}

/** 命中打分：hitCount×2 + coverage×5 + 新近分（与 rankCandidates 同刻度） */
function scoreHit(hitCount, coverage, termCount, updatedAt, now) {
  const t = now || Date.now();
  let recency = 0;
  const ageDays = updatedAt > 0 ? (t - updatedAt) / 86400000 : Infinity;
  if (ageDays <= 1) recency = 4;
  else if (ageDays <= 7) recency = 3;
  else if (ageDays <= 30) recency = 2;
  else if (ageDays <= 180) recency = 1;
  return hitCount * 2 + (termCount > 0 ? (coverage / termCount) * 5 : 0) + recency;
}

// ── 统计聚合 ────────────────────────────────────────────────────────────────

/** 按天聚合（updatedAt 落天）：{'YYYY-MM-DD': {s: 会话数, m: 消息数}} */
function buildDailyStats(entries) {
  const daily = {};
  for (const e of entries) {
    const day = localDayKey(e.updatedAt);
    if (!day) continue;
    const d = daily[day] || (daily[day] = { s: 0, m: 0 });
    d.s += 1;
    d.m += e.msgCount || 0;
  }
  return daily;
}

/** 总计卡数据；tokens 只聚合「源里有的」，并报覆盖口径（不臆造零） */
function buildTotals(entries) {
  const totals = {
    sessions: entries.length,
    messages: 0,
    proseChars: 0,
    activeDays: 0,
    firstDay: '',
    lastDay: '',
    bySource: {},
    tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costUsd: 0, sessionsCovered: 0 },
  };
  let minMs = Infinity;
  let maxMs = 0;
  const days = new Set();
  for (const e of entries) {
    totals.messages += e.msgCount || 0;
    totals.proseChars += e.proseChars || 0;
    const day = localDayKey(e.updatedAt);
    if (day) {
      days.add(day);
      if (e.updatedAt < minMs) minMs = e.updatedAt;
      if (e.updatedAt > maxMs) maxMs = e.updatedAt;
    }
    const bs = totals.bySource[e.source] || (totals.bySource[e.source] = { sessions: 0, messages: 0 });
    bs.sessions += 1;
    bs.messages += e.msgCount || 0;
    if (e.tokens) {
      totals.tokens.input += e.tokens.input || 0;
      totals.tokens.output += e.tokens.output || 0;
      totals.tokens.cacheRead += e.tokens.cacheRead || 0;
      totals.tokens.cacheWrite += e.tokens.cacheWrite || 0;
    }
    // cost 与 tokens 分开判：claude 源可能只有 costUsd 没有 tokens，费用不能跟着丢
    if (e.tokens || (Number.isFinite(e.costUsd) && e.costUsd > 0)) totals.tokens.sessionsCovered += 1;
    if (Number.isFinite(e.costUsd) && e.costUsd > 0) totals.tokens.costUsd += e.costUsd;
  }
  totals.activeDays = days.size;
  if (Number.isFinite(minMs)) {
    totals.firstDay = localDayKey(minMs);
    totals.lastDay = localDayKey(maxMs);
  }
  totals.tokens.costUsd = Math.round(totals.tokens.costUsd * 1e6) / 1e6;
  return totals;
}

/** 时光列表：按 updatedAt 落天分组，天倒序 */
function groupTimeline(entries) {
  const byDay = new Map();
  for (const e of entries) {
    const day = localDayKey(e.updatedAt);
    if (!day) continue;
    const arr = byDay.get(day) || (byDay.set(day, []), byDay.get(day));
    arr.push(e);
  }
  return [...byDay.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([day, sessions]) => ({ day, sessions: sessions.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)) }));
}

// ── kv 目录分块 ─────────────────────────────────────────────────────────────

const CAT_CHUNK = 200; // ≤200 条/块，单块远小于 kv 256KB 建议值

/** 目录分块：[[entry...], ...] */
function chunkCatalog(entries) {
  const chunks = [];
  for (let i = 0; i < entries.length; i += CAT_CHUNK) chunks.push(entries.slice(i, i + CAT_CHUNK));
  return chunks;
}

/** MCP/面板直读 kv 后合并目录分块 */
function mergeCatalogChunks(head, chunksByKey) {
  if (!head || !head.chunks) return [];
  const out = [];
  for (let i = 0; i < head.chunks; i++) {
    const arr = chunksByKey[`sift.cat.${i}`];
    if (Array.isArray(arr)) out.push(...arr);
  }
  return out;
}

// ── 设置归一 ────────────────────────────────────────────────────────────────

/** settings 归一（面板/MCP 写入任意形状都能落到安全默认） */
function sanitizeSettings(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const src = r.sources && typeof r.sources === 'object' ? r.sources : {};
  return {
    sources: {
      polaris: src.polaris !== false,
      v2: src.v2 !== false,
      claude: src.claude !== false,
      zcode: src.zcode !== false,
    },
    excludeKeywords: Array.isArray(r.excludeKeywords)
      ? r.excludeKeywords.filter((k) => typeof k === 'string' && k.trim()).map((k) => k.trim()).slice(0, 50)
      : [],
    maxMsgChars: Number.isFinite(r.maxMsgChars) && r.maxMsgChars >= 500 && r.maxMsgChars <= 20000 ? Math.floor(r.maxMsgChars) : 4000,
    sqliteRefreshMin: Number.isFinite(r.sqliteRefreshMin) && r.sqliteRefreshMin >= 2 && r.sqliteRefreshMin <= 120 ? Math.floor(r.sqliteRefreshMin) : 10,
  };
}

/** 排除词命中（标题或工作区路径包含任一关键词，大小写不敏感） */
function isExcluded(entry, keywords) {
  if (!keywords || keywords.length === 0) return false;
  const hay = `${entry.title || ''}\n${entry.workspace || ''}`.toLowerCase();
  return keywords.some((k) => hay.includes(k.toLowerCase()));
}

module.exports = {
  POSTINGS_CAP,
  SOURCES,
  CAT_CHUNK,
  sha256hex,
  makeSid,
  normalizeTs,
  localDayKey,
  tokenize,
  indexSessionTerms,
  unindexSessionTerms,
  queryCandidates,
  encodeBlob,
  parseBlob,
  makeSnippet,
  assembleSession,
  parsePolarisMetaLine,
  parsePolarisMsgLine,
  extractDialogText,
  parseClaudeLine,
  parseV2Row,
  dedupeV2Rows,
  parseZcodeMessage,
  parseZcodePart,
  rankCandidates,
  scoreHit,
  buildDailyStats,
  buildTotals,
  groupTimeline,
  chunkCatalog,
  mergeCatalogChunks,
  sanitizeSettings,
  isExcluded,
};
