'use strict';
/**
 * crawler.js —— 站点体检爬虫引擎（零依赖 Node http/https）
 *
 * 爬取语义与安全围栏（与 docs/site-audit-plan.md 对齐）：
 *  - 域锚定：种子 URL 的一次重定向链把「域内范围」锚定为 ≤3 个 host
 *    （example.com + www.example.com 这种）。范围内页面 BFS 深爬；
 *    范围外链接一律视为外链，只验存活（头即断），绝不解析、绝不深爬。
 *  - SSRF 围栏：云元数据端点（169.254.0.0/16 等）任何情况下拒绝；
 *    种子是公网时，跨 host 的资源/外链核查解析到私网地址一律拦截
 *    （防第三方页面借体检引擎探测内网）；种子本身是私网（本机/局域网
 *    开发站）时放开私网——那是用户显式输入的目标环境。
 *  - 礼貌爬取：同 host 最小间隔 = max(用户 delayMs, robots Crawl-delay)；
 *    并发池默认 6；页数/总时长/单页体积/单页超时全部有硬护栏；可中止。
 *  - robots.txt 默认遵守（Google 最长匹配语义，见 shared/audit-core）。
 */
const http = require('http');
const https = require('https');
const zlib = require('zlib');
const dns = require('dns');
const crypto = require('crypto');
const core = require('../shared/audit-core');

const UA = `Mozilla/5.0 (compatible; PolarisSiteAudit/${core.VERSION}; +https://github.com/misxzaiz/Polaris-plugin) local-audit`;
const ROBOT_TOKEN = 'site-audit';

class GuardError extends Error {
  constructor(msg, code) { super(msg); this.name = 'GuardError'; this.code = code || 'guard'; }
}

// ── 单跳请求 ────────────────────────────────────────────────────────────────
/**
 * 一次 HTTP 请求（不跟重定向）。
 * @param opts {method, timeoutMs, maxBytes, headersOnly, extraHeaders}
 * headersOnly=true：拿到响应头立即断开（外链/资源核查不下载正文）。
 * 返回 {status, statusText, headers, body:Buffer|null, bytes, ms, error?, overflow?}
 */
function rawRequest(urlStr, opts) {
  return new Promise((resolve) => {
    let u;
    try { u = new URL(urlStr); } catch (e) { resolve({ error: 'URL 无法解析' }); return; }
    const mod = u.protocol === 'https:' ? https : http;
    const timeoutMs = opts.timeoutMs || 15000;
    const started = Date.now();
    let settled = false;
    const finish = (r) => {
      if (settled) return;
      settled = true;
      resolve({ status: 0, statusText: '', headers: {}, body: null, bytes: 0, ...r, ms: Date.now() - started });
    };
    let req;
    try {
      req = mod.request({
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: (u.pathname || '/') + (u.search || ''),
        method: opts.method || 'GET',
        headers: {
          'User-Agent': UA,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.6',
          'Accept-Encoding': 'gzip, deflate, br',
          ...(opts.extraHeaders || {}),
        },
        timeout: timeoutMs,
        // 诊断工具：不校验证书链（自签名本机站也能体检）；不评估证书有效性，README 明示
        rejectUnauthorized: false,
      }, (res) => {
        if (opts.headersOnly) {
          const bytes = Number(res.headers['content-length']) || 0;
          finish({ status: res.statusCode, statusText: res.statusMessage || '', headers: res.headers, bytes });
          res.destroy();
          return;
        }
        const chunks = [];
        let size = 0;
        let overflow = false;
        const enc = String(res.headers['content-encoding'] || '').toLowerCase();
        const onData = (c) => {
          size += c.length;
          if (size > (opts.maxBytes || core.LIMITS.maxBodyBytes)) { overflow = true; try { res.destroy(); } catch (_) { /* 忽略 */ } return; }
          chunks.push(c);
        };
        let tail = res;
        if (!overflow && (enc === 'gzip' || enc === 'deflate' || enc === 'br')) {
          try {
            const z = enc === 'gzip' ? zlib.createGunzip() : enc === 'deflate' ? zlib.createInflate() : zlib.createBrotliDecompress();
            z.on('error', () => { /* 解压失败按原始字节兜底 */ });
            res.pipe(z);
            tail = z;
          } catch (_) { tail = res; }
        }
        tail.on('data', onData);
        res.on('aborted', () => finish({ status: res.statusCode, statusText: res.statusMessage || '', headers: res.headers, body: Buffer.concat(chunks), bytes: Buffer.concat(chunks).length, overflow }));
        res.on('error', () => { /* destroy 触发；close 统一收口 */ });
        tail.on('error', () => { /* 同上 */ });
        res.on('close', () => {
          const body = Buffer.concat(chunks);
          finish({
            status: res.statusCode, statusText: res.statusMessage || '', headers: res.headers,
            body, bytes: body.length, overflow,
            wireBytes: Number(res.headers['content-length']) || undefined,
          });
        });
      });
    } catch (e) {
      finish({ error: String((e && e.message) || e) });
      return;
    }
    req.on('timeout', () => { req.destroy(); finish({ error: `超时（${timeoutMs}ms）` }); });
    req.on('error', (e) => finish({ error: String(e.code || e.message || e) }));
    req.end();
  });
}

