'use strict';
/**
 * core.js —— 韦编纯函数核心（零依赖；服务 / MCP / 面板 / 测试四方同源）
 *
 * 职责边界：只做纯计算，不碰 fs / 网络 / kv。
 *   - tokenize：ASCII 词元（len≥2）+ CJK unigram/bigram 双层（bigram 保相邻精度，
 *     unigram 支持单字查询）。查询与索引共用同一函数 = 同一词项空间。
 *   - rank：BM25（k1=1.2, b=0.75）+ 文件名/路径加权。
 *   - snippet：查询词最密窗口切片 + 高亮偏移（面板 <mark> / AI 引用共用）。
 *   - pathRules：扩展名分类、默认排除表、隐藏段、containsPath 穿越判定。
 *   - normalizeSettings / parseQuery（ext: dir: 内联前缀）。
 *
 * CJK 范围：\u3400-\u4DBF（扩展A）\u4E00-\u9FFF（基本区）\uF900-\uFAFF（兼容）。
 * 已知取舍（如实）：跨语边界（如「React入门」）邻接不建 bigram；单字符 ASCII 不入索引。
 */

// ── 扩展名分类 ────────────────────────────────────────────────────────────────
const TEXT_EXTS = ['md', 'markdown', 'mdx', 'txt', 'text', 'csv', 'tsv', 'json', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'xml', 'srt', 'vtt', 'tex', 'bib'];
const CODE_EXTS = ['js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'py', 'rs', 'go', 'java', 'c', 'h', 'cpp', 'hpp', 'cc', 'cs', 'rb', 'php', 'swift', 'kt', 'kts', 'sh', 'bash', 'bat', 'cmd', 'ps1', 'psm1', 'sql', 'vue', 'svelte', 'lua', 'r', 'dart', 'scala', 'groovy'];
const PDF_EXTS = ['pdf'];
const DOCX_EXTS = ['docx'];
const HTML_EXTS = ['html', 'htm'];

/** 默认排除的目录段（小写比对，作用于路径任意一层） */
const DEFAULT_EXCLUDE_DIRS = [
  'node_modules', '.git', '.svn', '.hg', 'target', 'dist', 'build', 'out',
  '.zcode', '.zcode-plugin', '.venv', 'venv', '__pycache__', '.obsidian',
  '.idea', '.vscode', '.gradle', '.next', '.cache', 'coverage', 'appdata',
];

function extOf(name) {
  const i = String(name || '').lastIndexOf('.');
  if (i <= 0 || i === String(name).length - 1) return '';
  return String(name).slice(i + 1).toLowerCase();
}

/** → 'text' | 'code' | 'pdf' | 'docx' | 'html' | null（null = 不入索引） */
function classifyExt(ext) {
  const e = String(ext || '').toLowerCase();
  if (TEXT_EXTS.includes(e)) return 'text';
  if (CODE_EXTS.includes(e)) return 'code';
  if (PDF_EXTS.includes(e)) return 'pdf';
  if (DOCX_EXTS.includes(e)) return 'docx';
  if (HTML_EXTS.includes(e)) return 'html';
  return null;
}

// ── 设置归一 ─────────────────────────────────────────────────────────────────
function clampInt(v, lo, hi, dflt) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return dflt;
  return Math.min(hi, Math.max(lo, n));
}

/** 绝对路径判定（core 不依赖 node:path；Windows 盘符 / UNC / POSIX 均认可） */
function isAbsolutePath(p) {
  const s = String(p || '');
  return /^[a-zA-Z]:[\\/]/.test(s) || /^\\\\/.test(s) || s.startsWith('/');
}

/** 路径统一成正斜杠形式（仅用于规则匹配；fs 操作仍用原生分隔符） */
function normSlashes(p) {
  return String(p || '').replace(/\\/g, '/');
}

function cleanPathList(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    if (typeof raw !== 'string') continue;
    const p = raw.trim();
    if (!p || !isAbsolutePath(p)) continue;
    const key = normSlashes(p).toLowerCase().replace(/\/+$/, '');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p.replace(/[\\/]+$/, ''));
  }
  return out;
}

