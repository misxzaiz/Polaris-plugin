'use strict';
/**
 * main.js —— docker-desk 后台服务（node http，仅绑 127.0.0.1）
 *
 * 形态：宿主 spawn（plugin.json services 声明，{{port}}/{{appConfigDir}} 注入）。
 * 启动参数：node main.js <port> <appConfigDir> [--engine=tcp://host:port|unix:///path|npipe:...]
 *           --engine 仅测试与高级用户需要；缺省按 DOCKER_HOST/平台默认端点解析。
 *
 * 通道：
 *  - 面板：直连 127.0.0.1:<port>，Bearer token 鉴权；token/port 经 cap.kv `dkd.service`
 *    分发（面板经宿主 invoke 读 kv，MCP server 同样读 kv）。
 *  - MCP：`/mcp/*` 路由组，**只有只读端点**——AI 通道在路由层就没有写操作可言。
 *
 * 写护栏（与 db-workbench/disk-radar 同级纪律）：
 *  - 启/停/重启：仅面板（POST /api/containers/:id/...），AI 无入口。
 *  - 删除容器/镜像：面板传 confirm=<名称>，服务端校验一致才执行（防误点/误传）。
 *  - 无 exec、无 prune 一键全删、无 compose 编排命令（明确边界，见 README）。
 *
 * 事件泵：引擎可达时维持一条 /events 长流（仅 container 类型），入内存环形缓冲；
 * 断线指数退避重连（5s→60s 封顶），重连用 since 补缺口。日志/inspect 纯实时不落盘。
 */
const http = require('http');
const crypto = require('crypto');
const core = require('../shared/core');
const { createKvClient } = require('./kvclient');
const { Store } = require('./store');
const { DockerClient } = require('./engine');

// node 的 process.argv[1] 是脚本路径本身——宿主注入的 {{port}}/{{appConfigDir}} 从 argv[2] 起
const PORT = parseInt(process.argv[2] || '0', 10) || 9895;
const APP_CONFIG_DIR = process.argv[3] || '';
const engineArg = (() => {
  const a = process.argv.find((x) => typeof x === 'string' && x.startsWith('--engine='));
  return a ? a.slice('--engine='.length) : '';
})();

function slog(msg) { process.stderr.write(`[docker-desk:svc] ${msg}\n`); }

const kv = createKvClient({ appConfigDir: APP_CONFIG_DIR, log: (l, m) => slog(`${l}: ${m}`) });
const store = new Store(kv);
const engine = new DockerClient({ engineArg });
const ENDPOINT = engine.endpoint;

const TOKEN = crypto.randomBytes(24).toString('hex');
const BOOT_AT = Date.now();

// 事件环形缓冲（内存；不落盘）
const eventRing = [];
function pushEvent(ev) {
  const e = core.normalizeEvent(ev);
  if (!e) return;
  eventRing.push(e);
  if (eventRing.length > core.LIMITS.EVENTS_RING) eventRing.splice(0, eventRing.length - core.LIMITS.EVENTS_RING);
}

// ── 事件泵（断线退避重连 + since 补缺口） ────────────────────────────────────

const pump = { running: false, lastSince: Math.floor(Date.now() / 1000) - 86400, backoff: 5000, abort: null };

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function pumpLoop() {
  if (pump.running) return;
  pump.running = true;
  try {
    for (;;) {
      let res;
      try {
        const r = await engine.events({ since: pump.lastSince, filters: { type: ['container'] } });
        res = r.res;
        pump.backoff = 5000; // 成功建流即重置退避
      } catch (e) {
        engineDown(e);
        await sleep(pump.backoff);
        pump.backoff = Math.min(pump.backoff * 2, 60000);
        continue;
      }
      if (res.statusCode !== 200) {
        engineDown(new Error(`events HTTP ${res.statusCode}`));
        res.resume();
        await sleep(pump.backoff);
        pump.backoff = Math.min(pump.backoff * 2, 60000);
        continue;
      }
      await new Promise((resolve) => {
        let buf = '';
        res.setEncoding('utf8');
        res.on('data', (c) => {
          buf += c;
          for (;;) {
            const i = buf.indexOf('\n');
            if (i === -1) break;
            const line = buf.slice(0, i).trim();
            buf = buf.slice(i + 1);
            if (!line) continue;
            try {
              const ev = JSON.parse(line);
              pushEvent(ev);
              if (typeof ev.time === 'number') pump.lastSince = Math.max(pump.lastSince, ev.time);
            } catch (_) { /* 跳过坏行 */ }
          }
        });
        res.on('end', resolve);
        res.on('error', resolve);
        pump.abort = () => { try { res.destroy(); } catch (_) { /* noop */ } resolve(); };
      });
      pump.abort = null;
      await sleep(pump.backoff);
      pump.backoff = Math.min(pump.backoff * 2, 60000);
    }
  } finally {
    pump.running = false;
  }
}

