#!/usr/bin/env node
'use strict';
/**
 * main.js —— 口袋快传后台服务（零依赖，node >= 18）
 *
 * 职责：
 *   - 局域网文件服务（0.0.0.0:<port>）：手机页面 + 上传/下载/删除，PIN 门禁
 *   - tick 主循环（4s）：设置热更(30s) → 消费命令键(先删后做) → TTL 清扫 →
 *     items 投影镜像 kv（本地 meta.json 为权威） → meta 心跳(60s)
 *   - /__health 恒 200：bridge 不可达也活着（降级语义见 meta.degraded），
 *     文件收发不依赖 bridge——元数据落本地 meta.json，kv 只是跨端投影
 *
 * 生命周期由宿主 PluginServiceManager 管理。启动参数：node main.js <port> <appConfigDir>
 * 存储位置：anchor.json → dataRoot 的兄弟目录 polaris-drop/（data-ark 同款约定，
 * 过渡文件不进备份源）；兜底 <appConfigDir>/pocket-drop/
 */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const core = require('../shared/core');
const { createKvClient } = require('./kvclient');
const { buildMobilePage } = require('./mobile-page');

const VERSION = '0.1.0';
const TICK_MS = 4000;
const META_BEAT_MS = 60 * 1000;
const SETTINGS_REREAD_MS = 30 * 1000;

const K = {
  settings: 'pdrop.settings',
  meta: 'pdrop.meta',
  items: 'pdrop.items',
};
const CMD_PREFIX = 'pdrop.cmd.';
const RESULT_PREFIX = 'pdrop.result.';
const EVENT_PREFIX = 'pdrop.event.';
const EVENT_KEEP = 50;

// ── 文件日志（宿主不收集插件服务 stdout，自行落盘 + 512KB 轮转）─────────────
let logFile = null;
function initLog(appConfigDir) {
  const dir = appConfigDir || os.tmpdir();
  try {
    fs.mkdirSync(dir, { recursive: true });
    logFile = path.join(dir, 'pocket-drop.log');
    try {
      const st = fs.statSync(logFile);
      if (st.size > 512 * 1024) fs.renameSync(logFile, `${logFile}.old`);
    } catch (_) { /* 不存在即首轮 */ }
  } catch (_) { logFile = null; }
}
const DEBUG = process.env.PDROP_DEBUG === '1';
function log(level, msg) {
  const line = `[pocket-drop:${level}] ${new Date().toISOString()} ${msg}`;
  if (level === 'debug' && !DEBUG) return;
  process.stderr.write(line + '\n');
  if (logFile) {
    try { fs.appendFileSync(logFile, line + '\n'); } catch (_) { /* 磁盘问题不打断主流程 */ }
  }
}

// ── 存储目录：anchor.json → dataRoot 兄弟目录（不污染备份源），兜底 appConfigDir ──
function resolveDataRoot() {
  const cands = [
    process.env.APPDATA ? path.join(process.env.APPDATA, 'Polaris', 'anchor.json') : '',
    path.join(os.homedir(), '.config', 'Polaris', 'anchor.json'),
    path.join(os.homedir(), '.polaris', 'anchor.json'),
  ];
  for (const c of cands) {
    if (!c) continue;
    try {
      const a = JSON.parse(fs.readFileSync(c, 'utf8'));
      if (a && typeof a.dataRoot === 'string' && a.dataRoot && fs.existsSync(a.dataRoot)) return a.dataRoot;
    } catch (_) { /* 跳过不可读候选 */ }
  }
  return '';
}
function resolveDropDir(appConfigDir) {
  // PDROP_STORE_DIR 仅供冒烟测试隔离存储（生产路径= dataRoot 兄弟目录）
  if (process.env.PDROP_STORE_DIR) return { base: process.env.PDROP_STORE_DIR, store: path.join(process.env.PDROP_STORE_DIR, 'store') };
  const dataRoot = resolveDataRoot();
  const base = dataRoot ? path.join(path.dirname(dataRoot), 'polaris-drop') : path.join(appConfigDir || os.tmpdir(), 'pocket-drop');
  return { base, store: path.join(base, 'store') };
}

// ── 主流程 ─────────────────────────────────────────────────────────────────
const PORT = parseInt(process.argv[2], 10) || 0;
const APP_CONFIG_DIR = process.argv[3] || '';

