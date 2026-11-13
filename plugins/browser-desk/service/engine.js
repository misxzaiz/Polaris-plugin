'use strict';
/**
 * engine.js —— browser-desk 浏览器引擎核（纯逻辑，注入 puppeteer 依赖以便测试）
 *
 * 职责：
 *   - Chrome 生命周期（launch/断连自愈/退出）
 *   - 多标签管理：tab 池、newWindow 开新窗口、激活/关闭
 *   - agentKey 绑定表（TTL 解绑，对齐宿主 browser_acquire 语义）
 *   - 页面事件环（console/network/dialog/download/navigation/error，每 tab 200 条）
 *   - 等待器（desk_wait：selector/urlPattern/downloadComplete/dialog）
 *   - 操作面：navigate/search/read/click/fill/pressKey/scroll/find/screenshot/evaluate/history
 *
 * 依赖注入：puppeteer 由外部传入（测试可注入 stub），fs/path 等仅用 node 内置。
 */
const {
  AGENT_BIND_TTL_MS,
  EVENT_RING_CAPACITY,
  DEFAULT_WAIT_TIMEOUT_MS,
  SCREENSHOT_DEFAULTS,
  WATCH_LONGPOLL_MS,
  looksLikeUrl,
  normalizeUrl,
  buildSearchUrl,
} = require('../shared/core');

