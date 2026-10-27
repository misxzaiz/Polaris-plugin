#!/usr/bin/env node
'use strict';
/**
 * amber.js —— 琥珀后台服务（零依赖，node >= 18，需全局 fetch）
 *
 * 职责（amber.* 键空间里"条目/正文/检索结果"的单写权威；条目的用户状态
 * 与 pending 登记可由面板/MCP 写）：
 *   - 命令信箱（消费即删，面板/MCP → 服务的唯一触发通道）：
 *       amber.cmd.amberize.<n>  封存 URL（幂等：同 URL 同 id，重复=层积重封）
 *       amber.cmd.refresh.<id>  重封存指定条目（更新正文快照）
 *       amber.cmd.forget.<id>   删条目联动清理（item + body + 该条全部摘录）
 *       amber.cmd.purge.<n>     清空全部（保留设置）
 *       amber.cmd.search.<n>    全文检索 → 结果槽 amber.search.<n>（调用方读后删）
 *   - 封存流水线：SSRF 守卫 → 原生 fetch（20s 超时/4MB 上限/浏览器 UA）→
 *     字符集解码（BOM/头/meta）→ 打分容器抽取 → Markdown-lite 正文落 kv。
 *     **失败不动旧正文**（旧快照仍是遗产），只置 status=error 供重试。
 *   - 礼貌策略：同主机 5s 间隔；一次 tick 最多封 3 条。
 *   - 清扫：**默认永不清理**（收藏库语义）；设置开启后按 keepDays/maxItems，
 *     星标永豁免；>1h 死命令/检索槽回收。
 *   - 心跳 amber.meta（60s）供面板展示服务状态。
 *
 * 跨域铁律：**全部外网抓取只发生在本进程**（Node 原生 fetch，无同源策略）。
 * 面板与 MCP 永不直接 fetch 外网——单一抓取路径，无第二条写法。
 *
 * 生命周期由宿主 PluginServiceManager 管理（type=http + /__health；
 * 桥不可达时健康端点仍返回 200，避免被误杀重启循环，降级状态见 amber.meta）。
 *
 * 启动参数：node amber.js {{port}} {{appConfigDir}}
 */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const lib = require('./lib');
const charset = require('./charset');
const extract = require('./extract');
const searcher = require('./searcher');
const { createKvClient } = require('./kvclient');

const VERSION = '0.1.0';
const TICK_MS = 8000;
const META_BEAT_MS = 60 * 1000;
const SETTINGS_REREAD_MS = 60 * 1000;
const ITEMS_REREAD_MS = 15 * 1000;
const SWEEP_MS = 15 * 60 * 1000;
const FETCH_TIMEOUT_MS = 20000;
const MAX_BODY_BYTES = 4 * 1024 * 1024;
const HOST_GAP_MS = 5 * 1000;       // 同主机两次封存最小间隔
const MAX_CMDS_PER_TICK = 30;
const MAX_SEALS_PER_TICK = 3;       // 一次 tick 最多封几条（礼貌并发 1 串行）
const STALE_SLOT_MS = 60 * 60 * 1000; // 死命令/检索槽回收时限

const K = {
  item: (id) => `amber.item.${id}`,
  itemPrefix: 'amber.item.',
  body: (id) => `amber.body.${id}`,
  bodyPrefix: 'amber.body.',
  quotePrefix: 'amber.quote.',
  settings: 'amber.settings',
  meta: 'amber.meta',
  cmdAmberize: (n) => `amber.cmd.amberize.${n}`,
  cmdRefresh: (id) => `amber.cmd.refresh.${id}`,
  cmdForget: (id) => `amber.cmd.forget.${id}`,
  cmdPurge: (n) => `amber.cmd.purge.${n}`,
  cmdSearch: (n) => `amber.cmd.search.${n}`,
  search: (n) => `amber.search.${n}`,
  cmdPrefix: 'amber.cmd.',
};

