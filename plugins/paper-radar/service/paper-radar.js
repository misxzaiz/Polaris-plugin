'use strict';
/**
 * paper-radar 后台服务 —— 论文雷达的抓取与调度核心
 *
 * 职责：
 *   1. 定时（按设置）向 arXiv API 拉取关注主题的最新论文
 *   2. 用共享评分核心（shared/contract.js）做相关性评分 + 一句话解读
 *   3. 生成「每日值得读」feed 落 cap.kv（paper.feed.<YYYY-MM-DD>）
 *   4. 暴露 HTTP API /api/* 供面板近身读取（MCP 走 cap.kv，本接口主要给面板）
 *
 * 跨域问题：抓取在本进程原生执行（Node http/https），浏览器同源策略
 * 不适用于服务端——这是本插件不依赖 CORS 的关键。
 *
 * 端点自发现：与 page-sentinel / news-curator 同套路（POLARIS_HOST/PORT/TOKEN
 * 环境变量 → anchor.json → config.json → 端口扫描）。
 */

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

const pluginDir = path.join(__dirname, '..');
// 复用 shared/contract.js（与 MCP、面板同一份事实库）
let contract = null;
try {
  contract = require(path.join(pluginDir, 'shared', 'contract.js'));
} catch (_) {
  // 服务独立运行旧版本：兜底内联常量
  contract = null;
}
const K = contract ? contract.K : null;
const DEFAULT_SETTINGS = (contract && contract.DEFAULT_SETTINGS) || {
  perTopic: 15, dailyTop: 12, scanHour: 8, scanIntervalHours: 8,
};
const DEFAULT_SCAN_INTERVAL_MS = 8 * 3600 * 1000;
const ARXIV_API = 'https://export.arxiv.org/api/query';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Polaris-PaperRadar/0.1';
const TAG = 'paper.service';

function log(level, msg) {
  process.stderr.write(`[${TAG}:${level}] ${new Date().toISOString()} ${msg}\n`);
}

// ── Polaris IPC 自发现（同 page-sentinel）────────────────────────────────────
const APP_CONFIG_DIR = process.argv[3] || '';
const ENV_HOST = process.env.POLARIS_HOST || '';
const ENV_PORT = parseInt(process.env.POLARIS_PORT || '', 10);
const ENV_TOKEN = process.env.POLARIS_TOKEN || '';

function configCandidates() {
  const cands = [];
  for (const anchor of [
    process.env.APPDATA ? path.join(process.env.APPDATA, 'Polaris', 'anchor.json') : '',
    path.join(os.homedir(), '.config', 'Polaris', 'anchor.json'),
    path.join(os.homedir(), '.polaris', 'anchor.json'),
  ]) {
    try {
      const a = JSON.parse(fs.readFileSync(anchor, 'utf8'));
      if (a && typeof a.dataRoot === 'string' && a.dataRoot) {
        cands.push(path.join(a.dataRoot, 'config.json'));
      }
    } catch (_) { /* 跳过不可读候选 */ }
  }
  if (APP_CONFIG_DIR) cands.push(path.join(APP_CONFIG_DIR, 'config.json'));
  if (process.env.APPDATA) cands.push(path.join(process.env.APPDATA, 'Polaris', 'config.json'));
  cands.push(path.join(os.homedir(), '.config', 'Polaris', 'config.json'));
  cands.push(path.join(os.homedir(), '.polaris', 'config.json'));
  return cands;
}

function loadWebConfig() {
  for (const p of configCandidates()) {
    try {
      const root = JSON.parse(fs.readFileSync(p, 'utf8'));
      const web = root.web || {};
      if (typeof web.port === 'number' && web.port > 0) {
        return { host: web.host || '', port: web.port, token: web.token || '' };
      }
    } catch (_) { /* 跳过 */ }
  }
  return null;
}

