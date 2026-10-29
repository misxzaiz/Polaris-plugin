#!/usr/bin/env node
'use strict';
/**
 * net.js —— 网络哨兵后台服务（零依赖，node >= 18.15）
 *
 * 职责（网络探测的唯一权威——单写者）：
 *   - 每 tick（默认 10s）对全部启用目标并发探测：域名先 dns.lookup（OS 解析器，
 *     测 dnsMs）再对解析出的 IP 做 TCP 握手（测 connectMs）；错误按
 *     classifyConnectError 分类（RST 类=IP 已应答，算通——探测语义是网络
 *     可达性而非服务可用性，SYN→RST 往返仍是有效 RTT）
 *   - 分钟聚合（RoundAgg）→ 小时桶（netmon.h.<YYYYMMDDHH>，每 tick 写当前
 *     桶=写前持久，重启自 kv 续写当前小时）
 *   - 网关自动发现（powershell/route/ip，10min 刷新）
 *   - 在线判定（锚点 ≥2 可达）+ NetEventMachine 事件（边沿触发不轰炸）
 *   - 命令消费：cmd.speed.*（测速，confirm + SSRF 守卫）、cmd.targets.*（目标
 *     原子增删改——netmon.targets 由本服务独占写）
 *   - 保留清扫（10min）：旧小时桶 / 超额事件 / 超额测速 / 孤儿 result
 *
 * 跨域边界：全部探测在服务原生执行（net.connect/dns.lookup/http.get），
 * 浏览器 CORS 面为零；与宿主交互只走 127.0.0.1 bridge（md5 token）+ cap.kv，
 * 面板/AI 只读写 netmon.* 键空间——桌面/Web/手机看到同一份网络事实。
 *
 * 生命周期由宿主 PluginServiceManager 管理（type=http + healthCheck=/__health，
 * 任何 2xx 视为健康；桥不可达时健康端点仍返回 200 防重启循环，降级状态写
 * netmon.meta 供面板展示）。
 *
 * 启动参数：node net.js {{port}} {{appConfigDir}}
 */
const http = require('http');
const net = require('net');
const dns = require('dns');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const lib = require('./lib');
const { createKvClient } = require('./kvclient');

const VERSION = '0.1.0';
const SETTINGS_READ_MS = 10 * 1000;
const META_BEAT_MS = 60 * 1000;
const SWEEP_MS = 10 * 60 * 1000;
const GATEWAY_RESCAN_MS = 10 * 60 * 1000;
const RECENT_CAP = 90;            // 每目标最近 90 轮（≈15min @10s）
const SPEED_TIMEOUT_MS = 35 * 1000;
const SPEED_REDIRECTS = 3;
const CMD_TIMEOUT_MS = 8 * 1000;

// ── kv 键空间（与面板 src/model.ts、MCP mcp/server.js 三方一致）─────────────
const K = {
  snapshot: 'netmon.snapshot',
  meta: 'netmon.meta',
  settings: 'netmon.settings',
  targets: 'netmon.targets',
  hour: () => `netmon.h.${lib.hourKey(Date.now())}`,
  hourPrefix: 'netmon.h.',
  event: (at) => `netmon.event.${String(at).padStart(13, '0')}`,
  eventPrefix: 'netmon.event.',
  speed: (at) => `netmon.speed.${String(at).padStart(13, '0')}`,
  speedPrefix: 'netmon.speed.',
  cmdPrefix: 'netmon.cmd.',
  result: (nonce) => `netmon.result.${nonce}`,
};