function engineDown(e) {
  const n = core.normEngineError(e);
  slog(`事件泵待机: ${n.readable}`);
}

// ── 引擎状态缓存（3s 内的重复探测直接复用） ─────────────────────────────────

const engineState = { probedAt: 0, info: null };

async function engineInfo(force) {
  if (!force && engineState.info && Date.now() - engineState.probedAt < 3000) return engineState.info;
  try {
    const [ping, ver] = await Promise.all([engine.ping(), engine.version().catch(() => null)]);
    engineState.info = {
      status: 'ok',
      endpoint: { kind: ENDPOINT.kind, target: core.describeEndpoint(ENDPOINT) },
      apiVersion: ping.apiVersion || (ver && ver.ApiVersion) || '',
      daemonVersion: (ver && ver.Version) || '',
      os: (ver && ver.Os) || ping.ostype || '',
      osType: (ver && ver.Os) || ping.ostype || '',
      arch: (ver && ver.Arch) || '',
      containers: (ver && ver.Containers) != null ? ver.Containers : null,
    };
  } catch (e) {
    const n = core.normEngineError(e);
    engineState.info = {
      status: 'absent',
      endpoint: { kind: ENDPOINT.kind, target: core.describeEndpoint(ENDPOINT) },
      error: n.readable,
      code: n.code,
    };
  }
  engineState.probedAt = Date.now();
  return engineState.info;
}

// ── HTTP 基础设施 ────────────────────────────────────────────────────────────

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(body);
}

function fail(res, code, msg) {
  json(res, code, { ok: false, error: String(msg || '未知错误').slice(0, 500) });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 256 * 1024) { reject(new Error('请求体过大')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve(text ? JSON.parse(text) : {});
      } catch (e) {
        reject(new Error('请求体不是合法 JSON'));
      }
    });
    req.on('error', reject);
  });
}

/** Bearer token 鉴权（/__health 除外） */
function authed(req) {
  const h = String(req.headers.authorization || '');
  if (!h.startsWith('Bearer ')) return false;
  const t = h.slice(7);
  if (t.length !== TOKEN.length) return false;
  return crypto.timingSafeEqual(Buffer.from(t), Buffer.from(TOKEN));
}

/** 容器短 id/名称前缀解析 → 精确 id（MCP 的 nameOrId 入口；面板传精确短 id） */
async function resolveContainer(nameOrId) {
  const q = String(nameOrId || '').trim();
  if (!q) throw new Error('容器名或 id 必填');
  const all = await engine.listContainers(true);
  const hit = all.filter((c) => c.id === q || c.name === q || c.id.startsWith(q));
  if (hit.length === 1) return hit[0];
  if (hit.length > 1) throw new Error(`「${q}」匹配到 ${hit.length} 个容器，请用更长的 id 或完整名称`);
  throw new Error(`容器「${q}」不存在（用 dk_ps 查看现有容器）`);
}

// ── 日志管道（一次性 / follow 流式） ────────────────────────────────────────

async function serveLogsOnce(res, id, tail) {
  const lines = await engine.logsOnce(id, { tail });
  json(res, 200, { ok: true, lines, truncated: lines.length >= core.LIMITS.LOG_LINES_MAX });
}