// ── DNS 围栏 ────────────────────────────────────────────────────────────────
const dnsCache = new Map(); // host -> {addrs?:[{address}], error?}

function isMetadataIp(ip) {
  const m = String(ip).match(/^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (m) return Number(m[1]) === 169 && Number(m[2]) === 254;
  return String(ip).toLowerCase() === 'fd00:ec2::254';
}
function isPrivateIp(ip) {
  const m = String(ip).match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/);
  if (m) {
    const a = Number(m[1]); const b = Number(m[2]);
    if (a === 127 || a === 10 || a === 0) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    return false;
  }
  const s = String(ip).toLowerCase();
  return s === '::1' || s.startsWith('fc') || s.startsWith('fd') || s.startsWith('fe80');
}

/**
 * 目标围栏。inScope=true（域内页面）只拦元数据；跨 host 的资源/外链核查
 * 在公网种子场景下同时拦私网解析。返回 null=放行，字符串=拒绝原因。
 */
async function guardTarget(urlStr, { inScope, allowPrivate }) {
  if (core.isMetadataTarget(urlStr)) return '云元数据端点，禁止访问';
  const host = core.hostOf(urlStr).split(':')[0];
  if (!host) return 'host 为空';
  if (inScope || allowPrivate) return null;
  let entry = dnsCache.get(host);
  if (!entry) {
    entry = await new Promise((res) => {
      const h = host.replace(/^\[|\]$/g, '');
      if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(':')) { res({ addrs: [{ address: h }] }); return; }
      dns.lookup(h, { all: true, verbatim: true }, (err, addrs) => {
        if (err) res({ error: String(err.code || err.message || err) });
        else res({ addrs: Array.isArray(addrs) ? addrs : [] });
      });
    });
    dnsCache.set(host, entry);
  }
  if (entry.error) return null; // DNS 失败交给请求路径报错
  for (const a of entry.addrs || []) {
    if (isMetadataIp(a.address)) return '解析到云元数据地址，禁止访问';
    if (isPrivateIp(a.address)) return `解析到私网地址 ${a.address}，已拦截（公网目标不允许借道探测内网）`;
  }
  return null;
}

// ── 重定向链请求 ────────────────────────────────────────────────────────────
/**
 * 跟随重定向（≤LIMITS.maxHops 跳），记录完整链路。
 * @param opts {timeoutMs, maxBytes, headersOnly, scopeGuard?(url)=>boolean, guardOpts}
 * scopeGuard：域内爬取时判定下一跳是否在范围内；false 则记录并停止（不抓正文）。
 * 返回 {hops, status, statusText, headers, body, bytes, ms, error?, finalUrl}
 */
