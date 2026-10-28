'use strict';
/**
 * 观止 guanzhi-core —— 书影音消费账本的唯一计算权威（CommonJS，零依赖）
 *
 * 面板（esbuild 打包进 bundle）与 MCP（require）与测试三方共用，
 * 保证「归一化校验 / 状态-日期语义 / 透视聚合 / 年报 / 推荐评分」口径不漂移。
 *
 * 键空间契约（与 mcp/server.js 一致，权威描述见 README）：
 *   guanzhi.work.<id>  → Work（一条一键，规避列表并发覆盖）
 *   guanzhi.settings   → Settings
 *
 * 日期一律 'YYYY-MM-DD' 字符串（本地日期语义），比较用 UTC 日期算术避免 DST 漂移。
 */

const KINDS = ['book', 'movie', 'tv', 'anime', 'music', 'game', 'podcast', 'other'];
const KIND_LABELS = {
  book: '书', movie: '电影', tv: '剧集', anime: '动画',
  music: '音乐', game: '游戏', podcast: '播客', other: '其他',
};
/** 体裁动词：状态文案与推荐语共用（书→读、影剧→看…） */
const KIND_VERBS = { book: '读', movie: '看', tv: '看', anime: '看', music: '听', game: '玩', podcast: '听', other: '看' };

const STATUSES = ['wish', 'active', 'done', 'dropped'];
/** 体裁感知的状态文案：想看/在读/听完/弃了 */
const STATUS_BASE = { wish: '想{v}', active: '在{v}', done: '{v}完', dropped: '弃了' };

function statusLabel(kind, status) {
  const verb = KIND_VERBS[kind] || KIND_VERBS.other;
  const tpl = STATUS_BASE[status] || '';
  return tpl.replace('{v}', verb);
}

const DEFAULT_SETTINGS = { schemaVersion: 1 };

const K = {
  workPrefix: 'guanzhi.work.',
  work(id) { return `guanzhi.work.${id}`; },
  settings: 'guanzhi.settings',
};

// ── 日期工具（本地日期语义，UTC 算术防 DST）────────────────────────────────
function todayStr(nowMs) {
  const d = new Date(nowMs == null ? Date.now() : nowMs);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseYMD(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) return null;
  const y = Number(m[1]); const mo = Number(m[2]); const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { y, m: mo, d };
}

/** 天数差 target - base；非法日期返回 null */
function diffDays(base, target) {
  const b = parseYMD(base); const t = parseYMD(target);
  if (!b || !t) return null;
  return Math.round((Date.UTC(t.y, t.m - 1, t.d) - Date.UTC(b.y, b.m - 1, b.d)) / 86400000);
}

function round1(n) {
  return Math.round((Number(n) + Number.EPSILON) * 10) / 10;
}

function genId(nowMs) {
  const n = nowMs == null ? Date.now() : nowMs;
  return `gw_${n.toString(36)}${Math.floor(Math.random() * 1296).toString(36).padStart(2, '0')}`;
}

/** 标题匹配键（upsert 判重用）：移除全部空白 + 小写——「流浪地球 2」与「流浪地球2」同记录 */
function normTitle(t) {
  return String(t == null ? '' : t).replace(/\s+/g, '').toLowerCase();
}

/**
 * 状态-日期语义（新建与状态切换共用，避免两处漂移）：
 *   wish    → 起止日清空（纯心愿）
 *   active  → 清 finishDate（陈旧完成日）；缺 startDate 则记今天
 *   done    → 缺 finishDate 则记今天
 *   dropped → 日期原样保留（弃在哪天弃，含已读进度信息）
 * 返回 { startDate, finishDate }（可能为 null）。
 */
function applyStatusDates(status, startDate, finishDate, today) {
  if (status === 'wish') return { startDate: null, finishDate: null };
  if (status === 'active') return { startDate: startDate || today, finishDate: null };
  if (status === 'done') return { startDate: startDate || null, finishDate: finishDate || today };
  return { startDate: startDate || null, finishDate: finishDate || null };
}

