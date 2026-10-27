#!/usr/bin/env node
'use strict';
/**
 * host.js —— 口袋主机后台服务（零依赖，node >= 18.15）
 *
 * 职责（本机指标的唯一采样权威——单写者）：
 *   - 快采样（默认 2.5s/tick）：os.cpus() 差值 → CPU%、内存、uptime；
 *     消费 hostmon.cmd.* 命令键；按阈值评估告警（边沿触发）
 *   - 慢采样（默认 15s）：进程表（tasklist/ps）+ 监听端口（netstat/lsof/ss）
 *   - 磁盘（默认 60s）：fs.statfsSync 逐盘符（无 spawn；Node 不支持时回退 wmic/df）
 *   - 每 snapshotMs 把快照写入 cap.kv（hostmon.snapshot），心跳写 hostmon.meta
 *   - kill 命令：按 port 结束时执行时重新解析端口归属（防 PID 复用误杀），
 *     guardKill 拒绝系统进程/自身/父进程/Polaris 核心
 *
 * 跨域边界：本服务零外网请求（不 fetch 任何远端）；与宿主的全部交互走
 * 127.0.0.1 bridge（md5 token）+ cap.kv。面板/AI 只读 hostmon.* 键空间，
 * 桌面 / Web / 手机看到同一份快照——跨端一致性由 cap.kv 单事实库保证。
 *
 * 生命周期由宿主 PluginServiceManager 管理（type=http + healthCheck=/__health，
 * 任何 2xx 视为健康；桥不可达时健康端点仍返回 200，避免被误杀重启循环，
 * 降级状态写入 hostmon.meta 供面板展示）。
 *
 * 启动参数：node host.js {{port}} {{appConfigDir}}
 */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const lib = require('./lib');
const { createKvClient } = require('./kvclient');

const VERSION = '0.1.0';
const TICK_MS = 2500;
const META_BEAT_MS = 60 * 1000;
const DISK_REFRESH_MS = 60 * 1000;
const DRIVE_RESCAN_MS = 10 * 60 * 1000;
const HISTORY_CAP = 180;          // 180 × 5s ≈ 15 分钟历史环
const HISTORY_EVERY_TICKS = 2;
const EVENT_CAP = 100;            // hostmon.event.* 保留条数
const STALE_BRIDGE_RETRY_MS = 60 * 1000;
const PROC_CAP = 25;
const PORT_CAP = 100;
const CMD_TIMEOUT_MS = 10 * 1000;

// ── kv 键空间（与面板 src/model.ts、MCP mcp/server.js 三方一致）─────────────
const K = {
  snapshot: 'hostmon.snapshot',
  meta: 'hostmon.meta',
  settings: 'hostmon.settings',
  event: (at) => `hostmon.event.${String(at).padStart(13, '0')}`,
  eventPrefix: 'hostmon.event.',
  cmdPrefix: 'hostmon.cmd.',
  result: (nonce) => `hostmon.result.${nonce}`,
};

// ── 文件日志（宿主不收集插件服务 stdout，自行落盘）──────────────────────────
let logFile = null;
function initLog(appConfigDir) {
  const dir = appConfigDir || os.tmpdir();
  try {
    fs.mkdirSync(dir, { recursive: true });
    logFile = path.join(dir, 'pocket-host.log');
    try {
      const st = fs.statSync(logFile);
      if (st.size > 512 * 1024) fs.renameSync(logFile, `${logFile}.old`);
    } catch (_) { /* 不存在即首轮 */ }
  } catch (_) { logFile = null; }
}
const DEBUG = process.env.HOSTMON_DEBUG === '1';
function log(level, msg) {
  const line = `[pocket-host:${level}] ${new Date().toISOString()} ${msg}`;
  if (level === 'debug' && !DEBUG) return;
  process.stderr.write(line + '\n'); // 服务 stdout 无消费者；stderr 仅诊断
  if (logFile) {
    try { fs.appendFileSync(logFile, line + '\n'); } catch (_) { /* 磁盘问题不打断主流程 */ }
  }
}

// ── 子进程封装（GBK 感知解码 + 超时）────────────────────────────────────────
let gbkDecoder = null;
try { gbkDecoder = new TextDecoder('gbk'); } catch (_) { /* ICU 精简构建无 gbk */ }