// ── 文件日志（宿主不收集插件服务 stdout，自行落盘）──────────────────────────
let logFile = null;
function initLog(appConfigDir) {
  const dir = appConfigDir || os.tmpdir();
  try {
    fs.mkdirSync(dir, { recursive: true });
    logFile = path.join(dir, 'amber.log');
    try {
      const st = fs.statSync(logFile);
      if (st.size > 512 * 1024) fs.renameSync(logFile, `${logFile}.old`);
    } catch (_) { /* 不存在即首轮 */ }
  } catch (_) { logFile = null; }
}
const DEBUG = process.env.AMBER_DEBUG === '1';
function log(level, msg) {
  const line = `[amber:${level}] ${new Date().toISOString()} ${msg}`;
  if (level === 'debug' && !DEBUG) return;
  process.stderr.write(line + '\n');
  if (logFile) {
    try { fs.appendFileSync(logFile, line + '\n'); } catch (_) { /* 磁盘问题不打断主流程 */ }
  }
}

// ── HTTP 原生抓取（超时 + 流式限长；保留 Buffer 供字符集探测）────────────────
async function fetchUrl(url, { timeoutMs, maxBytes, headers } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs || FETCH_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        // 收藏场景要拿完整文章页，用真实浏览器 UA（部分站点对机器人 UA 返回降级页）
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        ...headers,
      },
    });
  } catch (e) {
    clearTimeout(timer);
    return { ok: false, error: e.name === 'AbortError' ? '抓取超时' : String(e.message || e) };
  }
  clearTimeout(timer);
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
    buffer: Buffer.concat(chunks),
    contentType: res.headers.get('content-type') || '',
  };
}

// ── 主服务 ─────────────────────────────────────────────────────────────────
/**
 * @param opts {{port?: number, appConfigDir?: string}}
 */