/**
 * 归一化校验（新增/更新/导入共用）。返回 { error } 或 { work }。
 * autoDates=false 时（JSON 批量导入）不做「缺完成日记今天」自动补全——
 * 导入的旧记录没有 finishDate 应保持缺失，而不是被盖成导入当天。
 * 校验：title 非空≤80、kind 必填合法、status 合法（缺省 done）、rating 0-10
 * （≤1 位小数）、日期格式与先后（finish≥start）、year 1900-2100、
 * creator≤60 / genre≤30 / note≤500、link 必须 http(s)、favorite 布尔。
 */
function normalizeWork(raw, nowMs, opts) {
  const now = nowMs == null ? Date.now() : nowMs;
  const autoDates = !(opts && opts.autoDates === false);
  if (!raw || typeof raw !== 'object') return { error: '参数缺失' };
  const title = String(raw.title == null ? '' : raw.title).trim();
  if (!title) return { error: '需要 title（作品名）' };
  if (title.length > 80) return { error: 'title 过长（≤80 字）' };
  const kind = String(raw.kind == null ? '' : raw.kind).trim();
  if (!KINDS.includes(kind)) return { error: `kind 需为 ${KINDS.join('/')}` };
  const status = STATUSES.includes(raw.status) ? raw.status : 'done';

  let rating = null;
  if (raw.rating != null && raw.rating !== '') {
    const r = Number(raw.rating);
    if (!Number.isFinite(r) || r < 0 || r > 10) return { error: 'rating 需为 0-10 的数字' };
    rating = round1(r);
  }

  let startDate = null; let finishDate = null;
  if (raw.startDate != null && raw.startDate !== '') {
    const s = String(raw.startDate).trim();
    if (!parseYMD(s)) return { error: 'startDate 格式应为 YYYY-MM-DD' };
    startDate = s;
  }
  if (raw.finishDate != null && raw.finishDate !== '') {
    const f = String(raw.finishDate).trim();
    if (!parseYMD(f)) return { error: 'finishDate 格式应为 YYYY-MM-DD' };
    finishDate = f;
  }
  const today = todayStr(now);
  if (startDate && finishDate && diffDays(startDate, finishDate) < 0) {
    return { error: 'finishDate 不能早于 startDate' };
  }
  const dated = autoDates ? applyStatusDates(status, startDate, finishDate, today)
    : { startDate: startDate || null, finishDate: finishDate || null };

  let year;
  if (raw.year != null && raw.year !== '') {
    const y = Math.floor(Number(raw.year));
    if (!Number.isFinite(y) || y < 1900 || y > 2100) return { error: 'year 需为 1900-2100 的整数' };
    year = y;
  }
  const creator = String(raw.creator == null ? '' : raw.creator).trim();
  if (creator.length > 60) return { error: 'creator 过长（≤60 字）' };
  const genre = String(raw.genre == null ? '' : raw.genre).trim();
  if (genre.length > 30) return { error: 'genre 过长（≤30 字）' };
  const note = String(raw.note == null ? '' : raw.note).trim();
  if (note.length > 500) return { error: 'note 过长（≤500 字）' };
  const link = String(raw.link == null ? '' : raw.link).trim();
  if (link && !/^https?:\/\//.test(link)) return { error: 'link 需以 http(s):// 开头' };
  if (link.length > 300) return { error: 'link 过长（≤300 字）' };

  const work = {
    id: String(raw.id || genId(now)),
    kind,
    title,
    status,
    createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : now,
    // 显式传入（导入保真）则保留；新建/面板/MCP 路径由 applyPatch 或此处刷成 now
    updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : now,
  };
  if (rating != null) work.rating = rating;
  if (dated.startDate) work.startDate = dated.startDate;
  if (dated.finishDate) work.finishDate = dated.finishDate;
  if (year != null) work.year = year;
  if (creator) work.creator = creator;
  if (genre) work.genre = genre;
  if (link) work.link = link;
  if (note) work.note = note;
  if (raw.favorite === true) work.favorite = true;
  return { work };
}

/** 更新合并：白名单字段补丁，仍走 normalizeWork 全量校验。
 *  status 变化时按 applyStatusDates 语义清理/补齐日期（见该函数注释）。 */
function applyPatch(existing, patch, nowMs, opts) {
  if (!existing || typeof existing !== 'object') return { error: '记录不存在' };
  const merged = { ...existing };
  const keys = ['title', 'kind', 'status', 'rating', 'startDate', 'finishDate', 'year', 'creator', 'genre', 'link', 'note', 'favorite'];
  const statusChanged = patch && patch.status != null && patch.status !== existing.status;
  for (const k of keys) {
    if (patch && patch[k] !== undefined) merged[k] = patch[k];
  }
  if (statusChanged) {
    const today = todayStr(nowMs);
    const dated = applyStatusDates(merged.status, merged.startDate, merged.finishDate, today);
    if (dated.startDate) merged.startDate = dated.startDate; else delete merged.startDate;
    if (dated.finishDate) merged.finishDate = dated.finishDate; else delete merged.finishDate;
  }
  // rating 显式置空 → 移除评分
  if (patch && (patch.rating === null || patch.rating === '')) delete merged.rating;
  if (patch && patch.favorite === false) delete merged.favorite;
  const out = normalizeWork(merged, nowMs, opts);
  if (!out.error && out.work) out.work.updatedAt = nowMs == null ? Date.now() : nowMs;
  return out;
}

// ── 检索 ───────────────────────────────────────────────────────────────────

/** 同体裁同名（压缩空白+忽略大小写）匹配；多条取最近更新的一条 */
function findSameWork(works, kind, title) {
  const key = normTitle(title);
  if (!key) return null;
  let hit = null;
  for (const w of Array.isArray(works) ? works : []) {
    if (!w || typeof w !== 'object') continue;
    if (w.kind === kind && normTitle(w.title) === key) {
      if (!hit || (w.updatedAt || 0) > (hit.updatedAt || 0)) hit = w;
    }
  }
  return hit;
}

/**
 * 检索：query（title/creator/genre/note 子串）+ kind/status/favorite 过滤，
 * 按最近更新排序。limit 缺省 30，上限 200。
 */
function searchWorks(works, opts) {
  const o = opts || {};
  const q = o.query ? String(o.query).trim().toLowerCase() : '';
  let list = (Array.isArray(works) ? works : []).filter((w) => w && typeof w === 'object');
  if (o.kind) list = list.filter((w) => w.kind === o.kind);
  if (o.status) list = list.filter((w) => w.status === o.status);
  if (o.favorite) list = list.filter((w) => w.favorite === true);
  if (o.year != null) list = list.filter((w) => w.year === o.year);
  if (q) {
    list = list.filter((w) => [w.title, w.creator, w.genre, w.note].some((f) => f && String(f).toLowerCase().includes(q)));
  }
  list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const limit = Math.min(200, Math.max(1, Math.floor(Number(o.limit) || 30)));
  return list.slice(0, limit);
}

// ── 聚合 ───────────────────────────────────────────────────────────────────

function avgOf(nums) {
  if (!nums.length) return null;
  return round1(nums.reduce((a, b) => a + b, 0) / nums.length);
}

function ratingBand(r) {
  if (r == null) return '未评';
  if (r >= 9) return '9-10';
  if (r >= 7) return '7-8';
  if (r >= 5) return '5-6';
  return '≤4';
}

const RATING_BANDS = ['9-10', '7-8', '5-6', '≤4', '未评'];

/**
 * 台账透视：进行中（在{v}，按开始日升序=最先开始的在前，提示该收尾了）、
 * 最近完成、心愿清单（按加入时间升序=压得最久的在前）、今年/本月完成数、
 * 评分均值（总体与分体裁）、评分档分布、心头好。
 */
function computeOverview(works, today) {
  const list = (Array.isArray(works) ? works : []).filter((w) => w && typeof w === 'object');
  const byStatus = { wish: 0, active: 0, done: 0, dropped: 0 };
  for (const w of list) if (byStatus[w.status] != null) byStatus[w.status] += 1;

  const activeList = list.filter((w) => w.status === 'active')
    .sort((a, b) => String(a.startDate || '9999').localeCompare(String(b.startDate || '9999')));
  const doneList = list.filter((w) => w.status === 'done')
    .sort((a, b) => String(b.finishDate || '').localeCompare(String(a.finishDate || '')));
  const wishList = list.filter((w) => w.status === 'wish')
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

  const year = today.slice(0, 4);
  const monthKey = today.slice(0, 7);
  const thisYearDone = doneList.filter((w) => (w.finishDate || '').slice(0, 4) === year);
  const thisMonthDone = doneList.filter((w) => (w.finishDate || '').slice(0, 7) === monthKey);

  const rated = list.filter((w) => typeof w.rating === 'number');
  const kindMap = new Map();
  for (const w of rated) {
    const cur = kindMap.get(w.kind) || { kind: w.kind, label: KIND_LABELS[w.kind] || w.kind, count: 0, sum: 0 };
    cur.count += 1; cur.sum += w.rating;
    kindMap.set(w.kind, cur);
  }
  const avgByKind = [...kindMap.values()]
    .map((k) => ({ kind: k.kind, label: k.label, count: k.count, avg: round1(k.sum / k.count) }))
    .sort((a, b) => b.count - a.count);

  const bands = {};
  for (const b of RATING_BANDS) bands[b] = 0;
  for (const w of rated) bands[ratingBand(w.rating)] += 1;

  return {
    today,
    total: list.length,
    byStatus,
    activeList,
    recentDone: doneList.slice(0, 8),
    wishOldest: wishList.slice(0, 5),
    wishCount: byStatus.wish,
    thisYearDone: thisYearDone.length,
    thisMonthDone: thisMonthDone.length,
    ratedCount: rated.length,
    avgRating: avgOf(rated.map((w) => w.rating)),
    avgByKind,
    ratingBands: bands,
    favoriteCount: list.filter((w) => w.favorite === true).length,
  };
}

/**
 * 年度报告（纯派生）：完成数、分体裁（含月度 12 桶）、评分档、十佳
 * （分数 desc → 完成日 desc）、心头好、年度最长短评、心愿跨年遗留数。
 */
function computeYearReport(works, year) {
  const y = String(year);
  const list = (Array.isArray(works) ? works : []).filter((w) => w && typeof w === 'object');
  const doneInYear = list.filter((w) => w.status === 'done' && (w.finishDate || '').slice(0, 4) === y)
    .sort((a, b) => String(b.finishDate || '').localeCompare(String(a.finishDate || '')));
  const rated = doneInYear.filter((w) => typeof w.rating === 'number');

  const kindMap = new Map();
  for (const w of doneInYear) {
    const cur = kindMap.get(w.kind) || { kind: w.kind, label: KIND_LABELS[w.kind] || w.kind, count: 0, sum: 0 };
    cur.count += 1; if (typeof w.rating === 'number') cur.sum += w.rating;
    kindMap.set(w.kind, cur);
  }
  const perKind = [...kindMap.values()]
    .map((k) => ({ kind: k.kind, label: k.label, count: k.count, ratedCount: 0, avg: null }))
    .map((k) => {
      const rs = doneInYear.filter((w) => w.kind === k.kind && typeof w.rating === 'number').map((w) => w.rating);
      k.ratedCount = rs.length;
      k.avg = rs.length ? round1(rs.reduce((a, b) => a + b, 0) / rs.length) : null;
      return k;
    })
    .sort((a, b) => b.count - a.count);

  const monthly = [];
  for (let m = 1; m <= 12; m++) {
    const mk = `${y}-${String(m).padStart(2, '0')}`;
    const inMonth = doneInYear.filter((w) => (w.finishDate || '').slice(0, 7) === mk);
    const rs = inMonth.filter((w) => typeof w.rating === 'number').map((w) => w.rating);
    monthly.push({ month: m, count: inMonth.length, avg: avgOf(rs) });
  }

  const bands = {};
  for (const b of RATING_BANDS) bands[b] = 0;
  for (const w of rated) bands[ratingBand(w.rating)] += 1;

  const top = doneInYear.filter((w) => typeof w.rating === 'number')
    .sort((a, b) => (b.rating - a.rating) || String(b.finishDate || '').localeCompare(String(a.finishDate || '')))
    .slice(0, 10);

  const favorites = doneInYear.filter((w) => w.favorite === true);
  const withNotes = doneInYear.filter((w) => w.note);
  const longestNote = withNotes.length
    ? withNotes.reduce((a, b) => (String(b.note).length > String(a.note).length ? b : a))
    : null;

  const wishCarryover = list.filter((w) => w.status === 'wish' && w.createdAt && new Date(w.createdAt).getFullYear() < Number(y)).length;

  return {
    year: y,
    doneCount: doneInYear.length,
    ratedCount: rated.length,
    avgRating: avgOf(rated.map((w) => w.rating)),
    perKind,
    monthly,
    ratingBands: bands,
    top,
    favorites,
    longestNote: longestNote
      ? { id: longestNote.id, title: longestNote.title, kind: longestNote.kind, rating: longestNote.rating ?? null, note: longestNote.note }
      : null,
    wishCarryover,
  };
}

// ── 推荐（纯函数、逐日确定：同一天重复问结果一致）──────────────────────────
function strHash(s) {
  let h = 5381;
  const str = String(s);
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * 今晚{看/读/玩}什么：从 wish 池与 active 池给确定性推荐。
 * 评分口径（透明可解释）：
 *   基础 = min(心愿躺龄天数/30, 4)（压得越久越该清）
 *   + 指定体裁 +1.5（问"今晚看什么"时优先电影）
 *   + 当日盐 jitter 0-2（strHash(today+id)——逐日轮换、日内稳定）
 * 返回 { continueList: active 按开始日升序（先把开了头的收尾）, picks, taste }。
 */
function recommend(works, today, opts) {
  const o = opts || {};
  const count = Math.min(10, Math.max(1, Math.floor(Number(o.count) || 3)));
  const list = (Array.isArray(works) ? works : []).filter((w) => w && typeof w === 'object');

  const activeList = list.filter((w) => w.status === 'active' && (!o.kind || w.kind === o.kind))
    .sort((a, b) => String(a.startDate || '9999').localeCompare(String(b.startDate || '9999')));
  const continueList = activeList.slice(0, 3).map((w) => ({
    id: w.id, title: w.title, kind: w.kind, startDate: w.startDate || null,
    daysOpen: w.startDate ? diffDays(w.startDate, today) : null,
  }));

  const wishPool = list.filter((w) => w.status === 'wish' && (!o.kind || w.kind === o.kind));
  const picks = wishPool
    .map((w) => {
      const ageDays = diffDays(todayStr(w.createdAt), today);
      const age = Math.max(0, Math.min(4, (ageDays == null ? 0 : ageDays / 30)));
      const kindBonus = o.kind ? 1.5 : 0;
      const jitter = (strHash(`${today}|${w.id}`) % 100) / 50;
      return {
        id: w.id, title: w.title, kind: w.kind, year: w.year ?? null, creator: w.creator || '',
        score: round1(age + kindBonus + jitter),
        wishAgeDays: ageDays,
      };
    })
    .sort((a, b) => b.score - a.score || (b.wishAgeDays || 0) - (a.wishAgeDays || 0))
    .slice(0, count)
    .map((p) => ({
      ...p,
      reason: p.wishAgeDays == null ? '心愿清单'
        : p.wishAgeDays >= 60 ? `压在清单里 ${p.wishAgeDays} 天了，该清了`
          : p.wishAgeDays >= 14 ? `加进清单两周以上（${p.wishAgeDays} 天）`
            : '心愿清单新成员',
    }));

  const rated = list.filter((w) => typeof w.rating === 'number');
  const kindMap = new Map();
  for (const w of rated) {
    const cur = kindMap.get(w.kind) || { kind: w.kind, label: KIND_LABELS[w.kind] || w.kind, sum: 0, count: 0 };
    cur.sum += w.rating; cur.count += 1;
    kindMap.set(w.kind, cur);
  }
  const avgByKind = [...kindMap.values()]
    .map((k) => ({ kind: k.kind, label: k.label, count: k.count, avg: round1(k.sum / k.count) }))
    .sort((a, b) => b.count - a.count);
  const genreMap = new Map();
  for (const w of list.filter((x) => x.status === 'done' && x.genre)) {
    for (const g of String(w.genre).split(/[,，、/|]/).map((s) => s.trim()).filter(Boolean)) {
      genreMap.set(g, (genreMap.get(g) || 0) + 1);
    }
  }
  const topGenres = [...genreMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([genre, count]) => ({ genre, count }));

  return {
    today,
    kind: o.kind || null,
    continueList,
    picks,
    taste: {
      totalDone: list.filter((w) => w.status === 'done').length,
      avgByKind,
      topGenres,
    },
  };
}

// ── 导入导出 ───────────────────────────────────────────────────────────────

/** CSV 导出（带 BOM 便于 Excel 识别 UTF-8；字段全部引号包裹防注入） */
function toCsv(works) {
  const esc = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const head = ['kind', 'title', 'status', 'rating', 'startDate', 'finishDate', 'year', 'creator', 'genre', 'note', 'favorite', 'link', 'createdAt'];
  const lines = [head.map(esc).join(',')];
  for (const w of Array.isArray(works) ? works : []) {
    if (!w || typeof w !== 'object') continue;
    lines.push([
      w.kind, w.title, w.status, w.rating == null ? '' : w.rating,
      w.startDate == null ? '' : w.startDate, w.finishDate == null ? '' : w.finishDate,
      w.year == null ? '' : w.year, w.creator || '', w.genre || '', w.note || '',
      w.favorite === true ? '是' : '', w.link || '',
      w.createdAt ? new Date(w.createdAt).toISOString() : '',
    ].map(esc).join(','));
  }
  return '\ufeff' + lines.join('\r\n');
}

/**
 * 导入判重：同体裁同名，且年份不冲突（年份只在双方都有且不同时区分作品，
 * 如 沙丘1984 与 沙丘2021 是两部；缺年份的一方视为同作）。
 */
function sameImportWork(a, b) {
  if (!a || !b || a.kind !== b.kind) return false;
  if (normTitle(a.title) !== normTitle(b.title)) return false;
  const ya = a.year == null || a.year === '' ? null : Math.floor(Number(a.year));
  const yb = b.year == null || b.year === '' ? null : Math.floor(Number(b.year));
  if (ya != null && yb != null && ya !== yb) return false;
  return true;
}

/**
 * 批量导入归一化（JSON dump / AI 批量入账共用）：
 * 逐条 normalizeWork（autoDates=false：不把缺完成日的旧记录盖成今天），
 * sameImportWork 判重——批内 + 与既有账本（保留已有，不覆盖），上限 500 条。
 * 返回 { accepted, rejected: [{index, error}], duplicates }
 */
function normalizeImport(list, existingWorks) {
  const arr = Array.isArray(list) ? list : [];
  if (arr.length > 500) return { error: '单次导入上限 500 条' };
  const accepted = []; const rejected = [];
  const existing = (Array.isArray(existingWorks) ? existingWorks : [])
    .filter((w) => w && typeof w === 'object');
  let duplicates = 0;
  arr.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object') { rejected.push({ index, error: '条目不是对象' }); return; }
    if (existing.some((w) => sameImportWork(w, raw)) || accepted.some((w) => sameImportWork(w, raw))) {
      duplicates += 1;
      return;
    }
    const norm = normalizeWork(raw, Date.now(), { autoDates: false });
    if (norm.error) { rejected.push({ index, error: norm.error }); return; }
    accepted.push(norm.work);
  });
  return { accepted, rejected, duplicates };
}

