'use strict';
/**
 * core.js —— db-workbench 护栏核心（面板 / MCP / service 三方同源）
 *
 * 设计原则：
 *  - 纯函数、零依赖、CJS（service/mcp 直接 require，面板经 esbuild bundle）。
 *  - 所有「放不放行」的判断只在这里做，service 与 MCP 不各自发明规则，
 *    保证面板通道与 AI 通道口径一致；AI 通道在此之上再加 forceReadonly。
 *  - SQL 扫描必须跳过字符串/反引号字面量后再判断关键词与分号，
 *    否则 `SELECT ';'` 会被误判多语句、`WHERE a='DROP'` 会被误判 DDL。
 */

// ── 常量 ────────────────────────────────────────────────────────────────────

/** 查询结果行数上限（取 1001 判断截断，返回前裁到 1000） */
const MAX_ROWS = 1000;
/** 单元格文本上限（超出截断并标记，完整值不进内存/kv） */
const MAX_CELL_CHARS = 4096;
/** 查询超时（毫秒），驱动层据此取消 */
const QUERY_TIMEOUT_MS = 15000;
/** 查询历史保留条数 */
const HIST_KEEP = 60;
/** MCP 查询返回给 AI 的行数上限（AI 上下文有限，比面板更紧） */
const MCP_MAX_ROWS = 50;

const SQL_KINDS = ['read', 'write', 'ddl', 'admin', 'unknown'];

// ── SQL 扫描基础 ────────────────────────────────────────────────────────────

/**
 * 扫描 SQL：剥离注释、跳过字符串/反引号/双引号字面量，
 * 返回 { clean, parts, topLevelLimit, topLevelSemicolons }。
 * clean：去注释后的文本；parts：按顶层分号切分的语句（含空白，未 trim）。
 * topLevelLimit：顶层（括号深度 0）是否出现 LIMIT/OFFSET 关键词。
 * 仅支持行注释（`--`、`#`）与块注释（`/* ... *​/`）三类，块注释不嵌套。
 */
function scanSql(sql) {
  const s = String(sql == null ? '' : sql);
  let out = '';
  const parts = [];
  let cur = '';
  let depth = 0;
  let topLevelLimit = false;
  let topLevelSemicolons = 0;
  let i = 0;
  const n = s.length;
  const isWord = (c) => /[A-Za-z0-9_$\u0080-\uFFFF]/.test(c);
  const wordAt = (pos, word) => {
    if (s.slice(pos, pos + word.length).toUpperCase() !== word) return false;
    const before = pos > 0 ? s[pos - 1] : '';
    const after = s[pos + word.length] || '';
    return !isWord(before) && !isWord(after);
  };
  while (i < n) {
    const c = s[i];
    // 字符串字面量：'...' / "..." / `...`，支持反斜杠与双写转义
    if (c === "'" || c === '"' || c === '`') {
      const quote = c;
      let j = i + 1;
      let lit = c;
      while (j < n) {
        if (s[j] === '\\' && quote !== '`') { lit += s[j] + (s[j + 1] || ''); j += 2; continue; }
        if (s[j] === quote) {
          if (s[j + 1] === quote) { lit += quote + quote; j += 2; continue; }
          lit += quote; j += 1; break;
        }
        lit += s[j]; j += 1;
      }
      out += lit; cur += lit; i = j; continue;
    }
    // 行注释 -- 与 #
    if ((c === '-' && s[i + 1] === '-') || c === '#') {
      if (c === '-' && !(s[i + 2] === ' ' || s[i + 2] === '\t')) { out += c; cur += c; i += 1; continue; }
      let j = s.indexOf('\n', i);
      if (j === -1) j = n;
      out += ' '; cur += ' '; i = j; continue;
    }
    // 块注释（不嵌套）
    if (c === '/' && s[i + 1] === '*') {
      let j = s.indexOf('*/', i + 2);
      j = j === -1 ? n : j + 2;
      out += ' '; cur += ' '; i = j; continue;
    }
    if (c === '(') { depth += 1; out += c; cur += c; i += 1; continue; }
    if (c === ')') { depth = Math.max(0, depth - 1); out += c; cur += c; i += 1; continue; }
    if (c === ';') {
      parts.push(cur); cur = '';
      out += c;
      if (depth === 0) topLevelSemicolons += 1;
      i += 1; continue;
    }
    if (depth === 0 && !topLevelLimit && wordAt(i, 'LIMIT')) topLevelLimit = true;
    if (depth === 0 && !topLevelLimit && wordAt(i, 'OFFSET')) topLevelLimit = true;
    out += c; cur += c; i += 1;
  }
  parts.push(cur);
  return { clean: out, parts, topLevelLimit, topLevelSemicolons };
}

