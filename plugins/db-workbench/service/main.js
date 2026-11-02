'use strict';
/**
 * main.js —— db-workbench 后台服务（node http，仅绑 127.0.0.1）
 *
 * 形态：宿主 spawn（plugin.json services 声明，{{port}}/{{appConfigDir}} 注入）。
 * 通道：
 *  - 面板：直连 127.0.0.1:<port>（localhost 免混合内容；CORS 由本服务放行，
 *    pocket-drop 先例），Bearer token 鉴权；token/port 经 cap.kv `dbl.service` 分发
 *    （面板经宿主 invoke 读 kv 拿到，MCP server 同样读 kv）。
 *  - MCP：`/mcp/*` 路由组，forceReadonly 强制只读——AI 通道无论面板开关如何都不放行写。
 *
 * 启动参数：node main.js <port> <appConfigDir>
 */
const http = require('http');
const crypto = require('crypto');
const path = require('path');
const core = require('../shared/core');
const { createKvClient } = require('./kvclient');
const { Store, KV_SERVICE } = require('./store');
const { PoolManager, RedisManager } = require('./pool');
const redisDrv = require('./drivers/redis');

const VERSION = '0.1.0';
// node 的 process.argv[1] 是脚本路径本身——宿主注入的 {{port}}/{{appConfigDir}} 从 argv[2] 起
const APP_CONFIG_DIR = process.argv[3] || path.join(process.env.APPDATA || '', 'Polaris');
const PORT = parseInt(process.argv[2] || '0', 10) || 9871;

function slog(msg) { process.stderr.write(`[db-workbench:svc] ${msg}\n`); }

const kv = createKvClient({ appConfigDir: APP_CONFIG_DIR, log: (l, m) => slog(`${l}: ${m}`) });
const store = new Store(kv, APP_CONFIG_DIR);
const pools = new PoolManager();
const redisConns = new RedisManager();
pools.start();
redisConns.start();

const TOKEN = crypto.randomBytes(24).toString('hex');
const STARTED_AT = Date.now();

// ── 通用 ────────────────────────────────────────────────────────────────────

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
      if (size > 2 * 1024 * 1024) { reject(new Error('请求体过大')); req.destroy(); return; }
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
  // 常量时间比较，避免本机进程逐字节猜 token
  return crypto.timingSafeEqual(Buffer.from(t), Buffer.from(TOKEN));
}

/** 单元格规整：Buffer→字符串、超长截断、对象 JSON 化 */
function sanitizeRows(rows) {
  return (rows || []).map((row) => {
    const out = {};
    for (const k of Object.keys(row)) {
      let v = row[k];
      if (v === undefined) v = null;
      if (Buffer.isBuffer(v)) v = v.toString('utf8');
      if (v !== null && typeof v === 'object') {
        v = JSON.stringify(v);
      }
      if (typeof v === 'string' && v.length > core.MAX_CELL_CHARS) {
        v = v.slice(0, core.MAX_CELL_CHARS) + '…[截断]';
      }
      out[k] = v;
    }
    return out;
  });
}

function pickProfile(list, id) {
  const p = (list || []).find((x) => x.id === id);
  return p || null;
}

async function loadProfile(profileId) {
  const items = await store.readProfiles();
  return pickProfile(items, profileId);
}

async function addHistory(item) {
  await store.pushHistory(item).catch((e) => slog(`history 写入失败: ${e.message}`));
}

// ── 查询执行管线 ────────────────────────────────────────────────────────────

/**
 * @param forceReadonly {boolean} MCP 通道 true
 * @param histCtx {{profileName:string, via:string}}
 */