function healthOnce(host, port) {
  return new Promise((resolve) => {
    const req = http.get(
      { hostname: host, port, path: '/api/health', timeout: 1200 },
      (res) => { res.resume(); resolve(res.statusCode === 200); },
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

let _endpointPromise = null;
function resolveEndpoint() {
  if (!_endpointPromise) {
    _endpointPromise = (async () => {
      if (ENV_HOST && Number.isFinite(ENV_PORT)) {
        return { host: ENV_HOST, port: ENV_PORT, token: ENV_TOKEN, via: 'env' };
      }
      const cfg = loadWebConfig();
      const cfgHost = (cfg && cfg.host) || '';
      const host = cfgHost && cfgHost !== '0.0.0.0' ? cfgHost : '127.0.0.1';
      const basePort = cfg ? cfg.port : 3000;
      const token = cfg ? cfg.token : '';
      for (let i = 0; i < 25; i++) {
        // eslint-disable-next-line no-await-in-loop
        if (await healthOnce(host, basePort + i)) {
          return { host, port: basePort + i, token, via: 'scan' };
        }
      }
      return { host, port: basePort, token, via: 'fallback' };
    })();
  }
  return _endpointPromise;
}

// ── cap.kv 读写（透传 host router_dispatch）─────────────────────────────────
function dispatch(target, payload, { retries = 2, timeoutMs = 30000 } = {}) {
  const attempt = (n) => resolveEndpoint().then((ep) => new Promise((resolve, reject) => {
    const data = JSON.stringify({ req: { target, payload } });
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data),
    };
    if (ep.token) headers.Authorization = `Bearer ${crypto.createHash('md5').update(ep.token).digest('hex')}`;
    const req = http.request(
      { hostname: ep.host, port: ep.port, path: '/api/router-dispatch', method: 'POST', headers, timeout: timeoutMs },
      (res) => {
        let body = '';
        res.on('data', (c) => { body += c; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            resolve(parsed);
          } catch (_) { reject(new Error('bridge 返回非 JSON')); }
        });
      },
    );
    req.on('timeout', () => { req.destroy(new Error('bridge timeout')); });
    req.on('error', (e) => {
      if (n < retries) setTimeout(() => attempt(n + 1).then(resolve, reject), 300 * Math.pow(2, n));
      else reject(e);
    });
    req.write(data);
    req.end();
  }));
  return attempt(0);
}

async function dispatchOk(target, payload, opt) {
  const res = await dispatch(target, payload, opt);
  if (!res || res.ok !== true) {
    throw new Error((res && res.error) || `${target} dispatch 失败`);
  }
  return res.result;
}

async function kvGet(key) {
  const r = await dispatchOk('cap.kv', { action: 'get', key });
  return r && r.value !== undefined ? r.value : null;
}
async function kvSet(key, value) {
  await dispatchOk('cap.kv', { action: 'set', key, value: value === undefined ? null : value });
  return true;
}
async function kvKeys() {
  const r = await dispatchOk('cap.kv', { action: 'list' });
  return r && Array.isArray(r.keys) ? r.keys : [];
}

// ── arXiv API 抓取（原生 https，服务端无跨域）────────────────────────────────
function httpsGetText(url, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': UA } }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`arXiv HTTP ${res.statusCode}`));
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve(body));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('arXiv timeout')); });
    req.setTimeout(timeoutMs);
  });
}

