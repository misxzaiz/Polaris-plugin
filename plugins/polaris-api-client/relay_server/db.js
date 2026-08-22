// relay_server/db.js — /__db/* MySQL 桥接（替代 db.py）。惰性 mysql2；token 会话；参数化；maxRows。
// 浏览器无法直连 MySQL（3306 二进制协议），故经本地后端桥接。安全红线同 Python 版：
// 仅内存缓存凭据（token→连接，不落盘）；SQL/参数分离；maxRows 上限；可选 RELAY_DB_TOKEN 门。
// Supabase 是浏览器原生 REST，不经此模块。
import crypto from 'node:crypto';

const MAX_ROWS = 500;
const SESS_TTL = 3600 * 1000;          // ms：无活动会话过期
const sessions = new Map();            // token -> {conn, config, database, last}
const utf8strict = new TextDecoder('utf-8', { fatal: true });

// ---- 惰性加载 mysql2/promise（未装则优雅降级，不影响静态/代理） ----
let _mysql, _tried = false, _provider = null;
// 驱动注入点：传入返回 mysql2-兼容模块的函数（测试用假驱动 / 将来替代驱动）；传 null 复位为真实惰性加载。
export function setMysqlProvider(fn) { _provider = fn; _tried = false; _mysql = undefined; }
async function getMysql() {
  if (_provider) return _provider();
  if (_tried) return _mysql;
  _tried = true;
  try { _mysql = await import('mysql2/promise'); } catch { _mysql = null; }
  return _mysql;
}
async function needMysql() {
  const m = await getMysql();
  if (!m) return { ok: false, error: 'mysql2 未安装', hint: '在服务器执行  npm i mysql2  后重启 server.js（纯 JS，无需编译）' };
  return null;
}

export function isDbPath(url) { return url.split('?')[0].startsWith('/__db'); }

// ---- IO ----
function sendJSON(res, code, obj) {
  const payload = Buffer.from(JSON.stringify(obj), 'utf-8');
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8', 'Content-Length': String(payload.length),
    'Access-Control-Allow-Origin': '*', 'X-Relay-DB': '1',
  });
  res.end(payload);
}
function readJSON(req) {
  return new Promise((resolve) => {
    const ch = []; req.on('data', c => ch.push(c));
    req.on('end', () => { const raw = Buffer.concat(ch).toString('utf-8'); if (!raw) return resolve({}); try { resolve(JSON.parse(raw)); } catch { resolve(null); } });
    req.on('error', () => resolve(null));
  });
}
// BLOB(Buffer) → utf8 严格解码，失败则 0x…(≤64B) 或 [blob NB]；对齐 Python _jsonable。
function fixBuffers(rows) {
  return rows.map(r => {
    const o = {};
    for (const k in r) {
      let v = r[k];
      if (Buffer.isBuffer(v)) {
        try { v = utf8strict.decode(v); }
        catch { v = v.length <= 64 ? '0x' + v.toString('hex') : `[blob ${v.length}B]`; }
      }
      o[k] = v;
    }
    return o;
  });
}
// DATE/DATETIME/TIMESTAMP → 'YYYY-MM-DDTHH:MM:SS'（对齐 Python datetime.isoformat）；DECIMAL → number。
const TYPE_CAST = (field, next) => {
  const t = field.type;
  if (t === 'DATETIME' || t === 'TIMESTAMP' || t === 'DATE') {
    const s = field.string(); return s === null ? null : s.replace(' ', 'T');
  }
  if (t === 'TIME') return field.string();
  return next();
};

// pymysql 用 %s 占位，mysql2 用 ?。前端沿用 Python 时代的 %s 契约，故在桥接层翻译：
// %s→?、%%→%，但跳过字符串字面量 / 反引号标识符 / 注释内部（比 pymysql 朴素 % 格式化更安全）。
// 仅在带参数时调用（无参 SQL 原样执行，对齐 pymysql：args 为 None 时不做 % 格式化）。
export function translatePlaceholders(sql) {
  let out = '', st = 0;            // 0 普通 · 1 '…' · 2 "…" · 3 `…` · 4 行注释 · 5 块注释
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i], n = sql[i + 1];
    if (st === 0) {
      if (c === "'") { out += c; st = 1; continue; }
      if (c === '"') { out += c; st = 2; continue; }
      if (c === '`') { out += c; st = 3; continue; }
      if (c === '#') { out += c; st = 4; continue; }
      if (c === '-' && n === '-') { out += '--'; i++; st = 4; continue; }
      if (c === '/' && n === '*') { out += '/*'; i++; st = 5; continue; }
      if (c === '%' && n === '%') { out += '%'; i++; continue; }      // 转义百分号 %% → %
      if (c === '%' && n === 's') { out += '?'; i++; continue; }      // 占位符 %s → ?
      out += c; continue;
    }
    if (st === 1 || st === 2) {                                       // 引号串：\ 转义 / 引号翻倍
      const q = st === 1 ? "'" : '"';
      if (c === '\\') { out += c; if (i + 1 < sql.length) out += sql[++i]; continue; }
      if (c === q) { if (n === q) { out += c + n; i++; } else { out += c; st = 0; } continue; }
      out += c; continue;
    }
    if (st === 3) {                                                   // 反引号标识符：仅翻倍转义
      if (c === '`') { if (n === '`') { out += '``'; i++; } else { out += c; st = 0; } continue; }
      out += c; continue;
    }
    if (st === 4) { out += c; if (c === '\n') st = 0; continue; }     // 行注释 -- / #
    /* st === 5 */ out += c; if (c === '*' && n === '/') { out += n; i++; st = 0; }  // 块注释 /* */
  }
  return out;
}