async function runSqlQuery(profile, sqlRaw, { forceReadonly, writeMode, confirm, maxRows, histCtx }) {
  const verdict = core.checkSql(sqlRaw, {
    readonly: profile.readonly,
    writeMode: writeMode === true,
    confirm: confirm === true,
    forceReadonly: forceReadonly === true,
    maxRows: maxRows || core.MAX_ROWS,
  });
  if (!verdict.ok) {
    await addHistory({
      id: core.newId(), profileId: profile.id, profileName: profile.name,
      kind: verdict.kind, ok: false, ms: 0, rows: 0,
      error: verdict.error, sql: sqlRaw, at: Date.now(),
    });
    return { ok: false, error: verdict.error, needsConfirm: verdict.needsConfirm === true, kind: verdict.kind };
  }
  const oneTimePassword = typeof histCtx.password === 'string' ? histCtx.password : undefined;
  const password = store.resolvePassword(profile.id, oneTimePassword);
  // MCP 通道：无存密码则明确失败（AI 无法弹窗输密码）；面板通道允许空密码（无密码库合法）
  if (histCtx.via === 'mcp' && !password) {
    const msg = '该连接未保存密码（AI 通道无法使用）；请在面板使用一次并勾选「记住密码」';
    await addHistory({
      id: core.newId(), profileId: profile.id, profileName: profile.name,
      kind: verdict.kind, ok: false, ms: 0, rows: 0, error: msg, sql: verdict.sql, at: Date.now(),
    });
    return { ok: false, error: msg };
  }
  const started = Date.now();
  try {
    if (profile.type === 'redis') {
      const msg = '该连接是 Redis，SQL 查询不适用；请用 redis 命令通道';
      await addHistory({
        id: core.newId(), profileId: profile.id, profileName: profile.name,
        kind: 'unknown', ok: false, ms: 0, rows: 0, error: msg, sql: sqlRaw, at: Date.now(),
      });
      return { ok: false, error: msg };
    }
    const drv = pools.driver(profile.type);
    const pool = await pools.getOrCreate(profile, password);
    const r = await drv.query(pool, verdict.sql, {
      maxRows: (maxRows || core.MAX_ROWS),
      timeoutMs: core.QUERY_TIMEOUT_MS,
    });
    const ms = Date.now() - started;
    await addHistory({
      id: core.newId(), profileId: profile.id, profileName: profile.name,
      kind: verdict.kind, ok: true, ms, rows: r.rowCount, sql: verdict.sql, at: Date.now(),
    });
    // 有真实使用即刷新 lastUsedAt（写前重读纪律）
    const items = await store.readProfiles();
    const it = pickProfile(items, profile.id);
    if (it) {
      it.lastUsedAt = Date.now();
      await store.writeProfiles(items).catch(() => {});
    }
    return {
      ok: true,
      columns: r.columns,
      rows: sanitizeRows(r.rows),
      rowCount: r.rowCount,
      truncated: r.truncated,
      ms,
      executedSql: verdict.sql,
    };
  } catch (e) {
    const ms = Date.now() - started;
    const msg = e && e.message ? e.message : String(e);
    await addHistory({
      id: core.newId(), profileId: profile.id, profileName: profile.name,
      kind: verdict.kind, ok: false, ms, rows: 0, error: msg, sql: verdict.sql, at: Date.now(),
    });
    return { ok: false, error: msg, ms };
  }
}

/** Redis 命令管线（白名单在 core，此处只管连接与格式化；拒绝也入历史供审计） */
async function runRedisCommand(profile, commandRaw, argsRaw, { allowWriteOverride, password }) {
  const args = [commandRaw].concat(Array.isArray(argsRaw) ? argsRaw.map((a) => String(a)) : []);
  const cmdLine = `${String(commandRaw).toUpperCase()} ${(argsRaw || []).join(' ')}`.slice(0, 300);
  const gate = core.checkRedisCommand(commandRaw, argsRaw, {
    allowWrite: allowWriteOverride === true || profile.allowWrite === true,
  });
  if (!gate.allowed) {
    await addHistory({
      id: core.newId(), profileId: profile.id, profileName: profile.name,
      kind: 'redis', ok: false, ms: 0, rows: 0, error: gate.reason, sql: cmdLine, at: Date.now(),
    });
    return { ok: false, error: gate.reason, needsWrite: gate.needsWrite === true };
  }
  const pass = store.resolvePassword(profile.id, typeof password === 'string' ? password : undefined);
  const conn = await redisConns.getOrCreate(profile, pass);
  const started = Date.now();
  try {
    const reply = await redisDrv.execCommand(conn, args, core.QUERY_TIMEOUT_MS);
    const ms = Date.now() - started;
    await addHistory({
      id: core.newId(), profileId: profile.id, profileName: profile.name,
      kind: 'redis', ok: true, ms, rows: Array.isArray(reply) ? reply.length : 1,
      sql: cmdLine, at: Date.now(),
    });
    return { ok: true, reply, ms, command: String(commandRaw).toLowerCase() };
  } catch (e) {
    const ms = Date.now() - started;
    const msg = e && e.message ? e.message : String(e);
    await addHistory({
      id: core.newId(), profileId: profile.id, profileName: profile.name,
      kind: 'redis', ok: false, ms, rows: 0, error: msg, sql: cmdLine, at: Date.now(),
    });
    return { ok: false, error: msg };
  }
}

// ── 路由 ────────────────────────────────────────────────────────────────────