// ── 文件日志（宿主不收集插件服务 stdout，自行落盘）──────────────────────────
let logFile = null;
function initLog(appConfigDir) {
  const dir = appConfigDir || os.tmpdir();
  try {
    fs.mkdirSync(dir, { recursive: true });
    logFile = path.join(dir, 'net-sentinel.log');
    try {
      const st = fs.statSync(logFile);
      if (st.size > 512 * 1024) fs.renameSync(logFile, `${logFile}.old`);
    } catch (_) { /* 不存在即首轮 */ }
  } catch (_) { logFile = null; }
}
const DEBUG = process.env.NETMON_DEBUG === '1';
function log(level, msg) {
  const line = `[net-sentinel:${level}] ${new Date().toISOString()} ${msg}`;
  if (level === 'debug' && !DEBUG) return;
  process.stderr.write(line + '\n'); // 服务 stdout 无消费者；stderr 仅诊断
  if (logFile) {
    try { fs.appendFileSync(logFile, line + '\n'); } catch (_) { /* 磁盘问题不打断主流程 */ }
  }
}

// ── GBK 感知子进程封装（网关发现用）────────────────────────────────────────
let gbkDecoder = null;
try { gbkDecoder = new TextDecoder('gbk'); } catch (_) { /* ICU 精简构建无 gbk */ }

function decodeBuf(buf) {
  if (!gbkDecoder) return buf.toString('utf8');
  try { return gbkDecoder.decode(buf); } catch (_) { return buf.toString('utf8'); }
}

function run(cmd, args, timeoutMs) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs || CMD_TIMEOUT_MS, windowsHide: true, encoding: 'buffer', maxBuffer: 1024 * 1024 }, (err, stdout) => {
      const text = err && !stdout ? '' : decodeBuf(stdout || Buffer.alloc(0));
      resolve({ ok: !(err && !stdout), text, err: err && !stdout ? String(err.message || err) : null });
    });
  });
}

const IS_WIN = process.platform === 'win32';
const IS_MAC = process.platform === 'darwin';

// ── 探测器 ─────────────────────────────────────────────────────────────────
/** 计时工具：resolve 后仍可 cancel（防悬挂 socket） */
function probeOnce(target, gatewayIp, timeoutMs) {
  return new Promise((resolve) => {
    const started = Date.now();
    let done = false;
    const finish = (r) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(r);
    };
    const timer = setTimeout(() => {
      cleanup();
      finish({ ok: false, err: 'timeout' });
    }, Math.max(500, timeoutMs));

    let socket = null;
    let resolver = null;

    const cleanup = () => {
      if (socket) { try { socket.destroy(); } catch (_) { /* ignore */ } socket = null; }
    };

    const connectTo = (ip) => {
      socket = net.connect({ host: ip, port: target.port });
      socket.setNoDelay(true);
      socket.on('connect', () => {
        cleanup();
        finish({ ok: true, ms: Date.now() - connectStart, dnsMs });
      });
      socket.on('error', (e) => {
        const cls = lib.classifyConnectError(e);
        cleanup();
        finish({ ok: cls.alive, ms: cls.alive ? Date.now() - connectStart : null, err: cls.alive ? cls.note : (e.code || cls.note), dnsMs });
      });
    };

    let dnsMs = null;
    let connectStart = started;

    const host = target.kind === 'gateway' ? (target.host || gatewayIp || '') : target.host;
    if (!host) {
      finish({ ok: false, err: 'gateway-unknown' });
      return;
    }
    const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
    if (isIp) {
      connectTo(host);
    } else {
      // 域名：先测 OS 解析（含 hosts），再对解析出的 IP 握手——DNS 与链路分离归因
      const t0 = Date.now();
      resolver = dns.lookup(host, { family: 4 }, (err, addr) => {
        dnsMs = Date.now() - t0;
        if (err || !addr) {
          // IPv4 失败回退任意族（纯 v6 环境兜底）
          dns.lookup(host, (err6, addr6) => {
            if (err6 || !addr6) {
              finish({ ok: false, err: 'dns', dnsMs });
            } else {
              connectStart = Date.now();
              connectTo(addr6);
            }
          });
          return;
        }
        connectStart = Date.now();
        connectTo(addr);
      });
    }
  });
}

// ── 测速执行 ───────────────────────────────────────────────────────────────
function fetchFollow(url, redirects) {
  return new Promise((resolve, reject) => {
    http.get(url, { timeout: SPEED_TIMEOUT_MS }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (redirects <= 0) { reject(new Error('重定向过多')); return; }
        const next = new URL(res.headers.location, url).toString();
        fetchFollow(next, redirects - 1).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      resolve(res);
    }).on('timeout', function onTimeout() {
      this.destroy(new Error('timeout'));
    }).on('error', reject);
  });
}