function decodeBuf(buf) {
  if (!gbkDecoder) return buf.toString('utf8');
  try { return gbkDecoder.decode(buf); } catch (_) { return buf.toString('utf8'); }
}

function run(cmd, args, timeoutMs) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs || CMD_TIMEOUT_MS, windowsHide: true, encoding: 'buffer', maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
      const text = err && !stdout ? '' : decodeBuf(stdout || Buffer.alloc(0));
      // tasklist 找不到进程时 err.code=128 但可能有部分输出；err 且无输出才算失败
      resolve({ ok: !(err && !stdout), text, err: err && !stdout ? String(err.message || err) : null });
    });
  });
}

// ── 采样器 ─────────────────────────────────────────────────────────────────
const IS_WIN = process.platform === 'win32';
const IS_MAC = process.platform === 'darwin';

let prevCpus = os.cpus();
let lastCpuPct = null;

function sampleCpu() {
  const next = os.cpus();
  const pct = lib.cpuDelta(prevCpus, next);
  prevCpus = next;
  if (pct !== null) lastCpuPct = pct;
  return lastCpuPct;
}

function sampleMem() {
  const total = os.totalmem();
  const free = os.freemem();
  if (!total) return { memPct: null, memUsedBytes: 0 };
  return { memPct: Math.round(((total - free) / total) * 1000) / 10, memUsedBytes: total - free };
}

// 磁盘：statfsSync 优先（无 spawn）；不可用时 win 用 wmic、posix 用 df
let drivesCache = { mounts: null, at: 0 };   // win32 盘符集合（10 分钟重扫）
let disksCache = { disks: [], at: 0, via: 'none' };
let statfsBroken = false;

function probeDrives() {
  const mounts = [];
  for (let i = 67; i <= 90; i++) { // C..Z（A/B 保留给软驱，跳过减少无谓探测）
    const m = `${String.fromCharCode(i)}:\\`;
    try {
      const st = fs.statfsSync(m);
      if (st && st.blocks > 0) mounts.push(m);
    } catch (_) { /* 盘符不存在 */ }
  }
  return mounts;
}

function disksByStatfs(mounts) {
  const out = [];
  for (const m of mounts) {
    try {
      const st = fs.statfsSync(m);
      const total = st.blocks * st.bsize;
      const free = st.bavail * st.bsize;
      if (total > 0) {
        out.push({
          mount: m,
          totalGb: Math.round(total / 1073741824 * 10) / 10,
          freeGb: Math.round(free / 1073741824 * 10) / 10,
          pct: Math.round(((total - free) / total) * 1000) / 10,
        });
      }
    } catch (_) { /* 探测中途掉盘 */ }
  }
  return out;
}

function disksByWmic() {
  return run('wmic', ['logicaldisk', 'get', 'deviceid,freespace,size', '/format:csv']).then(({ ok, text }) => {
    if (!ok || !text) return [];
    const out = [];
    for (const line of text.split(/\r?\n/)) {
      const cells = lib.splitCsvLine(line.trim()).map((s) => s.trim());
      if (cells.length < 3 || !/^[A-Za-z]:$/.test(cells[1] || '')) continue;
      const total = parseInt(cells[3] || '', 10);
      const free = parseInt(cells[2] || '', 10);
      if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(free)) continue;
      out.push({
        mount: cells[1].toUpperCase() + '\\',
        totalGb: Math.round(total / 1073741824 * 10) / 10,
        freeGb: Math.round(free / 1073741824 * 10) / 10,
        pct: Math.round(((total - free) / total) * 1000) / 10,
      });
    }
    return out;
  });
}

function disksByDf() {
  return run('df', ['-kP', '/']).then(({ ok, text }) => {
    if (!ok || !text) return [];
    const lines = text.split(/\r?\n/);
    if (lines.length < 2) return [];
    const cols = lines[1].trim().split(/\s+/);
    if (cols.length < 4) return [];
    const total = parseInt(cols[1], 10) * 1024;
    const free = parseInt(cols[3], 10) * 1024;
    if (!Number.isFinite(total) || total <= 0) return [];
    return [{
      mount: cols[5] || '/',
      totalGb: Math.round(total / 1073741824 * 10) / 10,
      freeGb: Math.round(free / 1073741824 * 10) / 10,
      pct: Math.round(((total - free) / total) * 1000) / 10,
    }];
  });
}