async function serveLogsFollow(req, res, id, tail) {
  const r = await engine.logs(id, { tail, follow: true });
  if (r.status >= 400) {
    let msg = `HTTP ${r.status}`;
    try { msg = JSON.parse(r.body.toString('utf8')).message || msg; } catch (_) { /* keep */ }
    fail(res, 502, msg.slice(0, 300));
    return;
  }
  res.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-cache',
    'Access-Control-Allow-Origin': '*',
  });
  const demuxer = new core.LogDemuxer();
  let sentBytes = 0;
  const writeLine = (line) => {
    const text = `[${line.stream === 'stderr' ? 'E' : 'O'}] ${line.text}\n`;
    const buf = Buffer.from(text, 'utf8');
    sentBytes += buf.length;
    res.write(buf);
    if (sentBytes > core.LIMITS.LOG_STREAM_BYTES) {
      res.write('\n[docker-desk] 日志流超过 8MB 上限，主动断开（刷新重新开始）\n');
      cleanup();
      res.end();
    }
  };
  let closed = false;
  function cleanup() {
    if (closed) return;
    closed = true;
    try { r.res.destroy(); } catch (_) { /* noop */ }
  }
  req.on('close', () => { cleanup(); try { res.end(); } catch (_) { /* noop */ } });
  r.res.on('data', (chunk) => {
    for (const line of demuxer.push(chunk)) writeLine(line);
  });
  r.res.on('error', () => { cleanup(); try { res.end(); } catch (_) { /* noop */ } });
  r.res.on('end', () => { cleanup(); try { res.end(); } catch (_) { /* noop */ } });
}

// ── 写操作护栏 ───────────────────────────────────────────────────────────────

/** confirm=<容器名> 服务端校验（删除容器/镜像的防误触语义） */
function confirmMatches(confirm, name) {
  return typeof confirm === 'string' && confirm.length > 0 && confirm === name;
}

// ── 路由 ────────────────────────────────────────────────────────────────────