/** 下载计速：至多 capBytes 字节 / SPEED_TIMEOUT_MS；返回 {ok, bytes, durMs, latencyMs, mbps, err?} */
async function runSpeedtest(url, capBytes) {
  const t0 = Date.now();
  let latencyMs = null;
  let bytes = 0;
  try {
    const stream = await fetchFollow(url, SPEED_REDIRECTS);
    return await new Promise((resolve) => {
      const finish = (ok, err) => {
        const durMs = Math.max(1, Date.now() - t0);
        stream.destroy();
        resolve({
          ok,
          bytes,
          durMs,
          latencyMs,
          mbps: ok && durMs > 0 ? Math.round((bytes * 8 / durMs) / 1000) / 10 : null,
          ...(err ? { err: String(err).slice(0, 120) } : {}),
        });
      };
      stream.on('data', (c) => {
        if (latencyMs === null) latencyMs = Date.now() - t0;
        bytes += c.length;
        if (bytes >= capBytes) finish(true);
      });
      stream.on('end', () => finish(bytes > 0));
      stream.on('error', (e) => finish(false, e.message));
      setTimeout(() => finish(bytes > 0), SPEED_TIMEOUT_MS).unref?.();
    });
  } catch (e) {
    return { ok: false, bytes, durMs: Math.max(1, Date.now() - t0), latencyMs, mbps: null, err: String(e.message || e).slice(0, 120) };
  }
}

// ── 主流程 ─────────────────────────────────────────────────────────────────
const PORT = parseInt(process.argv[2], 10) || 0;
const APP_CONFIG_DIR = process.argv[3] || '';
const SELF_PID = process.pid;

initLog(APP_CONFIG_DIR);

const kv = createKvClient({ appConfigDir: APP_CONFIG_DIR, log });
const machine = new lib.NetEventMachine();

let settings = lib.normalizeSettings(null);
let settingsReadAt = 0;
let targetsState = null;           // {v1, targets:[...]}（本服务独占写）
let degraded = false;
let lastBridgeErr = '';
let lastEndpointRefreshAt = 0;
let gatewayIp = '';
let lastGatewayRescanAt = 0;
let curHourKey = lib.hourKey(Date.now());
let curBucket = null;              // 当前小时桶（内存），每 tick 持久化
let curMinuteIdx = lib.minuteIdxOf(Date.now());
let curAggs = new Map();           // tid → RoundAgg（当前分钟）
let tickTimer = null;
let tickMs = 0;
let probing = false;
let speedJob = null;               // {at, url, mb}
let timerRef = null;
const startedAt = Date.now();
const recent = new Map();          // tid → [[t, ms|null], ...]
const counts = { rounds: 0, probes: 0, losses: 0 };
const speedsRecent = [];           // 最近 3 条测速记录（新在前）

async function loadTargets() {
  const raw = await kv.kvGet(K.targets).catch(() => null);
  if (raw && typeof raw === 'object' && Array.isArray(raw.targets) && raw.targets.length) {
    targetsState = lib.normalizeTargets(raw);
  } else {
    targetsState = { v1: 1, targets: lib.DEFAULT_TARGETS.map((t) => ({ ...t })) };
    await kv.kvSet(K.targets, targetsState).catch(() => {});
  }
}

function enabledTargets() {
  return (targetsState.targets || []).filter((t) => t.enabled !== false);
}

async function persistTargets() {
  await kv.kvSet(K.targets, targetsState);
}