/** 语句首词（跳过前导括号/空白），大写返回 */
function leadingKeyword(stmt) {
  const t = String(stmt || '').trim();
  if (!t) return '';
  const m = t.match(/^(WITH|SELECT|INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP|TRUNCATE|RENAME|SHOW|DESCRIBE|DESC|EXPLAIN|USE|SET|GRANT|REVOKE|KILL|LOCK|UNLOCK|CALL|DO|HANDLER|LOAD|FLUSH|RESET|START|BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE|PREPARE|EXECUTE|DEALLOCATE|ANALYZE|VACUUM|REINDEX|CLUSTER|COMMENT|LISTEN|NOTIFY|COPY|VALUES|TABLE)\b/i);
  return m ? m[1].toUpperCase() : '';
}

/**
 * 分类单条语句（已去注释）。返回 kind：
 *  read    只读查询（SELECT/SHOW/DESCRIBE/EXPLAIN/VALUES/TABLE 等）
 *  write   数据写（INSERT/UPDATE/DELETE/REPLACE）
 *  ddl     结构变更（CREATE/ALTER/DROP/TRUNCATE/RENAME/COMMENT ON/...）
 *  admin   会话/服务器管理（USE/SET/GRANT/KILL/COPY/CALL/...）
 *  unknown 无法识别（一律拒绝）
 * 形似 read 但有副作用的会被降级：
 *  - SELECT ... INTO OUTFILE/DUMPFILE/@var（文件/变量写入）
 *  - SELECT ... FOR UPDATE / FOR SHARE（行锁）
 *  - SELECT w/ 系统函数写副作用不在此展开，服务层另有超时与行数闸。
 */
function classifyStatement(stmtRaw) {
  const stmt = String(stmtRaw == null ? '' : stmtRaw).trim();
  if (!stmt) return { kind: 'unknown', reason: '空语句' };
  const head = leadingKeyword(stmt);
  const upper = stmt.toUpperCase();
  const noWord = (word) => !new RegExp(`\\b${word}\\b`).test(upper);

  // 形似 read 的副作用语句先拦截（必须在 read 判定之前）
  if (head === 'SELECT' || head === 'WITH') {
    if (/\bINTO\s+(OUTFILE|DUMPFILE)\b/.test(upper)) return { kind: 'admin', reason: 'SELECT INTO OUTFILE 可写文件，禁止' };
    if (/\bINTO\s+@/.test(upper)) return { kind: 'admin', reason: 'SELECT INTO @var 非纯查询，禁止' };
    if (/\bFOR\s+(UPDATE|SHARE)\b/.test(upper)) return { kind: 'write', reason: 'FOR UPDATE/SHARE 加行锁，属写语义' };
  }
  switch (head) {
    case 'SELECT': case 'SHOW': case 'DESCRIBE': case 'DESC':
    case 'EXPLAIN': case 'VALUES': case 'TABLE': case 'WITH':
      return { kind: 'read', reason: '' };
    case 'INSERT': case 'UPDATE': case 'DELETE': case 'REPLACE':
      return { kind: 'write', reason: '' };
    case 'CREATE': case 'ALTER': case 'DROP': case 'TRUNCATE': case 'RENAME':
    case 'COMMENT': case 'ANALYZE': case 'VACUUM': case 'REINDEX': case 'CLUSTER':
      return { kind: 'ddl', reason: '' };
    case 'USE': case 'SET': case 'GRANT': case 'REVOKE': case 'KILL':
    case 'LOCK': case 'UNLOCK': case 'CALL': case 'DO': case 'HANDLER':
    case 'LOAD': case 'FLUSH': case 'RESET': case 'COPY':
    case 'LISTEN': case 'NOTIFY':
      return { kind: 'admin', reason: '' };
    case 'START': case 'BEGIN': case 'COMMIT': case 'ROLLBACK': case 'SAVEPOINT':
    case 'RELEASE': case 'PREPARE': case 'EXECUTE': case 'DEALLOCATE':
      return { kind: 'admin', reason: '事务/预处理语句经本工作台禁止（连接池复用易串会话）' };
    default:
      return { kind: 'unknown', reason: `无法识别的语句（${head || '未知'}）` };
  }
}