async function refreshDisks(force) {
  const now = Date.now();
  if (!force && now - disksCache.at < DISK_REFRESH_MS) return disksCache;
  let via = 'none';
  let disks = [];
  if (typeof fs.statfsSync === 'function' && !statfsBroken) {
    try {
      if (IS_WIN) {
        if (!drivesCache.mounts || now - drivesCache.at > DRIVE_RESCAN_MS) {
          drivesCache = { mounts: probeDrives(), at: now };
        }
      }
      const mounts = IS_WIN ? (drivesCache.mounts || []) : ['/'];
      disks = disksByStatfs(mounts);
      if (disks.length || mounts.length === 0) via = 'statfs';
      else if (mounts.length) statfsBroken = true; // 全部失败才判 statfs 不可用
    } catch (_) { statfsBroken = true; }
  }
  if (!disks.length) {
    if (IS_WIN) disks = await disksByWmic();
    else disks = await disksByDf();
    if (disks.length) via = IS_WIN ? 'wmic' : 'df';
  }
  disksCache = { disks, at: now, via };
  return disksCache;
}

// 进程表 / 端口表（慢采样缓存）
let procsCache = { at: 0, rows: [] };
let portsCache = { at: 0, rows: [] };

async function refreshProcs() {
  let res;
  if (IS_WIN) res = await run('tasklist', ['/fo', 'csv', '/nh']);
  else res = await run('ps', ['-axo', 'pid,rss,comm']);
  if (!res.ok || !res.text) return procsCache;
  let rows = [];
  if (IS_WIN) rows = lib.parseTasklistCsv(res.text);
  else {
    for (const line of res.text.split(/\r?\n/).slice(1)) {
      const cols = line.trim().split(/\s+/);
      if (cols.length < 3) continue;
      const pid = parseInt(cols[0], 10);
      const memK = parseInt(cols[1], 10);
      if (!Number.isFinite(pid) || pid <= 0) continue;
      rows.push({ name: path.basename(cols.slice(2).join(' ')) || '?', pid, memK: Number.isFinite(memK) ? memK : 0 });
    }
  }
  procsCache = { at: Date.now(), rows, total: rows.length };
  return procsCache;
}

async function refreshPorts() {
  let res;
  if (IS_WIN) res = await run('netstat', ['-ano', '-p', 'tcp']);
  else if (IS_MAC) res = await run('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN']);
  else res = await run('ss', ['-tlnp']);
  if (!res.ok || !res.text) return portsCache;
  const rows = IS_WIN ? lib.parseNetstatWin(res.text) : (IS_MAC ? lib.parseLsof(res.text) : lib.parseSs(res.text));
  portsCache = { at: Date.now(), rows };
  return portsCache;
}

/** kill 前的实时归属解析：port → 现在真正占用它的 pid 列表 */
async function resolvePortOwners(port) {
  const { rows } = await refreshPorts();
  const pids = [...new Set(rows.filter((r) => r.port === port && r.pid > 0).map((r) => r.pid))];
  return pids;
}

async function procName(pid) {
  if (IS_WIN) {
    const res = await run('tasklist', ['/fo', 'csv', '/nh', '/fi', `PID eq ${pid}`]);
    const rows = lib.parseTasklistCsv(res.text || '');
    return rows.length ? rows[0].name : '';
  }
  const res = await run('ps', ['-p', String(pid), '-o', 'comm=']);
  const name = (res.text || '').trim().split(/\r?\n/)[0] || '';
  return name ? path.basename(name) : '';
}

async function killPid(pid) {
  if (IS_WIN) {
    const res = await run('taskkill', ['/PID', String(pid), '/T', '/F']);
    return { ok: res.ok, output: (res.text || '').trim() || (res.err || '') };
  }
  const res = await run('kill', ['-9', String(pid)]);
  return { ok: res.ok, output: (res.text || '').trim() || (res.err || '') };
}

// ── 主流程 ─────────────────────────────────────────────────────────────────
const PORT = parseInt(process.argv[2], 10) || 0;
const APP_CONFIG_DIR = process.argv[3] || '';
const SELF_PID = process.pid;
const PARENT_PID = process.ppid;

initLog(APP_CONFIG_DIR);