async function handle(req, res) {
  const u = new URL(req.url, 'http://127.0.0.1');
  const p = u.pathname;
  if (req.method === 'OPTIONS') { json(res, 204, {}); return; }

  if (p === '/__health') { json(res, 200, { ok: true, service: 'docker-desk', version: core.VERSION, uptimeMs: Date.now() - BOOT_AT }); return; }

  if (!authed(req)) { fail(res, 401, '未授权（token 不匹配）'); return; }

  // ── 面板通道 /api/* ───────────────────────────────────────────────────────
  if (p === '/api/engine' && req.method === 'GET') {
    json(res, 200, { ok: true, engine: await engineInfo(false), events: { buffered: eventRing.length, pumpRunning: pump.running } });
    return;
  }

  if (p === '/api/containers' && req.method === 'GET') {
    const all = u.searchParams.get('all') !== '0';
    const info = await engineInfo(false);
    if (info.status !== 'ok') { json(res, 200, { ok: false, error: info.error, engine: info }); return; }
    const items = await engine.listContainers(all);
    json(res, 200, { ok: true, items, grouped: core.groupByCompose(items) });
    return;
  }

  let m = p.match(/^\/api\/containers\/([A-Za-z0-9_.-]+)\/(start|stop|restart)$/);
  if (m && req.method === 'POST') {
    const body = await readBody(req);
    const c = await resolveContainer(m[1]);
    if (m[2] === 'start') await engine.startContainer(c.id);
    else if (m[2] === 'stop') await engine.stopContainer(c.id, body.timeout);
    else await engine.restartContainer(c.id, body.timeout);
    slog(`容器 ${c.name} ${m[2]}（面板操作）`);
    json(res, 200, { ok: true, action: m[2], id: c.id, name: c.name });
    return;
  }

  m = p.match(/^\/api\/containers\/([A-Za-z0-9_.-]+)\/remove$/);
  if (m && req.method === 'POST') {
    const body = await readBody(req);
    const c = await resolveContainer(m[1]);
    if (!confirmMatches(body.confirm, c.name)) fail(res, 400, `确认失败：需要精确输入容器名「${c.name}」`);
    else {
      await engine.removeContainer(c.id, !!body.force);
      slog(`容器 ${c.name} 已删除（面板操作，force=${!!body.force}）`);
      json(res, 200, { ok: true, removed: c.name });
    }
    return;
  }

  m = p.match(/^\/api\/containers\/([A-Za-z0-9_.-]+)\/logs$/);
  if (m && req.method === 'GET') {
    const c = await resolveContainer(m[1]);
    const tail = Math.min(parseInt(u.searchParams.get('tail') || '200', 10) || 200, core.LIMITS.LOG_LINES_MAX);
    if (u.searchParams.get('follow') === '1') await serveLogsFollow(req, res, c.id, tail);
    else await serveLogsOnce(res, c.id, tail);
    return;
  }

  m = p.match(/^\/api\/containers\/([A-Za-z0-9_.-]+)\/inspect$/);
  if (m && req.method === 'GET') {
    const c = await resolveContainer(m[1]);
    json(res, 200, { ok: true, inspect: await engine.inspect(c.id), name: c.name });
    return;
  }

  m = p.match(/^\/api\/containers\/([A-Za-z0-9_.-]+)\/stats$/);
  if (m && req.method === 'GET') {
    const c = await resolveContainer(m[1]);
    json(res, 200, { ok: true, name: c.name, id: c.id, stats: core.normalizeStats(await engine.stats(c.id)) });
    return;
  }

  if (p === '/api/images' && req.method === 'GET') {
    const info = await engineInfo(false);
    if (info.status !== 'ok') { json(res, 200, { ok: false, error: info.error, engine: info }); return; }
    const items = await engine.listImages();
    json(res, 200, { ok: true, items });
    return;
  }

  m = p.match(/^\/api\/images\/([A-Za-z0-9_:./-]+)\/remove$/);
  if (m && req.method === 'POST') {
    const body = await readBody(req);
    const raw = m[1].replace(/^sha256:/, ''); // 容忍 sha256: 前缀；匹配按归一化短 id 或 repo:tag
    // confirm 校验用 repo:tag（若有 tag）或短 id；Engine 同样接受 id 前缀
    const images = await engine.listImages();
    const hit = images.find((i) => i.id === raw || `${i.repo}:${i.tag}` === raw);
    if (!hit) { fail(res, 404, `镜像「${raw}」不存在`); return; }
    const fullName = hit.repo === '<none>' ? hit.id : `${hit.repo}:${hit.tag}`;
    if (!confirmMatches(body.confirm, fullName) && !confirmMatches(body.confirm, hit.id)) {
      fail(res, 400, `确认失败：需要精确输入「${fullName}」或镜像短 id「${hit.id}」`);
      return;
    }
    await engine.removeImage(hit.id);
    slog(`镜像 ${fullName} 已删除（面板操作）`);
    json(res, 200, { ok: true, removed: fullName });
    return;
  }

  if (p === '/api/stats' && req.method === 'GET') {
    // 面板资源页：不传 nameOrId = 全部运行中容器快照（逐个取，单个失败跳过）
    const nameOrId = u.searchParams.get('nameOrId');
    const info = await engineInfo(false);
    if (info.status !== 'ok') { json(res, 200, { ok: false, error: info.error, engine: info }); return; }
    if (nameOrId) {
      const c = await resolveContainer(nameOrId);
      json(res, 200, { ok: true, items: [{ name: c.name, id: c.id, ...core.normalizeStats(await engine.stats(c.id)) }] });
      return;
    }
    const running = (await engine.listContainers(false)).filter((c) => c.state === 'running').slice(0, 50);
    const items = [];
    for (const c of running) {
      try {
        items.push({ name: c.name, id: c.id, ...core.normalizeStats(await engine.stats(c.id)) }); // eslint-disable-next-line no-await-in-loop
      } catch (_) { /* 跳过瞬时消失的容器 */ }
    }
    json(res, 200, { ok: true, items });
    return;
  }

  if (p === '/api/df' && req.method === 'GET') {
    json(res, 200, { ok: true, df: core.dfSummary(await engine.df()) });
    return;
  }

  if (p === '/api/events' && req.method === 'GET') {
    const limit = Math.min(parseInt(u.searchParams.get('limit') || '200', 10) || 200, core.LIMITS.EVENTS_RING);
    json(res, 200, { ok: true, items: eventRing.slice(-limit).reverse(), pumpRunning: pump.running });
    return;
  }

  if (p === '/api/selftest' && req.method === 'POST') {
    const pure = core.selfTest();
    const checks = [...pure.checks];
    // 引擎侧自检（只读）：ping + version + list + df；引擎缺席不算测试失败，算「未连接」
    const info = await engineInfo(true);
    if (info.status === 'ok') {
      try { await engine.listContainers(true); checks.push({ name: 'engine.listContainers', ok: true, detail: '' }); } catch (e) { checks.push({ name: 'engine.listContainers', ok: false, detail: e.message }); }
      try { await engine.df(); checks.push({ name: 'engine.df', ok: true, detail: '' }); } catch (e) { checks.push({ name: 'engine.df', ok: false, detail: e.message }); }
    } else {
      checks.push({ name: 'engine.reachable', ok: true, detail: `引擎未连接（${info.error}）——纯逻辑自检已全部执行` });
    }
    const passed = checks.filter((c) => c.ok).length;
    json(res, 200, { ok: true, selftest: { checks, passed, total: checks.length, engineStatus: info.status, at: Date.now() } });
    return;
  }

  // ── MCP 通道 /mcp/*（全部只读；写操作在路由层就不存在） ────────────────────
  if (p === '/mcp/status' && req.method === 'GET') {
    const info = await engineInfo(false);
    const out = { ...info, eventsBuffered: eventRing.length, serviceUptimeMs: Date.now() - BOOT_AT, version: core.VERSION };
    if (info.status === 'ok') {
      const items = await engine.listContainers(false).catch(() => []);
      out.runningContainers = items.filter((c) => c.state === 'running').length;
      out.totalContainers = items.length;
    }
    json(res, 200, { ok: true, engine: out });
    return;
  }

  if (p === '/mcp/ps' && req.method === 'GET') {
    const all = u.searchParams.get('all') === '1';
    const info = await engineInfo(false);
    if (info.status !== 'ok') { fail(res, 503, info.error); return; }
    const items = await engine.listContainers(all);
    json(res, 200, { ok: true, items, grouped: core.groupByCompose(items) });
    return;
  }

  if (p === '/mcp/logs' && req.method === 'GET') {
    const c = await resolveContainer(u.searchParams.get('nameOrId'));
    const tail = Math.min(parseInt(u.searchParams.get('tail') || String(core.LIMITS.MCP_LOG_TAIL), 10) || core.LIMITS.MCP_LOG_TAIL, core.LIMITS.LOG_LINES_MAX);
    const lines = await engine.logsOnce(c.id, { tail });
    json(res, 200, { ok: true, name: c.name, image: c.image, state: c.state, lines, truncated: lines.length >= tail });
    return;
  }

  if (p === '/mcp/inspect' && req.method === 'GET') {
    const c = await resolveContainer(u.searchParams.get('nameOrId'));
    const raw = await engine.inspect(c.id);
    const maskEnv = u.searchParams.get('showEnv') !== '1';
    const trimmed = {
      Id: raw.Id, Name: raw.Name, Image: raw.Image, State: raw.State, Created: raw.Created,
      Platform: raw.Platform, RestartCount: raw.RestartCount,
      Path: raw.Path, Args: raw.Args,
      Ports: raw.NetworkSettings && raw.NetworkSettings.Ports,
      Mounts: (raw.Mounts || []).map((x) => ({ Type: x.Type, Source: x.Source, Destination: x.Destination, RW: x.RW })),
      Env: Array.isArray(raw.Config && raw.Config.Env)
        ? raw.Config.Env.map((e) => (maskEnv && e.includes('=') ? `${e.slice(0, e.indexOf('=') + 1)}<masked>` : e))
        : undefined,
      Labels: raw.Config && raw.Config.Labels,
      Health: raw.State && raw.State.Health ? raw.State.Health.Status : undefined,
      OOMKilled: raw.State && raw.State.OOMKilled,
      ExitCode: raw.State && raw.State.ExitCode,
      Error: raw.State && raw.State.Error,
    };
    let text = JSON.stringify(trimmed, null, 1);
    let truncated = false;
    if (text.length > core.LIMITS.MCP_INSPECT_CHARS) {
      text = `${text.slice(0, core.LIMITS.MCP_INSPECT_CHARS)}…`;
      truncated = true;
    }
    json(res, 200, { ok: true, name: c.name, envMasked: maskEnv, truncated, inspect: text });
    return;
  }

  if (p === '/mcp/stats' && req.method === 'GET') {
    const nameOrId = u.searchParams.get('nameOrId');
    const info = await engineInfo(false);
    if (info.status !== 'ok') { fail(res, 503, info.error); return; }
    if (nameOrId) {
      const c = await resolveContainer(nameOrId);
      json(res, 200, { ok: true, items: [{ name: c.name, id: c.id, ...core.normalizeStats(await engine.stats(c.id)) }] });
      return;
    }
    const running = (await engine.listContainers(false)).filter((c) => c.state === 'running').slice(0, core.LIMITS.MCP_ROWS);
    const items = [];
    for (const c of running) {
      // 逐个取，单个失败不影响整体（容器可能在两次列表间退出）
      try {
        items.push({ name: c.name, id: c.id, ...core.normalizeStats(await engine.stats(c.id)) });
      } catch (_) { /* 跳过瞬时消失的容器 */ }
    }
    json(res, 200, { ok: true, items });
    return;
  }

  if (p === '/mcp/images' && req.method === 'GET') {
    const info = await engineInfo(false);
    if (info.status !== 'ok') { fail(res, 503, info.error); return; }
    const [items, dfRaw] = await Promise.all([engine.listImages(), engine.df().catch(() => null)]);
    json(res, 200, { ok: true, items, df: dfRaw ? core.dfSummary(dfRaw) : null });
    return;
  }

  if (p === '/mcp/events' && req.method === 'GET') {
    const limit = Math.min(parseInt(u.searchParams.get('limit') || '100', 10) || 100, core.LIMITS.EVENTS_RING);
    json(res, 200, { ok: true, items: eventRing.slice(-limit).reverse(), pumpRunning: pump.running });
    return;
  }

  if (p === '/mcp/df' && req.method === 'GET') {
    const info = await engineInfo(false);
    if (info.status !== 'ok') { fail(res, 503, info.error); return; }
    json(res, 200, { ok: true, df: core.dfSummary(await engine.df()) });
    return;
  }

  if (p === '/mcp/selftest' && req.method === 'POST') {
    const pure = core.selfTest();
    json(res, 200, { ok: true, selftest: { ...pure, engineStatus: (await engineInfo(false)).status } });
    return;
  }

  fail(res, 404, `未知路由 ${p}（可用：/api/engine /api/containers ... /mcp/status /mcp/ps ...）`);
}