/**
 * 护栏检查（面板通道与 MCP 通道共用）。
 * opts.readonly    连接是否只读（profile.readonly）
 * opts.writeMode   面板是否已开写模式（仅 readonly=false 的连接有意义）
 * opts.confirm     面板对高危 DDL 的显式确认
 * opts.forceReadonly  MCP 通道强制只读（无视一切开关）
 * 返回 { ok, kind, error?, needsConfirm?, sql?（append LIMIT 后） }
 */
function checkSql(sqlRaw, opts) {
  const o = opts || {};
  const { clean, parts, topLevelLimit, topLevelSemicolons } = scanSql(sqlRaw);
  const stmts = parts.map((p) => p.trim()).filter(Boolean);
  if (!stmts.length) return { ok: false, kind: 'unknown', error: '空语句' };
  if (stmts.length > 1 || topLevelSemicolons > 0) {
    return { ok: false, kind: 'unknown', error: '一次只能执行一条语句（多语句已禁止，降低注入面）' };
  }
  const cls = classifyStatement(stmts[0]);
  const kind = cls.kind;
  if (kind === 'unknown') return { ok: false, kind, error: cls.reason || '无法识别的语句' };
  if (kind === 'admin') return { ok: false, kind, error: cls.reason || `管理类语句禁止执行（${stmts[0].slice(0, 40)}…）` };

  const readonly = o.forceReadonly || o.readonly !== false;
  const writeMode = !readonly && o.writeMode === true;
  if (kind === 'write' || kind === 'ddl') {
    if (readonly || !writeMode) {
      return { ok: false, kind, error: readonly
        ? '该连接为只读连接（写语句被护栏拦截）'
        : '写语句需要先在面板打开写模式' };
    }
    // 写模式下的次级闸：无 WHERE 的 UPDATE/DELETE 拒绝
    if ((kind === 'write') && /^\s*(UPDATE|DELETE)\b/i.test(stmts[0]) && !/\bWHERE\b/i.test(clean)) {
      return { ok: false, kind, error: 'UPDATE/DELETE 必须带 WHERE（防止全表改写）' };
    }
    // DROP/TRUNCATE 需要显式确认
    if (kind === 'ddl' && /^\s*(DROP|TRUNCATE)\b/i.test(stmts[0]) && o.confirm !== true) {
      return { ok: false, kind, needsConfirm: true, error: 'DROP/TRUNCATE 不可逆，需在结果中确认后携带 confirm 重发' };
    }
    return { ok: true, kind, sql: stmts[0] };
  }
  // read：顶层 SELECT/WITH 且无顶层 LIMIT → 自动加 LIMIT，防全表拉爆
  let finalSql = stmts[0];
  const head = leadingKeyword(finalSql);
  const isSelectish = head === 'SELECT' || head === 'WITH';
  if (isSelectish && !topLevelLimit) {
    const lim = o.maxRows && Number.isInteger(o.maxRows) && o.maxRows > 0 ? o.maxRows : MAX_ROWS;
    finalSql = `${finalSql} LIMIT ${lim + 1}`;
  }
  return { ok: true, kind, sql: finalSql };
}

// ── Redis 白名单 ────────────────────────────────────────────────────────────