/** 用正则从 arXiv Atom XML 提取条目（避免外部依赖，稳健适配） */
function parseEntries(xml) {
  const out = [];
  const re = /<entry>([\s\S]*?)<\/entry>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const seg = m[1];
    const grab = (tag) => {
      const r = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`);
      const mm = seg.match(r);
      return mm ? mm[1].trim() : '';
    };
    const id = ((grab('id').match(/arxiv\.org\/abs\/(.+)$/) || [])[1] || '').replace(/v\d+$/, '');
    const title = grab('title').replace(/\s+/g, ' ').trim();
    if (!id || !title) continue;
    const published = new Date(grab('published')).getTime();
    const updated = new Date(grab('updated')).getTime();
    const authors = [];
    const aRe = /<author>\s*<name>([\s\S]*?)<\/name>\s*<\/author>/g;
    let am;
    while ((am = aRe.exec(seg)) !== null) authors.push(am[1].trim());
    const cats = [];
    const cRe = /<category term="([^"]+)"/g;
    let cm;
    while ((cm = cRe.exec(seg)) !== null) cats.push(cm[1]);
    out.push({
      id,
      title,
      url: `https://arxiv.org/abs/${id}`,
      pdfUrl: `https://arxiv.org/pdf/${id}`,
      abstract: grab('summary').replace(/\s+/g, ' ').trim(),
      authors,
      categories: cats,
      published,
      updated,
    });
  }
  return out;
}

function buildQueryUrl(keywords, perTopic) {
  const query = keywords.map((k) => `all:"${k.replace(/"/g, '')}"`).join(' OR ');
  const params = new URLSearchParams({
    search_query: query,
    sortBy: 'submittedDate',
    sortOrder: 'descending',
    max_results: String(perTopic),
  });
  return `${ARXIV_API}?${params.toString()}`;
}

/** 抓取一个主题并评分，返回评分后的论文数组 */
async function scanTopic(topic, settings) {
  const perTopic = settings.perTopic || DEFAULT_SETTINGS.perTopic;
  const url = buildQueryUrl(topic.keywords, perTopic);
  const xml = await httpsGetText(url);
  const entries = parseEntries(xml);
  if (!entries.length) {
    log('warn', `topic「${topic.name}」无结果（query 可能过严）`);
    return [];
  }
  const ranked = contract
    ? contract.mergeAndRank(entries, [topic], -1) // -1 不截断，保留全部供综合排序
    : entries.map((e) => ({ ...e, score: 0, topMatches: [], verdict: '' }));
  log('info', `topic「${topic.name}」抓到 ${entries.length} 篇，命中 ${ranked.length} 篇`);
  return ranked;
}

/** 扫描全部启用主题，合并去重评分，生成当日 feed */
async function scanAll() {
  const settings = (await kvGet(K.settings)) || DEFAULT_SETTINGS;
  const merged = Object.assign({}, DEFAULT_SETTINGS, settings || {});
  const topicsRaw = await kvGet(K.topics);
  const topics = (Array.isArray(topicsRaw) ? topicsRaw : [])
    .map((t) => contract.normalizeTopic(t))
    .filter(Boolean)
    .filter((t) => t.enabled);
  if (!topics.length) {
    log('info', '没有启用主题，跳过扫描');
    await heartbeat('idle-no-topics');
    return { scanned: 0, feed: [] };
  }

  let all = [];
  for (const t of topics) {
    try {
      const res = await scanTopic(t, merged);
      all = all.concat(res);
    } catch (e) {
      log('error', `主题「${t.name}」扫描失败: ${e.message}`);
    }
  }

  // 合并去重（跨主题）+ 综合评分排序，截取每日上榜
  const feed = contract
    ? contract.mergeAndRank(all, topics, merged.dailyTop)
    : all.slice(0, merged.dailyTop);

  const date = new Date().toISOString().slice(0, 10);
  await kvSet(K.feed(date), {
    date,
    generatedAt: Date.now(),
    topicNames: topics.map((t) => t.name),
    count: feed.length,
    items: feed,
  });
  log('info', `已生成 ${date} feed：${feed.length} 篇`);
  await heartbeat('ok', { count: feed.length, date });
  return { scanned: all.length, feed };
}

async function heartbeat(status, extra) {
  try {
    await kvSet(K.meta, {
      version: '0.1.0',
      pid: process.pid,
      startedAt: extra?.startedAt || undefined,
      lastTickAt: Date.now(),
      lastScanAt: Date.now(),
      status,
      ...extra,
    });
  } catch (_) { /* 心跳失败不致命 */ }
}

