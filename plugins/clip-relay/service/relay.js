#!/usr/bin/env node
'use strict';
/**
 * relay.js —— 文本接力后台服务（零依赖，node >= 18，需全局 fetch）
 *
 * 职责（relay.item.* 的 enrich 单权威；条目本身由面板/MCP 写入）：
 *   - URL 条目补全：扫描 relay.item.* 中 kind=url 且未 enriched 的条目，
 *     原生 fetch 抓标题/摘要（浏览器同源策略管不到它——本插件跨域问题的
 *     根治点），回写 title/desc；失败重试 ≤3 次后标记 enrichFail 不再堵队列
 *   - 保留策略清扫（默认 10 分钟一轮）：条数上限 + 天数上限，置顶永留
 *   - 心跳 relay.meta（60s）供面板展示服务状态
 *
 * fetch 守卫：isFetchableUrl 拒绝环回/内网/链路本地地址（条目内容任何端
 * 都可写，不得让"推一条链接"变成对 localhost 的探测）。
 *
 * 生命周期由宿主 PluginServiceManager 管理（type=http + /__health；
 * 桥不可达时健康端点仍返回 200，避免被误杀重启循环，降级见 relay.meta）。
 *
 * 启动参数：node relay.js {{port}} {{appConfigDir}}
 */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const lib = require('./lib');
const { createKvClient } = require('./kvclient');

const VERSION = '0.1.0';
const TICK_MS = 4000;
const META_BEAT_MS = 60 * 1000;
const SETTINGS_REREAD_MS = 30 * 1000;
const FETCH_TIMEOUT_MS = 12000;
const MAX_ENRICH_TRIES = 3;
const ITEM_PREFIX = 'relay.item.';
const MAX_BODY_BYTES = 2 * 1024 * 1024;

const K = {
  meta: 'relay.meta',
  settings: 'relay.settings',
};

// ── 文件日志（宿主不收集插件服务 stdout，自行落盘）──────────────────────────
let logFile = null;
function initLog(appConfigDir) {
  const dir = appConfigDir || os.tmpdir();
  try {
    fs.mkdirSync(dir, { recursive: true });
    logFile = path.join(dir, 'clip-relay.log');
    try {
      const st = fs.statSync(logFile);
      if (st.size > 512 * 1024) fs.renameSync(logFile, `${logFile}.old`);
    } catch (_) { /* 不存在即首轮 */ }
  } catch (_) { logFile = null; }
}
const DEBUG = process.env.RELAY_DEBUG === '1';
function log(level, msg) {
  const line = `[clip-relay:${level}] ${new Date().toISOString()} ${msg}`;
  if (level === 'debug' && !DEBUG) return;
  process.stderr.write(line + '\n');
  if (logFile) {
    try { fs.appendFileSync(logFile, line + '\n'); } catch (_) { /* 磁盘问题不打断主流程 */ }
  }
}

// ── 抓取 ───────────────────────────────────────────────────────────────────
async function fetchPage(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PolarisClipRelay/0.1; +https://github.com/misxzaiz/Polaris-plugin)',
        'Accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
    });
  } catch (e) {
    clearTimeout(timer);
    return { ok: false, error: e.name === 'AbortError' ? '抓取超时' : String(e.message || e) };
  }
  clearTimeout(timer);
  if (!res.ok) {
    res.resume?.();
    return { ok: false, error: `HTTP ${res.status}` };
  }
  const type = String(res.headers.get('content-type') || '');
  if (type && !/text\/html|application\/xhtml|text\/plain/i.test(type)) {
    res.resume?.();
    return { ok: false, error: `非网页内容（${type.split(';')[0]}）` };
  }
  // web ReadableStream（undici）：reader 循环读取，超限即 cancel（head 足够）
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      chunks.push(Buffer.from(value));
      if (size >= MAX_BODY_BYTES) { await reader.cancel().catch(() => {}); break; }
    }
  } catch (_) {
    return { ok: false, error: '读取响应失败' };
  }
  return { ok: true, html: Buffer.concat(chunks).toString('utf8') };
}

// ── 主流程 ─────────────────────────────────────────────────────────────────
const PORT = parseInt(process.argv[2], 10) || 0;
const APP_CONFIG_DIR = process.argv[3] || '';

initLog(APP_CONFIG_DIR);

const kv = createKvClient({ appConfigDir: APP_CONFIG_DIR, log });

let settings = lib.normalizeSettings(null);
let settingsReadAt = 0;
let lastSweepAt = 0;
let degraded = false;
let lastEndpointRefreshAt = 0;
const startedAt = Date.now();
let lastMetaAt = 0;
const knownKeys = new Set(); // 已判定无需 enrich 的条目键（避免每 tick 全量回读）

/** 单条 URL 条目补全（≤3 次尝试，失败标记后不再堵队列） */
async function enrichItem(key, item) {
  const tries = (Number(item.enrichTries) || 0) + 1;
  if (!lib.isFetchableUrl(item.url)) {
    await kv.kvSet(key, lib.applyEnrich(item, { fail: '不允许抓取的地址（内网/非 http(s)）' })).catch(() => {});
    return;
  }
  const res = await fetchPage(item.url);
  if (res.ok) {
    const meta = lib.extractMeta(res.html);
    await kv.kvSet(key, lib.applyEnrich(item, meta)).catch(() => {});
    log('info', `enrich ok: ${item.url} → "${(meta.title || '').slice(0, 60)}"`);
    return;
  }
  if (tries >= MAX_ENRICH_TRIES) {
    await kv.kvSet(key, lib.applyEnrich(item, { fail: `${res.error}（已重试 ${tries} 次）` })).catch(() => {});
    log('warn', `enrich 放弃: ${item.url} — ${res.error}`);
  } else {
    await kv.kvSet(key, { ...item, enrichTries: tries }).catch(() => {});
    log('debug', `enrich 重试 ${tries}/${MAX_ENRICH_TRIES}: ${item.url} — ${res.error}`);
  }
}

