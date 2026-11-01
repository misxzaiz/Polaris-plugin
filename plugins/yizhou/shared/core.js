'use strict';
/**
 * core.js —— 双语阅读纯函数核心（MCP 与面板共同引用，单一口径）
 *
 * 职责：分段规划（批次）、译文幂等合并、进度统计、索引维护、语言探测、
 * markdown-lite 块分类、双语导出。所有涉及「数据形状」的规则只在这里写一次，
 * MCP 与面板不得各自实现（对齐 maian core 纪律）。
 *
 * 设计要点：
 *  - 段（segment）是翻译单元 = 抽取器产出的一个 markdown-lite 块；i 为全文段号。
 *  - 批（batch）是给 AI 的一次工具返回 = 段号区间 [start, end)，边界入库可复算。
 *  - 译文保存在段上（seg.dst），逐段 upsert 天然幂等，断点续译无需额外状态。
 */

// ── 常量（与 mcp/server.js 的护栏一致） ─────────────────────────────────────
const BATCH_CHAR_BUDGET = 12000;  // 单次工具返回的原文段字符预算（flashforge 24K 实证量级内）
const MAX_TOTAL_CHARS = 120000;   // 单篇入库上限（超出如实拒绝，不静默截腰）
const CHUNK_SEGS = 100;           // yz.art.<id>.p.<c> 每块段数（键数纪律）