/** 只读命令（默认放行）。KEYS/CONFIG/DEBUG 等阻塞或敏感命令刻意不在列。 */
const REDIS_READ = new Set([
  'get', 'mget', 'strlen', 'getrange', 'exists', 'type', 'ttl', 'pttl',
  'hget', 'hmget', 'hgetall', 'hkeys', 'hvals', 'hlen', 'hstrlen', 'hexists', 'hrandfield',
  'lrange', 'llen', 'lindex', 'lpos',
  'smembers', 'scard', 'sismember', 'smismember', 'srandmember', 'sinter', 'sunion', 'sdiff',
  'zrange', 'zrevrange', 'zrangebyscore', 'zrevrangebyscore', 'zrangebylex', 'zrevrangebylex',
  'zscore', 'zmscore', 'zcard', 'zcount', 'zrank', 'zrevrank', 'zlexcount',
  'scan', 'dbsize', 'randomkey', 'object', 'memory', 'bitcount', 'getbit',
  'info', 'time', 'ping', 'echo', 'command',
  'client', 'slowlog', 'expiretime', 'pexpiretime',
]);
/** 写命令（连接 allowWrite=true 时放行） */
const REDIS_WRITE = new Set([
  'set', 'setnx', 'setex', 'psetex', 'getset', 'getdel', 'mset', 'msetnx', 'append',
  'incr', 'incrby', 'incrbyfloat', 'decr', 'decrby', 'setrange', 'setbit',
  'hset', 'hsetnx', 'hmset', 'hdel', 'hincrby', 'hincrbyfloat',
  'lpush', 'rpush', 'lpushx', 'rpushx', 'lpop', 'rpop', 'lset', 'ltrim', 'lrem', 'linsert', 'rpoplpush', 'lmove',
  'sadd', 'srem', 'spop', 'smove', 'sinterstore', 'sunionstore', 'sdiffstore',
  'zadd', 'zrem', 'zincrby', 'zremrangebyrank', 'zremrangebyscore', 'zremrangebylex', 'zpopmin', 'zpopmax',
  'expire', 'pexpire', 'expireat', 'pexpireat', 'persist', 'del', 'unlink', 'rename', 'renamenx',
  'copy', 'move', 'setbit', 'getset',
]);
/** 永久拒绝（不可逆/服务器级），无论任何开关 */
const REDIS_BANNED = new Set([
  'flushdb', 'flushall', 'shutdown', 'config', 'slaveof', 'replicaof', 'swapdb',
  'debug', 'save', 'bgsave', 'bgrewriteaof', 'lastsave', 'monitor', 'subscribe', 'psubscribe',
  'reset', 'acl', 'module', 'migrate', 'dump', 'restore', 'sync', 'psync', 'script', 'eval', 'evalsha',
  'function', 'fcall', 'xgroup', 'xsetid', 'wait', 'waitaof',
]);

/**
 * Redis 命令分类。返回 { allowed, needsWrite, banned, cmd }
 * SCAN 强制要求 COUNT 且上限 1000（防全库扫描阻塞）。
 */
function checkRedisCommand(commandRaw, argsRaw, opts) {
  const o = opts || {};
  const cmd = String(commandRaw == null ? '' : commandRaw).trim().toLowerCase();
  const args = Array.isArray(argsRaw) ? argsRaw.map((a) => String(a)) : [];
  if (!cmd || /\s/.test(cmd)) return { allowed: false, reason: '命令名不合法' };
  if (REDIS_BANNED.has(cmd)) return { allowed: false, banned: true, reason: `命令 ${cmd.toUpperCase()} 属服务器级/不可逆操作，永久拒绝` };
  if (REDIS_READ.has(cmd)) {
    if (cmd === 'scan') {
      const ci = args.findIndex((a) => a.toUpperCase() === 'COUNT');
      if (ci === -1) return { allowed: false, reason: 'SCAN 必须带 COUNT（防全库扫描）' };
      const cnt = parseInt(args[ci + 1], 10);
      if (!Number.isFinite(cnt) || cnt <= 0 || cnt > 1000) return { allowed: false, reason: 'SCAN COUNT 必须在 1..1000' };
    }
    if (cmd === 'client' && args[0] && !['id', 'info', 'list'].includes(String(args[0]).toLowerCase())) {
      return { allowed: false, reason: '仅允许 CLIENT ID/INFO/LIST' };
    }
    if (cmd === 'memory' && args[0] && String(args[0]).toUpperCase() !== 'USAGE') {
      return { allowed: false, reason: '仅允许 MEMORY USAGE <key>' };
    }
    if (cmd === 'object' && args[0] && !['encoding', 'refcount', 'freq', 'idletime'].includes(String(args[0]).toLowerCase())) {
      return { allowed: false, reason: '仅允许 OBJECT 只读子命令' };
    }
    return { allowed: true, needsWrite: false, cmd };
  }
  if (REDIS_WRITE.has(cmd)) {
    if (!o.allowWrite) return { allowed: false, needsWrite: true, reason: '写命令需要连接开启 allowWrite' };
    return { allowed: true, needsWrite: true, cmd };
  }
  return { allowed: false, reason: `命令 ${cmd.toUpperCase()} 不在白名单（只读/写集合之外一律拒绝）` };
}