async function requestWithChain(urlStr, opts = {}) {
  const hops = [];
  let current = String(urlStr);
  let last = null;
  for (let i = 0; i <= (opts.maxHops || core.LIMITS.maxHops); i++) {
    const deny = await guardTarget(current, opts.guardOpts || { inScope: true, allowPrivate: true });
    if (deny) return { hops, status: 0, error: deny, finalUrl: current, guarded: true };
    const r = await rawRequest(current, {
      method: opts.method || 'GET',
      timeoutMs: opts.timeoutMs,
      maxBytes: opts.maxBytes,
      headersOnly: opts.headersOnly,
      extraHeaders: opts.extraHeaders,
    });
    last = r;
    hops.push({ url: current, status: r.status, location: (r.headers && r.headers.location) || null });
    const loc = r.headers && r.headers.location;
    if (r.status >= 300 && r.status < 400 && loc && i < (opts.maxHops || core.LIMITS.maxHops)) {
      let next;
      try { next = new URL(loc, current).toString(); } catch (_) { break; }
      if (!/^https?:/i.test(next)) break;
      if (opts.scopeGuard && !opts.scopeGuard(next)) {
        // 重定向离开范围：记录终点但不抓取（防跨域深爬/SSRF 借道）
        hops.push({ url: next, status: 0, location: null });
        return { ...r, hops, finalUrl: next, escaped: true };
      }
      current = next;
      continue;
    }
    return { ...r, hops, finalUrl: current };
  }
  return { ...(last || {}), hops, error: `重定向超过 ${core.LIMITS.maxHops} 跳`, finalUrl: current };
}

// ── 爬虫主体 ────────────────────────────────────────────────────────────────
const PHASES = { SEED: 'seed', ROBOTS: 'robots', SITEMAP: 'sitemap', CRAWL: 'crawl', EXTERNAL: 'external', DONE: 'done' };

class Crawler {
  /**
   * @param options {sanitizeOptions 出的 options}
   * @param cb {onProgress(snapshot), onEvent({type,url,detail})} 可选
   */
  constructor(options, cb) {
    this.options = options;
    this.cb = cb || {};
    this.aborted = false;
    this.startedAt = 0;
    this.deadline = 0;
    this.phase = PHASES.SEED;
    this.scopeHosts = [];
    this.allowPrivate = false;
    this.robotsByHost = new Map();   // host -> {parsed, fetched, restrictive}
    this.crawlDelayByHost = new Map(); // host -> ms
    this.queue = [];                 // [{url, depth, source}]
    this.queued = new Set();
    this.pages = [];
    this.assets = [];
    this.externalMap = new Map();    // url -> ExternalRecord
    this.externalOrder = [];
    this.externalSkipped = 0;
    this.sitemap = { fetched: false, url: null, urls: [] };
    this.sitemapsFromRobots = [];
    this.robotsBlockedCount = 0;
    this.active = new Set();         // 进行中的 rawRequest 控制柄（abort 用）
    this.lastHit = new Map();        // host -> ts（礼貌间隔）
    this.inFlight = new Map();       // host -> count
    this.pagesTried = 0;
    this.events = [];
  }

  onProgress(snap) { if (this.cb.onProgress) this.cb.onProgress(snap); }
  onEvent(ev) {
    this.events.push({ ...ev, at: Date.now() });
    if (this.events.length > 200) this.events.shift();
    if (this.cb.onEvent) this.cb.onEvent(ev);
  }

  stop() {
    this.aborted = true;
    // 立即打断进行中的请求（poll 循环外唯一入口）
    for (const r of this.active) { try { r.destroy(); } catch (_) { /* 忽略 */ } }
  }

  snapshot() {
    let errPages = 0;
    for (const p of this.pages) if (p.error || (p.status && p.status >= 400)) errPages++;
    let errAssets = 0;
    for (const a of this.assets) if (a.error || (a.status && a.status >= 400)) errAssets++;
    let errExt = 0;
    for (const e of this.externalMap.values()) if (e.error || (e.status && e.status >= 400)) errExt++;
    const current = [];
    for (const [h, c] of this.inFlight) if (c > 0) current.push(`${h}×${c}`);
    return {
      phase: this.phase,
      pagesDone: this.pages.length,
      queueLen: this.queue.length - 0,
      assetsDone: this.assets.length,
      externalDone: [...this.externalMap.values()].filter((e) => e.status || e.error).length,
      externalTotal: this.externalOrder.length,
      errors: errPages + errAssets + errExt,
      current,
      elapsedS: this.startedAt ? Math.round((Date.now() - this.startedAt) / 100) / 10 : 0,
      scopeHosts: [...this.scopeHosts],
      recentEvents: this.events.slice(-8),
    };
  }