const kv = createKvClient({ appConfigDir: APP_CONFIG_DIR, log });
const alerts = new lib.AlertMachine();

let settings = lib.normalizeSettings(null);
let settingsReadAt = 0;
let tickCount = 0;
let degraded = false;
let lastBridgeErr = '';
let lastEndpointRefreshAt = 0;
const startedAt = Date.now();
const history = [];
let alertEventsCount = 0;

function baseSnapshot() {
  const mem = sampleMem();
  const procIdx = lib.procIndex(procsCache.rows || []);
  return {
    at: Date.now(),
    version: VERSION,
    host: {
      name: os.hostname(),
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      cpuModel: (os.cpus()[0] && os.cpus()[0].model) || '',
      cores: os.cpus().length,
      totalMemBytes: os.totalmem(),
    },
    cpuPct: sampleCpu(),
    memPct: mem.memPct,
    memUsedBytes: mem.memUsedBytes,
    uptimeSec: Math.floor(os.uptime()),
    loadavg: IS_WIN ? undefined : os.loadavg().map((x) => Math.round(x * 100) / 100),
    disks: disksCache.disks,
    disksVia: disksCache.via,
    procs: {
      at: procsCache.at,
      count: procsCache.total || (procsCache.rows || []).length,
      list: lib.pickProcs(procsCache.rows, { limit: PROC_CAP }),
    },
    ports: {
      at: portsCache.at,
      count: (portsCache.rows || []).length,
      list: lib.dedupePorts(portsCache.rows, procIdx, PORT_CAP),
    },
    alerts: {
      ...alerts.state,
      lowMounts: alerts.diskLowMounts ? [...alerts.diskLowMounts] : [],
    },
    history: history.map((h) => h),
  };
}

async function writeSnapshot() {
  const snap = baseSnapshot();
  await kv.kvSet(K.snapshot, snap);
  return snap;
}

async function writeMeta() {
  await kv.kvSet(K.meta, {
    version: VERSION,
    pid: SELF_PID,
    startedAt,
    lastTickAt: Date.now(),
    bridge: (() => { const ep = kv.endpoint(); return ep ? `${ep.host}:${ep.port}` : ''; })(),
    host: os.hostname(),
    disksVia: disksCache.via,
    degraded,
    lastBridgeErr: lastBridgeErr || undefined,
    historyMin: Math.round((HISTORY_CAP * TICK_MS * HISTORY_EVERY_TICKS) / 60000),
  });
}

async function retainEvents() {
  const keys = await kv.kvKeys();
  const evKeys = keys.filter((k) => k.startsWith(K.eventPrefix)).sort();
  alertEventsCount = evKeys.length;
  if (evKeys.length <= EVENT_CAP) return;
  const excess = evKeys.slice(0, evKeys.length - EVENT_CAP);
  for (const k of excess) await kv.kvDel(k).catch(() => {});
}

async function pushEvent(ev) {
  try {
    await kv.kvSet(K.event(ev.at), ev);
    await retainEvents();
  } catch (e) {
    log('warn', `事件落盘失败: ${e.message}`);
  }
}

/** 命令消费：kill（支持按 port 执行时重新解析归属，防 PID 复用误杀） */
async function handleKillCmd(nonce, raw) {
  const cmd = lib.normalizeKillCmd(raw);
  if (cmd.error) {
    await kv.kvSet(K.result(nonce), { ok: false, error: cmd.error, at: Date.now() });
    return;
  }
  let targets = [];
  if (cmd.port) {
    const pids = await resolvePortOwners(cmd.port);
    if (!pids.length) {
      await kv.kvSet(K.result(nonce), { ok: false, error: `端口 ${cmd.port} 当前无监听进程（执行时已重新解析）`, at: Date.now() });
      return;
    }
    targets = pids;
  } else {
    targets = [cmd.pid];
  }

  const results = [];
  for (const pid of targets) {
    const name = await procName(pid);
    const guard = lib.guardKill({ pid, name, selfPid: SELF_PID, parentPid: PARENT_PID });
    if (guard) {
      results.push({ pid, name, ok: false, error: guard });
      // eslint-disable-next-line no-continue
      continue;
    }
    const r = await killPid(pid);
    results.push({ pid, name, ok: r.ok, output: r.output });
  }
  const okAll = results.length > 0 && results.every((r) => r.ok);
  await kv.kvSet(K.result(nonce), {
    ok: okAll,
    byPort: cmd.port || undefined,
    results,
    at: Date.now(),
  });
  log('info', `kill 命令 ${nonce}: ${JSON.stringify(results).slice(0, 300)}`);
}

