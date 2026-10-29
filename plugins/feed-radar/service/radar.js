#!/usr/bin/env node
'use strict';
/**
 * radar.js —— RSS 订阅后台服务（零依赖，node >= 18，需全局 fetch）
 *
 * 职责（radar.* 键空间里"状态/文章/正文"的单写权威；feed 定义可由面板/MCP 写）：
 *   - 按间隔抓订阅源：条件请求（ETag / If-Modified-Since，304 零成本回跳）、
 *     同主机礼貌间隔、连续失败指数退避（×2 → 上限 ×4）
 *   - 解析 RSS2 / Atom / RDF → 去重合并进 radar.article.<fid>.<aid>（guid/link 稳定 id）
 *   - 命令信箱（消费即删，面板/MCP → 服务的唯一触发通道）：
 *       radar.cmd.refreshAll.<n>     全源立刷
 *       radar.cmd.refreshFeed.<fid>  单源立刷
 *       radar.cmd.pull.<aid>         拉正文（阅读视图 / AI 读文章）
 *       radar.cmd.forget.<fid>       删源联动清理（feed + 文章 + 正文）
 *       radar.cmd.purge.<n>          清全部文章（保留订阅源）
 *   - 保留策略清扫：天数上限 + 单源条数上限（星标永留）、正文按时数清理、
 *     孤儿正文回收、过期死命令回收（>1h）
 *   - 心跳 radar.meta（60s）供面板展示服务状态
 *
 * 跨域铁律：**全部外网抓取只发生在本进程**（Node 原生 fetch，无同源策略）。
 * 面板与 MCP 永不直接 fetch 外网——单一抓取路径，无第二条写法。
 *
 * 生命周期由宿主 PluginServiceManager 管理（type=http + /__health；
 * 桥不可达时健康端点仍返回 200，避免被误杀重启循环，降级状态见 radar.meta）。
 *
 * 启动参数：node radar.js {{port}} {{appConfigDir}}
 */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const lib = require('./lib');
const feedparse = require('./feedparse');
const extract = require('./extract');
const { createKvClient } = require('./kvclient');

const VERSION = '0.1.0';
const TICK_MS = 8000;
const META_BEAT_MS = 60 * 1000;
const SETTINGS_REREAD_MS = 60 * 1000;
const FEEDS_REREAD_MS = 15 * 1000;
const SWEEP_MS = 15 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15000;
const ARTICLE_TIMEOUT_MS = 20000;
const MAX_FEED_BODY_BYTES = 2 * 1024 * 1024;
const MAX_ARTICLE_BODY_BYTES = 4 * 1024 * 1024;
const HOST_GAP_MS = 10 * 1000;      // 同主机两次抓取最小间隔（计划轮询用）
const FORCED_GAP_MS = 3 * 1000;     // 命令强制刷新的最小间隔（用户明确点了刷新）
const MAX_CMDS_PER_TICK = 30;

const K = {
  feed: (id) => `radar.feed.${id}`,
  feedPrefix: 'radar.feed.',
  article: (fid, aid) => `radar.article.${fid}.${aid}`,
  articlePrefix: 'radar.article.',
  content: (aid) => `radar.content.${aid}`,
  contentPrefix: 'radar.content.',
  settings: 'radar.settings',
  meta: 'radar.meta',
  cmdRefreshAll: (n) => `radar.cmd.refreshAll.${n}`,
  cmdRefreshFeed: (fid) => `radar.cmd.refreshFeed.${fid}`,
  cmdPull: (aid) => `radar.cmd.pull.${aid}`,
  cmdForget: (fid) => `radar.cmd.forget.${fid}`,
  cmdPurge: (n) => `radar.cmd.purge.${n}`,
};