// ── 展示口径 ───────────────────────────────────────────────────────────────

/** 一条记录的行文案（MCP 列表 / 面板 tooltip 复用） */
function fmtWorkLine(w, today) {
  const bits = [`[${w.id}] 《${w.title}》`, KIND_LABELS[w.kind] || w.kind, statusLabel(w.kind, w.status)];
  if (typeof w.rating === 'number') bits.push(`${w.rating} 分`);
  if (w.year) bits.push(`${w.year}`);
  if (w.creator) bits.push(w.creator);
  if (w.status === 'done' && w.finishDate) bits.push(w.finishDate);
  else if (w.status === 'active' && w.startDate) {
    const d = diffDays(w.startDate, today);
    bits.push(`开于 ${w.startDate}${d != null && d > 0 ? `（${d} 天前）` : ''}`);
  } else if (w.status === 'wish' && w.createdAt) {
    const d = diffDays(todayStr(w.createdAt), today);
    bits.push(`想${d != null && d > 0 ? `了 ${d} 天` : '于今天'}`);
  }
  if (w.favorite) bits.push('★心头好');
  if (w.note) bits.push(w.note);
  return bits.join(' · ');
}

module.exports = {
  KINDS, KIND_LABELS, KIND_VERBS, STATUSES, STATUS_BASE, statusLabel,
  DEFAULT_SETTINGS, K, RATING_BANDS,
  todayStr, parseYMD, diffDays, round1, genId, normTitle,
  applyStatusDates, normalizeWork, applyPatch,
  findSameWork, searchWorks,
  computeOverview, computeYearReport, recommend,
  toCsv, normalizeImport, fmtWorkLine, ratingBand, strHash,
};