async function writeSnapshot() {
  const round = {};
  for (const t of enabledTargets()) {
    const r = lastRound.get(t.id);
    if (r) round[t.id] = r;
  }
  const targetsMeta = (targetsState.targets || []).map((t) => ({
    id: t.id, label: t.label, host: t.kind === 'gateway' ? (t.host || gatewayIp || '(自动发现)') : t.host, port: t.port, kind: t.kind, enabled: t.enabled !== false,
  }));
  const recentObj = {};
  for (const [tid, arr] of recent) recentObj[tid] = arr;
  const snap = {
    at: Date.now(),
    version: VERSION,
    tickSec: settings.tickSec,
    online: machine.online === true,
    round,
    targets: targetsMeta,
    recent: recentObj,
    speeds: speedsRecent.slice(0, 3),
    speeding: speedJob,
    counts,
  };
  await kv.kvSet(K.snapshot, snap);
  return snap;
}

const lastRound = new Map();

async function writeMeta() {
  await kv.kvSet(K.meta, {
    version: VERSION,
    pid: SELF_PID,
    startedAt,
    lastTickAt: Date.now(),
    bridge: (() => { const ep = kv.endpoint(); return ep ? `${ep.host}:${ep.port}` : ''; })(),
    gateway: gatewayIp || undefined,
    degraded,
    lastBridgeErr: lastBridgeErr || undefined,
    retentionHours: settings.retentionHours,
    tickSec: settings.tickSec,
  });
}

async function pushEvent(ev) {
  try {
    await kv.kvSet(K.event(ev.at), ev);
  } catch (e) {
    log('warn', `事件落盘失败: ${e.message}`);
  }
}

// ── 分钟聚合 + 小时桶 ───────────────────────────────────────────────────────
function rollMinuteIfNeeded(now) {
  const hk = lib.hourKey(now);
  const mi = lib.minuteIdxOf(now);
  if (hk !== curHourKey) {
    flushAggs();
    curHourKey = hk;
    curBucket = null;
    curMinuteIdx = mi;
    return;
  }
  if (mi !== curMinuteIdx) {
    flushAggs();
    curMinuteIdx = mi;
  }
}

/** 分钟跨点：把当前分钟聚合 take（复位）进桶；跨小时则整个桶换新 */
function flushAggs() {
  if (!curAggs.size) return;
  const base = curBucket || { v1: 1, at: Date.now(), byTarget: {} };
  let b = base;
  for (const [tid, agg] of curAggs) {
    if (!agg.has) continue;
    b = lib.bucketUpsert(b, tid, agg.take(curMinuteIdx));
  }
  curBucket = b;
  curAggs = new Map();
}

async function resumeBucket() {
  try {
    const raw = await kv.kvGet(K.hour());
    if (raw && typeof raw === 'object' && raw.v1 === 1) {
      curBucket = { v1: 1, at: raw.at || Date.now(), byTarget: { ...(raw.byTarget || {}) } };
      log('info', `已续写当前小时桶 ${curHourKey}（${Object.keys(curBucket.byTarget).length} 目标）`);
    }
  } catch (_) { /* 首轮或桥未就绪 */ }
}