  /** 主入口。resolve 全量记录（报告在 main.js 用 core.buildReport 组装） */
  async run(seedUrl) {
    this.startedAt = Date.now();
    this.deadline = this.startedAt + this.options.auditTimeoutS * 1000;
    const seed = await this.anchorSeed(seedUrl);
    if (this.aborted) return this.collect();
    this.phase = PHASES.ROBOTS;
    await this.loadRobots();
    this.phase = PHASES.SITEMAP;
    await this.loadSitemaps();
    this.phase = PHASES.CRAWL;
    if (seed.finalUrl && this.isPageLike(seed)) {
      this.enqueue(seed.finalUrl, 0, null);
    }
    await this.drainQueue();
    if (this.options.checkExternal && !this.aborted) {
      this.phase = PHASES.EXTERNAL;
      await this.verifyExternals();
    }
    this.phase = PHASES.DONE;
    return this.collect();
  }

  /** 种子重定向链 → 锚定 scopeHosts */
  async anchorSeed(seedUrl) {
    // 种子是用户显式输入的目标：私网放行（本机/局域网开发站合法场景），
    // 只挡云元数据端点；allowPrivate 由此自证，供后续跨 host 核查复用。
    this.allowPrivate = isPrivateHost(core.hostOf(seedUrl));
    const guard = await guardTarget(seedUrl, { inScope: false, allowPrivate: true });
    if (guard) throw new GuardError(`目标被安全围栏拒绝：${guard}`);
    this._seedScheme = seedUrl.startsWith('https:') ? 'https' : 'http';
    const r = await requestWithChain(seedUrl, {
      timeoutMs: this.options.timeoutS * 1000,
      maxBytes: core.LIMITS.maxBodyBytes,
      guardOpts: { inScope: false, allowPrivate: true },
    });
    if (r.error && !r.status) throw new GuardError(`种子页面请求失败：${r.error}`);
    const hosts = [];
    for (const h of r.hops) {
      const host = core.hostOf(h.url);
      if (host && !hosts.includes(host)) hosts.push(host);
    }
    this.scopeHosts = hosts.slice(0, core.LIMITS.scopeHostMax);
    this.guardForScope = { inScope: false, allowPrivate: this.allowPrivate };
    return r;
  }

  isPageLike(r) {
    if (!r || r.error) return false;
    const ct = String((r.headers && r.headers['content-type']) || '');
    if (ct && !/html|xml/i.test(ct)) return false;
    return r.status >= 200 && r.status < 400;
  }

  isInternal(url) {
    return this.scopeHosts.includes(core.hostOf(url));
  }

  scopeGuard = (url) => {
    if (this.scopeHosts.includes(core.hostOf(url))) return true;
    // 重定向把爬取带出范围：若新 host 恰好是种子 host 的兄弟（少见），超出 3 个 host 也不扩
    return false;
  };

  enqueue(url, depth, source) {
    if (this.aborted) return false;
    if (this.pagesTried >= this.options.maxPages) return false;
    const n = core.normalizeUrl(url);
    if (!n.ok) return false;
    if (core.isMetadataTarget(n.url)) return false;
    if (!this.isInternal(n.url)) return false;
    if (this.queued.has(n.key)) return false;
    this.queued.add(n.key);
    this.queue.push({ url: n.url, depth, source: source || null });
    return true;
  }