/** extraExcludes 是目录名（任意层级匹配），不是路径——只收单段名 */
function cleanNameList(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    if (typeof raw !== 'string') continue;
    const segs = normSlashes(raw.trim()).split('/').filter(Boolean);
    for (const seg of segs) {
      const lower = seg.toLowerCase();
      if (!lower || seen.has(lower)) continue;
      seen.add(lower);
      out.push(lower);
    }
  }
  return out;
}

function normalizeSettings(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const maxFileMB = clampInt(r.maxFileMB, 1, 200, 20);
  const maxTextKB = clampInt(r.maxTextKB, 32, 1024, 256);
  return {
    roots: cleanPathList(r.roots),
    extraExcludes: cleanNameList(r.extraExcludes),
    maxDocs: clampInt(r.maxDocs, 50, 20000, 5000),
    maxFileBytes: clampInt(maxFileMB, 1, 200, 20) * 1024 * 1024,
    maxTextBytes: clampInt(maxTextKB, 32, 1024, 256) * 1024,
    includeHidden: r.includeHidden === true,
    enabled: r.enabled !== false,
  };
}

// ── 路径规则 ─────────────────────────────────────────────────────────────────
function isHiddenSegment(seg) {
  return seg.length > 1 && seg.startsWith('.') && seg !== '..';
}

/** dirPath / relPath 均为正斜杠形式；返回 {ok, reason} */
function isIndexable(relPath, size, settings, opts) {
  const s = settings || normalizeSettings(null);
  const o = opts || {};
  const rel = normSlashes(relPath);
  const segs = rel.split('/').filter(Boolean);
  const name = segs[segs.length - 1] || '';
  if (!name) return { ok: false, reason: 'empty' };
  const includeHidden = o.includeHidden === true || s.includeHidden === true;
  const dirs = segs.slice(0, -1);
  if (!includeHidden) {
    if (isHiddenSegment(name)) return { ok: false, reason: 'hidden' };
    for (const d of dirs) if (isHiddenSegment(d)) return { ok: false, reason: 'hidden' };
  }
  const excluded = new Set(DEFAULT_EXCLUDE_DIRS.map((d) => d.toLowerCase()));
  for (const x of s.extraExcludes) excluded.add(String(x).toLowerCase());
  for (const d of dirs) {
    if (excluded.has(d.toLowerCase())) return { ok: false, reason: 'exclude:' + d };
  }
  const ext = extOf(name);
  if (!classifyExt(ext)) return { ok: false, reason: 'ext:' + (ext || 'none') };
  if (typeof size === 'number' && size > s.maxFileBytes) return { ok: false, reason: 'size' };
  return { ok: true, reason: '', ext };
}

/**
 * target 是否落在 root 内（两者都应先做 realpath 归一）。
 * 大小写不敏感（Windows）；root 精确等于 target 视为在内（目录本身）。
 */
function containsPath(root, target) {
  const r = normSlashes(root).replace(/\/+$/, '').toLowerCase();
  const t = normSlashes(target).replace(/\/+$/, '').toLowerCase();
  if (!r || !t) return false;
  if (t === r) return true;
  return t.startsWith(r + '/');
}