if (!PORT) {
  process.stderr.write('[pocket-drop:fatal] 缺少端口参数（宿主应注入 {{port}}）\n');
  process.exit(1);
}
initLog(APP_CONFIG_DIR);

const { base: DROP_DIR, store: STORE_DIR } = resolveDropDir(APP_CONFIG_DIR);
const META_FILE = path.join(DROP_DIR, 'meta.json');

const kv = createKvClient({ appConfigDir: APP_CONFIG_DIR, log });
const limiter = core.createRateLimiter({ maxFails: 5, windowMs: 60 * 1000, lockMs: 60 * 1000 });

let settings = core.normalizeSettings(null);
let settingsLoaded = false;
let items = [];            // 权威元数据（meta.json 持久化；kv 为投影）
let itemsDirty = true;     // 待镜像 kv
let degraded = false;
let lastEndpointRefreshAt = 0;
let settingsReadAt = 0;
let lastMetaAt = 0;
let pinWarned = false;
let settingsEverLoaded = false;
const startedAt = Date.now();

// ── meta.json（本地权威，原子写）────────────────────────────────────────────
function loadLocalMeta() {
  try {
    const raw = JSON.parse(fs.readFileSync(META_FILE, 'utf8'));
    if (raw && Array.isArray(raw.items)) {
      items = raw.items.filter((it) => it && it.id && typeof it.name === 'string');
      log('info', `meta.json 恢复 ${items.length} 条投递记录`);
    }
  } catch (_) { /* 首轮无文件 */ }
}
function saveLocalMeta() {
  try {
    fs.mkdirSync(DROP_DIR, { recursive: true });
    const tmp = `${META_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ version: 1, items }));
    fs.renameSync(tmp, META_FILE);
  } catch (e) {
    log('warn', `meta.json 写入失败: ${e.message}`);
  }
}

/** 条目变更唯一入口：内存变更 → 原子落盘 → 标脏镜像 kv */
function mutateItems(next) {
  items = next;
  saveLocalMeta();
  itemsDirty = true;
  mirrorItems().catch(() => {});
}

async function mirrorItems() {
  if (!itemsDirty) return;
  try {
    await kv.kvSet(K.items, { at: Date.now(), items });
    itemsDirty = false;
  } catch (e) {
    log('warn', `items 投影镜像失败（下轮重试）: ${e.message}`);
  }
}

// ── 事件流（kv 键 pdrop.event.<ts>，保留 EVENT_KEEP 条）────────────────────
async function pushEvent(type, summary) {
  // 随机后缀防同毫秒键碰撞；字典序=时间序（13位时间戳开头）
  const key = `${EVENT_PREFIX}${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
  try {
    await kv.kvSet(key, { type, at: Date.now(), summary: String(summary || '').slice(0, 300) });
    const keys = (await kv.kvKeys()).filter((k) => k.startsWith(EVENT_PREFIX));
    if (keys.length > EVENT_KEEP) {
      keys.sort();
      for (const old of keys.slice(0, keys.length - EVENT_KEEP)) await kv.kvDel(old).catch(() => {});
    }
  } catch (e) {
    log('warn', `事件写入失败: ${e.message}`);
  }
}

// ── PIN（settings 唯一权威；服务仅在键缺失时引导写默认）────────────────────
function randomPin() {
  return String(100000 + crypto.randomBytes(4).readUInt32BE(0) % 900000);
}
async function ensureSettings() {
  const raw = await kv.kvGet(K.settings).catch(() => null);
  if (raw && typeof raw === 'object' && core.isValidPin(raw.pin)) {
    const next = core.normalizeSettings(raw);
    if (settingsEverLoaded && next.pin !== settings.pin) {
      log('info', `PIN 已变更（长度 ${next.pin.length}）`);
      limiter._state.clear();
      await pushEvent('pin_changed', '访问 PIN 已变更，手机端需重新输入');
    }
    settings = next;
    settingsLoaded = true;
    settingsEverLoaded = true;
    pinWarned = false;
    return;
  }
  // 首次引导：生成随机 PIN 写入（仅当键缺失/非法时执行一次）
  settings = core.normalizeSettings({ ...core.DEFAULT_SETTINGS, pin: randomPin() });
  try {
    await kv.kvSet(K.settings, settings);
    log('info', `首次运行：已生成初始 PIN（面板可重新生成）`);
    await pushEvent('boot', '首次运行：已生成初始 PIN');
  } catch (e) {
    log('warn', `初始 PIN 写入失败: ${e.message}`);
  }
  settingsLoaded = true;
}

// ── 存储原语 ───────────────────────────────────────────────────────────────
function itemPath(id) {
  // id 必须是本服务生成的 12 位 hex，杜绝路径注入
  if (!/^[0-9a-f]{12}$/.test(String(id))) return null;
  return path.join(STORE_DIR, `${id}.bin`);
}
function storeBytes() {
  return core.totalBytes(items);
}

// ── 命令消费（先删后做；结果写 result 键）──────────────────────────────────
async function consumeCommands() {
  const keys = await kv.kvKeys();
  const cmdKeys = keys.filter((k) => k.startsWith(CMD_PREFIX));
  for (const k of cmdKeys) {
    const cmd = await kv.kvGet(k).catch(() => null);
    const delOk = await kv.kvDel(k).then(() => true).catch(() => false);
    if (!delOk) continue; // 别人抢到了，跳过
    if (!cmd || typeof cmd !== 'object') continue;
    const nonce = String(cmd.nonce || k.slice(CMD_PREFIX.length).split('.').pop() || 'unknown');
    const resultKey = `${RESULT_PREFIX}${nonce}`;
    log('info', `消费命令 ${k}`);
    try {
      if (cmd.op === 'send') await cmdSend(cmd, resultKey);
      else if (cmd.op === 'save') await cmdSave(cmd, resultKey);
      else if (cmd.op === 'clear') await cmdClear(cmd, resultKey);
      else await kv.kvSet(resultKey, { ok: false, error: `未知命令 op=${cmd.op}`, at: Date.now() }).catch(() => {});
    } catch (e) {
      log('warn', `命令 ${k} 执行失败: ${e.message}`);
      await kv.kvSet(resultKey, { ok: false, error: e.message, at: Date.now() }).catch(() => {});
    }
  }
}

/** drop_send：本地路径 → 投递区（服务直接读盘，零桥上字节） */
async function cmdSend(cmd, resultKey) {
  const src = String(cmd.path || '').trim();
  if (!src) throw new Error('缺少文件路径 path');
  let st;
  try { st = fs.statSync(src); } catch (_) { throw new Error(`文件不存在或不可读: ${src}`); }
  if (!st.isFile()) throw new Error(`不是常规文件: ${src}`);
  const capBytes = settings.maxSizeMb * 1024 * 1024;
  if (st.size > capBytes) throw new Error(`文件 ${core.formatBytes(st.size)} 超过单文件上限 ${settings.maxSizeMb} MB（可在面板设置调整）`);
  const id = core.newItemId();
  const name = core.dedupeName(items.map((it) => it.name), core.sanitizeFilename(path.basename(src)));
  fs.mkdirSync(STORE_DIR, { recursive: true });
  fs.copyFileSync(src, itemPath(id));
  const item = {
    id, name, size: st.size, at: Date.now(),
    expiresAt: Date.now() + settings.ttlHours * 3600 * 1000,
    from: 'ai', note: cmd.note ? String(cmd.note).slice(0, 200) : undefined,
  };
  const admitted = core.addItem(items, item, { totalCapBytes: settings.totalCapMb * 1024 * 1024 });
  if (!admitted.ok) {
    fs.unlinkSync(itemPath(id));
    throw new Error(admitted.reason === 'capacity'
      ? `投递区总容量不足（上限 ${settings.totalCapMb} MB），请先清理或调高上限`
      : '投递区已满，请先清理');
  }
  mutateItems(admitted.items);
  await kv.kvSet(resultKey, { ok: true, itemId: id, name, at: Date.now() });
  await pushEvent('send', `AI 投递 ${name}（${core.formatBytes(st.size)}）`);
  log('info', `drop_send 完成: ${name} (${id})`);
}

/** drop_save：投递区 → 本地绝对路径；覆盖已存在文件需 confirm */
async function cmdSave(cmd, resultKey) {
  const v = core.validateDestPath(cmd.dest);
  if (!v.ok) throw new Error(v.error);
  const it = items.find((x) => x && x.id === cmd.id);
  if (!it) throw new Error(`投递条目不存在（可能已过期或已删除）: ${cmd.id}`);
  const src = itemPath(it.id);
  if (!src || !fs.existsSync(src)) throw new Error('条目文件已丢失（存储目录被清理？）');
  let st = null;
  try { st = fs.statSync(v.dest); } catch (_) { /* 不存在=新建 */ }
  if (st && st.isDirectory()) throw new Error(`目标已是目录: ${v.dest}`);
  if (st && cmd.confirm !== true) throw new Error(`目标已存在: ${v.dest}（覆盖请传 confirm:true）`);
  fs.mkdirSync(path.dirname(v.dest), { recursive: true });
  fs.copyFileSync(src, v.dest);
  await kv.kvSet(resultKey, { ok: true, dest: v.dest, name: it.name, at: Date.now() });
  await pushEvent('save', `已保存 ${it.name} → ${v.dest}`);
  log('info', `drop_save 完成: ${it.name} → ${v.dest}`);
}

/** drop_clear：清空投递区（必须显式 confirm） */
async function cmdClear(cmd, resultKey) {
  if (cmd.confirm !== true) throw new Error('清空投递区是不可逆操作，必须传 confirm:true');
  const count = items.length;
  for (const it of items) {
    const p = itemPath(it.id);
    if (p) { try { fs.unlinkSync(p); } catch (_) { /* 已不存在 */ } }
  }
  mutateItems([]);
  await kv.kvSet(resultKey, { ok: true, count, at: Date.now() });
  await pushEvent('clear', `已清空投递区（${count} 条）`);
  log('info', `drop_clear 完成（${count} 条）`);
}

// ── TTL 清扫 ───────────────────────────────────────────────────────────────
async function sweepExpired() {
  const { expired, keep } = core.planSweep(items, Date.now());
  if (!expired.length) return;
  for (const it of expired) {
    const p = itemPath(it.id);
    if (p) { try { fs.unlinkSync(p); } catch (_) { /* 已不存在 */ } }
  }
  mutateItems(keep);
  await pushEvent('clean', `自动清理 ${expired.length} 条过期投递（TTL ${settings.ttlHours}h）`);
  log('info', `TTL 清扫 ${expired.length} 条`);
}

// ── HTTP 服务（手机同源直连；桌面面板 127.0.0.1 直传）───────────────────────
function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}
function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}
function clientIp(req) {
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}
/** PIN 门禁：限频 + 常量时间比较 */
function checkPin(req, res, url) {
  const ip = clientIp(req);
  if (!limiter.allow(ip)) {
    const ra = limiter.retryAfterSec(ip);
    res.setHeader('Retry-After', String(ra || 60));
    sendJson(res, 429, { ok: false, error: `尝试次数过多，请 ${ra || 60} 秒后重试` });
    return false;
  }
  const got = String(url.searchParams.get('pin') || '');
  if (!settings.pin) {
    sendJson(res, 503, { ok: false, error: 'PIN 尚未就绪（等待 bridge 写入初始 PIN）' });
    return false;
  }
  const a = crypto.createHash('sha256').update(String(got)).digest();
  const b = crypto.createHash('sha256').update(String(settings.pin)).digest();
  if (!crypto.timingSafeEqual(a, b)) {
    const locked = limiter.fail(ip);
    if (!pinWarned && locked) {
      pinWarned = true;
      log('warn', `IP ${ip} PIN 连续失败已触发限频`);
      pushEvent('pin_fail', `IP ${ip} PIN 连续失败，已临时锁定`).catch(() => {});
    }
    sendJson(res, 401, { ok: false, error: 'PIN 不正确' });
    return false;
  }
  return true;
}