async function consumeCmds() {
  let keys;
  try {
    keys = await kv.kvKeys();
  } catch (e) {
    throw e; // 交给 tick 统一处理降级
  }
  const cmdKeys = keys.filter((k) => k.startsWith(K.cmdPrefix));
  for (const key of cmdKeys) {
    const rest = key.slice(K.cmdPrefix.length);
    const [kind, nonce] = rest.split('.');
    if (!nonce) { await kv.kvDel(key).catch(() => {}); continue; }
    let raw = null;
    try { raw = await kv.kvGet(key); } catch (_) { /* 下个 tick 重试 */ }
    await kv.kvDel(key).catch(() => {});
    if (kind === 'kill') {
      await handleKillCmd(nonce, raw).catch((e) => {
        log('warn', `kill 执行失败: ${e.message}`);
        kv.kvSet(K.result(nonce), { ok: false, error: `执行失败：${e.message}`, at: Date.now() }).catch(() => {});
      });
    }
    // 未知 kind：已删除忽略
  }
  // 清理孤儿 result（>10 分钟无人认领）
  const orphan = keys.filter((k) => k.startsWith('hostmon.result.'));
  for (const k of orphan) {
    try {
      const v = await kv.kvGet(k);
      if (v && typeof v === 'object' && typeof v.at === 'number' && Date.now() - v.at > 10 * 60 * 1000) {
        await kv.kvDel(k).catch(() => {});
      }
    } catch (_) { /* 跳过 */ }
  }
}

async function tick() {
  tickCount += 1;
  try {
    // 设置每 4 个 tick（约 10s）读一次
    if (Date.now() - settingsReadAt > 10 * 1000) {
      const raw = await kv.kvGet(K.settings).catch(() => null);
      if (raw && typeof raw === 'object') {
        settings = lib.normalizeSettings(raw);
        alerts.updateSettings(settings);
      }
      settingsReadAt = Date.now();
    }

    await consumeCmds();

    // 快采样 + 历史
    const cpuPct = sampleCpu();
    const mem = sampleMem();
    if (tickCount % HISTORY_EVERY_TICKS === 0) {
      history.push([Math.floor(Date.now() / 1000), Math.round(cpuPct || 0), Math.round(mem.memPct || 0)]);
      while (history.length > HISTORY_CAP) history.shift();
    }

    // 告警评估（磁盘用缓存）
    const events = alerts.feed({ cpuPct, memPct: mem.memPct, disks: disksCache.disks, paused: settings.paused });
    for (const ev of events) await pushEvent(ev);

    // 慢采样
    const slowMs = settings.slowMs;
    if (Date.now() - procsCache.at > slowMs) await refreshProcs();
    if (Date.now() - portsCache.at > slowMs) await refreshPorts();
    await refreshDisks(false);

    // 快照落盘
    if (tickCount % Math.max(1, Math.round(settings.snapshotMs / TICK_MS)) === 0) {
      await writeSnapshot();
    }
    // 心跳
    if (Date.now() - lastMetaAt > META_BEAT_MS) {
      lastMetaAt = Date.now();
      await writeMeta();
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
    if (!wasDown || Date.now() - lastEndpointRefreshAt > STALE_BRIDGE_RETRY_MS) {
      if (!wasDown) log('info', 'bridge 不可达，进入降级（健康端点保持 200）');
      lastEndpointRefreshAt = Date.now();
      kv.refreshEndpoint(true).catch(() => {});
    }
  }
}

let lastMetaAt = 0;

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

log('info', `pocket-host service v${VERSION} start (pid=${SELF_PID}, platform=${os.platform()}-${os.arch()})`);

// 首轮立即采样（进程/端口/磁盘），随后进入固定 tick
(async () => {
  try {
    await Promise.all([refreshProcs(), refreshPorts(), refreshDisks(true)]);
    await writeSnapshot();
    lastMetaAt = 0;
  } catch (e) {
    log('warn', `首轮采样降级: ${e.message}`);
  }
  setInterval(tick, TICK_MS);
})();