async function handle(req, res, url) {
  const p = url.pathname;

  if (p === '/__health') {
    return json(res, 200, { ok: true, service: 'db-workbench', version: VERSION });
  }

  if (!authed(req)) return fail(res, 401, '未授权（缺少或错误的 Bearer token）');

  // ── 面板通道 /api/* ───────────────────────────────────────────────────────
  if (p === '/api/info' && req.method === 'GET') {
    return json(res, 200, {
      ok: true, version: VERSION, pid: process.pid,
      startedAt: STARTED_AT, pools: pools.size(), redis: redisConns.size(),
    });
  }

  if (p === '/api/profiles' && req.method === 'GET') {
    const items = await store.readProfiles();
    // hasStoredPass 实时校验（本地文件是唯一密码事实源）
    const items2 = items.map((x) => Object.assign({}, x, { hasStoredPass: store.hasStoredPassword(x.id) }));
    return json(res, 200, { ok: true, items: items2 });
  }

  if (p === '/api/profiles' && req.method === 'POST') {
    const body = await readBody(req);
    const r = await store.upsertProfile(body.profile || {}, body.password);
    if (!r.ok) return fail(res, 422, r.error);
    await pools.drop(r.profile.id).catch(() => {});
    await redisConns.drop(r.profile.id).catch(() => {});
    return json(res, 200, r);
  }

  if (p === '/api/profiles/delete' && req.method === 'POST') {
    const body = await readBody(req);
    const r = await store.deleteProfile(String(body.id || ''));
    if (!r.ok) return fail(res, 404, r.error);
    await pools.drop(String(body.id)).catch(() => {});
    await redisConns.drop(String(body.id)).catch(() => {});
    return json(res, 200, r);
  }

  if (p.startsWith('/api/profiles/') && p.endsWith('/test') && req.method === 'POST') {
    const id = p.slice('/api/profiles/'.length, -'/test'.length);
    const profile = await loadProfile(id);
    if (!profile) return fail(res, 404, '连接不存在');
    const body = await readBody(req);
    const pass = store.resolvePassword(id, body.password);
    const drv = profile.type === 'redis' ? null : pools.driver(profile.type);
    try {
      if (profile.type === 'redis') {
        const { RedisConn } = require('./drivers/redis');
        const conn = new RedisConn({ host: profile.host, port: profile.port, password: pass, username: profile.username || '', db: profile.database ? parseInt(profile.database, 10) || 0 : 0 });
        try {
          await conn.exec(['PING'], 5000);
          return json(res, 200, { ok: true, serverVersion: 'redis' });
        } finally { conn.close(); }
      }
      const r = await drv.testConn(profile, pass);
      return json(res, 200, r);
    } catch (e) {
      return json(res, 200, { ok: false, error: e && e.message ? e.message : String(e) });
    }
  }

  if (p === '/api/query' && req.method === 'POST') {
    const body = await readBody(req);
    const profile = await loadProfile(String(body.profileId || ''));
    if (!profile) return fail(res, 404, '连接不存在');
    const r = await runSqlQuery(profile, String(body.sql || ''), {
      forceReadonly: false,
      writeMode: body.writeMode === true,
      confirm: body.confirm === true,
      maxRows: core.MAX_ROWS,
      histCtx: { password: body.password },
    });
    return json(res, r.ok ? 200 : 422, r);
  }

  if (p === '/api/redis' && req.method === 'POST') {
    const body = await readBody(req);
    const profile = await loadProfile(String(body.profileId || ''));
    if (!profile) return fail(res, 404, '连接不存在');
    if (profile.type !== 'redis') return fail(res, 422, '该连接不是 Redis');
    const r = await runRedisCommand(profile, body.command, body.args, {
      allowWriteOverride: body.writeMode === true && profile.allowWrite === true,
      password: body.password,
    });
    return json(res, r.ok ? 200 : 422, r);
  }

  if (p === '/api/schemas' && req.method === 'GET') {
    const profile = await loadProfile(url.searchParams.get('profileId') || '');
    if (!profile) return fail(res, 404, '连接不存在');
    if (profile.type === 'redis') return json(res, 200, { ok: true, items: ['0..15 (redis db)'] });
    const pass = store.resolvePassword(profile.id);
    const drv = pools.driver(profile.type);
    const pool = await pools.getOrCreate(profile, pass);
    const items = await drv.listSchemas(pool);
    return json(res, 200, { ok: true, items });
  }

  if (p === '/api/tables' && req.method === 'GET') {
    const profile = await loadProfile(url.searchParams.get('profileId') || '');
    if (!profile) return fail(res, 404, '连接不存在');
    if (profile.type === 'redis') return fail(res, 422, 'Redis 无表结构');
    const pass = store.resolvePassword(profile.id);
    const drv = pools.driver(profile.type);
    const pool = await pools.getOrCreate(profile, pass);
    const schema = url.searchParams.get('schema') || profile.database || '';
    const items = await drv.listTables(pool, schema);
    return json(res, 200, { ok: true, items, schema });
  }

  if (p === '/api/describe' && req.method === 'GET') {
    const profile = await loadProfile(url.searchParams.get('profileId') || '');
    if (!profile) return fail(res, 404, '连接不存在');
    if (profile.type === 'redis') return fail(res, 422, 'Redis 无表结构');
    const pass = store.resolvePassword(profile.id);
    const drv = pools.driver(profile.type);
    const pool = await pools.getOrCreate(profile, pass);
    const r = await drv.describeTable(pool, url.searchParams.get('schema') || profile.database || '', url.searchParams.get('table') || '');
    return json(res, 200, Object.assign({ ok: true }, r));
  }

  if (p === '/api/preview' && req.method === 'GET') {
    const profile = await loadProfile(url.searchParams.get('profileId') || '');
    if (!profile) return fail(res, 404, '连接不存在');
    if (profile.type === 'redis') return fail(res, 422, 'Redis 无表预览');
    const pass = store.resolvePassword(profile.id);
    const drv = pools.driver(profile.type);
    const pool = await pools.getOrCreate(profile, pass);
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    const r = await drv.previewTable(pool, url.searchParams.get('schema') || profile.database || '', url.searchParams.get('table') || '', limit);
    return json(res, 200, Object.assign({ ok: true }, r, { rows: sanitizeRows(r.rows) }));
  }

  if (p === '/api/history' && req.method === 'GET') {
    const items = await store.readHistory();
    return json(res, 200, { ok: true, items });
  }

  if (p === '/api/history/clear' && req.method === 'POST') {
    await store.clearHistory();
    return json(res, 200, { ok: true });
  }

  if (p === '/api/selftest' && req.method === 'POST') {
    const r = runSelftest();
    await store.writeMeta({ selftest: r, version: VERSION });
    return json(res, 200, { ok: r.failed === 0, selftest: r });
  }

  // ── MCP 通道 /mcp/*（forceReadonly；工具面窄于面板） ──────────────────────
  if (p === '/mcp/query' && req.method === 'POST') {
    const body = await readBody(req);
    const profile = await loadProfile(String(body.profileId || ''));
    if (!profile) return fail(res, 404, '连接不存在');
    if (profile.type === 'redis') return fail(res, 422, '该连接是 Redis；AI 侧请用 dbw_redis 工具');
    // 密码检查在护栏之后（runSqlQuery 内）——先让写语句被护栏拒绝，凭据状态不掩盖安全语义
    const r = await runSqlQuery(profile, String(body.sql || ''), {
      forceReadonly: true,
      maxRows: core.MCP_MAX_ROWS,
      histCtx: { via: 'mcp' },
    });
    return json(res, r.ok ? 200 : 422, r);
  }

  if (p === '/mcp/redis' && req.method === 'POST') {
    const body = await readBody(req);
    const profile = await loadProfile(String(body.profileId || ''));
    if (!profile) return fail(res, 404, '连接不存在');
    if (profile.type !== 'redis') return fail(res, 422, '该连接不是 Redis');
    const r = await runRedisCommand(profile, body.command, body.args, { allowWriteOverride: false, password: undefined });
    return json(res, r.ok ? 200 : 422, r);
  }

  return fail(res, 404, `未知路径 ${p}`);
}