  /** robots.txt：每个 scope host 取一次；Crawl-delay 记录生效 */
  async loadRobots() {
    if (!this.options.respectRobots) {
      this.robotsInfo = { fetched: false, url: null, crawlDelayMs: null, disallowCount: 0, sitemaps: [] };
      return;
    }
    const sitemaps = [];
    let disallowTotal = 0;
    let anyFetched = false;
    let delay = null;
    for (const host of this.scopeHosts) {
      const first = this.hostScheme(host) || this._seedScheme || 'http';
      const robotsUrl = `${first}://${host}/robots.txt`;
      const r = await requestWithChain(robotsUrl, { timeoutMs: Math.min(this.options.timeoutS * 1000, 10000), maxBytes: 512 * 1024, guardOpts: { inScope: true, allowPrivate: this.allowPrivate } });
      if (r.error && !r.status) { this.robotsByHost.set(host, { parsed: null, fetched: false }); continue; }
      anyFetched = true;
      // 401/403 = 站点对爬虫关门（保守视为禁爬，但报告如实说明）
      const restrictive = r.status === 401 || r.status === 403;
      const parsed = restrictive ? { groups: [{ agents: ['*'], allow: [], disallow: ['/'] }], sitemaps: [], ok: true } : core.parseRobots(r.body ? r.body.toString('utf8') : '');
      this.robotsByHost.set(host, { parsed, fetched: true, restrictive, status: r.status });
      for (const s of parsed.sitemaps || []) if (!sitemaps.includes(s)) sitemaps.push(s);
      if (parsed.groups) for (const g of parsed.groups) disallowTotal += g.disallow.length;
      if (delay === null) {
        const pick = core.pickRobotGroup(parsed);
        if (pick.group && pick.group.crawlDelayMs) delay = pick.group.crawlDelayMs;
      }
      if (this.aborted) return;
    }
    this.crawlDelayByHostRobots = delay;
    this.robotsInfo = { fetched: anyFetched, url: this.scopeHosts.length ? `${this.hostScheme(this.scopeHosts[0])}://${this.scopeHosts[0]}/robots.txt` : null, crawlDelayMs: delay, disallowCount: disallowTotal, sitemaps: sitemaps.slice(0, 5) };
    this.sitemapsFromRobots = sitemaps;
  }

  hostScheme(host) {
    // 该 host 用什么 scheme：页面抓取时记录过就用记录值；主 host 用种子 scheme；否则回退种子 scheme
    if (this._schemeByHost && this._schemeByHost.has(host)) return this._schemeByHost.get(host);
    return this._seedScheme || null;
  }

  /** robots Sitemap: 声明 → 兜底 /sitemap.xml；index 展开一层（≤10） */
  async loadSitemaps() {
    const candidates = [];
    if (this.sitemapsFromRobots.length) candidates.push(this.sitemapsFromRobots[0]);
    for (const host of this.scopeHosts) {
      const scheme = this.hostScheme(host) || this._seedScheme || 'https';
      candidates.push(`${scheme}://${host}/sitemap.xml`);
    }
    for (const cand of candidates.slice(0, 3)) {
      if (this.aborted) return;
      const n = core.normalizeUrl(cand);
      if (!n.ok) continue;
      const r = await requestWithChain(n.url, { timeoutMs: Math.min(this.options.timeoutS * 1000, 10000), maxBytes: 4 * 1024 * 1024, guardOpts: { inScope: true, allowPrivate: this.allowPrivate } });
      if (r.error && !r.status) continue;
      if (r.status === 404) continue;
      const parsed = core.parseSitemap(r.body ? r.body.toString('utf8') : '');
      if (parsed.kind === 'unknown' || !parsed.locs.length) continue;
      this.sitemap.fetched = true;
      this.sitemap.url = n.url;
      if (parsed.kind === 'index') {
        const children = parsed.locs.filter((u) => /\.xml(\?|$)/i.test(u)).slice(0, 10);
        for (const child of children) {
          if (this.aborted) return;
          const cr = await requestWithChain(child, { timeoutMs: Math.min(this.options.timeoutS * 1000, 10000), maxBytes: 4 * 1024 * 1024, guardOpts: { inScope: true, allowPrivate: this.allowPrivate } });
          if (!cr.error && cr.status === 200 && cr.body) {
            const cp = core.parseSitemap(cr.body.toString('utf8'));
            for (const u of cp.locs) {
              if (this.sitemap.urls.length >= 6000) break;
              this.sitemap.urls.push(u);
            }
          }
        }
      } else {
        this.sitemap.urls = parsed.locs.slice(0, 6000);
      }
      break;
    }
  }

