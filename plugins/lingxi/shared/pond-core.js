'use strict';
/**
 * pond-core.js —— 灵犀灵感孵化池共享核心（单一权威，零依赖）
 *
 * 被 MCP server（CJS require）与面板（esbuild 打包进 bundle）共用：
 * 键空间、想法归一化、成熟度管道、回访调度（SRS 思想）、关联检索
 * （CJK 双元 BM25-lite）、星系聚类、星图布局、碰撞选题、统计。
 * 所有"计算"必须放这里，两侧只做 IO（cap.kv 读写），防止口径漂移。
 *
 * 设计核心（与笔记工具的本质区别）：「存下来」只是起点。
 * 灵犀的全部机制围绕三件事：
 *   1. 让想法被再次见到 —— 到期回访队列（revisit）
 *   2. 让想法被推进     —— 成熟度管道（seed→sprout→sketch→plan→done）
 *   3. 让想法相遇       —— 关联匹配 / 星系聚类 / 随机碰撞
 *
 * 数据契约（cap.kv `lingxi.` 键空间，权威描述见 README）：
 *   lingxi.idea.<id> → Idea（一想法一键，低频写，读改写幂等）
 *   lingxi.settings  → Settings（v1 仅有 schemaVersion，预留扩展）
 */

// ── 键空间 ─────────────────────────────────────────────────────────────────
const K = {
  idea: (id) => `lingxi.idea.${id}`,
  ideaPrefix: 'lingxi.idea.',
  settings: 'lingxi.settings',
};

/** 想法类型（kind） */
const KINDS = [
  { key: 'idea', label: '点子', desc: '想做的东西 / 功能 / 项目' },
  { key: 'problem', label: '问题', desc: '待解决的疑问 / 痛点' },
  { key: 'resource', label: '素材', desc: '值得留用的线索 / 引用 / 链接' },
  { key: 'observation', label: '观察', desc: '现象 / 洞察 / 随想' },
];

/** 成熟度管道（maturity 0..4） */
const MATURITIES = [
  { key: 'seed', label: '种子', desc: '只是一个念头' },
  { key: 'sprout', label: '嫩芽', desc: '有过一次深化，知道它在回答什么' },
  { key: 'sketch', label: '轮廓', desc: '有了形态：大致怎么做、做给谁' },
  { key: 'plan', label: '蓝图', desc: '可执行：步骤/成本/验收清楚' },
  { key: 'done', label: '落地', desc: '已动手或已实现' },
];

/** 回访节奏（天）：新想法 3 天后首访，深化/再等等间隔翻倍，推进则回到活跃节奏 */
const REVISIT_BASE_DAYS = 3;
const REVISIT_MAX_DAYS = 60;

/** 单字段长度上限（防 kv 膨胀；raw/note 是想法主体，放宽到 2000/6000） */
const LIMITS = { title: 60, raw: 2000, tags: 6, tagLen: 16, timeline: 40, revisitHistory: 30, links: 20 };

const DEFAULT_SETTINGS = { schemaVersion: 1 };

// ── 小工具 ─────────────────────────────────────────────────────────────────
function makeId(now) {
  const t = typeof now === 'number' ? now : Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return 'i' + t.toString(36) + rand;
}

const DAY_MS = 24 * 3600 * 1000;