// 绑定参数：带非空参数才翻译占位符（对齐 pymysql 仅在有 args 时做 % 格式化）。
function bindParams(sql, params) {
  if (params == null || (Array.isArray(params) && params.length === 0)) return { sql, params: undefined };
  return { sql: translatePlaceholders(sql), params };
}


// ---- 分发入口（由 handler 的 do_POST 等价分支调用） ----
export async function dbHandler(req, res) {
  const token = process.env.RELAY_DB_TOKEN;   // 请求时读取，便于运维热设
  if (token && req.headers['x-relay-db-token'] !== token)
    return sendJSON(res, 403, { ok: false, error: 'forbidden: 缺少或错误的访问令牌', hint: '后端已设置 RELAY_DB_TOKEN，请在连接表单的「访问令牌」中填入' });
  if (req.method !== 'POST')
    return sendJSON(res, 405, { ok: false, error: 'method not allowed: /__db 仅支持 POST' });
  const route = req.url.split('?')[0];
  const body = await readJSON(req);
  if (body === null) return sendJSON(res, 400, { ok: false, error: 'invalid JSON body' });
  const routes = { '/__db/test': _test, '/__db/connect': _connect, '/__db/query': _query, '/__db/exec': _exec, '/__db/schema': _schema, '/__db/databases': _databases, '/__db/use': _use, '/__db/disconnect': _disconnect };
  const fn = routes[route];
  if (!fn) return sendJSON(res, 404, { ok: false, error: 'unknown /__db route: ' + route });
  try { return sendJSON(res, 200, await fn(body)); }
  catch (e) { return sendJSON(res, 200, { ok: false, error: (e && e.name || 'Error') + ': ' + (e && e.message || e) }); }
}

// ---- MySQL ----
async function mysqlConnect(c) {
  const m = await getMysql();
  return m.createConnection({
    host: c.host || '127.0.0.1', port: Number(c.port || 3306), user: c.user || 'root',
    password: c.password || '', database: c.database || undefined, charset: 'utf8mb4',
    connectTimeout: 8000, decimalNumbers: true, typeCast: TYPE_CAST,
  });
}

async function _test(body) {
  if ((body.driver || 'mysql') !== 'mysql') return { ok: false, error: '仅 MySQL 需要后端测试；Supabase 在前端直连测试' };
  const err = await needMysql(); if (err) return err;
  let conn;
  try { conn = await mysqlConnect(body.conn || {}); }
  catch (e) { return { ok: false, error: '连接失败：' + (e && e.message || e), hint: '检查 host/port/账号密码、库是否存在、MySQL 是否放行该来源' }; }
  try {
    const [rows] = await conn.query('SELECT VERSION() AS v');
    return { ok: true, driver: 'mysql', serverVersion: rows[0] && rows[0].v };
  } finally { await conn.end().catch(() => {}); }
}

async function _connect(body) {
  if ((body.driver || 'mysql') !== 'mysql') return { ok: false, error: '仅 MySQL 使用后端 token 会话' };
  const err = await needMysql(); if (err) return err;
  const c = body.conn || {};
  let conn;
  try { conn = await mysqlConnect(c); }
  catch (e) { return { ok: false, error: '连接失败：' + (e && e.message || e), hint: '检查 host/port/账号密码、库是否存在、MySQL 是否放行该来源' }; }
  const [rows] = await conn.query('SELECT VERSION() AS v, DATABASE() AS db');
  const meta = rows[0] || {};
  const token = crypto.randomBytes(18).toString('base64url');
  gc();
  sessions.set(token, { conn, config: c, database: c.database || meta.db, last: Date.now() });
  return { ok: true, token, serverVersion: meta.v, database: meta.db };
}