  /** robots 判定 + 延迟合并后的抓取许可 */
  robotsCheck(url) {
    if (!this.options.respectRobots) return { allowed: true, blocked: false };
    const host = core.hostOf(url);
    const entry = this.robotsByHost.get(host);
    if (!entry || !entry.parsed) return { allowed: true, blocked: false };
    const r = core.robotsAllows(entry.parsed, url);
    return { allowed: r.allowed, blocked: !r.allowed, crawlDelayMs: r.crawlDelayMs };
  }

  async politeWait(host) {
    const robotsDelay = (this.options.respectRobots && this.crawlDelayByHostRobots) || 0;
    const min = Math.max(this.options.delayMs, robotsDelay);
    const last = this.lastHit.get(host) || 0;
    const wait = last + min - Date.now();
    if (wait > 0) await sleep(Math.min(wait, 10000));
    this.lastHit.set(host, Date.now());
  }

  async drainQueue() {
    const workers = new Array(Math.min(this.options.concurrency, Math.max(1, this.queue.length || 1)))
      .fill(0).map(() => this.worker());
    await Promise.all(workers);
  }

  async worker() {
    for (;;) {
      if (this.aborted || Date.now() > this.deadline) return;
      if (this.pagesTried >= this.options.maxPages) return;
      const item = this.queue.shift();
      if (!item) return;
      await this.crawlOne(item);
    }
  }

  async crawlOne(item) {
    this.pagesTried += 1;
    const { url, depth, source } = item;
    const robots = this.robotsCheck(url);
    if (robots.blocked) {
      this.pages.push({ url, status: 0, ms: 0, bytes: 0, robotsBlocked: true, source, depth });
      this.robotsBlockedCount += 1;
      this.onEvent({ type: 'robots_blocked', url, detail: '被 robots.txt 排除' });
      return;
    }
    const host = core.hostOf(url);
    await this.politeWait(host);
    if (this.aborted || Date.now() > this.deadline) { this.pagesTried -= 1; this.queue.unshift(item); return; }
    this.inFlight.set(host, (this.inFlight.get(host) || 0) + 1);
    // 域内页面：记录 scheme 供 robots/sitemap 复用
    if (!this._schemeByHost) this._schemeByHost = new Map();
    if (!this._schemeByHost.has(host)) this._schemeByHost.set(host, url.startsWith('https:') ? 'https' : 'http');
    const r = await requestWithChain(url, {
      timeoutMs: this.options.timeoutS * 1000,
      maxBytes: core.LIMITS.maxBodyBytes,
      scopeGuard: this.scopeGuard,
      guardOpts: { inScope: true, allowPrivate: this.allowPrivate },
    });
    this.inFlight.set(host, Math.max(0, (this.inFlight.get(host) || 1) - 1));
    const record = {
      url, status: r.status, statusText: r.statusText, ms: r.ms, bytes: r.bytes || 0,
      contentType: String((r.headers && r.headers['content-type']) || ''), hops: r.hops || [],
      source, depth, error: r.error,
    };
    if (r.error && !r.status) {
      // 网络层失败：重试一次（瞬时抖动），仍失败才定案
      this.inFlight.set(host, (this.inFlight.get(host) || 0) + 1);
      await this.politeWait(host);
      const r2 = await requestWithChain(url, {
        timeoutMs: this.options.timeoutS * 1000, maxBytes: core.LIMITS.maxBodyBytes,
        scopeGuard: this.scopeGuard, guardOpts: { inScope: true, allowPrivate: this.allowPrivate },
      });
      this.inFlight.set(host, Math.max(0, (this.inFlight.get(host) || 1) - 1));
      if (!r2.error && r2.status) { Object.assign(record, { status: r2.status, statusText: r2.statusText, ms: r2.ms, bytes: r2.bytes || 0, contentType: String((r2.headers && r2.headers['content-type']) || ''), hops: r2.hops || [], error: undefined }); }
      else record.retryError = r2.error || record.error;
    }
    this.pages.push(record);
    if (record.error || (record.status && record.status >= 400)) {
      this.onEvent({ type: record.error ? 'broken_page' : 'broken_page', url, detail: record.error || `HTTP ${record.status}` });
    } else if (record.ms > this.options.slowMs) {
      this.onEvent({ type: 'slow_page', url, detail: `${record.ms}ms` });
    }
    // 2xx HTML 才解析
    const ct = record.contentType;
    if (!record.error && record.status >= 200 && record.status < 300 && /html|xml/i.test(ct) && r.body) {
      this.parseAndExpand(record, r.body, url);
    }
  }