// ── 自检（无外部连接依赖） ──────────────────────────────────────────────────

function runSelftest() {
  const checks = [];
  const t = (name, fn) => {
    try {
      const ok = fn();
      checks.push({ name, ok: ok === true, detail: ok === true ? '' : String(ok) });
    } catch (e) {
      checks.push({ name, ok: false, detail: e.message });
    }
  };
  t('护栏: 只读连接拒绝 UPDATE', () => core.checkSql('UPDATE t SET a=1', { readonly: true }).ok === false);
  t('护栏: 写模式仍需 WHERE', () => core.checkSql('DELETE FROM t', { readonly: false, writeMode: true }).ok === false);
  t('护栏: 多语句拒绝', () => core.checkSql('SELECT 1; DROP TABLE t', { readonly: true }).ok === false);
  t('护栏: SELECT INTO 拒绝', () => core.checkSql("SELECT * FROM t INTO OUTFILE '/x'", { readonly: false, writeMode: true }).ok === false);
  t('护栏: SELECT 自动补 LIMIT', () => /LIMIT 1001$/.test(core.checkSql('SELECT * FROM t', { readonly: true }).sql || ''));
  t('护栏: MCP 通道拒绝写', () => core.checkSql('DROP TABLE t', { readonly: false, writeMode: true, forceReadonly: true }).ok === false);
  t('护栏: FOR UPDATE 降级写（只读连接拒绝、写模式按写语句闸）', () =>
    core.checkSql('SELECT * FROM t FOR UPDATE', { readonly: true }).ok === false
    && core.checkSql('SELECT * FROM t FOR UPDATE', { readonly: false, writeMode: true }).kind === 'write');
  t('Redis: SCAN 无 COUNT 拒绝', () => core.checkRedisCommand('SCAN', ['0']).allowed === false);
  t('Redis: FLUSHALL 永久拒绝', () => core.checkRedisCommand('FLUSHALL', []).banned === true);
  t('Redis: 写命令需 allowWrite', () => core.checkRedisCommand('SET', ['a', 'b'], {}).allowed === false
    && core.checkRedisCommand('SET', ['a', 'b'], { allowWrite: true }).allowed === true);
  t('RESP: 编解码 roundtrip', () => {
    const { encodeCommand, parseReply } = require('./drivers/redis');
    const buf = encodeCommand(['GET', 'a:b']);
    const r = parseReply(buf, 0);
    return JSON.stringify(r.value) === JSON.stringify(['GET', 'a:b']);
  });
  t('RESP: 分块解析（跨 TCP 块续读）', () => {
    const { parseReply } = require('./drivers/redis');
    const full = Buffer.from('*2\r\n$3\r\nabc\r\n$1\r\nz\r\n');
    const part1 = parseReply(full.subarray(0, 8), 0);
    if (part1 !== null) return '半包应返回 null';
    const part2 = parseReply(full, 0);
    return Array.isArray(part2.value) ? true : '应为数组';
  });
  t('CSV: 逗号引号换行转义', () => {
    const csv = core.toCsv(['a', 'b'], [{ a: 'x,"y"', b: 'l1\nl2' }]);
    return csv.includes('"x,""y"""') && csv.includes('"l1\nl2"');
  });
  const passed = checks.filter((c) => c.ok).length;
  return { passed, failed: checks.length - passed, total: checks.length, checks, at: Date.now() };
}