/** Chrome 可执行文件定位顺序 */
function findChromePath(extraEnv) {
  const candidates = [
    extraEnv,
    process.env.BROWSER_DESK_CHROME,
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env['ProgramFiles(x86)']
      ? `${process.env['ProgramFiles(x86)']}\\Google\\Chrome\\Application\\chrome.exe`
      : '',
    process.env.LOCALAPPDATA
      ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`
      : '',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean);
  for (const p of candidates) {
    try {
      if (require('fs').existsSync(p)) return p;
    } catch (_) { /* ignore */ }
  }
  return null;
}

let seq = 0;
function nextSeq() {
  seq += 1;
  return seq;
}

/**
 * 创建引擎实例。
 * @param {object} opts
 * @param {Function} opts.loadPuppeteer  异步返回 puppeteer-core 模块（可注入 stub）
 * @param {object} [opts.log]            日志器 {info,warn,error,debug}
 */
function createEngine({ loadPuppeteer, log }) {
  const logger = log || { info() {}, warn() {}, error() {}, debug() {} };

  /** @type {import('puppeteer-core').Browser|null} */
  let browser = null;
  let chromePath = null;
  let startingPromise = null;
  let closing = false;

  /** tab 池：tabId → 记录 */
  const tabs = new Map();
  /** agentKey → tabId 绑定表 */
  const agentBinds = new Map(); // agentKey -> { tabId, lastUsedAt }
  /** 每 tab 事件环：tabId → array（定长） */
  const eventRings = new Map();
  /** 每 tab 等待器：tabId → [{id, test, resolve, timer}] */
  const waiters = new Map();
  /** 每 tab 操作互斥队列 */
  const tabLocks = new Map();
  /** 下载跟踪：guid → {url, filename, state, receivedBytes, totalBytes, tabId} */
  const downloads = new Map();

  // ── 工具 ────────────────────────────────────────────────────────────────
  let clockOffset = 0;
  function now() { return Date.now() + clockOffset; }

  function ringFor(tabId) {
    let r = eventRings.get(tabId);
    if (!r) { r = []; eventRings.set(tabId, r); }
    return r;
  }

  function pushEvent(tabId, kind, data) {
    const ring = ringFor(tabId);
    const item = { seq: nextSeq(), ts: now(), kind, ...data };
    ring.push(item);
    if (ring.length > EVENT_RING_CAPACITY) ring.splice(0, ring.length - EVENT_RING_CAPACITY);
    // 唤醒等待器
    const ws = waiters.get(tabId);
    if (ws && ws.length) {
      const remaining = [];
      for (const w of ws) {
        try {
          if (w.test(item)) { clearTimeout(w.timer); w.resolve(item); }
          else remaining.push(w);
        } catch (_) { remaining.push(w); }
      }
      waiters.set(tabId, remaining);
    }
    return item;
  }

  /** 同一 tab 的操作串行化（CDP 并发调用同页易错） */
  function withTabLock(tabId, fn) {
    const prev = tabLocks.get(tabId) || Promise.resolve();
    const next = prev.then(fn, fn);
    tabLocks.set(tabId, next.catch(() => {}));
    return next;
  }

  function touchAgent(agentKey, tabId) {
    if (!agentKey) return;
    agentBinds.set(agentKey, { tabId, lastUsedAt: now() });
  }

  function pruneAgentBinds() {
    const cutoff = now() - AGENT_BIND_TTL_MS;
    for (const [k, v] of agentBinds) {
      if (v.lastUsedAt < cutoff) {
        agentBinds.delete(k);
        logger.debug(`agentKey 绑定过期解绑: ${k}`);
      }
    }
  }

  // ── Chrome 启动与自愈 ──────────────────────────────────────────────────
  async function ensureBrowser() {
    if (browser && browser.connected) return browser;
    if (startingPromise) return startingPromise;
    startingPromise = (async () => {
      const puppeteer = await loadPuppeteer();
      if (!chromePath) {
        chromePath = findChromePath();
        if (!chromePath) {
          throw new Error('未找到 Chrome/Edge：请设置 BROWSER_DESK_CHROME 环境变量指向 chrome.exe');
        }
      }
      logger.info(`launch Chrome: ${chromePath}`);
      browser = await puppeteer.launch({
        executablePath: chromePath,
        headless: false,
        defaultViewport: null, // 跟随窗口大小（spec §2 裁定：网页开独立 Chrome 窗口）
        protocolTimeout: 0,
        args: [
          '--disable-renderer-backgrounding',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--restore-last-session=false',
        ],
      });
      browser.on('disconnected', () => {
        logger.warn('Chrome 断连');
        browser = null;
        tabs.clear();
        for (const [k, v] of agentBinds) agentBinds.delete(k);
      });
      // 下载事件（Browser domain，Chrome 117+；Page domain 已 deprecated）
      const cdp = await browser.target().createCDPSession();
      cdp.on('Browser.downloadWillBegin', (p) => {
        downloads.set(p.guid, {
          guid: p.guid, url: p.url, filename: p.suggestedFilename,
          state: 'inProgress', receivedBytes: 0, totalBytes: 0,
          tabId: p.targetInfo && p.targetInfo.targetId, startedAt: now(),
        });
        if (p.targetInfo && p.targetInfo.targetId) {
          pushEvent(p.targetInfo.targetId, 'download', {
            guid: p.guid, url: p.url, filename: p.suggestedFilename, state: 'inProgress',
          });
        }
      });
      cdp.on('Browser.downloadProgress', (p) => {
        const d = downloads.get(p.guid);
        if (d) {
          d.state = p.state; d.receivedBytes = p.receivedBytes; d.totalBytes = p.totalBytes;
        }
        if (p.state !== 'inProgress') {
          const rec = downloads.get(p.guid);
          if (rec && rec.tabId) {
            pushEvent(rec.tabId, 'download', { guid: p.guid, filename: rec.filename, state: p.state });
          }
          // 保留 5 分钟后清理
          setTimeout(() => downloads.delete(p.guid), 5 * 60 * 1000).unref?.();
        }
      });
      // 附加既有标签（浏览器恢复会话时可能出现）
      for (const t of await browser.targets()) {
        if (t.type() === 'page') attachTarget(t).catch(() => {});
      }
      browser.on('targetcreated', (t) => { if (t.type() === 'page') attachTarget(t).catch(() => {}); });
      browser.on('targetdestroyed', (t) => {
        if (t.type() !== 'page') return;
        const tabId = t._targetId;
        tabs.delete(tabId);
        eventRings.delete(tabId);
        waiters.delete(tabId);
        tabLocks.delete(tabId);
        for (const [k, v] of agentBinds) if (v.tabId === tabId) agentBinds.delete(k);
        logger.info(`tab 关闭: ${tabId}`);
      });
      logger.info('Chrome 引擎就绪');
      return browser;
    })();
    try {
      return await startingPromise;
    } finally {
      startingPromise = null;
    }
  }

  /** 接入一个 page target：订阅事件、注入初始化。返回 tab 记录（或 null=非页面 target） */
  async function attachTarget(target) {
    const tabId = target._targetId;
    if (tabs.has(tabId)) return tabs.get(tabId);
    let page;
    try { page = await target.page(); } catch (_) { return null; }
    if (!page) return null;
    const rec = {
      tabId,
      page,
      url: page.url(),
      title: '',
      agentKey: null,
      createdAt: now(),
      lastUsedAt: now(),
      windowId: null,
      cdp: null,
      screencastOn: false,
    };
    tabs.set(tabId, rec);
    ringFor(tabId); // 初始化事件环
    try {
      page.on('console', (m) => {
        pushEvent(tabId, 'console', { level: m.type(), text: String(m.text() || '').slice(0, 2000) });
      });
      page.on('pageerror', (e) => pushEvent(tabId, 'error', { message: String(e.message).slice(0, 2000) }));
      page.on('dialog', (d) => {
        pushEvent(tabId, 'dialog', { type: d.type(), message: String(d.message()).slice(0, 500) });
      });
      page.on('framenavigated', (f) => {
        if (f === page.mainFrame()) {
          rec.url = f.url();
          pushEvent(tabId, 'navigation', { url: f.url() });
          // 挂起交互警报：离开页面前若有没有处理的 dialog，记录到事件环即可（dialog 事件已推）
        }
      });
      page.on('request', (r) => {
        pushEvent(tabId, 'network', { phase: 'request', url: r.url().slice(0, 500), method: r.method() });
      });
      page.on('response', (r) => {
        pushEvent(tabId, 'network', {
          phase: 'response', url: r.url().slice(0, 500), status: r.status(),
        });
      });
      const title = await page.title().catch(() => '');
      rec.title = title;
    } catch (e) {
      logger.warn(`attachTarget 事件订阅部分失败: ${e.message}`);
    }
    return rec;
  }

  async function close() {
    closing = true;
    if (browser) {
      try { await browser.close(); } catch (_) { /* ignore */ }
      browser = null;
    }
  }

  // ── tab 解析 ───────────────────────────────────────────────────────────
  /** 解析目标 tab：显式 tabId > agentKey 绑定 > 最近活跃 */
  /** 同步解析：显式 tabId > agentKey 绑定 > 最近活跃；找不到返回 null */
  function resolveTabSync({ tabId, agentKey } = {}) {
    pruneAgentBinds();
    if (tabId) {
      const rec = tabs.get(tabId);
      if (!rec) throw new Error(`标签不存在: ${tabId}`);
      rec.lastUsedAt = now();
      return rec;
    }
    if (agentKey) {
      const bind = agentBinds.get(agentKey);
      if (bind && tabs.has(bind.tabId)) {
        const rec = tabs.get(bind.tabId);
        rec.lastUsedAt = now();
        bind.lastUsedAt = now();
        return rec;
      }
    }
    let best = null;
    for (const rec of tabs.values()) {
      if (!best || rec.lastUsedAt > best.lastUsedAt) best = rec;
    }
    if (best) best.lastUsedAt = now();
    return best;
  }

  function resolveTab(params = {}) {
    const rec = resolveTabSync(params);
    if (!rec) throw new Error('当前没有打开的标签，请先 desk_acquire');
    return rec;
  }

  /** 浏览类操作专用：无可用标签时自动 acquire 一个（对齐宿主 browser_acquire 的开箱即用语义） */
  async function resolveOrCreate(params = {}) {
    const existing = resolveTabSync(params);
    if (existing) return existing;
    await ensureBrowser();
    return openNewTab({ agentKey: params.agentKey });
  }

  // ── 操作面 ─────────────────────────────────────────────────────────────
  /**
   * 开/取标签（对齐宿主 browser_acquire 语义）。
   * mode: create=总是新建；reuse=优先 agentKey 绑定，无则新建；require_new=强制新窗口标签
   */
  async function acquire({ url, title, mode = 'reuse', newWindow = false, agentKey } = {}) {
    await ensureBrowser();
    pruneAgentBinds();
    const wantUrl = url ? (looksLikeUrl(url) ? normalizeUrl(url) : buildSearchUrl(url)) : 'about:blank';

    if (mode !== 'create' && mode !== 'require_new' && agentKey) {
      const bind = agentBinds.get(agentKey);
      if (bind && tabs.has(bind.tabId)) {
        const rec = tabs.get(bind.tabId);
        rec.lastUsedAt = now();
        bind.lastUsedAt = now();
        if (wantUrl !== 'about:blank') await navigateTab(rec, wantUrl);
        return tabInfo(rec);
      }
    }

    const rec = await openNewTab({ agentKey, url: wantUrl, title, newWindow: newWindow || mode === 'require_new' });
    return tabInfo(rec);
  }

  /** 新建一个 tab 并建档（acquire 与 resolveOrCreate 共用的核心） */
  async function openNewTab({ agentKey, url = 'about:blank', title, newWindow = false } = {}) {
    const page = await browser.newPage(newWindow ? { type: 'window' } : undefined);
    const tabId = page.target()._targetId;
    let rec = await attachTarget(page.target());
    if (!rec) {
      // target.page() 失败的兜底：直接以 page 建档（保证不因 attach 失败而中断）
      rec = {
        tabId, page, url: page.url(), title: '', agentKey: null,
        createdAt: now(), lastUsedAt: now(), windowId: null,
      };
      tabs.set(tabId, rec);
      ringFor(tabId);
    }
    rec.url = page.url();
    if (title) rec.title = title;
    touchAgent(agentKey, tabId);
    if (url && url !== 'about:blank') {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch((e) => {
        logger.warn(`openNewTab goto 失败(继续): ${e.message}`);
      });
      rec.url = page.url();
      rec.title = await page.title().catch(() => rec.title);
    }
    pushEvent(tabId, 'navigation', { url: rec.url, reason: 'acquire' });
    return rec;
  }

  /**
   * 等待搜索结果渲染就绪：结果条目出现或正文充实即提前返回（上限 timeoutMs）。
   * 相比固定 waitForSelector：正常页 1-2s 返回；CF 挑战/慢页不拖满超时。
   */
  async function waitForResultsReady(page, timeoutMs = 6000) {
    const deadline = now() + timeoutMs;
    let lastLen = -1;
    while (now() < deadline) {
      // eslint-disable-next-line no-await-in-loop
      const st = await page.evaluate(() => ({
        items: document.querySelectorAll('#b_results > li.b_algo, #b_results h2 a, #rso h3, article, .result__snippet').length,
        len: (document.body && document.body.innerText) ? document.body.innerText.length : 0,
      })).catch(() => null);
      if (st) {
        if (st.items > 0) return true;
        // 正文在增长 → 页面仍在渲染，继续等；正文停滞且为空 → 可能是挑战页，缩短等待
        if (st.len > 800) return true;
        if (st.len === lastLen && st.len === 0) return false;
        lastLen = st.len;
      }
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 300));
    }
    return false;
  }

  async function navigateTab(rec, url) {
    const finalUrl = looksLikeUrl(url) ? normalizeUrl(url) : buildSearchUrl(url);
    await withTabLock(rec.tabId, async () => {
      await rec.page.goto(finalUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      rec.url = rec.page.url();
      rec.title = await rec.page.title().catch(() => rec.title);
      rec.lastUsedAt = now();
    });
    return { tabId: rec.tabId, url: rec.url, title: rec.title };
  }

  async function navigate({ url, query, tabId, agentKey } = {}) {
    const target = url || query;
    if (!target) throw new Error('navigate 需要 url 或 query');
    const rec = await resolveOrCreate({ tabId, agentKey });
    return navigateTab(rec, target);
  }

  async function search({ query, engine, limit = 8, tabId, agentKey } = {}) {
    if (!query) throw new Error('search 需要 query');
    const rec = await resolveOrCreate({ tabId, agentKey });
    const searchUrl = buildSearchUrl(query, engine);
    await navigateTab(rec, searchUrl);
    // 等待结果渲染：短轮询（命中结果条目或正文充实即返回，上限 6s）。
    // 替代固定 waitForSelector(8s)：CF 挑战页/慢渲染不白等，正常页 1-2s 即返回。
    const page = rec.page;
    await waitForResultsReady(page, 6000);
    const results = await page.evaluate((max) => {
      const pick = (sel) => Array.from(document.querySelectorAll(sel));
      // bing
      let items = pick('#b_results > li.b_algo').map((li) => {
        const a = li.querySelector('h2 a');
        return a ? { title: a.textContent.trim(), url: a.href, snippet: (li.querySelector('.b_caption p, .b_lineclamp2') || {}).textContent?.trim() || '' } : null;
      });
      if (!items.length) {
        // bing 兜底：结果容器变体（cf 盾放行后的延迟渲染 / 国际版布局差异）
        items = pick('#b_results h2 a').map((a) => {
          const li = a.closest('li');
          return {
            title: a.textContent.trim(),
            url: a.href,
            snippet: li ? ((li.querySelector('.b_caption p, .b_lineclamp2, p') || {}).textContent?.trim() || '') : '',
          };
        });
      }
      if (!items.length) {
        // google
        items = pick('#rso div.g, #rso > div').map((d) => {
          const a = d.querySelector('a[href^="http"]');
          const t = d.querySelector('h3');
          const s = d.querySelector('div[data-snhf], .VwiC3b, span.aCOpRe');
          return a && t ? { title: t.textContent.trim(), url: a.href, snippet: (s || {}).textContent?.trim() || '' } : null;
        });
      }
      if (!items.length) {
        // baidu
        items = pick('#content_left .result, #content_left .c-container').map((d) => {
          const a = d.querySelector('h3 a, .t a');
          const s = d.querySelector('.c-abstract, [class*=content-right], .c-span-last');
          return a ? { title: a.textContent.trim(), url: a.href, snippet: (s || {}).textContent?.trim() || '' } : null;
        });
      }
      if (!items.length) {
        // duckduckgo 新版（<article> data-testid 结构）
        items = Array.from(document.querySelectorAll('article')).map((art) => {
          const a = art.querySelector('a[data-testid="result-title-a"], h2 a, a[href^="http"]');
          if (!a) return null;
          const s = art.querySelector('[data-result="snippet"], .result__snippet');
          return {
            title: (art.querySelector('h2') || a).textContent.trim(),
            url: a.href,
            snippet: s ? s.textContent.trim().slice(0, 300) : '',
          };
        });
      }
      if (!items.length) {
        // duckduckgo html 旧版
        items = pick('#links .result, #links .web-result').map((d) => {
          const a = d.querySelector('a.result__a, h2 a');
          const s = d.querySelector('.result__snippet');
          return a ? { title: a.textContent.trim(), url: a.href, snippet: (s || {}).textContent?.trim() || '' } : null;
        });
      }
      return items.filter(Boolean).slice(0, max);
    }, limit);
    return { tabId: rec.tabId, url: rec.url, query, engine: engine || 'bing', results };
  }

  /** 正文抽取（打分容器算法，浏览器内执行） */
  const READ_SCRIPT = () => {
    const rm = (sel) => { document.querySelectorAll(sel).forEach((n) => n.remove()); };
    rm('script,style,noscript,nav,footer,header,aside,form,iframe,[role=navigation],[role=banner],[role=complementary]');
    const cands = Array.from(document.querySelectorAll('article,main,[role=main],.article,.content,.post,#content,.entry-content'));
    let best = null; let bestScore = -1;
    const pool = cands.length ? cands : [document.body];
    for (const el of pool) {
      let score = 0;
      const text = el.innerText || '';
      score += Math.min(text.length / 100, 50);
      score += el.querySelectorAll('p').length * 2;
      if (text.length > 2000) score += 20;
      if (score > bestScore) { bestScore = score; best = el; }
    }
    if (!best) return { title: document.title, text: '', url: location.href };
    const paras = Array.from(best.querySelectorAll('p,h1,h2,h3,li,blockquote,pre'))
      .map((p) => p.innerText.trim())
      .filter((t) => t.length > 0);
    const text = (paras.length ? paras.join('\n\n') : best.innerText).slice(0, 50000);
    return { title: document.title, url: location.href, text, textLength: text.length };
  };

  async function read({ tabId, agentKey, url, mode = 'article' } = {}) {
    let rec;
    if (url && (!tabId && !agentKey)) {
      // 读取指定 URL：在当前活跃 tab 导航后读取（无 tab 则自动开一个）
      rec = await resolveOrCreate({});
      await navigateTab(rec, url);
    } else {
      rec = await resolveOrCreate({ tabId, agentKey });
    }
    const result = await withTabLock(rec.tabId, () => rec.page.evaluate(READ_SCRIPT));
    if (mode === 'text') {
      return { tabId: rec.tabId, url: result.url, title: result.title, text: result.text, textLength: result.textLength };
    }
    return { tabId: rec.tabId, url: result.url, title: result.title, text: result.text, textLength: result.textLength };
  }

  /** 候选元素收集与打分（浏览器内执行；对齐 interactive-collector 思路） */
  const COLLECT_SCRIPT = () => {
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) return false;
      const st = getComputedStyle(el);
      return st.visibility !== 'hidden' && st.display !== 'none' && Number(st.opacity) > 0.05;
    };
    const els = Array.from(document.querySelectorAll('a,button,input,select,textarea,[role=button],[onclick],summary')).filter(visible);
    return els.slice(0, 120).map((el, i) => {
      const r = el.getBoundingClientRect();
      const text = (el.innerText || el.value || el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('title') || '').trim().slice(0, 120);
      return {
        index: i,
        tag: el.tagName.toLowerCase(),
        type: el.getAttribute('type') || '',
        text,
        href: el.tagName === 'A' ? el.href : undefined,
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      };
    });
  };

  async function collectInteractive(rec) {
    return withTabLock(rec.tabId, () => rec.page.evaluate(COLLECT_SCRIPT));
  }

  async function click({ tabId, agentKey, label, index, text, selector } = {}) {
    const rec = await resolveOrCreate({ tabId, agentKey });
    return withTabLock(rec.tabId, async () => {
      let handle = null;
      if (selector) {
        handle = await rec.page.$(selector);
      } else {
        const items = await rec.page.evaluate(COLLECT_SCRIPT);
        let target = null;
        if (typeof index === 'number') {
          target = items[index];
        } else {
          const needle = String(label || text || '').toLowerCase();
          if (!needle) throw new Error('click 需要 label/text/index/selector 之一');
          // 精确包含匹配，取文本最长者（信息量最大）
          let bestLen = -1;
          for (const it of items) {
            if (it.text && it.text.toLowerCase().includes(needle) && it.text.length > bestLen) {
              target = it; bestLen = it.text.length;
            }
          }
        }
        if (!target) throw new Error(`未找到匹配元素: ${label || text || index}`);
        const all = await rec.page.evaluate(COLLECT_SCRIPT);
        const meta = all[target.index];
        handle = await rec.page.evaluateHandle((m) => {
          const visible = (el) => {
            const r = el.getBoundingClientRect();
            if (r.width < 4 || r.height < 4) return false;
            const st = getComputedStyle(el);
            return st.visibility !== 'hidden' && st.display !== 'none' && Number(st.opacity) > 0.05;
          };
          const els = Array.from(document.querySelectorAll('a,button,input,select,textarea,[role=button],[onclick],summary')).filter(visible);
          return els[m.index] || null;
        }, meta);
        handle = handle.asElement();
      }
      if (!handle) throw new Error('元素定位失败');
      await handle.scrollIntoViewIfNeeded().catch(() => {});
      await handle.click({ delay: 30 }).catch(async (e) => {
        // 某些元素不可 click()（如 div[onclick]），降级派发事件
        await rec.page.evaluate((el) => el.click(), handle);
      });
      rec.lastUsedAt = now();
      // 点击后等网络空闲：最多 1.2s、空闲 250ms 即返回（页面无后续请求时不白等）
      await rec.page.waitForNetworkIdle({ idleTime: 250, timeout: 1200 }).catch(() => {});
      return { tabId: rec.tabId, url: rec.page.url(), clicked: true };
    });
  }

  async function fill({ tabId, agentKey, label, selector, value } = {}) {
    if (value === undefined) throw new Error('fill 需要 value');
    const rec = await resolveOrCreate({ tabId, agentKey });
    return withTabLock(rec.tabId, async () => {
      let handle = null;
      if (selector) {
        handle = await rec.page.$(selector);
      } else {
        const needle = String(label || '').toLowerCase();
        if (!needle) throw new Error('fill 需要 label 或 selector');
        const items = await rec.page.evaluate(COLLECT_SCRIPT);
        const it = items.find((x) => x.text.toLowerCase().includes(needle) && ['input', 'textarea', 'select'].includes(x.tag));
        if (!it) throw new Error(`未找到表单元素: ${label}`);
        handle = await rec.page.$$('input,textarea,select').then((els) => els[Math.min(it.index, els.length - 1)]).catch(() => null);
        // index 对不上时退化为文本匹配
        if (!handle) throw new Error(`表单元素定位失败: ${label}`);
      }
      if (!handle) throw new Error('元素定位失败');
      await handle.scrollIntoViewIfNeeded().catch(() => {});
      const tag = (await handle.evaluate((el) => el.tagName.toLowerCase())).trim();
      if (tag === 'select') {
        await handle.select(String(value));
      } else {
        await handle.evaluate((el, v) => {
          el.focus();
          const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
          setter.call(el, v);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }, String(value));
      }
      return { tabId: rec.tabId, filled: true };
    });
  }

  async function pressKey({ keys, tabId, agentKey } = {}) {
    if (!keys) throw new Error('pressKey 需要 keys');
    const rec = await resolveOrCreate({ tabId, agentKey });
    return withTabLock(rec.tabId, async () => {
      await rec.page.keyboard.press(String(keys));
      return { tabId: rec.tabId, pressed: keys };
    });
  }

  async function scroll({ amount, direction = 'down', tabId, agentKey } = {}) {
    const rec = await resolveOrCreate({ tabId, agentKey });
    return withTabLock(rec.tabId, async () => {
      const delta = Math.abs(Number(amount) || 600) * (direction === 'up' ? -1 : 1);
      await rec.page.evaluate((d) => { window.scrollBy(0, d); }, delta);
      return { tabId: rec.tabId, scrolled: delta };
    });
  }

  async function find({ query, tabId, agentKey } = {}) {
    if (!query) throw new Error('find 需要 query');
    const rec = await resolveOrCreate({ tabId, agentKey });
    return withTabLock(rec.tabId, async () => {
      const r = await rec.page.evaluate((q) => {
        const needle = q.toLowerCase();
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        const hits = [];
        let node;
        while ((node = walker.nextNode()) && hits.length < 50) {
          const t = node.textContent || '';
          const i = t.toLowerCase().indexOf(needle);
          if (i >= 0) {
            hits.push(t.slice(Math.max(0, i - 40), i + q.length + 40).trim());
          }
        }
        return { count: hits.length, contexts: hits.slice(0, 10) };
      }, String(query));
      return { tabId: rec.tabId, ...r };
    });
  }

  async function screenshot({ tabId, agentKey, fullPage = false, quality, maxWidth } = {}) {
    const rec = await resolveOrCreate({ tabId, agentKey });
    const q = Math.min(100, Math.max(10, Number(quality) || SCREENSHOT_DEFAULTS.quality));
    const mw = Math.max(320, Number(maxWidth) || SCREENSHOT_DEFAULTS.maxWidth);
    return withTabLock(rec.tabId, async () => {
      await rec.page.setViewport({ width: Math.min(mw, 1600), height: 900 }).catch(() => {});
      const buf = await rec.page.screenshot({
        type: 'jpeg', quality: q, fullPage: !!fullPage, encoding: 'base64',
      });
      return { tabId: rec.tabId, mime: 'image/jpeg', base64: buf };
    });
  }

  async function evaluate({ script, tabId, agentKey } = {}) {
    if (!script) throw new Error('evaluate 需要 script');
    const rec = await resolveOrCreate({ tabId, agentKey });
    return withTabLock(rec.tabId, async () => {
      const r = await rec.page.evaluate(script);
      return { tabId: rec.tabId, result: r === undefined ? null : r };
    });
  }

  async function history({ tabId, agentKey, action = 'list' } = {}) {
    const rec = await resolveOrCreate({ tabId, agentKey });
    if (action === 'back' || action === 'forward') {
      await withTabLock(rec.tabId, async () => {
        if (action === 'back') await rec.page.goBack({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
        else await rec.page.goForward({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
        rec.url = rec.page.url();
        rec.title = await rec.page.title().catch(() => rec.title);
      });
      return { tabId: rec.tabId, url: rec.url, action };
    }
    const entries = await withTabLock(rec.tabId, () => rec.page.evaluate(() => {
      const n = Math.min(history.length, 50);
      const items = [];
      for (let i = 0; i < n; i += 1) items.push({ index: i - (history.length - 1) });
      return { length: history.length, current: location.href };
    }));
    return { tabId: rec.tabId, ...entries };
  }

  async function closeTab({ tabId, close } = {}) {
    await ensureBrowser();
    if (close === 'all') {
      const ids = [...tabs.keys()];
      for (const id of ids) {
        const rec = tabs.get(id);
        await rec.page.close().catch(() => {});
      }
      return { closed: ids.length };
    }
    const rec = resolveTab({ tabId });
    await rec.page.close().catch(() => {});
    return { closed: 1, tabId: rec.tabId };
  }

  // ── 事件与等待 ─────────────────────────────────────────────────────────
  async function watch({ tabId, agentKey, kinds, sinceSeq = 0 } = {}) {
    const rec = resolveTab({ tabId, agentKey });
    const ring = ringFor(rec.tabId);
    const kindSet = Array.isArray(kinds) && kinds.length ? new Set(kinds) : null;
    // 短窗口轮询（3s）：有增量立即返回；无增量快速返回空（AI 侧循环调用即为流式感知，
    // 避免 25s 长轮询被 AI 侧超时判定为挂死）。
    const deadline = now() + 3000;
    while (true) {
      const items = ring.filter((e) => e.seq > sinceSeq && (!kindSet || kindSet.has(e.kind)));
      if (items.length > 0) {
        return { tabId: rec.tabId, events: items, lastSeq: items[items.length - 1].seq };
      }
      if (now() >= deadline) {
        return { tabId: rec.tabId, events: [], lastSeq: sinceSeq, timeout: true };
      }
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  async function wait({ tabId, agentKey, selector, urlPattern, downloadComplete, dialog, timeoutMs } = {}) {
    const rec = resolveTab({ tabId, agentKey });
    const timeout = Math.min(60000, Math.max(500, Number(timeoutMs) || DEFAULT_WAIT_TIMEOUT_MS));
    const test = (event) => {
      if (selector && event.kind === 'navigation') return false; // selector 走 DOM 轮询
      if (urlPattern && event.kind === 'navigation' && new RegExp(urlPattern).test(event.url || '')) return true;
      if (downloadComplete && event.kind === 'download' && (event.state === 'completed' || event.state === 'canceled')) return true;
      if (dialog && event.kind === 'dialog') return true;
      return false;
    };
    // URL/下载/对话框走事件环等待
    if (urlPattern || downloadComplete || dialog) {
      const ring = ringFor(rec.tabId);
      const existing = ring.find(test);
      if (existing) return { tabId: rec.tabId, matched: existing };
      const p = new Promise((resolve) => {
        const w = { test, resolve, timer: null };
        w.timer = setTimeout(() => {
          const ws = waiters.get(rec.tabId) || [];
          const i = ws.indexOf(w);
          if (i >= 0) ws.splice(i, 1);
          resolve(null);
        }, timeout);
        if (!waiters.has(rec.tabId)) waiters.set(rec.tabId, []);
        waiters.get(rec.tabId).push(w);
      });
      const matched = await p;
      if (!matched) throw new Error(`等待超时(${timeout}ms): ${urlPattern || downloadComplete || dialog}`);
      return { tabId: rec.tabId, matched };
    }
    // selector：DOM 轮询（同步轮询而非 page.waitForSelector，便于 stub 测试与统一超时语义）
    if (selector) {
      const deadlineSel = now() + timeout;
      while (now() < deadlineSel) {
        // eslint-disable-next-line no-await-in-loop
        const found = await rec.page.$(selector).catch(() => null);
        if (found) return { tabId: rec.tabId, matched: { kind: 'selector', selector } };
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 250));
      }
      throw new Error(`等待超时(${timeout}ms): selector ${selector}`);
    }
    throw new Error('wait 需要 selector/urlPattern/downloadComplete/dialog 之一');
  }

  // ── Screencast 内嵌视图（面板实时画面 + 交互回传）─────────────────────
  /** 每 tab 最新帧：tabId → { data(base64), seq, ts, deviceWidth, deviceHeight } */
  const latestFrames = new Map();
  let frameSeq = 0;

  async function ensureTabCdp(rec) {
    if (rec.cdp) return rec.cdp;
    const cdp = await rec.page.createCDPSession();
    rec.cdp = cdp;
    cdp.on('Page.screencastFrame', (p) => {
      frameSeq += 1;
      latestFrames.set(rec.tabId, {
        data: p.data,
        seq: frameSeq,
        ts: now(),
        deviceWidth: p.metadata ? p.metadata.deviceWidth : 0,
        deviceHeight: p.metadata ? p.metadata.deviceHeight : 0,
      });
      // ack 上限保护：不 ack Chrome 会停止推帧
      cdp.send('Page.screencastFrameAck', { sessionId: p.sessionId }).catch(() => {});
    });
    return cdp;
  }

  async function screencastStart({ tabId, agentKey, quality = 50, maxWidth = 1280, everyNth = 1 } = {}) {
    const rec = await resolveOrCreate({ tabId, agentKey });
    const cdp = await ensureTabCdp(rec);
    if (!rec.screencastOn) {
      await cdp.send('Page.startScreencast', {
        format: 'jpeg',
        quality: Math.min(90, Math.max(20, Number(quality) || 50)),
        maxWidth: Math.min(1920, Math.max(320, Number(maxWidth) || 1280)),
        everyNthFrame: Math.max(1, Number(everyNth) || 1),
      }).catch((e) => { throw new Error(`screencast 启动失败: ${e.message}`); });
      rec.screencastOn = true;
    }
    const f = latestFrames.get(rec.tabId);
    return { tabId: rec.tabId, streaming: true, hasFrame: !!f, seq: f ? f.seq : 0 };
  }

  async function screencastFrame({ tabId, agentKey, sinceSeq = 0 } = {}) {
    const rec = resolveTab({ tabId, agentKey });
    const f = latestFrames.get(rec.tabId);
    if (!f) return { tabId: rec.tabId, frame: null, seq: 0 };
    if (f.seq <= sinceSeq) return { tabId: rec.tabId, frame: null, seq: f.seq };
    return { tabId: rec.tabId, frame: { data: f.data, deviceWidth: f.deviceWidth, deviceHeight: f.deviceHeight }, seq: f.seq, ts: f.ts };
  }

  async function screencastStop({ tabId, agentKey } = {}) {
    const rec = resolveTab({ tabId, agentKey });
    if (rec.cdp && rec.screencastOn) {
      await rec.cdp.send('Page.stopScreencast').catch(() => {});
      rec.screencastOn = false;
    }
    return { tabId: rec.tabId, streaming: false };
  }

  /** 交互回传：鼠标（move/down/up/click/dblclick/wheel）与键盘 */
  async function inputMouse({ tabId, agentKey, type, x, y, button = 'left', clickCount = 1, deltaX = 0, deltaY = 0 } = {}) {
    const rec = resolveTab({ tabId, agentKey });
    const cdp = await ensureTabCdp(rec);
    const allowed = ['mousePressed', 'mouseReleased', 'mouseMoved', 'mouseWheel'];
    if (!allowed.includes(type)) throw new Error(`inputMouse 不支持 type: ${type}`);
    const params = { type, x: Number(x) || 0, y: Number(y) || 0, button: ['left', 'middle', 'right'].includes(button) ? button : 'left', clickCount: Number(clickCount) || 1 };
    if (type === 'mouseWheel') { params.deltaX = Number(deltaX) || 0; params.deltaY = Number(deltaY) || -60; }
    await cdp.send('Input.dispatchMouseEvent', params);
    return { tabId: rec.tabId, dispatched: type };
  }

  async function inputKey({ tabId, agentKey, type = 'keyDown', key, text } = {}) {
    const rec = resolveTab({ tabId, agentKey });
    const cdp = await ensureTabCdp(rec);
    if (text) {
      await cdp.send('Input.insertText', { text: String(text) });
      return { tabId: rec.tabId, inserted: String(text) };
    }
    const allowed = ['keyDown', 'keyUp', 'char'];
    if (!allowed.includes(type)) throw new Error(`inputKey 不支持 type: ${type}`);
    // 常见键 → CDP windowsVirtualKeyCode/key 简化映射；未识别键交由 text 路径
    const KEY_MAP = {
      Enter: { key: 'Enter', keyCode: 13 }, Tab: { key: 'Tab', keyCode: 9 },
      Escape: { key: 'Escape', keyCode: 27 }, Backspace: { key: 'Backspace', keyCode: 8 },
      Delete: { key: 'Delete', keyCode: 46 }, ArrowUp: { key: 'ArrowUp', keyCode: 38 },
      ArrowDown: { key: 'ArrowDown', keyCode: 40 }, ArrowLeft: { key: 'ArrowLeft', keyCode: 37 },
      ArrowRight: { key: 'ArrowRight', keyCode: 39 }, Space: { key: ' ', keyCode: 32 },
    };
    const k = KEY_MAP[key];
    const params = k
      ? { type, key: k.key, windowsVirtualKeyCode: k.keyCode, nativeVirtualKeyCode: k.keyCode }
      : { type, key: String(key || ''), text: String(key || '') };
    await cdp.send('Input.dispatchKeyEvent', params);
    return { tabId: rec.tabId, dispatched: type, key };
  }

  // ── 状态 ───────────────────────────────────────────────────────────────
  function tabInfo(rec) {
    return {
      tabId: rec.tabId,
      url: rec.url,
      title: rec.title,
      agentKey: rec.agentKey || [...agentBinds.entries()].find(([, v]) => v.tabId === rec.tabId)?.[0] || null,
      windowId: rec.windowId,
      createdAt: rec.createdAt,
      lastUsedAt: rec.lastUsedAt,
    };
  }

  async function status() {
    pruneAgentBinds();
    const list = [...tabs.values()].map(tabInfo).sort((a, b) => b.lastUsedAt - a.lastUsedAt);
    return {
      engine: browser && browser.connected ? 'ready' : (startingPromise ? 'starting' : 'stopped'),
      chromePath,
      tabs: list,
      agentBinds: [...agentBinds.entries()].map(([k, v]) => ({ agentKey: k, tabId: v.tabId, lastUsedAt: v.lastUsedAt })),
      downloads: [...downloads.values()].filter((d) => d.state === 'inProgress'),
      version: require('../shared/core').VERSION,
    };
  }

  return {
    ensureBrowser,
    close,
    acquire,
    navigate,
    search,
    read,
    click,
    fill,
    pressKey,
    scroll,
    find,
    screenshot,
    evaluate,
    history,
    closeTab,
    watch,
    wait,
    status,
    resolveTab,
    screencastStart,
    screencastFrame,
    screencastStop,
    inputMouse,
    inputKey,
    // 测试钩子
    _internal: { tabs, agentBinds, eventRings, downloads, pushEvent, findChromePath, advanceClock: (ms) => { clockOffset += ms; } },
  };
}

module.exports = { createEngine, findChromePath };