// ── id 与小工具 ─────────────────────────────────────────────────────────────
/** URL → 稳定短 id（纯 JS 双 FNV-1a 32 位拼 16 hex；浏览器/Node 同源可用，无 crypto 依赖） */
function articleId(url) {
  const s = String(url || '').trim();
  let h1 = 0x811c9dc5;
  let h2 = 0x811c9dc5;
  for (let k = 0; k < s.length; k++) {
    const c = s.charCodeAt(k);
    h1 ^= c; h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= (c + k) & 0xff; h2 = Math.imul(h2, 0x01000193) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

function nowIso() { return new Date().toISOString(); }

function clampInt(v, lo, hi, dflt) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return dflt;
  return Math.min(hi, Math.max(lo, n));
}

/** 清理 AI 返回的译文：去首尾空白、压 3+ 空行；空串返回 null（视为无效段拒收） */
function sanitizeDst(dst) {
  const t = String(dst == null ? '' : dst).replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return t || null;
}

// ── 语言探测（诚实口径：启发式，仅供展示与提示，不参与数据正确性） ────────────
function detectSrcLang(text) {
  const s = String(text || '').slice(0, 4000);
  const cjk = (s.match(/[\u4e00-\u9fff]/g) || []).length;
  const kana = (s.match(/[\u3040-\u30ff]/g) || []).length;
  const hangul = (s.match(/[\uac00-\ud7af]/g) || []).length;
  const latin = (s.match(/[A-Za-z]/g) || []).length;
  if (kana > 0 && kana * 4 > cjk) return 'ja';
  if (hangul > 0 && hangul * 4 > cjk && hangul > latin / 4) return 'ko';
  if (cjk > latin / 2) return 'zh';
  if (latin > 0) return 'en';
  return 'und';
}

const LANG_LABEL = { zh: '中文', en: '英文', ja: '日文', ko: '韩文', und: '未识别' };
function langLabel(code) { return LANG_LABEL[code] || String(code || '未识别'); }

// ── 分段与批次规划 ───────────────────────────────────────────────────────────
/** 块数组 → 段数组 [{i, src}]；空块丢弃，段号连续重排（抽取结果即权威） */
function normalizeSegments(blocks) {
  const segs = [];
  for (const b of Array.isArray(blocks) ? blocks : []) {
    const t = String(b == null ? '' : b).trim();
    if (!t) continue;
    segs.push({ i: segs.length, src: t, dst: '' });
  }
  return segs;
}

/**
 * 批次规划：贪心装箱，段不跨批。返回 [{start, end, chars}]（end 不含）。
 * 单段超预算时独占一批（工具返回层面再截断，core 不削内容）。
 */
function planBatches(segs, budget) {
  const cap = clampInt(budget, 2000, 60000, BATCH_CHAR_BUDGET);
  const batches = [];
  let start = 0;
  let chars = 0;
  for (const seg of segs) {
    const len = seg.src.length;
    if (start < seg.i && chars + len > cap) {
      batches.push({ start, end: seg.i, chars });
      start = seg.i;
      chars = 0;
    }
    chars += len;
  }
  if (start < segs.length) batches.push({ start, end: segs.length, chars });
  return batches;
}

function batchOf(batches, n) {
  const idx = clampInt(n, 0, (batches ? batches.length : 0) - 1, -1);
  if (idx < 0 || !batches || !batches.length) return null;
  return batches[idx];
}

// ── 译文合并（幂等） ─────────────────────────────────────────────────────────
/**
 * 把一批译文合并进段数组：items=[{i,dst}]；i 必须命中现有段，dst 空串拒收。
 * 返回 {segs, applied, invalid, skipped}；重复保存同段=覆盖（后写胜），天然幂等。
 */
function mergeTranslations(segs, items) {
  const byIdx = new Map(segs.map((s) => [s.i, s]));
  let applied = 0;
  let invalid = 0;
  let skipped = 0;
  for (const it of Array.isArray(items) ? items : []) {
    const seg = byIdx.get(clampInt(it && it.i, 0, Number.MAX_SAFE_INTEGER, -1));
    if (!seg) { skipped++; continue; }
    const dst = sanitizeDst(it && it.dst);
    if (!dst) { invalid++; continue; }
    seg.dst = dst;
    seg.at = nowIso();
    applied++;
  }
  return { segs, applied, invalid, skipped };
}

function translatedCount(segs) {
  return segs.filter((s) => s.dst).length;
}

function progressPct(segs) {
  if (!segs.length) return 0;
  return Math.round((translatedCount(segs) / segs.length) * 100);
}

/** 代码块段（契约：dst=src 原样）与可译段分开数，未译进度只看可译段 */
function isCodeSeg(src) { return /^\s*```/.test(String(src || '')); }

function translatableSegs(segs) { return segs.filter((s) => !isCodeSeg(s.src)); }

/** 代码段系统自动原样收编（契约：AI 无需翻译 ``` 块）；返回本次填入数。幂等。 */
function autoFillCodeSegs(segs) {
  let filled = 0;
  for (const s of segs) {
    if (!s.dst && isCodeSeg(s.src)) {
      s.dst = s.src;
      filled++;
    }
  }
  return filled;
}

// ── 索引维护（yz.idx 仅 MCP 写） ─────────────────────────────────────────────
/** 生成/归一索引条目 */
function idxEntry(a) {
  return {
    id: String(a.id || ''),
    url: String(a.url || ''),
    site: String(a.site || ''),
    title: String(a.title || '(无标题)'),
    byline: String(a.byline || ''),
    srcLang: String(a.srcLang || 'und'),
    tgtLang: String(a.tgtLang || 'zh'),
    segCount: clampInt(a.segCount, 0, 1e9, 0),
    totalChars: clampInt(a.totalChars, 0, 1e12, 0),
    batches: clampInt(a.batches, 0, 1e6, 0),
    translated: clampInt(a.translated, 0, 1e9, 0),
    truncated: !!a.truncated,
    addedAt: String(a.addedAt || nowIso()),
    updatedAt: String(a.updatedAt || nowIso()),
  };
}

/** 按 id upsert（新条目插最前）；返回新数组，不改入参 */
function upsertIndex(idx, entry) {
  const rest = (Array.isArray(idx) ? idx : []).filter((e) => e && e.id !== entry.id);
  return [entry, ...rest];
}

function removeFromIndex(idx, id) {
  return (Array.isArray(idx) ? idx : []).filter((e) => e && e.id !== id);
}

function findInIndex(idx, id) {
  return (Array.isArray(idx) ? idx : []).find((e) => e && e.id === id) || null;
}

// ── markdown-lite 分类（面板渲染 + AI 契约提示共用） ─────────────────────────
/** 返回 {kind:'h'|'li'|'quote'|'code'|'para', level?, body} */
function classifyBlock(src) {
  const s = String(src || '');
  const mH = /^(#{1,6})\s+(.*)$/.exec(s);
  if (mH) return { kind: 'h', level: mH[1].length, body: mH[2] };
  if (/^\s*```/.test(s)) return { kind: 'code', body: s };
  if (/^>\s?/.test(s)) return { kind: 'quote', body: s.replace(/^>\s?/gm, '') };
  if (/^-\s+/.test(s)) return { kind: 'li', body: s.replace(/^-\s+/, '') };
  return { kind: 'para', body: s };
}

// ── 分块存取辅助（yz.art.<id>.p.<c>，100 段/块） ─────────────────────────────
function chunkCount(segCount) { return Math.max(1, Math.ceil(segCount / CHUNK_SEGS)); }
function chunkKey(id, c) { return `yz.art.${id}.p.${c}`; }
function segChunkIndex(i) { return Math.floor(i / CHUNK_SEGS); }

/** 全段重建：blocks（按 c 升序的段数组）→ segs（按 i 升序） */
function assembleSegs(chunkArrays) {
  const segs = [];
  for (const arr of Array.isArray(chunkArrays) ? chunkArrays : []) {
    for (const s of Array.isArray(arr) ? arr : []) {
      if (s && typeof s.i === 'number') segs.push(s);
    }
  }
  segs.sort((a, b) => a.i - b.i);
  return segs;
}

/** 段数组 → 分块 map（{[c]: segs[]}），供逐块写 kv */
function splitChunks(segs) {
  const map = new Map();
  for (const s of segs) {
    const c = segChunkIndex(s.i);
    if (!map.has(c)) map.set(c, []);
    map.get(c).push(s);
  }
  return map;
}

// ── 导出 ────────────────────────────────────────────────────────────────────
/** 双语导出 markdown（src 在上 dst 在下；未译段只出原文并标注） */
function bilingualMarkdown(entry, segs, mode) {
  const lines = [`# ${entry.title}`, '', `> ${entry.url}`, ''];
  for (const s of segs) {
    const cls = classifyBlock(s.src);
    const srcPart = s.src;
    const dstPart = s.dst;
    if (mode === 'dst') { lines.push(dstPart || srcPart, ''); continue; }
    if (mode === 'src') { lines.push(srcPart, ''); continue; }
    lines.push(srcPart);
    if (dstPart) lines.push(dstPart);
    else if (!isCodeSeg(s.src)) lines.push('> 〔未翻译〕');
    lines.push('');
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

module.exports = {
  BATCH_CHAR_BUDGET, MAX_TOTAL_CHARS, CHUNK_SEGS,
  articleId, nowIso, clampInt, sanitizeDst,
  detectSrcLang, langLabel,
  normalizeSegments, planBatches, batchOf,
  mergeTranslations, translatedCount, progressPct, isCodeSeg, translatableSegs, autoFillCodeSegs,
  idxEntry, upsertIndex, removeFromIndex, findInIndex,
  classifyBlock, chunkCount, chunkKey, segChunkIndex, assembleSegs, splitChunks,
  bilingualMarkdown,
};