// ── 启动 ────────────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  handle(req, res).catch((e) => {
    slog(`路由异常: ${e.message}`);
    if (!res.headersSent) fail(res, 500, e.message);
    else try { res.end(); } catch (_) { /* noop */ }
  });
});

// 服务端头超时兜底（日志 follow 是长连接，须放开）
server.requestTimeout = 0;
server.headersTimeout = 10000;

server.listen(PORT, '127.0.0.1', () => {
  slog(`service 已启动 127.0.0.1:${PORT}，engine endpoint: ${core.describeEndpoint(ENDPOINT)}`);
  // 服务记录发布：桥不可达时重试（宿主可能比服务晚就绪）
  const publish = (n) => store.publishService({ port: PORT, token: TOKEN, pid: process.pid })
    .then(() => slog('dkd.service 已发布'))
    .catch((e) => { if (n < 10) setTimeout(() => publish(n + 1), 3000); else slog(`dkd.service 发布失败: ${e.message}`); });
  publish(0);
  pumpLoop().catch((e) => slog(`事件泵崩溃: ${e.message}`));
  // 心跳：30s 一次，维护 updatedAt
  const hb = setInterval(() => store.heartbeat(), 30000);
  hb.unref();
});

function shutdown(signal) {
  if (shutdown.done) return;
  shutdown.done = true;
  slog(`收到 ${signal}，注销 dkd.service 并退出`);
  if (pump.abort) pump.abort();
  store.unpublishService().finally(() => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500).unref();
  });
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
// Windows 的 process.kill(SIGTERM)=TerminateProcess 不会执行信号 handler（实测）。
// stdin 是宿主持有的管道：宿主正常收摊（或测试显式 end）时先关 stdin → 走优雅清理。
process.stdin.on('end', () => shutdown('stdin-closed'));
process.stdin.on('close', () => shutdown('stdin-closed'));
process.stdin.resume();