function handleUpload(req, res, url) {
  const rawName = url.searchParams.get('name') || '';
  const capBytes = settings.maxSizeMb * 1024 * 1024;
  const totalCap = settings.totalCapMb * 1024 * 1024;
  if (items.length >= core.MAX_ITEMS) {
    sendJson(res, 507, { ok: false, error: `投递区已满（${core.MAX_ITEMS} 条），请先清理` });
    req.resume();
    return;
  }
  if (storeBytes() >= totalCap) {
    sendJson(res, 507, { ok: false, error: `投递区总容量已满（上限 ${settings.totalCapMb} MB），请先清理或调高上限` });
    req.resume();
    return;
  }
  const id = core.newItemId();
  fs.mkdirSync(STORE_DIR, { recursive: true });
  const dest = itemPath(id);
  const out = fs.createWriteStream(dest);
  let received = 0;
  let aborted = false;

  req.on('data', (chunk) => {
    if (aborted) return;
    received += chunk.length;
    if (received > capBytes) {
      aborted = true;
      out.destroy();
      fs.unlink(dest, () => {});
      sendJson(res, 413, { ok: false, error: `文件超过单文件上限 ${settings.maxSizeMb} MB（可在面板设置调整）` });
      // 留 300ms 让响应 flush 到对端再断连，否则客户端只看到网络错误看不到 413
      setTimeout(() => req.destroy(), 300);
      return;
    }
    out.write(chunk);
  });
  req.on('end', () => {
    if (aborted) return;
    out.end(() => {
      try {
        const name = core.dedupeName(items.map((it) => it.name), core.sanitizeFilename(rawName));
        const item = {
          id, name, size: received, at: Date.now(),
          expiresAt: Date.now() + settings.ttlHours * 3600 * 1000,
          from: req.headers['x-drop-from'] === 'desktop' ? 'desktop' : 'phone',
        };
        const r = core.addItem(items, item, { totalCapBytes: totalCap });
        if (!r.ok) {
          fs.unlink(dest, () => {});
          sendJson(res, 507, { ok: false, error: r.reason === 'capacity' ? '投递区总容量不足' : '投递区已满' });
          return;
        }
        mutateItems(r.items);
        log('info', `收到上传 ${name}（${core.formatBytes(received)}）来自 ${clientIp(req)}`);
        pushEvent('recv', `手机上传 ${name}（${core.formatBytes(received)}）`).catch(() => {});
        sendJson(res, 200, { ok: true, item });
      } catch (e) {
        fs.unlink(dest, () => {});
        log('warn', `上传收尾失败: ${e.message}`);
        sendJson(res, 500, { ok: false, error: '保存失败，请重试' });
      }
    });
  });
  req.on('error', () => {
    aborted = true;
    out.destroy();
    fs.unlink(dest, () => {});
  });
}