// ── 文件日志（宿主不收集插件服务 stdout，自行落盘）──────────────────────────
let logFile = null;
function initLog(appConfigDir) {
  const dir = appConfigDir || os.tmpdir();
  try {
    fs.mkdirSync(dir, { recursive: true });
    logFile = path.join(dir, 'feed-radar.log');
    try {
      const st = fs.statSync(logFile);
      if (st.size > 512 * 1024) fs.renameSync(logFile, `${logFile}.old`);
    } catch (_) { /* 不存在即首轮 */ }
  } catch (_) { logFile = null; }
}
const DEBUG = process.env.RADAR_DEBUG === '1';
function log(level, msg) {
  const line = `[feed-radar:${level}] ${new Date().toISOString()} ${msg}`;
  if (level === 'debug' && !DEBUG) return;
  process.stderr.write(line + '\n');
  if (logFile) {
    try { fs.appendFileSync(logFile, line + '\n'); } catch (_) { /* 磁盘问题不打断主流程 */ }
  }
}

// ── HTTP 原生抓取（超时 + 流式限长 + 条件请求头）────────────────────────────
async function fetchUrl(url, { timeoutMs, maxBytes, headers } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs || FETCH_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PolarisFeedRadar/0.1; +https://github.com/misxzaiz/Polaris-plugin)',
        'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.9, */*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        ...headers,
      },
    });
  } catch (e) {
    clearTimeout(timer);
    return { ok: false, error: e.name === 'AbortError' ? '抓取超时' : String(e.message || e) };
  }
  clearTimeout(timer);
  if (res.status === 304) {
    res.resume?.();
    return { ok: true, notModified: true, status: 304 };
  }
  if (!res.ok) {
    res.resume?.();
    return { ok: false, error: `HTTP ${res.status}`, status: res.status };
  }
  // undici web ReadableStream：reader 循环，超限 cancel（防超大响应撑爆内存）
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      chunks.push(Buffer.from(value));
      if (size >= maxBytes) { await reader.cancel().catch(() => {}); break; }
    }
  } catch (_) {
    return { ok: false, error: '读取响应失败' };
  }
  return {
    ok: true,
    status: res.status,
    body: Buffer.concat(chunks).toString('utf8'),
    etag: res.headers.get('etag') || '',
    lastModified: res.headers.get('last-modified') || '',
  };
}

// ── 主服务 ─────────────────────────────────────────────────────────────────
/**
 * @param opts {{port?: number, appConfigDir?: string}}
 * 返回 { start, stop, tick, kv, feeds, settings, loadFeeds, fetchFeedOnce,
 *        sweep, forgetFeed, purgeArticles, pullArticleContent, consumeCommands,
 *        healthServer, state }
 */
