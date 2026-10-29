'use strict';
/**
 * searcher.js —— 网页封存全文检索（BM25-lite，零依赖纯函数，可离线单测）
 *
 * 语料规模（个人收藏，数百篇）不值得引外部搜索引擎；BM25 足够且可解释。
 * 切词：CJK 连续段两两 bigram（词边界未知的最稳切法，单字也经 bigram 命中）；
 * latin/digit 连续段整词小写。字段权重 title×3、excerpt×1.2、text×1。
 * 摘要（snippet）：在正文里找首个命中位置，取 ±100 字符窗口。
 */

const K1 = 1.2;
const B = 0.75;
const FIELD_WEIGHT = { title: 3, excerpt: 1.2, text: 1 };
const SNIPPET_WIN = 100;

const CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]+/g;
const WORD_RE = /[a-z0-9_@#$%^&*+=..]+/gi;

/** 切词：CJK bigram + latin 词。返回 token 数组（顺序无关，只用于 tf 统计） */
function tokenize(s) {
  const str = String(s || '').toLowerCase();
  const out = [];
  for (const seg of str.match(CJK_RE) || []) {
    if (seg.length === 1) { out.push(seg); continue; }
    for (let i = 0; i < seg.length - 1; i++) out.push(seg.slice(i, i + 2));
  }
  for (const w of str.match(WORD_RE) || []) {
    if (w.length >= 2) out.push(w); // 单字符 latin 词噪声大（"a"/"b"），丢弃
  }
  return out;
}

function tfMap(tokens) {
  const m = new Map();
  for (const t of tokens) m.set(t, (m.get(t) || 0) + 1);
  return m;
}

/**
 * 建文档：fields = {title, excerpt, text}。
 * @returns {{ id: string, fields: Record<string, string>, tokens: Record<string, Map<string,number>>, len: number }}
 */
function buildDoc(id, fields) {
  const tokens = {};
  let len = 0;
  for (const f of Object.keys(FIELD_WEIGHT)) {
    const toks = tokenize(fields[f] || '');
    tokens[f] = tfMap(toks);
    len += toks.length;
  }
  return { id: String(id), fields, tokens, len: Math.max(1, len) };
}

/**
 * 检索主入口。
 * @param {Array<ReturnType<buildDoc>>} docs
 * @param {string} q 查询串
 * @param {{limit?: number}} opts
 * @returns {Array<{id: string, score: number, snippet: string}>} 按相关度降序
 */
function search(docs, q, opts) {
  const limit = Math.max(1, Math.min(50, Math.floor(Number(opts && opts.limit) || 10)));
  const qTokens = [...new Set(tokenize(q))];
  if (!qTokens.length || !docs.length) return [];

  // IDF（文档级：任一字段含该 token 即算命中文档）
  const df = new Map();
  for (const t of qTokens) {
    let n = 0;
    for (const d of docs) {
      if (Object.values(d.tokens).some((m) => m.has(t))) n++;
    }
    df.set(t, n);
  }
  const idf = (t) => Math.log(1 + (docs.length - df.get(t) + 0.5) / (df.get(t) + 0.5));
  const avgLen = docs.reduce((s, d) => s + d.len, 0) / docs.length;

  const hits = [];
  for (const d of docs) {
    let score = 0;
    let matched = 0;
    for (const t of qTokens) {
      let tfWeighted = 0;
      for (const f of Object.keys(FIELD_WEIGHT)) {
        const tf = d.tokens[f].get(t) || 0;
        if (tf > 0) tfWeighted += tf * FIELD_WEIGHT[f];
      }
      if (tfWeighted <= 0) continue;
      matched++;
      score += idf(t) * (tfWeighted * (K1 + 1)) / (tfWeighted + K1 * (1 - B + B * (d.len / avgLen)));
    }
    if (!matched) continue;
    hits.push({ id: d.id, score: Math.round(score * 1000) / 1000, matched });
  }
  hits.sort((a, b) => b.score - a.score);
  const byId = new Map(docs.map((d) => [d.id, d]));
  return hits.slice(0, limit).map((h) => {
    const d = byId.get(h.id);
    return { id: h.id, score: h.score, snippet: snippetOf((d && d.fields.text) || '', qTokens) };
  });
}

/** 在正文里构造命中上下文窗口（找首个命中的 token 出现位置） */
function snippetOf(text, qTokens) {
  if (!text) return '';
  let at = -1;
  let atLen = 0;
  const lower = text.toLowerCase();
  for (const t of qTokens) {
    // CJK bigram / latin 词都按字面找（tokenize 与字面一致）
    const i = lower.indexOf(t);
    if (i !== -1 && (at === -1 || i < at)) { at = i; atLen = t.length; }
  }
  if (at === -1) return text.slice(0, SNIPPET_WIN * 2).replace(/\s+/g, ' ').trim();
  const start = Math.max(0, at - SNIPPET_WIN);
  const end = Math.min(text.length, at + atLen + SNIPPET_WIN);
  const body = text.slice(start, end).replace(/\s+/g, ' ').trim();
  return `${start > 0 ? '…' : ''}${body}${end < text.length ? '…' : ''}`;
}

module.exports = { tokenize, buildDoc, search, snippetOf };