// ── Profile 规范化与掩码 ────────────────────────────────────────────────────

const DB_TYPES = ['mysql', 'postgres', 'redis'];

function newId() {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 规范化 profile（入库/出库统一形状）。密码永远不出现在返回值里，
 * 只有 rememberPass=true 时密码才由 service 写本地凭据文件。
 */
function normalizeProfile(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const type = DB_TYPES.includes(r.type) ? r.type : '';
  if (!type) return { error: 'type 必须是 mysql / postgres / redis' };
  const name = String(r.name || '').trim().slice(0, 60);
  if (!name) return { error: 'name 必填' };
  const host = String(r.host || '').trim().slice(0, 253);
  if (!host) return { error: 'host 必填' };
  const defPort = type === 'mysql' ? 3306 : type === 'postgres' ? 5432 : 6379;
  let port = parseInt(r.port, 10);
  if (!Number.isFinite(port) || port <= 0 || port > 65535) port = defPort;
  const username = String(r.username == null ? '' : r.username).slice(0, 128);
  if (type !== 'redis' && !username) return { error: 'username 必填' };
  const database = String(r.database == null ? '' : r.database).trim().slice(0, 128);
  if ((type === 'mysql' || type === 'postgres') && !database) return { error: 'database 必填' };
  return {
    profile: {
      id: typeof r.id === 'string' && r.id ? r.id : newId(),
      type, name, host, port, username, database,
      readonly: r.readonly !== false,
      allowWrite: r.allowWrite === true,
      rememberPass: r.rememberPass === true,
      hasStoredPass: r.hasStoredPass === true,
      ssl: r.ssl === true,
      note: String(r.note || '').slice(0, 200),
      createdAt: Number.isFinite(r.createdAt) ? r.createdAt : Date.now(),
      lastUsedAt: Number.isFinite(r.lastUsedAt) ? r.lastUsedAt : 0,
    },
  };
}

/** 默认端口（连接编辑 UI 用） */
function defaultPort(type) {
  return type === 'mysql' ? 3306 : type === 'postgres' ? 5432 : 6379;
}

/** 连接串掩码展示（host:port/db，不含凭据） */
function describeTarget(p) {
  if (!p) return '';
  const db = p.database ? `/${p.database}` : '';
  return `${p.host}:${p.port}${db}`;
}

/** 历史条目脱敏（SQL 本身可能含字面量敏感值——只截断不脱值，提示用户注意） */
function trimHistoryItem(h) {
  return {
    id: h.id, profileId: h.profileId, profileName: h.profileName || '',
    kind: h.kind, ok: h.ok, ms: h.ms, rows: h.rows,
    error: h.error ? String(h.error).slice(0, 200) : '',
    sql: String(h.sql || '').slice(0, 300),
    at: h.at,
  };
}

// ── CSV/JSON 导出 ───────────────────────────────────────────────────────────

function csvCell(v) {
  if (v == null) return '';
  let s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  if (s.length > MAX_CELL_CHARS) s = `${s.slice(0, MAX_CELL_CHARS)}…[截断]`;
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** rows: object[]（列顺序取 columns 数组） */
function toCsv(columns, rows) {
  const head = columns.map(csvCell).join(',');
  const body = (rows || []).map((r) => columns.map((c) => csvCell(r[c])).join(','));
  // 带 BOM：Excel 直开中文不乱码（house 惯例，data-query 同）
  return `\uFEFF${[head].concat(body).join('\r\n')}`;
}

module.exports = {
  MAX_ROWS, MAX_CELL_CHARS, QUERY_TIMEOUT_MS, HIST_KEEP, MCP_MAX_ROWS, SQL_KINDS,
  scanSql, leadingKeyword, classifyStatement, checkSql,
  REDIS_READ, REDIS_WRITE, REDIS_BANNED, checkRedisCommand,
  DB_TYPES, newId, normalizeProfile, defaultPort, describeTarget, trimHistoryItem,
  csvCell, toCsv,
};