function createRadar(opts) {
  const port = parseInt(opts && opts.port, 10) || 0;
  const appConfigDir = (opts && opts.appConfigDir) || '';

  const kv = createKvClient({ appConfigDir, log });

  let settings = lib.normalizeSettings(null);
  const feeds = new Map(); // fid → feed def（FEEDS_REREAD_MS 内复用缓存）
  const state = {
    feedsReadAt: 0,
    settingsReadAt: 0,
    hostLastAt: new Map(), // host → ts（礼貌间隔）
    lastSweepAt: 0,
    lastMetaAt: 0,
    startedAt: Date.now(),
    degraded: false,
    lastEndpointRefreshAt: 0,
    lastKeyList: [], // 最近一次 kvKeys 缓存（tick 内多处理器共享）
    lastKeyListAt: 0,
    busy: false, // tick 重入保护（一次只跑一轮）
  };

  /** key 列表（7s 内复用：tick 内的信箱/合并/清扫共用一次 kvKeys） */
  async function keyList(forceTtlMs = 7000) {
    if (Date.now() - state.lastKeyListAt < forceTtlMs && state.lastKeyList.length) return state.lastKeyList;
    state.lastKeyList = await kv.kvKeys();
    state.lastKeyListAt = Date.now();
    return state.lastKeyList;
  }

  /** 抓取前的守卫（enabled 与地址合法性） */
  function feedAllowed(feed) {
    return !!(feed && feed.enabled !== false && lib.isFetchableUrl(feed.url));
  }

  /** 设置重读（60s） */
  async function refreshSettings() {
    if (Date.now() - state.settingsReadAt < SETTINGS_REREAD_MS) return;
    const raw = await kv.kvGet(K.settings).catch(() => null);
    if (raw && typeof raw === 'object') settings = lib.normalizeSettings(raw);
    state.settingsReadAt = Date.now();
  }

  /** feed 定义重读（15s）：面板/MCP 新增/编辑在半个缓存周期内可见 */
  async function loadFeeds(force) {
    if (!force && Date.now() - state.feedsReadAt < FEEDS_REREAD_MS && feeds.size) return;
    const keys = await keyList();
    const feedKeys = keys.filter((k) => k.startsWith(K.feedPrefix));
    const defs = await Promise.all(feedKeys.map(async (k) => {
      const v = await kv.kvGet(k).catch(() => null);
      return v && typeof v === 'object' && v.id ? v : null;
    }));
    feeds.clear();
    for (const f of defs) if (f) feeds.set(f.id, f);
    state.feedsReadAt = Date.now();
    log('debug', `feeds loaded: ${feeds.size}`);
  }

  /** 该 feed 的现有文章 map（aid → article） */
  async function loadFeedArticles(fid) {
    const keys = await keyList();
    const artKeys = keys.filter((k) => k.startsWith(`radar.article.${fid}.`));
    const out = new Map();
    await Promise.all(artKeys.map(async (k) => {
      const v = await kv.kvGet(k).catch(() => null);
      if (v && typeof v === 'object' && typeof v.id === 'string') out.set(v.id, v);
    }));
    return out;
  }

  /** 由于 fetch 的有效间隔：per-feed interval 否则全局 pollMin；连续失败 ×2/×4 退避 */
  function effectiveIntervalMs(feed) {
    const min = feed.intervalMin > 0 ? feed.intervalMin : settings.pollMin;
    const ce = Number(feed.consecutiveErrors) || 0;
    const factor = ce >= 3 ? 4 : ce >= 1 ? 2 : 1;
    return Math.floor(min * 60000 * factor);
  }

  /**
   * 抓一个订阅源：条件请求 → 解析 → 去重合并 → 写文章/feed 状态。
   * forced = true 表示来自命令信箱（礼貌间隔放宽到 3s 且绕过计划间隔）。
   */
  async function fetchFeedOnce(feed, { forced = false } = {}) {
    if (!feedAllowed(feed)) return { skipped: true, why: 'disabled' };
    const host = (() => { try { return new URL(feed.url).host; } catch (_) { return ''; } })();
    const last = state.hostLastAt.get(host) || 0;
    const gap = forced ? FORCED_GAP_MS : HOST_GAP_MS;
    if (Date.now() - last < gap) return { skipped: true, why: 'host-gap' };
    state.hostLastAt.set(host, Date.now());

    const now = Date.now();
    const cond = {};
    if (feed.etag) cond['If-None-Match'] = feed.etag;
    if (feed.lastModified) cond['If-Modified-Since'] = feed.lastModified;

    let res;
    try {
      res = await fetchUrl(feed.url, { timeoutMs: FETCH_TIMEOUT_MS, maxBytes: MAX_FEED_BODY_BYTES, headers: cond });
    } catch (e) {
      res = { ok: false, error: String((e && e.message) || e) };
    }

    // 304：零成本回跳（只 bump 时间戳，不算错误）
    if (res.ok && res.notModified) {
      const upd = { ...feed, lastFetchAt: now, lastStatus: 'ok', lastError: '', consecutiveErrors: 0 };
      feeds.set(feed.id, upd);
      await kv.kvSet(K.feed(feed.id), upd).catch(() => {});
      log('debug', `304 not modified: ${feed.url}`);
      return { ok: true, notModified: true };
    }
    if (!res.ok) {
      const err = res.error || '抓取失败';
      const ce = (Number(feed.consecutiveErrors) || 0) + 1;
      const upd = { ...feed, lastFetchAt: now, lastStatus: 'error', lastError: String(err).slice(0, 160), consecutiveErrors: ce };
      feeds.set(feed.id, upd);
      await kv.kvSet(K.feed(feed.id), upd).catch(() => {});
      log('warn', `feed 抓取失败(${ce}): ${feed.url} — ${err}`);
      return { ok: false };
    }

    const parsed = feedparse.parseFeed(res.body);
    if (!parsed.ok) {
      const ce = (Number(feed.consecutiveErrors) || 0) + 1;
      const upd = { ...feed, lastFetchAt: now, lastStatus: 'error', lastError: parsed.error, consecutiveErrors: ce };
      feeds.set(feed.id, upd);
      await kv.kvSet(K.feed(feed.id), upd).catch(() => {});
      log('warn', `feed 解析失败(${ce}): ${feed.url} — ${parsed.error}`);
      return { ok: false };
    }

    // 合并：读现有 → planMerge → 写新文章 / 回填旧文章
    const existing = await loadFeedArticles(feed.id);
    const plan = lib.planMerge(existing, parsed.items, feed, Date.now(), settings.maxPerFeed);
    for (const a of plan.adds) {
      await kv.kvSet(K.article(feed.id, a.id), a).catch(() => {});
    }
    for (const u of plan.updates) {
      const prev = existing.get(u.id);
      if (prev) await kv.kvSet(K.article(feed.id, u.id), { ...prev, ...u.patch }).catch(() => {});
    }
    // 未读数在手边就能算：现有里 read!=true 的 + 新增（必然未读）
    let unread = 0;
    for (const [, a] of existing) { if (!a.read) unread++; }
    unread += plan.adds.length;
    const upd = {
      ...feed,
      title: feed.title || parsed.title || feed.url,
      siteUrl: feed.siteUrl || parsed.siteUrl || '',
      etag: res.etag || '',
      lastModified: res.lastModified || '',
      lastFetchAt: now,
      lastStatus: 'ok',
      lastError: '',
      consecutiveErrors: 0,
      itemCount: plan.total,
      unreadCount: unread,
      rev: (Number(feed.rev) || 1) + 1,
    };
    feeds.set(feed.id, upd);
    await kv.kvSet(K.feed(feed.id), upd).catch(() => {});
    log('info', `feed ok: "${(upd.title || '').slice(0, 50)}" +${plan.adds.length}（共 ${plan.total}，未读 ${unread}）`);
    return { ok: true, adds: plan.adds.length, total: plan.total };
  }

  /** 单条文章正文拉取（阅读视图 / AI 读文章） */
  async function pullArticleContent(articleIdRaw) {
    const keys = await keyList();
    // 文章键形如 radar.article.<fid>.<aid>——aid 唯一，扫描法定位
    const aid = String(articleIdRaw || '').toLowerCase();
    const k = keys.find((kk) => kk.startsWith('radar.article.') && kk.endsWith('.' + aid));
    if (!k) {
      await kv.kvSet(K.content(aid), { id: aid, ok: false, error: '文章不存在或已被清理', fetchedAt: Date.now() }).catch(() => {});
      return;
    }
    const art = await kv.kvGet(k).catch(() => null);
    if (!art || typeof art !== 'object' || !art.link) {
      await kv.kvSet(K.content(aid), { id: aid, ok: false, error: '文章没有可抓取的链接', fetchedAt: Date.now() }).catch(() => {});
      return;
    }
    if (!lib.isFetchableUrl(art.link)) {
      await kv.kvSet(K.content(aid), { id: aid, ok: false, error: '链接不允许抓取（内网/非 http(s)）', fetchedAt: Date.now() }).catch(() => {});
      return;
    }
    const host = (() => { try { return new URL(art.link).host; } catch (_) { return ''; } })();
    const last = state.hostLastAt.get(host) || 0;
    if (Date.now() - last < HOST_GAP_MS) {
      await kv.kvSet(K.content(aid), { id: aid, ok: false, error: '同主机抓取太频繁，稍后再试', fetchedAt: Date.now() }).catch(() => {});
      return;
    }
    state.hostLastAt.set(host, Date.now());
    const res = await fetchUrl(art.link, { timeoutMs: ARTICLE_TIMEOUT_MS, maxBytes: MAX_ARTICLE_BODY_BYTES });
    if (!res.ok || !res.body) {
      await kv.kvSet(K.content(aid), { id: aid, ok: false, error: res.error || '抓取失败', fetchedAt: Date.now() }).catch(() => {});
      log('debug', `pull 失败: ${art.link} — ${res.error}`);
      return;
    }
    // 链接指向另一订阅源（RSS 全文型 feed 的 guid=link）时如实拒绝
    if (/^\s*<\?xml/i.test(res.body) && /<(rss|rdf)\b/i.test(res.body.slice(0, 200))) {
      await kv.kvSet(K.content(aid), { id: aid, ok: false, error: '链接指向的还是另一个订阅源（不是文章页）', fetchedAt: Date.now() }).catch(() => {});
      return;
    }
    const ex = extract.extractReadable(res.body);
    await kv.kvSet(K.content(aid), ex.ok
      ? { id: aid, ok: true, title: ex.title, text: ex.text.slice(0, lib.TEXT_CAP), fetchedAt: Date.now() }
      : { id: aid, ok: false, error: ex.error, fetchedAt: Date.now() }).catch(() => {});
    log(ex.ok ? 'info' : 'debug', `pull ${ex.ok ? 'ok' : 'fail'}: ${art.link}${ex.ok ? ` → ${ex.text.length} 字` : ` — ${ex.error}`}`);
  }

  /** 删源联动清理（面板/MCP 触发）：feed + 该源全部文章 + 对应正文 */
  async function forgetFeed(fid) {
    const keys = await keyList();
    const articleKeys = keys.filter((k) => k.startsWith(`radar.article.${fid}.`));
    const aids = articleKeys.map((k) => k.split('.').pop());
    for (const k of [`radar.feed.${fid}`, ...articleKeys]) {
      await kv.kvDel(k).catch(() => {});
    }
    for (const aid of aids) {
      await kv.kvDel(K.content(aid)).catch(() => {});
    }
    feeds.delete(fid);
    log('info', `forget feed ${fid}: 删除 ${articleKeys.length} 篇文章`);
  }

  /** 清全部文章（保留订阅源） */
  async function purgeArticles() {
    const keys = await keyList();
    let n = 0;
    for (const k of keys) {
      if (k.startsWith(K.articlePrefix) || k.startsWith(K.contentPrefix)) { await kv.kvDel(k).catch(() => {}); n++; }
    }
    // feed 计数与未读归零（rev 保持 +1，给面板刷文章缓存一个信号）
    for (const [, f] of feeds) {
      if (f.itemCount || f.unreadCount) {
        const upd = { ...f, itemCount: 0, unreadCount: 0, rev: (Number(f.rev) || 1) + 1 };
        feeds.set(f.id, upd);
        await kv.kvSet(K.feed(f.id), upd).catch(() => {});
      }
    }
    log('info', `purge articles: 删除 ${n} 键`);
  }

  // ── 保留策略 + 孤儿回收 ────────────────────────────────────────────────────
  async function sweep() {
    const keys = await keyList();
    const articleKeys = keys.filter((k) => k.startsWith(K.articlePrefix));
    const articles = await Promise.all(articleKeys.map(async (k) => kv.kvGet(k).catch(() => null)));
    const live = articles.filter((a) => a && typeof a === 'object' && a.id && a.feedId)
      .map((a) => ({ ...a, read: !!a.read, star: !!a.star }));
    const knownAids = new Set(live.map((a) => a.id));
    const starByAid = new Map(live.map((a) => [a.id, !!a.star]));

    const delIds = new Set(); // 形如 K:<key>（通用承载：文章键 / 正文键 / 死命令键）
    for (const id of lib.planRetention(live, settings, Date.now())) {
      delIds.add('A:' + id);
    }

    // 正文：文章已删的直接回收（孤儿）；在世文章按 contentKeepHours / 星标放长清理
    const contentKeys = keys.filter((k) => k.startsWith(K.contentPrefix));
    const contents = [];
    for (const k of contentKeys) {
      const v = await kv.kvGet(k).catch(() => null);
      if (!v || typeof v !== 'object' || !v.id) continue;
      contents.push(v);
      if (!knownAids.has(v.id)) {
        delIds.add('K:' + k);
        continue;
      }
      const st = starByAid.get(v.id) === true;
      const limitHours = st ? Math.max(720, settings.contentKeepHours) : settings.contentKeepHours;
      if (v.error || Date.now() - (v.fetchedAt || 0) > limitHours * 3600000) {
        delIds.add('K:' + k);
      }
    }

    // 过期死命令（服务未运行时段堆积的 >1h 命令）
    const now = Date.now();
    for (const k of keys.filter((k2) => k2.startsWith('radar.cmd.'))) {
      const v = await kv.kvGet(k).catch(() => null);
      if (!v || (typeof v === 'object' && Number(v.at) > 0 && now - Number(v.at) > 3600000)) delIds.add('K:' + k);
    }

    // 执行：文章删除联带正文删除
    for (const dk of delIds) {
      if (dk.startsWith('K:')) {
        await kv.kvDel(dk.slice(2)).catch(() => {});
      } else if (dk.startsWith('A:')) {
        const aid = dk.slice(2);
        const k = keys.find((kk) => kk.endsWith('.' + aid) && kk.startsWith(K.articlePrefix));
        if (k) {
          await kv.kvDel(k).catch(() => {});
          await kv.kvDel(K.content(aid)).catch(() => {});
        }
      }
    }
    if (delIds.size) log('info', `清扫 ${delIds.size} 键`);
  }

  // ── 命令信箱（消费即删；一次 tick 上限 MAX_CMDS_PER_TICK 防雪崩）────────────
  async function consumeCommands(keyListNow) {
    const cmdKeys = keyListNow.filter((k) => k.startsWith('radar.cmd.')).slice(0, MAX_CMDS_PER_TICK);
    const actions = [];
    for (const k of cmdKeys) {
      const v = await kv.kvGet(k).catch(() => null);
      await kv.kvDel(k).catch(() => {});
      if (v && typeof v === 'object') actions.push({ k, v });
    }
    return actions;
  }

  // ── tick 主流程 ───────────────────────────────────────────────────────────
  async function tick() {
    if (state.busy) return; // 重入保护：上一轮没跑完就跳过（不用超时掩盖，标识自然收敛）
    state.busy = true;
    try {
      await refreshSettings();
      await loadFeeds();
      const keys = await keyList();

      // 1. 命令信箱
      const actions = await consumeCommands(keys);
      const forcedFeedIds = new Set();
      const pullIds = [];
      const forgetIds = [];
      let needPurge = false;
      for (const { k } of actions) {
        if (k.startsWith('radar.cmd.refreshAll.')) {
          for (const [, f] of feeds) if (feedAllowed(f)) { f.lastFetchAt = 0; forcedFeedIds.add(f.id); }
        } else if (k.startsWith('radar.cmd.refreshFeed.')) {
          const fid = k.slice('radar.cmd.refreshFeed.'.length);
          const f = feeds.get(fid);
          if (f && feedAllowed(f)) { f.lastFetchAt = 0; forcedFeedIds.add(fid); }
        } else if (k.startsWith('radar.cmd.pull.')) {
          pullIds.push(k.slice('radar.cmd.pull.'.length));
        } else if (k.startsWith('radar.cmd.forget.')) {
          forgetIds.push(k.slice('radar.cmd.forget.'.length));
        } else if (k.startsWith('radar.cmd.purge.')) {
          needPurge = true;
        }
      }
      for (const fid of forgetIds) await forgetFeed(fid);
      if (needPurge) await purgeArticles();

      // 2. 计划轮询：优先"到期最早"的源，一次 tick 抓一条（并发恒 1，礼貌抓取）
      const now = Date.now();
      const due = [];
      for (const [, f] of feeds) {
        if (!feedAllowed(f)) continue;
        const interval = forcedFeedIds.has(f.id) ? 0 : effectiveIntervalMs(f);
        if (f.lastFetchAt > 0 && now - f.lastFetchAt < interval) continue;
        due.push(f);
      }
      due.sort((a, b) => (a.lastFetchAt || 0) - (b.lastFetchAt || 0));
      for (const f of due) {
        const r = await fetchFeedOnce(f, { forced: forcedFeedIds.has(f.id) });
        if (!r.skipped) break; // 本 tick 已完成一次真实抓取（礼貌并发 1）
      }

      // 3. 正文拉取（每 tick 最多 2 条；阅读/AI 按需触发，不积压）
      for (const aid of pullIds.slice(0, 2)) await pullArticleContent(aid);

      // 4. 保留策略 + 孤儿回收
      if (Date.now() - state.lastSweepAt > SWEEP_MS) {
        state.lastSweepAt = Date.now();
        await sweep();
      }

      // 5. 心跳
      if (Date.now() - state.lastMetaAt > META_BEAT_MS) {
        state.lastMetaAt = Date.now();
        let unreadSum = 0;
        for (const [, f] of feeds) unreadSum += Number(f.unreadCount) || 0;
        await kv.kvSet(K.meta, {
          version: VERSION,
          pid: process.pid,
          startedAt: state.startedAt,
          lastTickAt: Date.now(),
          bridge: (() => { const ep = kv.endpoint(); return ep ? `${ep.host}:${ep.port}` : ''; })(),
          feeds: feeds.size,
          enabledFeeds: [...feeds.values()].filter((f) => f.enabled !== false).length,
          unreadSum,
          settings: { pollMin: settings.pollMin, retentionDays: settings.retentionDays, maxPerFeed: settings.maxPerFeed },
        }).catch(() => {});
      }

      if (state.degraded) {
        state.degraded = false;
        log('info', 'bridge 已恢复');
      }
    } catch (e) {
      const wasDown = state.degraded;
      state.degraded = true;
      log('warn', `tick 降级: ${e.message}`);
      if (!wasDown || Date.now() - state.lastEndpointRefreshAt > 60 * 1000) {
        if (!wasDown) log('info', 'bridge 不可达，进入降级（健康端点保持 200）');
        state.lastEndpointRefreshAt = Date.now();
        kv.refreshEndpoint(true).catch(() => {});
      }
    } finally {
      state.busy = false;
    }
  }

  let loopTimer = null;
  const healthServer = http.createServer((req, res) => {
    if (req.url === '/__health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true, version: VERSION, degraded: state.degraded,
        uptimeSec: Math.floor((Date.now() - state.startedAt) / 1000),
        feeds: feeds.size,
      }));
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'not found' }));
  });

  let started = false;
  function start() {
    if (started) return;
    started = true;
    state.startedAt = Date.now();
    log('info', `radar service v${VERSION} start (pid=${process.pid}, health=${port || '(unbound)'})`);
    const run = () => { tick().catch((e) => log('error', `tick 异常: ${e.stack || e.message}`)); };
    run();
    loopTimer = setInterval(run, TICK_MS);
  }
  function stop() {
    if (loopTimer) clearInterval(loopTimer);
    loopTimer = null;
    started = false;
  }

  return {
    kv, tick, start, stop, loadFeeds, refreshSettings, fetchFeedOnce, sweep,
    forgetFeed, purgeArticles, pullArticleContent, consumeCommands,
    healthServer, state,
    get settings() { return settings; },
    get feeds() { return feeds; },
  };
}

// ── CLI ────────────────────────────────────────────────────────────────────
if (require.main === module) {
  const cliPort = parseInt(process.argv[2], 10) || 0;
  const cliAppConfigDir = process.argv[3] || '';
  initLog(cliAppConfigDir);
  const app = createRadar({ port: cliPort, appConfigDir: cliAppConfigDir });
  if (cliPort > 0) {
    app.healthServer.listen(cliPort, '127.0.0.1', () => log('info', `health endpoint on 127.0.0.1:${cliPort}`));
    app.healthServer.on('error', (e) => log('error', `health endpoint: ${e.message}`));
  }
  app.start();
  process.on('uncaughtException', (e) => log('error', `uncaught: ${e.stack || e.message}`));
  process.on('SIGTERM', () => { try { app.healthServer.close(); } catch (_) { /* ignore */ } process.exit(0); });
  process.on('SIGINT', () => { try { app.healthServer.close(); } catch (_) { /* ignore */ } process.exit(0); });
}

module.exports = { createRadar, K };