// ── 分词 ─────────────────────────────────────────────────────────────────────
const CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]+/g;
const ASCII_RE = /[a-z0-9_+#]+/g;

function bump(tf, tok, n) {
  const cur = tf.get(tok);
  tf.set(tok, (cur || 0) + (n || 1));
}

/**
 * 文本 → Map<token, tf>。ASCII run 取 len≥2；CJK run 拆 unigram+bigram。
 * 这是对外唯一的分词入口：索引与查询必须同源。
 */
function tokenize(text) {
  const tf = new Map();
  if (text == null) return tf;
  const s = String(text).toLowerCase();
  if (!s) return tf;
  for (const m of s.matchAll(ASCII_RE)) {
    if (m[0].length >= 2 && !/^_+$/.test(m[0])) bump(tf, m[0]); // 纯下划线 run 是噪声
  }
  for (const m of s.matchAll(CJK_RE)) {
    const run = m[0];
    if (run.length === 1) { bump(tf, run); continue; }
    for (let i = 0; i < run.length; i++) {
      bump(tf, run[i]);
      if (i + 1 < run.length) bump(tf, run[i] + run[i + 1]);
    }
  }
  return tf;
}

// ── 查询语法 ─────────────────────────────────────────────────────────────────
/** `ext:pdf dir:plans 缓存 假象` → {ext, dir, raw}；余下词交 tokenize */
function parseQuery(q) {
  const raw = String(q || '');
  let ext = '';
  let dir = '';
  const rest = [];
  for (const part of raw.split(/\s+/)) {
    if (!part) continue;
    const low = part.toLowerCase();
    if (!ext && low.startsWith('ext:')) { ext = low.slice(4).replace(/^\./, ''); continue; }
    if (!dir && low.startsWith('dir:')) { dir = low.slice(4).replace(/^\/+|\/+$/g, ''); continue; }
    rest.push(part);
  }
  return { ext: ext || '', dir: dir || '', raw: rest.join(' ') };
}

// ── BM25 排名 ────────────────────────────────────────────────────────────────
const BM25_K1 = 1.2;
const BM25_B = 0.75;

/**
 * 内存倒排上的 BM25。
 *   inverted: Map<tok, Map<docId, tf>>
 *   docs:     Map<docId, {len, nameTf:Map, pathLower}>
 * 返回按分降序的 [{docId, score}]（score>0）。
 */
function rank(queryText, inverted, docs, opts) {
  const o = opts || {};
  const limit = clampInt(o.limit, 1, 100, 8);
  const { ext, dir, raw } = parseQuery(queryText);
  const qtf = tokenize(raw);
  if (qtf.size === 0) return [];
  const N = docs.size;
  if (N === 0) return [];
  let totalLen = 0;
  for (const d of docs.values()) totalLen += d.len;
  const avgLen = totalLen / N || 1;

  // ext 过滤支持类别名（text/code/pdf/docx/html）或精确扩展名（ext:md）
  const CATS = ['text', 'code', 'pdf', 'docx', 'html'];
  const extLower = String(ext || '').toLowerCase().replace(/^\./, '');
  const wantCat = CATS.includes(extLower) ? extLower : '';
  const wantExt = extLower && !wantCat ? extLower : '';
  const dirLower = normSlashes(dir).toLowerCase();

  const scores = new Map();
  for (const [tok] of qtf) {
    const postings = inverted.get(tok);
    if (!postings || postings.size === 0) continue;
    const df = postings.size;
    const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
    for (const [docId, tf] of postings) {
      const d = docs.get(docId);
      if (!d) continue;
      if (wantExt && d.ext !== wantExt) continue;
      if (wantCat && d.cat !== wantCat) continue;
      if (dirLower && !d.pathLower.includes('/' + dirLower + '/')) continue;
      const denom = tf + BM25_K1 * (1 - BM25_B + BM25_B * (d.len / avgLen));
      const s = idf * (tf * (BM25_K1 + 1)) / denom;
      scores.set(docId, (scores.get(docId) || 0) + s);
    }
  }
  if (scores.size === 0) return [];
  // 文件名 / 路径加权：全词命中 ×1.5，部分命中 ×1.2，路径段命中 ×1.1
  const qtoks = [...qtf.keys()];
  for (const [docId, base] of scores) {
    const d = docs.get(docId);
    let hit = 0;
    let pathHit = false;
    for (const t of qtoks) {
      if (d.nameTf && d.nameTf.has(t)) hit++;
      else if (!pathHit && t.length >= 2 && d.pathLower.includes(t)) pathHit = true;
    }
    let boost = 1;
    if (hit === qtoks.length) boost = 1.5;
    else if (hit > 0) boost = 1.2;
    else if (pathHit) boost = 1.1;
    scores.set(docId, base * boost);
  }
  const out = [];
  for (const [docId, score] of scores) out.push({ docId, score });
  out.sort((a, b) => b.score - a.score || (a.docId < b.docId ? -1 : 1));
  return out.slice(0, limit);
}

// ── 片段与高亮 ───────────────────────────────────────────────────────────────
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 待高亮词：ASCII 原词（len≥2）+ CJK 整串（找不到时回退 bigram 由调用方处理） */
function highlightTerms(raw) {
  const s = String(raw || '');
  const terms = [];
  const seen = new Set();
  const push = (t) => { const k = t.toLowerCase(); if (!seen.has(k) && t.length >= (/[a-z0-9]/i.test(t[0]) ? 2 : 1)) { seen.add(k); terms.push(t); } };
  for (const m of s.matchAll(/[A-Za-z0-9_+#]{2,}/g)) push(m[0]);
  for (const m of s.matchAll(CJK_RE)) push(m[0]);
  return terms;
}

/**
 * 在 text 中找 terms 的最密窗口。
 * 返回 {text, hits:[{s,e}]}（hits 为窗口内偏移）；无命中返回文档开头 256 字、hits 空。
 * CJK 整串在文本中不存在时逐字回退（unigram 命中也高亮）。
 */
function snippet(text, raw, width) {
  const W = clampInt(width, 64, 1024, 256);
  const s = String(text || '');
  const low = s.toLowerCase();
  const terms = highlightTerms(raw);
  const ranges = [];
  for (const t of terms) {
    const tl = t.toLowerCase();
    let idx = low.indexOf(tl);
    if (idx < 0 && /[\u3400-\u4dbf\u4e00-\u9fff]/.test(t) && t.length > 1) {
      // CJK 整串未命中 → 逐字（unigram）回退
      for (const ch of t) {
        let i = low.indexOf(ch.toLowerCase());
        if (i >= 0) ranges.push([i, i + ch.length]);
      }
      continue;
    }
    let guard = 0;
    while (idx >= 0 && guard++ < 50) {
      ranges.push([idx, idx + tl.length]);
      idx = low.indexOf(tl, idx + tl.length);
    }
  }
  if (ranges.length === 0) return { text: s.slice(0, W), hits: [] };
  ranges.sort((a, b) => a[0] - b[0]);
  // 最密窗口：任一命中为中心，数窗口内命中数，取多者（并列取靠前）
  let bestStart = 0, bestCount = -1;
  for (const [st] of ranges) {
    const winStart = Math.max(0, st - Math.floor(W / 3));
    const winEnd = winStart + W;
    let c = 0;
    for (const [a, b] of ranges) if (a >= winStart && b <= winEnd) c++;
    if (c > bestCount) { bestCount = c; bestStart = winStart; }
  }
  const start = bestStart;
  const end = Math.min(s.length, start + W);
  const hits = [];
  for (const [a, b] of ranges) {
    if (b > start && a < end) hits.push({ s: Math.max(0, a - start), e: Math.min(end, b) - start });
  }
  hits.sort((a, b) => a.s - b.s);
  return { text: s.slice(start, end), hits };
}

// ── 展示辅助（MCP / 面板共用） ───────────────────────────────────────────────
function fmtBytes(n) {
  const v = Number(n) || 0;
  if (v < 1024) return v + ' B';
  if (v < 1024 * 1024) return (v / 1024).toFixed(1) + ' KB';
  if (v < 1024 * 1024 * 1024) return (v / (1024 * 1024)).toFixed(1) + ' MB';
  return (v / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

module.exports = {
  TEXT_EXTS, CODE_EXTS, DEFAULT_EXCLUDE_DIRS,
  extOf, classifyExt, isAbsolutePath, normSlashes,
  normalizeSettings, cleanPathList, cleanNameList, isIndexable, containsPath,
  tokenize, parseQuery, rank, highlightTerms, snippet,
  fmtBytes,
  BM25_K1, BM25_B,
};