// ── tick ───────────────────────────────────────────────────────────────────
async function tick() {
  if (probing) return; // 重入守卫：上轮未完成（超时堆积）则跳过本轮
  probing = true;
  try {
    // 设置读取
    if (Date.now() - settingsReadAt > SETTINGS_READ_MS) {
      const raw = await kv.kvGet(K.settings).catch(() => null);
      if (raw && typeof raw === 'object') {
        const next = lib.normalizeSettings(raw);
        if (next.tickSec !== settings.tickSec && tickMs > 0) log('info', `tick 间隔调整 ${settings.tickSec}s → ${next.tickSec}s`);
        settings = next;
      }
      settingsReadAt = Date.now();
    }

    rollMinuteIfNeeded(Date.now());

    // 并发探测
    const list = enabledTargets();
    const jobs = list.map(async (t) => ({ t, r: await probeOnce(t, gatewayIp, settings.timeoutMs) }));
    const results = await Promise.all(jobs);
    counts.rounds += 1;

    const rounds = {};
    for (const { t, r } of results) {
      counts.probes += 1;
      lastRound.set(t.id, r.ok
        ? { ok: true, ms: r.ms, ...(r.dnsMs !== null ? { dnsMs: r.dnsMs } : {}), at: Date.now() }
        : { ok: false, err: r.err || 'error', ...(r.dnsMs !== null && r.dnsMs !== undefined ? { dnsMs: r.dnsMs } : {}), at: Date.now() });
      if (!r.ok) counts.losses += 1;
      rounds[t.id] = r.ok ? { ok: true, ms: r.ms } : { ok: false, ms: null };

      const arr = recent.get(t.id) || [];
      arr.push([Math.floor(Date.now() / 1000), r.ok ? r.ms : null]);
      while (arr.length > RECENT_CAP) arr.shift();
      recent.set(t.id, arr);

      let agg = curAggs.get(t.id);
      if (!agg) { agg = new lib.RoundAgg(); curAggs.set(t.id, agg); }
      agg.add(r.ok, r.ms);
    }

    // 事件评估
    const events = machine.feed(rounds, list, settings);
    for (const ev of events) {
      await pushEvent(ev);
      log('info', `事件: ${ev.summary}`);
    }

    // 桶持久化（写前持久：当前分钟以部分数据落盘，重启续写）
    await persistBucketNow();

    // 快照 + 心跳
    await writeSnapshot();
    if (!lastMetaAt || Date.now() - lastMetaAt > META_BEAT_MS) {
      lastMetaAt = Date.now();
      await writeMeta();
    }

    // 命令消费（先删后做）
    await consumeCmds();

    // 清扫
    if (Date.now() - lastSweepAt > SWEEP_MS) {
      lastSweepAt = Date.now();
      await sweep().catch((e) => log('warn', `清扫失败: ${e.message}`));
    }
    // 网关重扫
    if (Date.now() - lastGatewayRescanAt > GATEWAY_RESCAN_MS) {
      lastGatewayRescanAt = Date.now();
      discoverGateway().catch(() => {});
    }

    // 从降级恢复
    if (degraded) {
      degraded = false;
      lastBridgeErr = '';
      log('info', 'bridge 已恢复');
    }
  } catch (e) {
    // 桥不可达：降级但不退出（健康端点仍 200，防重启循环）；降级期间限频重试端点重发现
    const wasDown = degraded;
    degraded = true;
    lastBridgeErr = e.message;
    log('warn', `tick 降级: ${e.message}`);
    if (!wasDown || Date.now() - lastEndpointRefreshAt > 60 * 1000) {
      lastEndpointRefreshAt = Date.now();
      kv.refreshEndpoint(true).catch(() => {});
    }
  } finally {
    probing = false;
  }
}

let lastMetaAt = 0;
let lastSweepAt = 0;

/** 桶落盘：对当前分钟做免复位快照（copy 聚合值），不破坏内存聚合 */
async function persistBucketNow() {
  let b = curBucket || { v1: 1, at: Date.now(), byTarget: {} };
  for (const [tid, agg] of curAggs) {
    if (!agg.has) continue;
    // 免复位：手工构造记录（与 RoundAgg.take 同构）
    const cnt = agg.cnt;
    const loss = agg.loss;
    const okN = cnt - loss;
    const avgX10 = okN > 0 ? Math.round((agg.sum / okN) * 10) : null;
    b = lib.bucketUpsert(b, tid, [curMinuteIdx, avgX10, agg.max, loss, cnt]);
  }
  curBucket = b;
  await kv.kvSet(K.hour(), curBucket);
}

// ── 命令消费 ───────────────────────────────────────────────────────────────
async function consumeCmds() {
  const keys = await kv.kvKeys();
  const cmdKeys = keys.filter((k) => k.startsWith(K.cmdPrefix));
  for (const key of cmdKeys) {
    const rest = key.slice(K.cmdPrefix.length);
    const [kind, nonce] = rest.split('.');
    if (!nonce) { await kv.kvDel(key).catch(() => {}); continue; }
    let raw = null;
    try { raw = await kv.kvGet(key); } catch (_) { /* 下个 tick 重试 */ }
    await kv.kvDel(key).catch(() => {});
    if (kind === 'speed') {
      handleSpeedCmd(nonce, raw).catch((e) => {
        log('warn', `测速执行失败: ${e.message}`);
        kv.kvSet(K.result(nonce), { ok: false, error: `执行失败：${e.message}`, at: Date.now() }).catch(() => {});
      });
    } else if (kind === 'targets') {
      await handleTargetsCmd(nonce, raw).catch((e) => {
        log('warn', `targets 命令失败: ${e.message}`);
        kv.kvSet(K.result(nonce), { ok: false, error: `执行失败：${e.message}`, at: Date.now() }).catch(() => {});
      });
    }
    // 未知 kind：已删除忽略
  }
}