function createAmber(opts) {
  const port = parseInt(opts && opts.port, 10) || 0;
  const appConfigDir = (opts && opts.appConfigDir) || '';

  const kv = createKvClient({ appConfigDir, log });

  let settings = lib.normalizeSettings(null);
  const items = new Map(); // id → item（ITEMS_REREAD_MS 内复用缓存）
  const state = {
    settingsReadAt: 0,
    itemsReadAt: 0,
    hostLastAt: new Map(), // host → ts（礼貌间隔）
    lastSweepAt: 0,
    lastMetaAt: 0,
    startedAt: Date.now(),
    degraded: false,
    lastEndpointRefreshAt: 0,
    lastKeyList: [],
    lastKeyListAt: 0,
    busy: false,
  };

  async function keyList(forceTtlMs = 7000) {
    if (Date.now() - state.lastKeyListAt < forceTtlMs && state.lastKeyList.length) return state.lastKeyList;
    state.lastKeyList = await kv.kvKeys();
    state.lastKeyListAt = Date.now();
    return state.lastKeyList;
  }

  async function refreshSettings() {
    if (Date.now() - state.settingsReadAt < SETTINGS_REREAD_MS) return;
    const raw = await kv.kvGet(K.settings).catch(() => null);
    if (raw && typeof raw === 'object') settings = lib.normalizeSettings(raw);
    state.settingsReadAt = Date.now();
  }

  /** 条目重读（15s）：面板/MCP 的 pending 登记与状态修改半个缓存周期内可见 */
  async function loadItems(force) {
    if (!force && Date.now() - state.itemsReadAt < ITEMS_REREAD_MS && items.size) return;
    const keys = await keyList();
    const itemKeys = keys.filter((k) => k.startsWith(K.itemPrefix));
    const defs = await Promise.all(itemKeys.map(async (k) => {
      const v = await kv.kvGet(k).catch(() => null);
      return v && typeof v === 'object' && v.id ? v : null;
    }));
    items.clear();
    for (const it of defs) if (it) items.set(it.id, it);
    state.itemsReadAt = Date.now();
    log('debug', `items loaded: ${items.size}`);
  }

  /**
   * 封存一条 URL：抓取 → 解码 → 抽取 → 落 body + item。
   * 成功才写 body（旧快照永不因失败被摧毁）；成功与否都回写 item 状态。
   */
  async function sealUrl(rawUrl, { tags } = {}) {
    const n = lib.normalizeUrl(rawUrl);
    if (n.error) return { ok: false, error: n.error };
    const url = n.url;
    if (!lib.isFetchableUrl(url)) return { ok: false, error: '仅支持公网 http(s) 地址（内网/环回不允许）' };
    const id = lib.itemIdFor(url);
    const host = lib.safeHost(url);
    const last = state.hostLastAt.get(host) || 0;
    if (Date.now() - last < HOST_GAP_MS) return { ok: false, retryable: true, error: '同主机抓取太频繁，稍后自动重试' };
    state.hostLastAt.set(host, Date.now());

    const prev = await kv.kvGet(K.item(id)).catch(() => null);
    const base = lib.normalizeItem({ url, tags, id }, prev && typeof prev === 'object' ? prev : null);
    if (base.error) return { ok: false, error: base.error };

    const res = await fetchUrl(url, { timeoutMs: FETCH_TIMEOUT_MS, maxBytes: MAX_BODY_BYTES });
    if (!res.ok || !res.buffer || !res.buffer.length) {
      const item = lib.applySealResult(base.item, { ok: false, error: res.error || '抓取失败' }, Date.now());
      await kv.kvSet(K.item(id), item).catch(() => {});
      log('warn', `封存失败: ${url} — ${item.error}`);
      return { ok: false, error: item.error, id };
    }

    // 订阅源误当文章页：如实拒绝（feed-radar 同款判定）
    const headText = res.buffer.subarray(0, 512).toString('latin1');
    if (/^\s*<\?xml/i.test(headText) && /<(rss|rdf)\b/i.test(headText)) {
      const item = lib.applySealResult(base.item, { ok: false, error: '链接是 RSS/Atom 订阅源，不是文章页（请用订阅雷达）' }, Date.now());
      await kv.kvSet(K.item(id), item).catch(() => {});
      return { ok: false, error: item.error, id };
    }

    const decoded = charset.decodeBuffer(res.buffer, res.contentType);
    const ctype = (res.contentType || '').toLowerCase();
    if (!/html|xml|text|empty/.test(ctype) && !/^\s*<(!doctype|html)/i.test(decoded.text.slice(0, 200))) {
      const item = lib.applySealResult(base.item, { ok: false, error: `非文章页（Content-Type: ${res.contentType || '未知'}）` }, Date.now());
      await kv.kvSet(K.item(id), item).catch(() => {});
      return { ok: false, error: item.error, id };
    }

    const ex = extract.extractArticle(decoded.text);
    if (!ex.ok) {
      const item = lib.applySealResult(base.item, ex, Date.now());
      await kv.kvSet(K.item(id), item).catch(() => {});
      log('debug', `抽取失败: ${url} — ${ex.error}`);
      return { ok: false, error: ex.error, id };
    }

    const now = Date.now();
    const item = lib.applySealResult(base.item, ex, now);
    const body = {
      id,
      ok: true,
      title: ex.title,
      text: ex.text,
      charset: decoded.charset,
      bytes: res.buffer.length,
      sealNo: item.sealCount,
      fetchedAt: now,
    };
    await kv.kvSet(K.item(id), item).catch(() => {});
    await kv.kvSet(K.body(id), body).catch(() => {});
    items.set(id, item);
    log('info', `封存 #${item.sealCount}: "${(item.title || '').slice(0, 50)}" ${ex.wordCount} 字（${decoded.charset}，${Math.round(res.buffer.length / 1024)}KB）← ${url}`);
    return { ok: true, id, item };
  }

  /** 重封存指定条目（更新快照） */
  async function refreshItem(id) {
    const it = await kv.kvGet(K.item(id)).catch(() => null);
    if (!it || typeof it !== 'object' || !it.url) return { ok: false, error: `条目不存在：${id}` };
    return sealUrl(it.url, {});
  }

  /** 删条目联动清理：item + body + 该条全部摘录 */
  async function forgetItem(id) {
    const keys = await keyList(true);
    let quotes = 0;
    for (const k of keys.filter((k2) => k2.startsWith(K.quotePrefix))) {
      const v = await kv.kvGet(k).catch(() => null);
      if (v && typeof v === 'object' && v.itemId === id) {
        await kv.kvDel(k).catch(() => {});
        quotes++;
      }
    }
    await Promise.all([kv.kvDel(K.item(id)), kv.kvDel(K.body(id))].map((p) => p.catch(() => {})));
    items.delete(id);
    log('info', `forget ${id}: 摘录 ${quotes} 条一并清理`);
    return { quotes };
  }

  /** 清空全部条目/正文/摘录（保留设置） */
  async function purgeAll() {
    const keys = await keyList(true);
    let n = 0;
    for (const k of keys) {
      if (k.startsWith(K.itemPrefix) || k.startsWith(K.bodyPrefix) || k.startsWith(K.quotePrefix)) {
        await kv.kvDel(k).catch(() => {});
        n++;
      }
    }
    items.clear();
    log('info', `purge: 删除 ${n} 键`);
  }

  // ── 检索（服务端执行：需要全部正文）─────────────────────────────────────
  async function runSearch(q, limit, nonceKey) {
    const keys = await keyList(true);
    const bodyKeys = keys.filter((k) => k.startsWith(K.bodyPrefix));
    const docs = [];
    const itemCache = new Map();
    for (const k of bodyKeys) {
      const b = await kv.kvGet(k).catch(() => null);
      if (!b || typeof b !== 'object' || !b.ok || !b.text) continue;
      let it = items.get(b.id);
      if (!it) {
        it = itemCache.get(b.id) || await kv.kvGet(K.item(b.id)).catch(() => null);
        if (it && typeof it === 'object') itemCache.set(b.id, it);
      }
      docs.push(searcher.buildDoc(b.id, {
        title: (it && it.title) || b.title || '',
        excerpt: (it && it.excerpt) || '',
        text: b.text,
      }));
    }
    const hits = searcher.search(docs, q, { limit });
    const hostMap = new Map(docs.map((d) => [d.id, '']));
    for (const [id2] of hostMap) {
      const it = items.get(id2) || itemCache.get(id2);
      if (it) hostMap.set(id2, it.host || '');
    }
    const result = {
      q,
      total: docs.length,
      hits: hits.map((h) => ({
        id: h.id,
        title: (items.get(h.id) || itemCache.get(h.id) || {}).title || h.id,
        host: hostMap.get(h.id) || '',
        score: h.score,
        snippet: h.snippet,
      })),
      doneAt: Date.now(),
    };
    await kv.kvSet(K.search(nonceKey), result).catch(() => {});
    log('info', `检索 "${q}"：命中 ${result.hits.length}/${docs.length} 篇`);
  }

  // ── 清扫 ────────────────────────────────────────────────────────────────
  async function sweep() {
    const keys = await keyList();
    const live = [...items.values()];
    const delIds = lib.planSweep(live, settings, Date.now());
    let n = 0;
    for (const id of delIds) {
      await forgetItem(id).catch(() => {});
      n++;
    }
    // 死命令 / 过期检索槽（服务未运行时段堆积的 >1h 键）
    const now = Date.now();
    for (const k of keys.filter((k2) => k2.startsWith(K.cmdPrefix) || /^amber\.search\./.test(k2))) {
      const v = await kv.kvGet(k).catch(() => null);
      if (!v || (typeof v === 'object' && Number(v.at || v.doneAt) > 0 && now - Number(v.at || v.doneAt) > STALE_SLOT_MS)) {
        await kv.kvDel(k).catch(() => {});
        n++;
      }
    }
    if (n) log('info', `清扫 ${n} 键`);
  }

  // ── 命令信箱（消费即删；一次 tick 上限 MAX_CMDS_PER_TICK）─────────────────
  async function consumeCommands(keyListNow) {
    const cmdKeys = keyListNow.filter((k) => k.startsWith(K.cmdPrefix)).slice(0, MAX_CMDS_PER_TICK);
    const actions = [];
    for (const k of cmdKeys) {
      const v = await kv.kvGet(k).catch(() => null);
      await kv.kvDel(k).catch(() => {});
      if (v && typeof v === 'object') actions.push({ k, v });
    }
    return actions;
  }

  // ── tick 主流程 ─────────────────────────────────────────────────────────
  async function tick() {
    if (state.busy) return; // 重入保护：上一轮没跑完就跳过（不用超时掩盖）
    state.busy = true;
    try {
      await refreshSettings();
      await loadItems();
      const keys = await keyList();

      // 1. 命令信箱
      const actions = await consumeCommands(keys);
      let sealed = 0;
      for (const { k, v } of actions) {
        if (k.startsWith('amber.cmd.amberize.')) {
          if (sealed >= MAX_SEALS_PER_TICK) { await kv.kvSet(k, v).catch(() => {}); continue; } // 放回信箱下轮再消费
          const r = await sealUrl(v.url, { tags: v.tags });
          if (r.ok) sealed++;
        } else if (k.startsWith('amber.cmd.refresh.')) {
          if (sealed < MAX_SEALS_PER_TICK) {
            const r = await refreshItem(k.slice('amber.cmd.refresh.'.length));
            if (r.ok) sealed++;
          } else {
            await kv.kvSet(k, v).catch(() => {});
          }
        } else if (k.startsWith('amber.cmd.forget.')) {
          await forgetItem(k.slice('amber.cmd.forget.'.length));
        } else if (k.startsWith('amber.cmd.purge.')) {
          await purgeAll();
        } else if (k.startsWith('amber.cmd.search.')) {
          const n = k.slice('amber.cmd.search.'.length);
          await runSearch(String(v.q || ''), Number(v.limit) || 10, n).catch((e) => {
            log('warn', `检索失败: ${e.message}`);
            kv.kvSet(K.search(n), { q: String(v.q || ''), error: String(e.message || e), doneAt: Date.now() }).catch(() => {});
          });
        }
      }

      // 2. 清扫（默认关）
      if (Date.now() - state.lastSweepAt > SWEEP_MS) {
        state.lastSweepAt = Date.now();
        await sweep();
      }

      // 3. 心跳
      if (Date.now() - state.lastMetaAt > META_BEAT_MS) {
        state.lastMetaAt = Date.now();
        const arr = [...items.values()];
        const keysNow = await keyList();
        await kv.kvSet(K.meta, {
          version: VERSION,
          pid: process.pid,
          startedAt: state.startedAt,
          lastTickAt: Date.now(),
          bridge: (() => { const ep = kv.endpoint(); return ep ? `${ep.host}:${ep.port}` : ''; })(),
          items: arr.length,
          pending: arr.filter((x) => x.status === 'pending').length,
          errors: arr.filter((x) => x.status === 'error').length,
          unread: arr.filter((x) => !x.read).length,
          starred: arr.filter((x) => x.star).length,
          quotes: keysNow.filter((k) => k.startsWith(K.quotePrefix)).length,
          settings: { sweepEnabled: settings.sweepEnabled, keepDays: settings.keepDays, maxItems: settings.maxItems },
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
        items: items.size,
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
    log('info', `amber service v${VERSION} start (pid=${process.pid}, health=${port || '(unbound)'})`);
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
    kv, tick, start, stop, sealUrl, refreshItem, forgetItem, purgeAll, runSearch,
    sweep, consumeCommands, healthServer, state,
    get settings() { return settings; },
    get items() { return items; },
  };
}

// ── CLI ────────────────────────────────────────────────────────────────────
if (require.main === module) {
  const cliPort = parseInt(process.argv[2], 10) || 0;
  const cliAppConfigDir = process.argv[3] || '';
  initLog(cliAppConfigDir);
  const app = createAmber({ port: cliPort, appConfigDir: cliAppConfigDir });
  if (cliPort > 0) {
    app.healthServer.listen(cliPort, '127.0.0.1', () => log('info', `health endpoint on 127.0.0.1:${cliPort}`));
    app.healthServer.on('error', (e) => log('error', `health endpoint: ${e.message}`));
  }
  app.start();
  process.on('uncaughtException', (e) => log('error', `uncaught: ${e.stack || e.message}`));
  process.on('SIGTERM', () => { try { app.healthServer.close(); } catch (_) { /* ignore */ } process.exit(0); });
  process.on('SIGINT', () => { try { app.healthServer.close(); } catch (_) { /* ignore */ } process.exit(0); });
}

module.exports = { createAmber, K };