async function _query(body) {
  const s = getSession(body.token || ''); if (!s) return { ok: false, error: '会话无效或已过期，请重新连接', code: 'NO_SESSION' };
  const sql = (body.sql || '').trim(); if (!sql) return { ok: false, error: 'SQL 为空' };
  const params = body.params || undefined;
  const maxrows = Math.min(Number(body.maxRows || MAX_ROWS), 5000);
  const conn = await ensureAlive(s); if (!conn) return { ok: false, error: '连接已断开，请重新连接', code: 'NO_SESSION' };
  const t0 = Date.now();
  const b = bindParams(sql, params);                              // %s→? 仅在带参时；并用 query()（文本协议，使 TYPE_CAST 的 field.string() 生效）
  const [rowsOrResult, fields] = await conn.query(b.sql, b.params);
  if (!Array.isArray(rowsOrResult)) {           // 写语句误入 query：返回受影响行数（对齐 description is None）
    return { ok: true, columns: [], rows: [], rowCount: 0, affectedRows: rowsOrResult.affectedRows, elapsedMs: round(Date.now() - t0) };
  }
  const cols = (fields || []).map(f => f.name);
  let rows = rowsOrResult;
  const truncated = rows.length > maxrows;
  if (truncated) rows = rows.slice(0, maxrows);
  return { ok: true, columns: cols, rows: fixBuffers(rows), rowCount: rows.length, truncated, maxRows: maxrows, elapsedMs: round(Date.now() - t0) };
}

async function _exec(body) {
  const s = getSession(body.token || ''); if (!s) return { ok: false, error: '会话无效或已过期，请重新连接', code: 'NO_SESSION' };
  const sql = (body.sql || '').trim(); if (!sql) return { ok: false, error: 'SQL 为空' };
  const params = body.params || undefined;
  const conn = await ensureAlive(s); if (!conn) return { ok: false, error: '连接已断开，请重新连接', code: 'NO_SESSION' };
  const t0 = Date.now();
  const b = bindParams(sql, params);                              // %s→? 仅在带参时
  const [result] = await conn.query(b.sql, b.params);
  return { ok: true, affectedRows: result.affectedRows, insertId: result.insertId, elapsedMs: round(Date.now() - t0) };
}

async function _schema(body) {
  const s = getSession(body.token || ''); if (!s) return { ok: false, error: '会话无效或已过期，请重新连接', code: 'NO_SESSION' };
  const db = body.database || s.database;
  const conn = await ensureAlive(s); if (!conn) return { ok: false, error: '连接已断开，请重新连接', code: 'NO_SESSION' };
  let tables = [], cols = {};
  if (db) {
    const [ts] = await conn.query('SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA=? ORDER BY TABLE_NAME', [db]);
    tables = ts.map(r => r.t);
    const [cs] = await conn.query('SELECT TABLE_NAME AS t, COLUMN_NAME AS c, DATA_TYPE AS dt, COLUMN_KEY AS k FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? ORDER BY TABLE_NAME, ORDINAL_POSITION', [db]);
    for (const r of cs) (cols[r.t] = cols[r.t] || []).push({ name: r.c, type: r.dt, pk: r.k === 'PRI' });
  } else {
    // No database selected — return empty; frontend will show database picker
    return { ok: true, database: null, tables: [], columns: {} };
  }
  return { ok: true, database: db, tables, columns: cols };
}

async function _databases(body) {
  const s = getSession(body.token || ''); if (!s) return { ok: false, error: '会话无效或已过期，请重新连接', code: 'NO_SESSION' };
  const conn = await ensureAlive(s); if (!conn) return { ok: false, error: '连接已断开，请重新连接', code: 'NO_SESSION' };
  const [rows] = await conn.query('SHOW DATABASES');
  return { ok: true, databases: rows.map(r => Object.values(r)[0]) };
}

async function _use(body) {
  const s = getSession(body.token || ''); if (!s) return { ok: false, error: '会话无效或已过期，请重新连接', code: 'NO_SESSION' };
  const target = (body.database || '').trim();
  if (!target) return { ok: false, error: '数据库名不能为空' };
  const conn = await ensureAlive(s); if (!conn) return { ok: false, error: '连接已断开，请重新连接', code: 'NO_SESSION' };
  await conn.query('USE ' + conn.escapeId(target));
  s.database = target;
  return { ok: true, database: target };
}

async function _disconnect(body) {
  const token = body.token || '';
  const s = sessions.get(token);
  if (s) { sessions.delete(token); await s.conn.end().catch(() => {}); }
  return { ok: true };
}

// ---- 会话 ----
function getSession(token) { const s = sessions.get(token); if (!s) return null; s.last = Date.now(); return s; }
async function ensureAlive(s) {
  try { await s.conn.ping(); return s.conn; }
  catch {
    try { s.conn = await mysqlConnect(s.config); return s.conn; }   // 尝试重连（对齐 ping(reconnect=True)）
    catch { return null; }
  }
}
function gc() {
  const now = Date.now();
  for (const [t, s] of sessions) if (now - s.last > SESS_TTL) { sessions.delete(t); s.conn.end().catch(() => {}); }
}
function round(ms) { return Math.round(ms * 10) / 10; }