function handleDownload(req, res, url, id) {
  const p = itemPath(id);
  const it = items.find((x) => x && x.id === id);
  if (!p || !it || !fs.existsSync(p)) {
    sendJson(res, 404, { ok: false, error: '条目不存在或已过期' });
    return;
  }
  let st;
  try { st = fs.statSync(p); } catch (_) { sendJson(res, 404, { ok: false, error: '条目文件已丢失' }); return; }
  const forceDownload = url.searchParams.get('dl') === '1';
  const inline = !forceDownload && core.isPreviewable(it.name);
  const asciiName = it.name.replace(/[^\x20-\x7e]/g, '_');
  res.writeHead(200, {
    'Content-Type': core.mimeFor(it.name),
    'Content-Length': st.size,
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(it.name)}`,
    'Cache-Control': 'no-store',
  });
  const stream = fs.createReadStream(p);
  stream.pipe(res);
  stream.on('error', () => { try { res.destroy(); } catch (_) { /* ignore */ } });
}

const MOBILE_PAGE = buildMobilePage({ version: VERSION });

const server = http.createServer((req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  } catch (_) {
    sendJson(res, 400, { ok: false, error: 'bad request' });
    return;
  }
  const pathname = url.pathname;

  if (pathname === '/__health') {
    sendJson(res, 200, { ok: true, version: VERSION, degraded, uptimeSec: Math.floor((Date.now() - startedAt) / 1000), items: items.length });
    return;
  }
  if (pathname === '/' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(MOBILE_PAGE);
    return;
  }
  // 以下全部要求 PIN
  if (pathname === '/api/info' && req.method === 'GET') {
    if (!checkPin(req, res, url)) return;
    sendJson(res, 200, {
      ok: true,
      hostname: os.hostname(),
      version: VERSION,
      ttlHours: settings.ttlHours,
      maxSizeMb: settings.maxSizeMb,
      itemCount: items.length,
      items: items.map((it) => ({ id: it.id, name: it.name, size: it.size, at: it.at, expiresAt: it.expiresAt, from: it.from, note: it.note })),
    });
    return;
  }
  if (pathname === '/u' && req.method === 'POST') {
    if (!checkPin(req, res, url)) { req.resume(); return; }
    handleUpload(req, res, url);
    return;
  }
  const fmatch = /^\/f\/([0-9a-f]{12})$/.exec(pathname);
  if (fmatch && req.method === 'GET') {
    if (!checkPin(req, res, url)) return;
    handleDownload(req, res, url, fmatch[1]);
    return;
  }
  if (fmatch && req.method === 'DELETE') {
    if (!checkPin(req, res, url)) return;
    const id = fmatch[1];
    const it = items.find((x) => x && x.id === id);
    if (!it) { sendJson(res, 404, { ok: false, error: '条目不存在' }); return; }
    const p = itemPath(id);
    if (p) { try { fs.unlinkSync(p); } catch (_) { /* 已不存在 */ } }
    mutateItems(core.removeItem(items, id));
    pushEvent('del', `删除 ${it.name}`).catch(() => {});
    sendJson(res, 200, { ok: true });
    return;
  }
  sendJson(res, 404, { ok: false, error: 'not found' });
});

// 端口被占用：诚实失败退出（健康检查固定在声明端口，换端口会漂移导致重启循环）
server.on('error', (e) => {
  log('error', `服务端口 ${PORT} 监听失败: ${e.message}（被占用时请释放 9867 或在设置里停用服务）`);
  process.exit(1);
});

// ── tick 主循环 ────────────────────────────────────────────────────────────
function lanUrls() {
  const ifs = [];
  const ni = os.networkInterfaces();
  for (const name of Object.keys(ni)) {
    for (const f of ni[name] || []) {
      ifs.push({ name, address: f.address, internal: f.internal, family: f.family });
    }
  }
  return { best: core.pickLanUrl(ifs, PORT), all: ifs.filter((f) => f.family === 'IPv4' && !f.internal).map((f) => f.address) };
}

async function tick() {
  try {
    if (Date.now() - settingsReadAt > SETTINGS_REREAD_MS || !settingsLoaded) {
      await ensureSettings();
      settingsReadAt = Date.now();
    }

    await consumeCommands();
    await sweepExpired();
    await mirrorItems();

    if (Date.now() - lastMetaAt > META_BEAT_MS) {
      lastMetaAt = Date.now();
      const lan = lanUrls();
      await kv.kvSet(K.meta, {
        version: VERSION,
        pid: process.pid,
        startedAt,
        lastTickAt: Date.now(),
        bridge: (() => { const ep = kv.endpoint(); return ep ? `${ep.host}:${ep.port}` : ''; })(),
        degraded,
        port: PORT,
        lanUrl: lan.best,
        lanUrls: lan.all,
        dropDir: DROP_DIR,
        itemCount: items.length,
        storeBytes: storeBytes(),
        settings,
      }).catch((e) => log('warn', `meta 心跳失败: ${e.message}`));
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
      if (!wasDown) log('info', 'bridge 不可达，进入降级（文件收发不受影响，健康端点保持 200）');
      lastEndpointRefreshAt = Date.now();
      kv.refreshEndpoint(true).catch(() => {});
    }
  }
}

// ── 生命周期 ───────────────────────────────────────────────────────────────
process.on('uncaughtException', (e) => log('error', `uncaught: ${e.stack || e.message}`));
process.on('SIGTERM', () => { try { server.close(); } catch (_) { /* ignore */ } process.exit(0); });
process.on('SIGINT', () => { try { server.close(); } catch (_) { /* ignore */ } process.exit(0); });

loadLocalMeta();
fs.mkdirSync(STORE_DIR, { recursive: true });

server.listen(PORT, '0.0.0.0', () => {
  const lan = lanUrls();
  log('info', `口袋快传服务 v${VERSION} (pid=${process.pid}) 端口 ${PORT}，存储 ${DROP_DIR}`);
  log('info', `局域网入口: ${lan.best || '（未检测到局域网 IPv4）'}`);
});
setInterval(tick, TICK_MS);