/** 保留策略清扫：planRetention 纯函数出名单，这里执行删除 */
async function sweep() {
  const keys = await kv.kvKeys();
  const itemKeys = keys.filter((k) => k.startsWith(ITEM_PREFIX));
  if (!itemKeys.length) return;
  const items = await Promise.all(itemKeys.map(async (k) => {
    const v = await kv.kvGet(k).catch(() => null);
    return v && typeof v === 'object' ? v : null;
  }));
  const delIds = lib.planRetention(items.filter(Boolean), settings, Date.now());
  if (!delIds.length) return;
  const delSet = new Set(delIds);
  const targets = items.filter((it) => it && delSet.has(it.id));
  for (const it of targets) {
    await kv.kvDel(ITEM_PREFIX + it.id).catch(() => {});
  }
  log('info', `清扫 ${targets.length} 条（maxItems=${settings.maxItems}, retentionDays=${settings.retentionDays}）`);
}

async function tick() {
  try {
    if (Date.now() - settingsReadAt > SETTINGS_REREAD_MS) {
      const raw = await kv.kvGet(K.settings).catch(() => null);
      if (raw && typeof raw === 'object') settings = lib.normalizeSettings(raw);
      settingsReadAt = Date.now();
    }

    // 每_tick 一次 kvKeys：enrich 候选发现 + 超限立即清扫（不等 sweepMs 周期）
    const keys = await kv.kvKeys();
    let itemCount = 0;
    const pending = [];
    for (const k of keys) {
      if (!k.startsWith(ITEM_PREFIX)) continue;
      itemCount += 1;
      if (knownKeys.has(k)) continue;
      const it = await kv.kvGet(k).catch(() => null);
      if (!it || typeof it !== 'object') { knownKeys.add(k); continue; }
      if (it.kind !== 'url' || it.enriched === true || (Number(it.enrichTries) || 0) >= MAX_ENRICH_TRIES) {
        knownKeys.add(k);
        continue;
      }
      pending.push({ key: k, item: it });
    }
    // 超限立即清扫（15s 节流：全 pinned 等无法收敛时不会每 tick 空转）
    if (itemCount > settings.maxItems && Date.now() - lastSweepAt > 15000) {
      lastSweepAt = Date.now();
      await sweep();
    }

    // URL enrich：每 tick 处理最旧的一条待补全条目（礼貌抓取，不并发轰炸）
    if (settings.urlEnrich && pending.length) {
      pending.sort((a, b) => (a.item.createdAt || 0) - (b.item.createdAt || 0));
      const target = pending[0];
      // 不加入 knownKeys：enrich 回写后下轮重读一次并归类
      await enrichItem(target.key, target.item);
    }

    // 周期清扫（覆盖 retentionDays 维度；超限场景已由上面立即清扫兜住）
    if (Date.now() - lastSweepAt > settings.sweepMs) {
      lastSweepAt = Date.now();
      await sweep();
    }

    // 心跳
    if (Date.now() - lastMetaAt > META_BEAT_MS) {
      lastMetaAt = Date.now();
      await kv.kvSet(K.meta, {
        version: VERSION,
        pid: process.pid,
        startedAt,
        lastTickAt: Date.now(),
        bridge: (() => { const ep = kv.endpoint(); return ep ? `${ep.host}:${ep.port}` : ''; })(),
        settings: { maxItems: settings.maxItems, retentionDays: settings.retentionDays, urlEnrich: settings.urlEnrich },
      }).catch(() => {});
    }

    if (degraded) {
      degraded = false;
      log('info', 'bridge 已恢复');
    }
  } catch (e) {
    const wasDown = degraded;
    degraded = true;
    log('warn', `tick 降级: ${e.message}`);
    if (!wasDown || Date.now() - lastEndpointRefreshAt > 60 * 1000) {
      if (!wasDown) log('info', 'bridge 不可达，进入降级（健康端点保持 200）');
      lastEndpointRefreshAt = Date.now();
      kv.refreshEndpoint(true).catch(() => {});
    }
  }
}

// ── 健康端点（宿主仅看 2xx；桥不可达也返回 200，降级见 meta）────────────────
const server = http.createServer((req, res) => {
  if (req.url === '/__health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, version: VERSION, degraded, uptimeSec: Math.floor((Date.now() - startedAt) / 1000) }));
    return;
  }
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: false, error: 'not found' }));
});

if (PORT > 0) {
  server.listen(PORT, '127.0.0.1', () => log('info', `health endpoint on 127.0.0.1:${PORT}`));
  server.on('error', (e) => log('error', `health endpoint: ${e.message}`));
}

process.on('uncaughtException', (e) => log('error', `uncaught: ${e.stack || e.message}`));
process.on('SIGTERM', () => { try { server.close(); } catch (_) { /* ignore */ } process.exit(0); });
process.on('SIGINT', () => { try { server.close(); } catch (_) { /* ignore */ } process.exit(0); });

log('info', `clip-relay service v${VERSION} start (pid=${process.pid})`);
setInterval(tick, TICK_MS);
