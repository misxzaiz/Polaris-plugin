#!/usr/bin/env node
'use strict';
/**
 * stove.js —— 问灶后台服务（零依赖，node >= 18，需全局 fetch）
 *
 * 职责（服务是插件唯一的对外网络出口；库存/菜谱/计划/采购正身由面板与 MCP
 * 直接写 cap.kv，本服务不碰它们）：
 *   - 命令邮箱消费：stove.cmd.fetch.<nonce>（先删后做）→ SSRF 守卫 → 原生
 *     fetch 抓菜谱页（浏览器同源策略管不到 Node 服务——本插件跨域问题的
 *     根治点）→ 正文清洗 → stove.result.<nonce>
 *   - 心跳 stove.meta（60s）供面板/MCP 判断服务在线
 *   - 孤儿结果清扫：>15min 无人认领的 stove.result.* 删除（每 5min 一轮）
 *
 * fetch 守卫：isFetchableUrl 只放行公网 http(s)——命令键内容任何端都可写，
 * 不得让「发一个 URL」变成对 localhost/云元数据端口的探测。
 *
 * 生命周期由宿主 PluginServiceManager 管理（type=http + /__health；桥不可达
 * 时健康端点仍返回 200，避免被误杀重启循环，降级见 stove.meta）。
 *
 * 启动参数：node stove.js {{port}} {{appConfigDir}}
 */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const core = require('../shared/stove-core.js');
const { createKvClient } = require('./kvclient');

const VERSION = core.VERSION;
const TICK_MS = 4000;
const META_BEAT_MS = 60 * 1000;
const SWEEP_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const TEXT_CAP = 8000;
const RESULT_TTL_MS = 15 * 60 * 1000;

// ── 文件日志（宿主不收集插件服务 stdout，自行落盘轮转）─────────────────────
let logFile = null;
function initLog(appConfigDir) {
  const dir = appConfigDir || os.tmpdir();
  try {
    fs.mkdirSync(dir, { recursive: true });
    logFile = path.join(dir, 'ask-stove.log');
    try {
      const st = fs.statSync(logFile);
      if (st.size > 512 * 1024) fs.renameSync(logFile, `${logFile}.old`);
    } catch (_) { /* 不存在即首轮 */ }
  } catch (_) { logFile = null; }
}
const DEBUG = process.env.STOVE_DEBUG === '1';
function log(level, msg) {
  const line = `[ask-stove:${level}] ${new Date().toISOString()} ${msg}`;
  if (level === 'debug' && !DEBUG) return;
  process.stderr.write(line + '\n');
  if (logFile) {
    try { fs.appendFileSync(logFile, line + '\n'); } catch (_) { /* 磁盘问题不打断主流程 */ }
  }
}

// ── SSRF 守卫（与接力板同款纪律：只放行公网 http(s)）───────────────────────
function isFetchableUrl(rawUrl) {
  let u;
  try { u = new URL(String(rawUrl || '')); } catch (_) { return false; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const h = u.hostname.toLowerCase().replace(/\.$/, '');
  if (!h) return false;
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return false;
  if (h === '::1' || h === '[::1]' || h === '0.0.0.0') return false;
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const oct = v4.slice(1).map((x) => parseInt(x, 10));
    if (oct.some((x) => x > 255)) return false;
    const [a, b] = oct;
    if (a === 127 || a === 10 || a === 0) return false;
    if (a === 192 && b === 168) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 169 && b === 254) return false; // 链路本地/云元数据
  }
  return true;
}

// ── 抓取与正文清洗 ─────────────────────────────────────────────────────────
async function fetchPage(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PolarisAskStove/0.1; +https://github.com/misxzaiz/Polaris-plugin)',
        'Accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
    });
  } catch (e) {
    clearTimeout(timer);
    return { ok: false, error: e.name === 'AbortError' ? '抓取超时（8s）' : String(e.message || e) };
  }
  clearTimeout(timer);
  if (!res.ok) {
    res.resume?.();
    return { ok: false, error: `HTTP ${res.status}` };
  }
  const type = String(res.headers.get('content-type') || '');
  if (type && !/text\/html|application\/xhtml|text\/plain|application\/json/i.test(type)) {
    res.resume?.();
    return { ok: false, error: `非网页内容（${type.split(';')[0]}）` };
  }
  // web ReadableStream（undici）：reader 循环读取，超限即 cancel（菜谱页 2MB 足够）
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
  const finalUrl = res.url || url;
  res.resume?.();
  return { ok: true, html: Buffer.concat(chunks).toString('utf8'), finalUrl };
}