async function handleTargetsCmd(nonce, raw) {
  const cmd = lib.normalizeTargetsCmd(raw);
  if (cmd.error) {
    await kv.kvSet(K.result(nonce), { ok: false, error: cmd.error, at: Date.now() });
    return;
  }
  const list = (targetsState.targets || []).slice();
  if (cmd.action === 'add') {
    if (list.some((t) => t.id === cmd.target.id)) {
      await kv.kvSet(K.result(nonce), { ok: false, error: `目标 id 已存在：${cmd.target.id}`, at: Date.now() });
      return;
    }
    if (list.length >= lib.TARGET_MAX) {
      await kv.kvSet(K.result(nonce), { ok: false, error: `目标数已达上限 ${lib.TARGET_MAX}`, at: Date.now() });
      return;
    }
    list.push(cmd.target);
  } else if (cmd.action === 'remove') {
    const i = list.findIndex((t) => t.id === cmd.id);
    if (i < 0) {
      await kv.kvSet(K.result(nonce), { ok: false, error: `未找到目标：${cmd.id}`, at: Date.now() });
      return;
    }
    list.splice(i, 1);
    recent.delete(cmd.id);
    lastRound.delete(cmd.id);
  } else if (cmd.action === 'enable' || cmd.action === 'disable') {
    const t = list.find((x) => x.id === cmd.id);
    if (!t) {
      await kv.kvSet(K.result(nonce), { ok: false, error: `未找到目标：${cmd.id}`, at: Date.now() });
      return;
    }
    t.enabled = cmd.action === 'enable';
  }
  targetsState = lib.normalizeTargets(list);
  await persistTargets();
  await kv.kvSet(K.result(nonce), { ok: true, at: Date.now(), payload: { targets: targetsState.targets } });
  log('info', `targets ${cmd.action} → 共 ${targetsState.targets.length} 个目标`);
}

async function handleSpeedCmd(nonce, raw) {
  const cmd = lib.normalizeSpeedCmd(raw, settings);
  if (cmd.error) {
    await kv.kvSet(K.result(nonce), { ok: false, error: cmd.error, at: Date.now() });
    return;
  }
  if (speedJob) {
    await kv.kvSet(K.result(nonce), { ok: false, error: '已有测速在进行中（每服务同时只跑一个）', at: Date.now() });
    return;
  }
  const guarded = lib.guardSpeedUrl(cmd.url, { allowPrivate: cmd.allowPrivate });
  if (guarded.error) {
    await kv.kvSet(K.result(nonce), { ok: false, error: guarded.error, at: Date.now() });
    return;
  }
  const url = guarded.url.includes('{bytes}')
    ? guarded.url.replace(/\{bytes\}/g, String(cmd.mb * 1000 * 1000))
    : guarded.url;
  speedJob = { at: Date.now(), url: guarded.url, mb: cmd.mb };
  try {
    log('info', `测速开始: ${guarded.url} (cap ${cmd.mb}MB, allowPrivate=${cmd.allowPrivate})`);
    const r = await runSpeedtest(url, cmd.mb * 1000 * 1000);
    const record = { at: Date.now(), url: guarded.url, mb: cmd.mb, ok: r.ok, mbps: r.mbps, bytes: r.bytes, durMs: r.durMs, latencyMs: r.latencyMs, ...(r.err ? { err: r.err } : {}) };
    speedsRecent.unshift(record);
    while (speedsRecent.length > 3) speedsRecent.pop();
    await kv.kvSet(K.speed(record.at), record);
    await kv.kvSet(K.result(nonce), {
      ok: r.ok,
      at: Date.now(),
      payload: { mbps: r.mbps, bytes: r.bytes, durMs: r.durMs, latencyMs: r.latencyMs, url: guarded.url },
      ...(r.ok ? {} : { error: r.err || '测速失败' }),
    });
    log('info', `测速完成: ${r.ok ? `${r.mbps} Mbps (${r.bytes}B / ${r.durMs}ms)` : `失败 ${r.err}`}`);
  } finally {
    speedJob = null;
  }
}