  parseAndExpand(record, body, entryUrl) {
    let text;
    try { const d = core.decodeHtml(body, record.contentType); text = d.text; record.charset = d.charset; } catch (_) { text = body.toString('utf8'); }
    const scan = core.scanHtml(text);
    record.title = scan.title; record.titleLen = scan.title.length;
    record.description = scan.description; record.descLen = scan.description ? scan.description.length : undefined;
    record.lang = scan.lang; record.h1Count = scan.h1Count;
    record.noindex = scan.noindex; record.metaRobots = scan.metaRobots;
    record.linkCount = scan.links.length;
    const base = scan.baseHref ? resolveUrl(scan.baseHref, entryUrl) : entryUrl;
    if (scan.metaRefreshUrl) { record.metaRefresh = resolveUrl(scan.metaRefreshUrl, base) || scan.metaRefreshUrl; }
    if (scan.canonical) record.canonical = resolveUrl(scan.canonical, base) || scan.canonical;
    record.canonicalCount = scan.canonicalCount;

    // 图片 alt / 混合内容 / 资源
    let imgNoAlt = 0;
    const mixedRefs = [];
    const assetRefs = [];
    const pageHttps = entryUrl.startsWith('https:');
    const pushAsset = (raw, kind) => {
      if (!raw) return;
      const abs = resolveUrl(raw, base);
      if (!abs) return;
      if (pageHttps && abs.startsWith('http://') && mixedRefs.length < 10) mixedRefs.push(abs);
      assetRefs.push({ url: abs, kind });
    };
    for (const img of scan.images.slice(0, core.LIMITS.assetCapPerPage)) {
      if (!img.hasAltAttr) imgNoAlt++;
      pushAsset(img.src, 'img');
    }
    for (const res of scan.resources.slice(0, core.LIMITS.assetCapPerPage)) pushAsset(res.url, res.kind);
    record.imgNoAlt = imgNoAlt;
    record.mixedRefs = mixedRefs;
    if (imgNoAlt > 0) this.onEvent({ type: 'missing_alt', url: entryUrl, detail: `${imgNoAlt} 张图缺 alt` });
    if (mixedRefs.length) this.onEvent({ type: 'mixed_content', url: entryUrl, detail: mixedRefs[0] });

    // 链接分类：域内入队 / 域外记外链
    const skipAll = scan.nofollowAll || scan.noindex;
    for (const link of scan.links) {
      if (!core.isCrawlableHref(link.href)) continue;
      const abs = resolveUrl(link.href, base);
      if (!abs) continue;
      if (this.isInternal(abs)) {
        if (!skipAll && !link.nofollow) this.enqueue(abs, (record.depth || 0) + 1, entryUrl);
      } else if (this.options.checkExternal) {
        this.noteExternal(abs, entryUrl);
      }
    }
    // 资源核查：不分内外（CDN 图挂了也是问题），全部入资源队列，受总量护栏
    if (this.options.checkAssets) {
      for (const ref of assetRefs) this.assetQueue.push(ref);
    }
  }

  // 资源用独立轻队列，页队列空了统一核查（不占页面配额，但受总量护栏）
  assetQueue = [];
  async verifyAssets() {
    const cap = Math.min(this.options.maxPages * 8, 5000);
    const list = this.assetQueue.slice(0, cap);
    const seen = new Set();
    const uniq = [];
    for (const a of list) {
      if (seen.has(a.url)) { continue; }
      seen.add(a.url);
      uniq.push(a);
    }
    for (const ref of uniq) {
      if (this.aborted) break;
      if (core.isMetadataTarget(ref.url)) continue;
      const deny = await guardTarget(ref.url, { inScope: this.isInternal(ref.url), allowPrivate: this.allowPrivate });
      if (deny) { this.assets.push({ url: ref.url, kind: ref.kind, ms: 0, error: `已拦截：${deny}`, skipped: true, source: null }); continue; }
      const host = core.hostOf(ref.url);
      await this.politeWait(host);
      const r = await rawRequest(ref.url, { timeoutMs: this.options.timeoutS * 1000, headersOnly: true, guardOpts: {} });
      this.assets.push({ url: ref.url, kind: ref.kind, status: r.status, ms: r.ms, bytes: r.bytes || 0, error: r.error, source: null });
      if (r.error || (r.status && r.status >= 400)) this.onEvent({ type: 'broken_asset', url: ref.url, detail: r.error || `HTTP ${r.status}` });
    }
    this.assetQueue = [];
  }

