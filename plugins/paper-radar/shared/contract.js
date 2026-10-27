'use strict';
/**
 * contract.js —— 论文雷达三端共享契约（service / mcp / panel）
 *
 * 键空间 + 模型字段 + 评分核心，须与面板 src/model.ts 保持同步
 *（权威字段说明见 README）。改动键名或字段时，请同时改三处。
 *
 * 键空间（cap.kv 域内，前缀 paper.）：
 *   paper.settings                全局设置（间隔/每日限额）——面板/MCP 写，服务读
 *   paper.topics                  关注主题数组（含关键词权重）——面板/MCP 写，服务读
 *   paper.feed.<YYYY-MM-DD>       某天抓取的论文清单（服务写，面板/MCP 读）
 *   paper.fav.<arxivId>           收藏的论文（用户笔记/已读）——面板/MCP 写
 *   paper.meta                    服务心跳/上次抓取（服务写）
 *   paper.msg.<type>.<ts>         面板/服务的提示信息（可选，广播用）
 */
const PREFIX = 'paper.';
const K = {
  settings: PREFIX + 'settings',
  topics: PREFIX + 'topics',
  feed: (d) => PREFIX + 'feed.' + d,
  fav: (id) => PREFIX + 'fav.' + id,
  meta: PREFIX + 'meta',
  msg: (type, ts) => PREFIX + 'msg.' + type + '.' + ts,
  isFeed: (k) => k.startsWith(PREFIX + 'feed.'),
  isFav: (k) => k.startsWith(PREFIX + 'fav.'),
};

/** 默认设置 */
const DEFAULT_SETTINGS = {
  perTopic: 15,       // 每个主题拉取的最大论文数（arXiv API max_results）
  dailyTop: 12,       // feed 中保留的最值得读条数
  scanHour: 8,        // 每天首次扫描的小时（本地时间），0-23
  scanIntervalHours: 8, // 扫描间隔小时数（同日防重）
  maxFav: 200,        // 收藏上限
};

/**
 * 论文原文模型（arXiv Atom -> Paper）
 * id 统一为 arXiv 内部 id（如 2601.12345），url 为 abs 页。
 */
function normalizePaper(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const title = String(raw.title || '').replace(/\s+/g, ' ').trim();
  // arXiv Atom 返回的 id 常带版本号后缀（2610.35829v1），统一剥离到基版
  //（2610.35829），否则同一论文的不同版本无法去重、收藏会碎片化。
  const id = String(raw.id || '').replace(/v\d+$/, '').trim();
  if (!title || !id) return null;
  return {
    id,
    title: title.slice(0, 500),
    url: String(raw.url || '').replace(/v\d+$/, '') || ('https://arxiv.org/abs/' + id),
    pdfUrl: (raw.pdfUrl ? String(raw.pdfUrl) : '').replace(/v\d+$/, '') || ('https://arxiv.org/pdf/' + id),
    abstract: String(raw.abstract || '').replace(/\s+/g, ' ').trim().slice(0, 4000),
    authors: Array.isArray(raw.authors) ? raw.authors.map((a) => String(a)).slice(0, 20) : [],
    categories: Array.isArray(raw.categories) ? raw.categories.slice(0, 10) : [],
    published: Number(raw.published) || 0,
    updated: Number(raw.updated) || 0,
    // 评分域（服务写；MCP/面板只读）
    score: Number(raw.score) || 0,
    topMatches: Array.isArray(raw.topMatches) ? raw.topMatches.slice(0, 8) : [],
    verdict: raw.verdict ? String(raw.verdict).slice(0, 600) : '',
  };
}

/**
 * 主题定义：{ id, name, keywords: string[], enabled: bool }
 * keywords 可含短语，匹配时小写子串命中。
 */
function normalizeTopic(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !raw.id) return null;
  const keywords = (Array.isArray(raw.keywords) ? raw.keywords : [])
    .map((k) => String(k || '').trim().toLowerCase())
    .filter(Boolean);
  if (!keywords.length) return null;
  return {
    id: raw.id,
    name: String(raw.name || raw.id).trim().slice(0, 80),
    keywords,
    enabled: raw.enabled !== false,
    createdAt: Number(raw.createdAt) || Date.now(),
  };
}

const DEFAULT_TOPICS = [
  { id: 'llm-agent', name: 'LLM Agent', keywords: ['llm', 'large language model', 'ai agent', 'agent'], enabled: true },
  { id: 'reasoning', name: '推理与思维链', keywords: ['reasoning', 'chain-of-thought', 'thinking'], enabled: true },
  { id: 'codegen', name: '代码生成', keywords: ['code generation', 'codegen', 'program synthesis'], enabled: true },
].map(normalizeTopic);

/**
 * 评分核心：标题命中 ×3 / 摘要命中 ×1，按主题聚合 top matches。
 * 返回 { score, topMatches, verdict }
 */
function scorePaper(paper, topics) {
  const title = (paper.title || '').toLowerCase();
  const abs = (paper.abstract || '').toLowerCase();
  const hay = { title, abs };
  const enabled = (topics || []).filter((t) => t && t.enabled);
  let score = 0;
  const matches = []; // { topic, word, weight, hit }
  for (const t of enabled) {
    for (const word of t.keywords) {
      let hitT = false, hitA = false;
      if (title.indexOf(word) >= 0) hitT = true;
      else if (abs.indexOf(word) >= 0) hitA = true;
      if (hitT || hitA) {
        const w = hitT ? 3 : 1;
        score += w;
        matches.push({ topic: t.name, word, weight: w, hit: hitT ? 'title' : 'abstract' });
      }
    }
  }
  return { score, matches, hay };
}

/** 生成一句话解读（开箱即用，无需 API） */
function buildVerdict(paper, matches, topics) {
  const enabled = (topics || []).filter((t) => t && t.enabled);
  if (!matches.length) return '与当前关注主题无明显重叠，建议按需浏览。';
  const byTopic = {};
  for (const m of matches) {
    if (!byTopic[m.topic]) byTopic[m.topic] = [];
    byTopic[m.topic].push(m.word);
  }
  const topTopic = Object.keys(byTopic)[0];
  const topWords = byTopic[topTopic].slice(0, 3);
  const names = enabled.map((t) => t.name).join(' / ');
  const hitWords = matches.slice(0, 4).map((m) => m.word).join('、');
  if (matches.some((m) => m.weight === 3)) {
    return `标题直接命中主题「${topTopic}」（${topWords.join('、')}），与关注方向高度相关，建议列入精读。`;
  }
  return `摘要命中主题「${topTopic}」（${hitWords}）。当前关注：${names}，值得泛读。`;
}

/** 合并两组论文（按 id 去重），补评分与 verdict，按分数排序取 top。 */
function mergeAndRank(papers, topics, top) {
  const seen = new Set();
  const out = [];
  for (const raw of papers) {
    const p = normalizePaper(raw);
    if (!p || seen.has(p.id)) continue;
    seen.add(p.id);
    const { score, matches } = scorePaper(p, topics);
    p.score = score;
    p.topMatches = matches.slice(0, 8);
    p.verdict = buildVerdict(p, matches, topics);
    out.push(p);
  }
  out.sort((a, b) => b.score - a.score || (a.published || 0) - (b.published || 0));
  if (top > 0 && out.length > top) return out.slice(0, top);
  return out;
}

module.exports = { K, DEFAULT_SETTINGS, DEFAULT_TOPICS, normalizePaper, normalizeTopic, scorePaper, buildVerdict, mergeAndRank };