// ── server 生命周期 ─────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    res.end();
    return;
  }
  let u;
  try {
    u = new URL(req.url, `http://127.0.0.1:${PORT}`);
  } catch (_) {
    return fail(res, 400, 'bad url');
  }
  handle(req, res, u).catch((e) => {
    slog(`handle 异常: ${e && e.stack ? e.stack.split('\n')[0] : e}`);
    try { fail(res, 500, e.message || '内部错误'); } catch (_) { /* 已响应 */ }
  });
});

server.on('error', (e) => {
  // 端口被占等监听错误：干净退出交还 restartOnFailure 决策，避免 crash 循环刷日志
  slog(`server error: ${e.message}`);
  process.exit(1);
});

server.listen(PORT, '127.0.0.1', () => {
  slog(`listening on 127.0.0.1:${PORT} (version ${VERSION})`);
  publishServiceInfo();
});

// 服务信息写 kv（面板/MCP 的发现入口）；宿主未就绪时重试
let publishTries = 0;
function publishServiceInfo() {
  const info = {
    port: PORT, token: TOKEN, pid: process.pid, version: VERSION, startedAt: STARTED_AT,
  };
  store.writeServiceInfo(info)
    .then(() => slog('service info published to kv'))
    .catch((e) => {
      publishTries += 1;
      if (publishTries <= 10) {
        slog(`publish 失败重试(${publishTries}): ${e.message}`);
        setTimeout(publishServiceInfo, 3000 * publishTries);
      } else {
        slog('publish 放弃：面板将无法发现服务（检查宿主 bridge）');
      }
    });
}

process.on('SIGTERM', () => { void shutdown(); });
process.on('SIGINT', () => { void shutdown(); });
process.on('exit', () => {
  try { pools.shutdownAll(); redisConns.shutdownAll(); } catch (_) { /* 尽力 */ }
});

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  slog('shutting down…');
  await kv.kvDel(KV_SERVICE).catch(() => {});
  await pools.shutdownAll();
  await redisConns.shutdownAll();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