// ── HTTP API（面板读取；健康检查 /__health）────────────────────────────────
function json(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  res.end(body);
}

function readBody(req, cb) {
  let body = '';
  req.on('data', (c) => { body += c; if (body.length > 1e6) req.destroy(); });
  req.on('end', () => cb(body));
}

function startApi(port) {
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, `http://127.0.0.1:${port}`);
    try {
      if (u.pathname === '/__health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true, service: 'paper-radar' }));
      }
      if (u.pathname === '/api/feed' && req.method === 'GET') {
        const date = u.searchParams.get('date') || new Date().toISOString().slice(0, 10);
        const feed = await kvGet(K.feed(date));
        if (!feed) return json(res, 404, { ok: false, error: '该日期尚无 feed' });
        return json(res, 200, { ok: true, feed });
      }
      if (u.pathname === '/api/scan' && req.method === 'POST') {
        const r = await scanAll();
        return json(res, 200, { ok: true, ...r });
      }
      if (u.pathname === '/api/topics' && req.method === 'GET') {
        const topics = (await kvGet(K.topics)) || [];
        return json(res, 200, { ok: true, topics });
      }
      if (u.pathname === '/api/topics' && req.method === 'POST') {
        readBody(req, async (body) => {
          try {
            const data = JSON.parse(body);
            const topics = (Array.isArray(data) ? data : []).map((t) => contract.normalizeTopic(t)).filter(Boolean);
            await kvSet(K.topics, topics);
            return json(res, 200, { ok: true, topics });
          } catch (e) { return json(res, 400, { ok: false, error: e.message }); }
        });
        return;
      }
      return json(res, 404, { ok: false, error: 'not found' });
    } catch (e) {
      log('error', `API error: ${e.message}`);
      return json(res, 500, { ok: false, error: e.message });
    }
  });
  server.listen(port, '127.0.0.1');
  log('info', `HTTP API 启动于 127.0.0.1:${port}`);
  return server;
}

// ── 调度主循环 ──────────────────────────────────────────────────────────────
function nowLocalHours() {
  const d = new Date();
  return d.getHours();
}

async function main(port, appConfigDir) {
  const PORT = Number(port) || 4317;
  startApi(PORT);

  await heartbeat('ok', { startedAt: Date.now() });
  log('info', '论文雷达服务启动');

  // 启动即首扫（若当天还没有 feed）
  try {
    const today = new Date().toISOString().slice(0, 10);
    const todayFeed = await kvGet(K.feed(today));
    if (!todayFeed) {
      log('info', '今天尚无 feed，启动时立即扫描一次');
      await scanAll();
    }
  } catch (e) {
    log('error', `启动首扫失败: ${e.message}`);
  }

  // 定时扫描：默认每 8 小时一次，且避开本地 2-4 点（arXiv 维护）
  const intervalMs = DEFAULT_SCAN_INTERVAL_MS;
  setInterval(async () => {
    const h = nowLocalHours();
    if (h >= 2 && h < 4) {
      log('info', `本地 ${h} 点（arXiv 维护窗口），跳过本次周期`);
      return;
    }
    try {
      await scanAll();
    } catch (e) {
      log('error', `周期扫描失败: ${e.message}`);
    }
  }, intervalMs);
}

// 启动参数：node service/paper-radar.js <port> <appConfigDir>
const portArg = process.argv[2];
const cfgArg = process.argv[3];
main(portArg, cfgArg).catch((e) => {
  log('error', `启动失败: ${e.message}`);
  process.exit(1);
});

// 心跳保活
setInterval(() => {
  try { heartbeat('ok').catch(() => {}); } catch (_) {}
}, 15 * 60 * 1000);

// 平滑退出
process.on('SIGTERM', () => { log('info', '收到 SIGTERM，退出'); process.exit(0); });
process.on('SIGINT', () => { log('info', '收到 SIGINT，退出'); process.exit(0); });