/** HTML → 标题 + 可读正文（去 script/style/nav 等，实体解码，限 8KB） */
function extractReadable(html) {
  let h = String(html || '');
  const title = (() => {
    const og = h.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
    if (og) return og[1];
    const t = h.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    return t ? t[1].trim() : '';
  })();
  h = h
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(nav|header|footer|aside|form|noscript)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  const ENT = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ', '&#x27;': "'" };
  h = h.replace(/&(amp|lt|gt|quot|#39|#x27|nbsp);/g, (m) => ENT[m] || m);
  const text = h
    .split('\n')
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length > 1)
    .join('\n')
    .slice(0, TEXT_CAP);
  return { title: title.slice(0, 120), text };
}

// ── 主流程 ─────────────────────────────────────────────────────────────────
const PORT = parseInt(process.argv[2], 10) || 0;
const APP_CONFIG_DIR = process.argv[3] || '';

initLog(APP_CONFIG_DIR);

const kv = createKvClient({ appConfigDir: APP_CONFIG_DIR, log });

let degraded = false; // 桥不可达（健康端点仍 200，meta 里如实标注）
const startedAt = Date.now();
let lastTickAt = 0;
let lastMetaAt = 0;
let lastSweepAt = 0;
let lastBridgeRefreshAt = 0;
let busy = false;

/** 消费一条抓取命令：先删后做（谁删到谁做，天然单执行者） */
async function consumeFetchCmd(key) {
  const nonce = key.slice(core.K.cmdFetchPrefix.length);
  const resultKey = `${core.K.resultPrefix}${nonce}`;
  let payload = null;
  try {
    payload = await kv.kvGet(key);
  } catch (e) {
    log('warn', `cmd 读取失败 ${key}: ${e.message}`);
    return;
  }
  if (!payload || typeof payload !== 'object') {
    await kv.kvDel(key).catch(() => {});
    return;
  }
  // 先删后做：删除成功者获得执行权；删失败（已被他端取走）则跳过
  let claimed = false;
  try {
    await kv.kvDel(key);
    claimed = true;
  } catch (_) {
    claimed = false;
  }
  if (!claimed) return;
  log('info', `消费 fetch 命令 ${nonce}: ${payload.url}`);
  let result;
  if (!isFetchableUrl(payload.url)) {
    result = { ok: false, at: Date.now(), error: '不允许抓取的地址（仅公网 http/https）' };
  } else {
    const res = await fetchPage(payload.url);
    if (res.ok) {
      const readable = extractReadable(res.html);
      if (!readable.text || readable.text.length < 20) {
        result = { ok: false, at: Date.now(), error: '页面无可提取正文（可能是纯脚本渲染页）' };
      } else {
        result = { ok: true, at: Date.now(), payload: { title: readable.title, text: readable.text, url: res.finalUrl } };
      }
    } else {
      result = { ok: false, at: Date.now(), error: res.error };
    }
  }
  await kv.kvSet(resultKey, result).catch((e) => log('warn', `结果回写失败 ${resultKey}: ${e.message}`));
}

async function tick() {
  lastTickAt = Date.now();
  let keys = null;
  try {
    keys = await kv.kvKeys();
    if (degraded) log('info', '桥恢复，退出降级');
    degraded = false;
  } catch (e) {
    if (!degraded) log('warn', `桥不可达（降级，健康端点仍 200）: ${e.message}`);
    degraded = true;
    // 桥持续不可达时周期性强制重新发现端点（端口可能变了）
    if (Date.now() - lastBridgeRefreshAt > 60 * 1000) {
      lastBridgeRefreshAt = Date.now();
      kv.refreshEndpoint().catch(() => {});
    }
    return;
  }
  const cmdKeys = keys.filter((k) => k.startsWith(core.K.cmdFetchPrefix));
  for (const k of cmdKeys) {
    // 串行消费，避免并发抓取打满出口
    // eslint-disable-next-line no-await-in-loop
    await consumeFetchCmd(k);
  }
  // 孤儿结果清扫（>15min）
  if (Date.now() - lastSweepAt > SWEEP_MS) {
    lastSweepAt = Date.now();
    const cut = Date.now() - RESULT_TTL_MS;
    for (const k of keys.filter((x) => x.startsWith(core.K.resultPrefix))) {
      // eslint-disable-next-line no-await-in-loop
      const r = await kv.kvGet(k).catch(() => null);
      if (r && typeof r === 'object' && Number(r.at) < cut) {
        // eslint-disable-next-line no-await-in-loop
        await kv.kvDel(k).catch(() => {});
        log('info', `清扫孤儿结果 ${k}`);
      }
    }
  }
}

async function beat() {
  const meta = {
    v: 1,
    version: VERSION,
    pid: process.pid,
    startedAt,
    lastTickAt,
    bridge: degraded ? 'down' : 'ok',
  };
  await kv.kvSet(core.K.meta, meta).catch((e) => log('warn', `meta 写失败: ${e.message}`));
}

// ── HTTP 外壳（宿主健康检查）───────────────────────────────────────────────
const server = http.createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/__health' || req.url === '/__health?')) {
    // 桥不可达也返回 200：健康语义=进程活着；桥状态看 meta，避免重启循环
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, version: VERSION, bridge: degraded ? 'down' : 'ok', uptimeMs: Date.now() - startedAt }));
    return;
  }
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: false, error: 'not found' }));
});

server.listen(PORT, '127.0.0.1', () => {
  log('info', `ask-stove service listening on 127.0.0.1:${PORT}`);
});

function loop() {
  const now = Date.now();
  if (!busy) {
    busy = true;
    tick().catch((e) => log('warn', `tick 异常: ${e.message}`)).finally(() => { busy = false; });
  }
  if (now - lastMetaAt >= META_BEAT_MS) {
    lastMetaAt = now;
    beat().catch(() => {});
  }
  setTimeout(loop, TICK_MS).unref?.();
}
loop();

// ── 收尾 ───────────────────────────────────────────────────────────────────
let stopping = false;
function shutdown(sig) {
  if (stopping) return;
  stopping = true;
  log('info', `收到 ${sig}，退出`);
  try { server.close(); } catch (_) { /* 忽略 */ }
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (e) => log('error', `uncaught: ${e.stack || e.message}`));
process.on('unhandledRejection', (e) => log('error', `unhandled: ${e instanceof Error ? e.message : String(e)}`));