  noteExternal(url, source) {
    const n = core.normalizeUrl(url);
    if (!n.ok) return;
    if (core.isMetadataTarget(n.url)) return;
    let e = this.externalMap.get(n.url);
    if (!e) {
      e = { url: n.url, sources: [] };
      this.externalMap.set(n.url, e);
      this.externalOrder.push(n.url);
    }
    if (source && e.sources.length < 5 && !e.sources.includes(source)) e.sources.push(source);
  }

  /** 外链存活核查（头即断，不下载正文） */
  async verifyExternals() {
    const cap = this.options.externalCap;
    const all = this.externalOrder.slice(0, cap);
    this.externalSkipped = this.externalOrder.length - all.length;
    let idx = 0;
    const worker = async () => {
      for (;;) {
        if (this.aborted || Date.now() > this.deadline) return;
        const i = idx++;
        if (i >= all.length) return;
        const url = all[i];
        const deny = await guardTarget(url, { inScope: false, allowPrivate: this.allowPrivate });
        const rec = this.externalMap.get(url);
        if (deny) { if (rec) { rec.error = `已拦截：${deny}`; rec.skipped = true; } continue; }
        await this.politeWait(core.hostOf(url));
        const r = await requestWithChain(url, { timeoutMs: Math.min(this.options.timeoutS * 1000, 20000), headersOnly: true, maxHops: 3, guardOpts: { inScope: false, allowPrivate: this.allowPrivate } });
        if (rec) {
          rec.status = r.status || undefined;
          rec.ms = r.ms;
          rec.error = r.guarded ? r.error : (r.error && !r.status ? r.error : (r.status >= 400 ? `HTTP ${r.status}` : undefined));
        }
        if ((r.status && r.status >= 400) || (r.error && !r.status)) this.onEvent({ type: 'broken_external', url, detail: (r.error && !r.status ? r.error : `HTTP ${r.status}`) });
      }
    };
    await Promise.all(new Array(Math.min(this.options.concurrency, Math.max(1, all.length) || 1)).fill(0).map(worker));
  }

  /** 汇总（含资源核查收尾；main.js 拿这些喂 core.buildReport） */
  async collect() {
    if (this.assetQueue.length && !this.aborted && this.options.checkAssets) {
      await this.verifyAssets();
    } else if (this.assetQueue.length) {
      this.assetQueue = [];
    }
    return {
      pages: this.pages,
      assets: this.assets,
      externals: [...this.externalMap.values()],
      externalSkipped: this.externalSkipped,
      robots: this.robotsInfo || { fetched: false, crawlDelayMs: null, disallowCount: 0, sitemaps: [] },
      sitemap: this.sitemap,
      scopeHosts: [...this.scopeHosts],
      aborted: this.aborted || Date.now() > this.deadline,
      durationMs: Date.now() - this.startedAt,
      timeoutHit: Date.now() > this.deadline,
    };
  }
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function resolveUrl(href, base) {
  try { const u = new URL(href, base); if (u.protocol === 'http:' || u.protocol === 'https:') return u.toString(); return null; } catch (_) { return null; }
}
function isPrivateHost(host) {
  const h = String(host || '').split(':')[0].replace(/^\[|\]$/g, '');
  if (/^localhost$/i.test(h)) return true;
  if (/\.local$/i.test(h)) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return isPrivateIp(h);
  if (h.includes(':')) return isPrivateIp(h);
  return false;
}

module.exports = { Crawler, rawRequest, requestWithChain, guardTarget, GuardError, isPrivateIp, isPrivateHost, UA, sleep };