// ── 保留清扫 ───────────────────────────────────────────────────────────────
async function sweep() {
  const keys = await kv.kvKeys();
  const del = lib.retentionPlan(keys, {
    retentionHours: settings.retentionHours,
    now: Date.now(),
  });
  // result 孤儿（nonce 键名无时间戳语义）：读值内 at，>15min 无人认领即删
  for (const k of keys) {
    if (!k.startsWith('netmon.result.')) continue;
    try {
      const v = await kv.kvGet(k);
      if (v && typeof v === 'object' && typeof v.at === 'number' && Date.now() - v.at > 15 * 60 * 1000) del.push(k);
    } catch (_) { /* 跳过 */ }
  }
  for (const k of del) await kv.kvDel(k).catch(() => {});
  if (del.length) log('info', `清扫 ${del.length} 个过期键`);
}

// ── 网关发现 ───────────────────────────────────────────────────────────────
async function discoverGateway() {
  let gw = '';
  if (IS_WIN) {
    const r = await run('powershell', ['-NoProfile', '-Command', "(Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Sort-Object RouteMetric | Select-Object -First 1 -ExpandProperty NextHop)"], 8 * 1000);
    gw = lib.parseGatewayWin(r.text);
  } else if (IS_MAC) {
    const r = await run('route', ['-n', 'get', 'default'], CMD_TIMEOUT_MS);
    gw = lib.parseGatewayMac(r.text);
  } else {
    const r = await run('ip', ['route', 'show', 'default'], CMD_TIMEOUT_MS);
    gw = lib.parseGatewayLinux(r.text);
  }
  if (gw && gw !== gatewayIp) {
    log('info', `网关发现: ${gatewayIp || '(空)'} → ${gw}`);
    gatewayIp = gw;
    await writeMeta().catch(() => {});
  }
  return gatewayIp;
}

// ── 健康端点（宿主仅看 2xx；桥不可达也返回 200，降级见 meta）────────────────
const server = http.createServer((req, res) => {
  if (req.url === '/__health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, version: VERSION, degraded, online: machine.online, uptimeSec: Math.floor((Date.now() - startedAt) / 1000) }));
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
process.on('unhandledRejection', (e) => log('error', `unhandledRejection: ${e && e.message ? e.message : e}`));
process.on('SIGTERM', () => { try { server.close(); } catch (_) { /* ignore */ } if (timerRef) clearInterval(timerRef); process.exit(0); });
process.on('SIGINT', () => { try { server.close(); } catch (_) { /* ignore */ } if (timerRef) clearInterval(timerRef); process.exit(0); });

log('info', `net-sentinel service v${VERSION} start (pid=${SELF_PID}, platform=${os.platform()}-${os.arch()})`);

/** 按设置重建定时器 */
function armTimer() {
  const ms = Math.max(5, settings.tickSec) * 1000;
  if (timerRef && tickMs === ms) return;
  if (timerRef) clearInterval(timerRef);
  tickMs = ms;
  timerRef = setInterval(tick, ms);
}

(async () => {
  await loadTargets();
  await discoverGateway().catch(() => {});
  await resumeBucket();
  armTimer();
  // 首轮立即探测（不等第一个 interval）
  lastMetaAt = 0;
  lastSweepAt = Date.now();
  tick();
  // tickSec 变化时重排定时器：轻量轮询对比
  setInterval(() => armTimer(), 5000);
})();