function fmtDay(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDateTime(ts) {
  const d = new Date(ts);
  return `${fmtDay(ts)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 简体中文相对天数描述（用于回访提示） */
function fmtDueRelative(dueAt, now) {
  const diff = dueAt - now;
  const days = Math.round(diff / DAY_MS);
  if (days >= 1) return `${days} 天后`;
  if (days <= -1) return `逾期 ${Math.abs(days)} 天`;
  return diff >= 0 ? '今天晚些' : '今天（已到期）';
}

/** 字符串确定性散列（星图颜色/布局抖动用；不得用于安全场景） */
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ── 想法归一化 ─────────────────────────────────────────────────────────────
function cleanTags(raw) {
  const out = [];
  for (const t of Array.isArray(raw) ? raw : []) {
    const s = String(t || '').trim().slice(0, LIMITS.tagLen);
    if (s && !out.includes(s)) out.push(s);
    if (out.length >= LIMITS.tags) break;
  }
  return out;
}

/**
 * 归一化一个想法；非法返回 { error }，合法返回 { idea }。
 * raw: { id?, title, raw?, kind?, tags?, url?, origin?, now? }
 * 回访与 timeline 由此初始化：首访 = 创建 + REVISIT_BASE_DAYS。
 */
function normalizeIdea(input) {
  if (!input || typeof input !== 'object') return { error: '缺少想法数据' };
  const title = String(input.title || '').trim().slice(0, LIMITS.title);
  if (!title) return { error: '想法需要一个标题（一句话概括即可）' };
  const now = Number.isFinite(Number(input.now)) && Number(input.now) > 0 ? Number(input.now) : Date.now();
  const kind = KINDS.some((k) => k.key === input.kind) ? input.kind : 'idea';
  const raw = String(input.raw || '').trim().slice(0, LIMITS.raw);
  const url = typeof input.url === 'string' && /^https?:\/\//.test(input.url) ? input.url.slice(0, 500) : undefined;
  const idea = {
    id: typeof input.id === 'string' && input.id ? input.id.slice(0, 40) : makeId(now),
    title,
    raw,
    kind,
    tags: cleanTags(input.tags),
    maturity: 0,
    status: 'active',
    origin: input.origin === 'panel' || input.origin === 'import' ? input.origin : 'ai',
    url,
    links: [],
    createdAt: now,
    updatedAt: now,
    revisit: {
      dueAt: now + REVISIT_BASE_DAYS * DAY_MS,
      interval: REVISIT_BASE_DAYS,
      history: [],
    },
    timeline: [{ at: now, kind: 'catch', text: raw ? '捕获入池' : '捕获入池（暂无正文）' }],
  };
  return { idea };
}

/** 深化/回访等事件追加进 timeline（新事件在前，超限截断） */
function pushEvent(idea, kind, text, now) {
  idea.timeline = [{ at: now, kind, text: String(text || '').slice(0, 400) }, ...(idea.timeline || [])].slice(0, LIMITS.timeline);
  idea.updatedAt = now;
}

// ── 成熟度管道与回访调度 ───────────────────────────────────────────────────
/**
 * 深化：追加一段沉淀（答案/补充/反转），回访间隔翻倍。
 * 返回 { error } 或 { idea }（原对象被修改，调用方负责写回）。
 */
function deepenIdea(idea, text, now) {
  const t = String(text || '').trim().slice(0, LIMITS.raw);
  if (!t) return { error: '深化内容不能为空' };
  if (!idea || idea.status !== 'active') return { error: '想法不存在或不在池中（active）' };
  pushEvent(idea, 'deepen', t, now);
  idea.revisit.interval = Math.min(idea.revisit.interval * 2, REVISIT_MAX_DAYS);
  idea.revisit.dueAt = now + idea.revisit.interval * DAY_MS;
  idea.revisit.history = [{ at: now, outcome: 'deepen' }, ...(idea.revisit.history || [])].slice(0, LIMITS.revisitHistory);
  return { idea };
}

/**
 * 推进成熟度 +1（到 done 时状态收口）。推进后回到活跃节奏（3 天）：
 * 推进中的想法正处于活跃孵化期，值得高频回看。
 */
function promoteIdea(idea, now, note) {
  if (!idea) return { error: '想法不存在' };
  if (idea.maturity >= 4) return { error: '已在「落地」，无法再推进' };
  if (idea.status !== 'active') return { error: '想法不存在或不在池中（active）' };
  idea.maturity += 1;
  if (idea.maturity >= 4) {
    idea.status = 'done';
    idea.revisit = { dueAt: 0, interval: 0, history: idea.revisit.history || [] };
  } else {
    idea.revisit.interval = REVISIT_BASE_DAYS;
    idea.revisit.dueAt = now + REVISIT_BASE_DAYS * DAY_MS;
  }
  pushEvent(idea, 'promote', note ? `推进至「${MATURITIES[idea.maturity].label}」：${note}` : `推进至「${MATURITIES[idea.maturity].label}」`, now);
  idea.revisit.history = [{ at: now, outcome: 'promote' }, ...(idea.revisit.history || [])].slice(0, LIMITS.revisitHistory);
  return { idea };
}

/** 回访记一笔：deepen（顺带深化）/ promote（推进）/ snooze（再等等）/ archive（归档） */
function applyRevisitOutcome(idea, outcome, now, note) {
  if (!idea) return { error: '想法不存在' };
  if (idea.status !== 'active') return { error: '该想法不在池中（active），无需回访' };
  if (outcome === 'deepen') return deepenIdea(idea, note || '（回访时深化，未留内容）', now);
  if (outcome === 'promote') return promoteIdea(idea, now, note);
  if (outcome === 'snooze') {
    idea.revisit.interval = Math.min(Math.max(idea.revisit.interval, REVISIT_BASE_DAYS) * 2, REVISIT_MAX_DAYS);
    idea.revisit.dueAt = now + idea.revisit.interval * DAY_MS;
    idea.revisit.history = [{ at: now, outcome: 'snooze' }, ...(idea.revisit.history || [])].slice(0, LIMITS.revisitHistory);
    pushEvent(idea, 'revisit', note ? `再等等：${note}` : '回访：再等等', now);
    return { idea };
  }
  if (outcome === 'archive') return archiveIdea(idea, now, note || '回访时归档');
  return { error: '未知回访结果（deepen / promote / snooze / archive）' };
}

/** 归档（不删除——沉寂的想法保留可恢复、可被检索命中） */
function archiveIdea(idea, now, note) {
  if (!idea) return { error: '想法不存在' };
  if (idea.status === 'archived') return { error: '已在归档中' };
  const wasActive = idea.status === 'active';
  idea.status = 'archived';
  if (wasActive) {
    idea.revisit = { dueAt: 0, interval: 0, history: idea.revisit.history || [] };
  }
  pushEvent(idea, 'archive', note || '归档沉寂', now);
  return { idea };
}

/** 从归档恢复入池（回访重置为基础节奏） */
function restoreIdea(idea, now) {
  if (!idea) return { error: '想法不存在' };
  if (idea.status !== 'archived') return { error: '仅归档中的想法可恢复' };
  idea.status = 'active';
  if (idea.maturity < 4) {
    idea.revisit = { dueAt: now + REVISIT_BASE_DAYS * DAY_MS, interval: REVISIT_BASE_DAYS, history: idea.revisit.history || [] };
  }
  pushEvent(idea, 'restore', '从归档恢复入池', now);
  return { idea };
}

/** 编辑标题（其余字段不可经编辑改，保证管道语义单一） */
function retitleIdea(idea, title, now) {
  const t = String(title || '').trim().slice(0, LIMITS.title);
  if (!t) return { error: '标题不能为空' };
  if (!idea) return { error: '想法不存在' };
  idea.title = t;
  pushEvent(idea, 'edit', `改题：${t}`, now);
  return { idea };
}

// ── 检索：CJK 双元 + ASCII 词，BM25-lite ───────────────────────────────────
/** 文本 → token 集（CJK 连续段切双元，ASCII 切小写词）；返回 Map<token, tf> */
function tokenize(text) {
  const map = new Map();
  const add = (t) => map.set(t, (map.get(t) || 0) + 1);
  const s = String(text || '');
  const re = /[\u4e00-\u9fff]+|[a-zA-Z0-9][a-zA-Z0-9_+#.-]*/g;
  let m;
  while ((m = re.exec(s))) {
    const seg = m[0];
    if (/^[\u4e00-\u9fff]/.test(seg)) {
      if (seg.length === 1) add(seg);
      else for (let i = 0; i < seg.length - 1; i++) add(seg.slice(i, i + 2));
    } else {
      add(seg.toLowerCase());
    }
  }
  return map;
}

/** 一个想法的加权检索文本：标题×3 + 标签×2 + 正文×1 + URL×0.5 */
function ideaTokens(idea) {
  const acc = new Map();
  const bump = (text, w) => {
    for (const [t, tf] of tokenize(text)) acc.set(t, (acc.get(t) || 0) + tf * w);
  };
  bump(idea.title, 3);
  bump((idea.tags || []).join(' '), 2);
  bump(idea.raw, 1);
  bump(idea.url || '', 0.5);
  return acc;
}

/**
 * 相关想法匹配（入池时自动调用）：在 corpus 中找与 target 最相关的 n 个。
 * BM25-lite：idf * tf/(tf+k)。corpus 不含 target 自身。
 * 返回 [{ idea, score }]，按分降序；corpus 为空或无命中返回 []。
 * 注意：池里只有 1 条旧想法时也必须参与匹配——这恰是「第二条想法遇见第一条」的场景。
 */
function findRelated(target, corpus, n = 3) {
  if (!target || !Array.isArray(corpus) || corpus.length < 1) return [];
  const q = ideaTokens(target);
  if (!q.size) return [];
  const docs = corpus.map((idea) => ({ idea, toks: ideaTokens(idea) }));
  const N = docs.length;
  const df = new Map();
  for (const d of docs) for (const t of d.toks.keys()) df.set(t, (df.get(t) || 0) + 1);
  const scored = [];
  for (const d of docs) {
    let score = 0;
    let hits = 0;
    for (const [t, qtf] of q) {
      const dtf = d.toks.get(t);
      if (!dtf) continue;
      hits += 1;
      const idf = Math.log(1 + N / (df.get(t) || 1));
      score += idf * ((dtf * (1.2 + 1)) / (dtf + 1.2 * (0.25 + 0.75)) ) * Math.min(qtf, 3);
    }
    // 命中面太小的不算相关（避免单 token 巧合）
    if (score > 0 && hits >= 2) scored.push({ idea: d.idea, score });
  }
  scored.sort((a, b) => b.score - a.score);
  if (!scored.length) return [];
  const top = scored[0].score;
  return scored
    .filter((s) => s.score >= Math.max(top * 0.35, 0.6))
    .slice(0, n);
}

/** 池内检索（lingxi_search / 面板池子 Tab 同一过滤口径） */
function searchIdeas(ideas, { keyword, tag, kind, status, minMaturity, maxMaturity } = {}) {
  const kw = keyword ? tokenize(String(keyword)) : null;
  return (ideas || []).filter((idea) => {
    if (status && idea.status !== status) return false;
    if (!status && kw === null && idea.status === 'archived') return false; // 缺省不见归档
    if (tag && !(idea.tags || []).includes(tag)) return false;
    if (kind && idea.kind !== kind) return false;
    if (Number.isFinite(Number(minMaturity)) && idea.maturity < Number(minMaturity)) return false;
    if (Number.isFinite(Number(maxMaturity)) && idea.maturity > Number(maxMaturity)) return false;
    if (kw && kw.size) {
      const toks = ideaTokens(idea);
      let hit = 0;
      for (const t of kw.keys()) if (toks.has(t)) hit += 1;
      if (!hit) return false;
    }
    return true;
  });
}

// ── 回访队列 ───────────────────────────────────────────────────────────────
/** 到期待访的活跃想法（升序：逾期最久的最先见） */
function dueRevisits(ideas, now) {
  return (ideas || [])
    .filter((i) => i && i.status === 'active' && i.revisit && i.revisit.dueAt > 0 && i.revisit.dueAt <= now)
    .sort((a, b) => a.revisit.dueAt - b.revisit.dueAt);
}

/** 下一个最近的回访到期时间（无活跃想法返回 null） */
function nextRevisitAt(ideas) {
  let min = null;
  for (const i of ideas || []) {
    if (i && i.status === 'active' && i.revisit && i.revisit.dueAt > 0) {
      if (min === null || i.revisit.dueAt < min) min = i.revisit.dueAt;
    }
  }
  return min;
}

// ── 星系聚类 ───────────────────────────────────────────────────────────────
/** 主标签（首标签）；无标签归「未分域」 */
function primaryTagOf(idea) {
  return (idea.tags && idea.tags[0]) || '未分域';
}

/**
 * 星系聚类：按主标签分簇，输出每簇统计 + 「值得合并成项目」的候选簇。
 * 合并候选：簇内 ≥3 个活跃想法，且 ≥2 个已到「轮廓」及以上。
 */
function clusterConstellations(ideas, now) {
  const clusters = new Map();
  for (const idea of ideas || []) {
    if (!idea) continue;
    if (idea.status === 'archived') continue;
    const tag = primaryTagOf(idea);
    let c = clusters.get(tag);
    if (!c) {
      c = { tag, ideas: [], byMaturity: [0, 0, 0, 0, 0], oldestAt: idea.createdAt, newestAt: idea.createdAt };
      clusters.set(tag, c);
    }
    c.ideas.push(idea);
    c.byMaturity[idea.maturity] += 1;
    if (idea.createdAt < c.oldestAt) c.oldestAt = idea.createdAt;
    if (idea.createdAt > c.newestAt) c.newestAt = idea.createdAt;
  }
  const list = [...clusters.values()].map((c) => ({
    tag: c.tag,
    count: c.ideas.length,
    byMaturity: c.byMaturity,
    matureCount: c.byMaturity.slice(2).reduce((s, x) => s + x, 0),
    oldestDays: Math.floor((now - c.oldestAt) / DAY_MS),
    ideaIds: c.ideas.map((i) => i.id),
  }));
  list.sort((a, b) => b.count - a.count || b.matureCount - a.matureCount);
  const mergeCandidates = list.filter((c) => c.count >= 3 && c.matureCount >= 2);
  return { clusters: list, mergeCandidates };
}

// ── 碰撞选题 ───────────────────────────────────────────────────────────────
/** 创意激发技术（碰撞时随机抽一张「视角卡」） */
const TECHNIQUES = [
  { key: 'force-join', name: '强制嫁接', hint: '把抽中的想法两两拧在一起：它们的交集能解决什么单独解决不了的问题？' },
  { key: 'invert', name: '反转假设', hint: '把每个想法的核心前提反过来看：如果事实完全相反，剩下的还是不是一个有意思的东西？' },
  { key: 'scale', name: '缩放十年', hint: '把每个想法分别缩小 10 倍（只做最小内核）与放大 10 倍（假设无资源约束），哪个版本更值得做？' },
  { key: 'constraint', name: '减半挑战', hint: '假设时间与资源只剩一半：每个想法必须砍掉什么才能活下来？被砍掉的部分里有没有金子？' },
  { key: 'other-use', name: '迁地他用', hint: '把每个想法搬到完全不同的场景/人群/介质里：还能用在哪？谁会为它付钱或花时间？' },
  { key: 'user-shift', name: '换人发问', hint: '分别用「领域专家」和「完全的外行」的口吻向每个想法提问，两种视角各会问出什么？' },
  { key: 'combine', name: '旧配新', hint: '把抽中的想法分别与池中一个更旧的未推进想法配对：旧想法能为它补上什么？' },
  { key: 'future', name: '时间旅行', hint: '五年后回头看这些想法：它们会分别因为什么而显得幼稚？又可能因为什么被证明超前？' },
];

/**
 * 随机碰撞：从候选中抽 n 个想法 + 一张视角卡。
 * rand 可注入（测试确定性）；scope: all | active | mature（轮廓及以上）。
 */
function pickCollisions(ideas, { count = 3, scope = 'active', rand = Math.random } = {}) {
  let pool = (ideas || []).filter((i) => i && i.status !== 'archived');
  if (scope === 'active') pool = pool.filter((i) => i.status === 'active');
  if (scope === 'mature') pool = pool.filter((i) => i.status === 'active' && i.maturity >= 2);
  if (pool.length < 2) return { error: '池子里的可用想法少于 2 个，先多捞几条再来碰撞' };
  const shuffled = pool.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const n = Math.min(Math.max(2, Number(count) || 3), 5, shuffled.length);
  const picks = shuffled.slice(0, n);
  const technique = TECHNIQUES[Math.floor(rand() * TECHNIQUES.length) % TECHNIQUES.length];
  return { picks, technique };
}

// ── 星图布局（纯函数，确定性：同输入同输出）──────────────────────────────
/**
 * 把想法布局成星图：主标签成「星系」（簇），星等随成熟度，归档星暗淡。
 * 返回 { stars: [{id,x,y,r,hue,alpha,due,ring}], clusters: [{tag,cx,cy,r,count}] }，
 * 坐标基于给定画布宽高（CSS 像素，调用方自乘 DPR）。
 */
function computeStarLayout(ideas, width, height) {
  const W = Math.max(280, Number(width) || 320);
  const H = Math.max(240, Number(height) || 380);
  const margin = 34;
  const items = (ideas || []).filter((i) => i && i.id);
  const now = Date.now();
  const { clusters } = clusterConstellations(items, now);
  const byPrimary = new Map();
  for (const idea of items) {
    const tag = primaryTagOf(idea);
    if (!byPrimary.has(tag)) byPrimary.set(tag, []);
    byPrimary.get(tag).push(idea);
  }
  // 簇心：黄金角螺旋铺在画布椭圆内（大簇靠中心）
  const ordered = clusters.slice().sort((a, b) => b.count - a.count);
  const cx0 = W / 2;
  const cy0 = H / 2;
  const rx = (W - margin * 2) / 2;
  const ry = (H - margin * 2) / 2;
  const centers = new Map();
  ordered.forEach((c, idx) => {
    if (idx === 0) {
      centers.set(c.tag, { x: cx0, y: cy0 });
      return;
    }
    const ang = idx * 2.399963; // 黄金角(弧度)
    const rr = Math.min(1, Math.sqrt(idx / Math.max(3, ordered.length)) + 0.18);
    centers.set(c.tag, { x: cx0 + Math.cos(ang) * rx * rr * 0.78, y: cy0 + Math.sin(ang) * ry * rr * 0.78 });
  });
  const stars = [];
  const clusterOut = [];
  for (const c of ordered) {
    const members = byPrimary.get(c.tag) || [];
    const center = centers.get(c.tag) || { x: cx0, y: cy0 };
    const cr = 18 + Math.sqrt(members.length) * 16; // 星系半径
    clusterOut.push({ tag: c.tag, cx: center.x, cy: center.y, r: cr, count: c.count });
    members.forEach((idea, i) => {
      // 星在簇内的确定性散置：双环 + 散列抖动
      const h = hashStr(idea.id);
      const ring = i === 0 ? 0 : 1 + (i % 2);
      const rad = ring === 0 ? 0 : (cr - 10) * (0.42 + 0.28 * ring * 0.5);
      const baseAng = (h % 360) * (Math.PI / 180);
      const ang = ring === 0 ? 0 : baseAng + (i * 2.399963);
      const jitter = ((h >>> 8) % 100) / 100 * 6 - 3;
      const x = Math.min(W - 12, Math.max(12, center.x + Math.cos(ang) * rad + jitter));
      const y = Math.min(H - 12, Math.max(12, center.y + Math.sin(ang) * rad + jitter));
      const due = idea.status === 'active' && idea.revisit && idea.revisit.dueAt > 0 && idea.revisit.dueAt <= now;
      stars.push({
        id: idea.id,
        x: Math.round(x * 10) / 10,
        y: Math.round(y * 10) / 10,
        r: 3 + idea.maturity * 1.7 + ((h >>> 12) % 10) / 10,
        hue: Math.round((hashStr(c.tag) % 360)),
        alpha: idea.status === 'active' ? 0.95 : idea.status === 'done' ? 0.62 : 0.22,
        due,
        title: idea.title,
        maturity: idea.maturity,
        status: idea.status,
      });
    });
  }
  return { stars, clusters: clusterOut, width: W, height: H };
}

// ── 统计 ───────────────────────────────────────────────────────────────────
/** 池子总览统计（纯派生，无任何持久状态） */
function computePondStats(ideas, now) {
  const all = (ideas || []).filter(Boolean);
  const active = all.filter((i) => i.status === 'active');
  const byMaturity = [0, 0, 0, 0, 0];
  for (const i of all) byMaturity[i.maturity] += 1;
  const byKind = {};
  for (const k of KINDS) byKind[k.key] = 0;
  for (const i of active) byKind[i.kind] = (byKind[i.kind] || 0) + 1;
  const tagCount = new Map();
  for (const i of active) for (const t of i.tags || []) tagCount.set(t, (tagCount.get(t) || 0) + 1);
  const topTags = [...tagCount.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count).slice(0, 8);
  // 近 8 周捕获趋势（桶起点=周一）
  const weekStart = (ts) => {
    const d = new Date(ts);
    const day = (d.getDay() + 6) % 7;
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
    return start.getTime();
  };
  const cur = weekStart(now);
  const weeks = [];
  const byWeek = new Map();
  for (let w = 7; w >= 0; w--) {
    const s = cur - w * 7 * DAY_MS;
    weeks.push(s);
    byWeek.set(s, 0);
  }
  for (const i of all) {
    const s = weekStart(i.createdAt);
    if (byWeek.has(s)) byWeek.set(s, byWeek.get(s) + 1);
  }
  const oldest = active.length ? Math.min(...active.map((i) => i.createdAt)) : null;
  return {
    total: all.length,
    active: active.length,
    archived: all.filter((i) => i.status === 'archived').length,
    done: all.filter((i) => i.status === 'done').length,
    byMaturity,
    byKind,
    topTags,
    captures8w: weeks.map((s) => ({ weekStart: s, count: byWeek.get(s) })),
    dueNow: dueRevisits(active, now).length,
    matureShare: active.length ? active.filter((i) => i.maturity >= 2).length / active.length : 0,
    oldestActiveDays: oldest != null ? Math.floor((now - oldest) / DAY_MS) : null,
  };
}

/** 想法的一行人读摘要（AI/面板共用格式） */
function fmtIdeaLine(idea, now) {
  const mat = MATURITIES[idea.maturity] || MATURITIES[0];
  const kind = (KINDS.find((k) => k.key === idea.kind) || KINDS[0]).label;
  const dueTxt = idea.status === 'active' && idea.revisit && idea.revisit.dueAt > 0
    ? ` · 回访${fmtDueRelative(idea.revisit.dueAt, now)}`
    : '';
  const tagTxt = (idea.tags || []).length ? ` #${idea.tags.join(' #')}` : '';
  return `[${idea.id}] ${kind}·${mat.label} ${idea.title}${tagTxt}${dueTxt}`;
}

module.exports = {
  K, KINDS, MATURITIES, TECHNIQUES, DEFAULT_SETTINGS,
  REVISIT_BASE_DAYS, REVISIT_MAX_DAYS, LIMITS,
  DAY_MS, makeId, hashStr, fmtDay, fmtDateTime, fmtDueRelative,
  normalizeIdea, deepenIdea, promoteIdea, applyRevisitOutcome,
  archiveIdea, restoreIdea, retitleIdea, pushEvent,
  tokenize, ideaTokens, findRelated, searchIdeas,
  dueRevisits, nextRevisitAt,
  primaryTagOf, clusterConstellations, pickCollisions,
  computeStarLayout, computePondStats, fmtIdeaLine,
};
