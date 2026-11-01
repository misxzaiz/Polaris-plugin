'use strict';
/**
 * lens-core.js —— SQLite 检查台共享纯逻辑（单一权威，服务/MCP/面板/测试共用）
 *
 * 职责：KV 键名契约、SQL 闸门（只读分类 / 单语句 / WHERE 强制 / 防倾泻包裹）、
 *       行整形（BLOB/NULL 标注）、CSV/JSON 序列化、已知应用库签名、字节格式化。
 * 零依赖、零 IO——所有决策纯函数化，测试可直接全分支覆盖。
 */

const VERSION = '0.1.0';

// ── KV 键空间契约（前缀 sqltl.，cap.kv 全局共享，必须带插件前缀防撞键）──────
const K = {
  meta: 'sqltl.meta',              // {version,port,token,startedAt,pid,degraded?}
  settings: 'sqltl.settings',      // {radarRoots:[], autoBackup:true, queryLimit, cellBudget}
  libs: 'sqltl.libs',              // [{dbId,path,label,sizeBytes,tables,knownAs,addedAt,lastOpenedAt}]
  qhist: 'sqltl.qhist',            // [{sql,dbPath,at,ok,ms,rows}] cap 50
  audit: 'sqltl.audit',            // [{at,dbPath,sql,status,changes,backupPath}] cap 100
  pendingPrefix: 'sqltl.pending.', // sqltl.pending.<id> → 两步写待确认单
};

const DEFAULT_SETTINGS = {
  radarRoots: [],        // 额外雷达根；空=只扫内置常见目录
  autoBackup: true,      // 写前自动备份 .db 文件
  queryLimit: 1000,      // 无 LIMIT 查询的自动包裹上限
  cellBudget: 200000,    // rows*cols 单元预算
};

const PENDING_TTL_MS = 10 * 60 * 1000;   // 待写确认单 10 分钟过期
const AUDIT_CAP = 100;
const QHIST_CAP = 50;
const PENDING_CAP = 5;

// ── 已知应用库签名（按表名集合匹配；不命中不硬猜，宁可不标）────────────────
const KNOWN_SIGNATURES = [
  { knownAs: 'Chrome/Edge 浏览历史', tables: ['urls', 'visits', 'visit_source'] },
  { knownAs: 'Chrome/Edge Cookies', tables: ['cookies', 'meta', 'operation'] },
  { knownAs: 'Firefox 浏览历史', tables: ['moz_places', 'moz_historyvisits'] },
  { knownAs: 'Firefox Cookies', tables: ['moz_cookies', 'moz_perm'] },
  { knownAs: 'VS Code 状态库', tables: ['ItemTable', 'cursor'] },
  { knownAs: '微信聊天记录', tables: ['Chat', 'ChatContact', 'Name2ID'] },
  { knownAs: 'Windows 通知库', tables: ['Notification', 'Handler'] },
  { knownAs: 'Windows 搜索索引', tables: ['SystemIndex_0A', 'SystemIndex_Gthr'] },
  { knownAs: 'Steam 应用缓存', tables: ['DataCache', 'AppLog'] },
];

/** 按表名集合识别已知库（返回 null = 不认识，如实标注） */
function matchSignature(tableNames) {
  if (!Array.isArray(tableNames) || !tableNames.length) return null;
  const set = new Set(tableNames);
  let best = null;
  let bestHits = 0;
  for (const sig of KNOWN_SIGNATURES) {
    const hits = sig.tables.filter((t) => set.has(t)).length;
    if (hits >= 2 && hits > bestHits) { best = sig; bestHits = hits; }
  }
  return best ? { knownAs: best.knownAs, hits: bestHits } : null;
}

// ── SQL 闸门 ─────────────────────────────────────────────────────────────────
// 只读语句允许的首词（查询通道白名单）
const READONLY_HEADS = new Set(['select', 'with', 'values', 'explain', 'pragma']);

/** 去掉注释后按真分号切分——字符串/标识符内的分号不算语句边界 */
function stripSqlComments(sql) {
  let out = '';
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i];
    if (c === '-' && sql[i + 1] === '-') {
      while (i < n && sql[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && sql[i + 1] === '*') {
      i += 2;
      while (i < n && !(sql[i] === '*' && sql[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** 真语句分割：先剥注释，再跳过 '...' "..." `...` [...] 内的分号 */
function splitStatements(sql) {
  // 修复：注释必须先剥——否则「SELECT 1;\n-- x; DELETE FROM t」里的注释体
  // 会被当成一条语句残留在结果里，闸门可能误判条数/首词。
  const clean = stripSqlComments(String(sql || ''));
  const parts = [];
  let cur = '';
  let i = 0;
  const n = clean.length;
  let quote = null;
  while (i < n) {
    const c = clean[i];
    if (quote) {
      cur += c;
      if (c === quote) {
        // 双写转义（'' "" ]] ``）
        if (clean[i + 1] === quote && (quote !== '[' || c === ']')) { cur += clean[i + 1]; i += 2; continue; }
        quote = null;
      }
      i++;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { quote = c; cur += c; i++; continue; }
    if (c === '[') { quote = ']'; cur += c; i++; continue; }
    if (c === ';') { parts.push(cur); cur = ''; i++; continue; }
    cur += c;
    i++;
  }
  if (cur.trim()) parts.push(cur);
  return parts.map((s) => s.trim()).filter(Boolean);
}

/**
 * 只读查询闸门：查询通道（面板 SQL 框 / sqlite_query 工具）只放行单条只读语句。
 * 返回 {ok:true, head} 或 {ok:false, error}。
 * 注意：PRAGMA 白名单在服务层按返回值是否可写判定（read-only pragma 之外拒绝）。
 */
function classifyReadonly(sql) {
  const stmts = splitStatements(stripSqlComments(String(sql || '')));
  if (stmts.length === 0) return { ok: false, error: '空语句' };
  if (stmts.length > 1) return { ok: false, error: `只允许单条语句（检测到 ${stmts.length} 条）——请逐条执行` };
  const head = stmts[0].replace(/^\s*(\(+\s*)*/u, '').split(/[\s(]/)[0].toLowerCase();
  if (!READONLY_HEADS.has(head)) {
    return { ok: false, error: `查询通道只读：以「${head}」开头的语句被拒绝（写操作请走两步写通道）` };
  }
  return { ok: true, head, single: stmts[0] };
}

// 只读 PRAGMA 名（查询通道放行）；其余 PRAGMA（journal_mode/wal_checkpoint/…）一律走维护通道
const READONLY_PRAGMAS = new Set([
  'table_info', 'table_xinfo', 'index_list', 'index_info', 'foreign_key_list',
  'page_count', 'page_size', 'freelist_count', 'journal_mode', 'encoding',
  'user_version', 'application_id', 'schema_version', 'data_version',
  'cache_size', 'page_cache', 'quick_check', 'integrity_check', 'compile_options',
]);

/** PRAGMA 细分闸门：只读 pragma 放行，其余拒绝。pragmaXxx/“pragma xxx(...)” 都接 */
function classifyPragma(single) {
  const m = /^pragma\s+([a-zA-Z_][\w]*)/i.exec(single);
  if (!m) return { ok: false, error: '无法解析的 PRAGMA' };
  const name = m[1].toLowerCase();
  if (!READONLY_PRAGMAS.has(name)) {
    return { ok: false, error: `PRAGMA ${name} 可能改变数据库状态——维护操作请走维护通道` };
  }
  return { ok: true };
}

/**
 * 写通道闸门（两步写的第一步校验）：
 *  - 单条语句
 *  - 必须是写类语句（insert/update/delete/create/drop/alter/reindex/vacuum）
 *  - UPDATE/DELETE 必须带 WHERE（防呆：整表覆写必须显式 1=1）
 *  - SELECT/PRAGMA 等非写语句拒绝（各走各的通道）
 */
const WRITE_HEADS = new Set(['insert', 'update', 'delete', 'create', 'drop', 'alter', 'reindex', 'vacuum']);

function classifyWrite(sql) {
  const stmts = splitStatements(stripSqlComments(String(sql || '')));
  if (stmts.length === 0) return { ok: false, error: '空语句' };
  if (stmts.length > 1) return { ok: false, error: `只允许单条语句（检测到 ${stmts.length} 条）` };
  const s = stmts[0];
  const head = s.replace(/^\s*(\(+\s*)*/u, '').split(/[\s(]/)[0].toLowerCase();
  if (head === 'select' || head === 'with' || head === 'values' || head === 'explain') {
    return { ok: false, error: '这是只读语句——查询请走查询通道（sqlite_query）' };
  }
  if (head === 'pragma') {
    const p = classifyPragma(s);
    return { ok: false, error: p.ok ? 'PRAGMA 请走维护通道' : p.error };
  }
  if (!WRITE_HEADS.has(head)) {
    return { ok: false, error: `不支持的写语句类型「${head}」` };
  }
  if ((head === 'update' || head === 'delete') && !/\bwhere\b/i.test(s)) {
    return { ok: false, error: `${head.toUpperCase()} 缺少 WHERE 子句被拒绝——确需全表操作请写 WHERE 1=1` };
  }
  return { ok: true, head, single: s };
}

/** 无 LIMIT 的 SELECT 自动包裹防全量倾泻（EXPLAIN/PRAGMA/带 LIMIT 的原样放行） */
function withLimit(single, limit) {
  const n = Math.max(1, Math.min(Number(limit) || DEFAULT_SETTINGS.queryLimit, 100000));
  const head = single.trim().replace(/^\s*(\(+\s*)*/u, '').split(/[\s(]/)[0].toLowerCase();
  if (head === 'explain' || head === 'pragma') return single;
  if (/\blimit\s+\d+/i.test(single)) return single;
  return `SELECT * FROM (${single}) AS __lens LIMIT ${n}`;
}

// ── 行整形（BLOB/超长文本安全化，防 UI/JSON 爆炸）───────────────────────────
const CELL_TEXT_CAP = 4096;

function shapeCell(v) {
  if (v === null || v === undefined) return { t: 'null', v: null };
  if (typeof v === 'number' || typeof v === 'bigint') return { t: 'num', v: String(v) };
  if (typeof v === 'string') {
    if (v.length > CELL_TEXT_CAP) return { t: 'text', v: v.slice(0, CELL_TEXT_CAP), trunc: v.length };
    return { t: 'text', v };
  }
  if (v instanceof Uint8Array) {
    return { t: 'blob', v: `BLOB(${v.length}B)`, bytes: v.length };
  }
  return { t: 'text', v: String(v) };
}

function shapeRows(columns, rows) {
  const shaped = (rows || []).map((r) => {
    const out = new Array(columns.length);
    for (let i = 0; i < columns.length; i++) out[i] = shapeCell(r ? r[i] : null);
    return out;
  });
  return shaped;
}

// ── CSV 序列化（RFC 4180：引号包裹+双写转义，BOM 让 Excel 认 UTF-8）────────
function csvEscape(s) {
  const str = String(s);
  if (/[",\r\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function toCsv(columns, rows) {
  const lines = [columns.map(csvEscape).join(',')];
  for (const r of rows) lines.push(r.map((v) => (v === null || v === undefined ? '' : csvEscape(v))).join(','));
  return '\uFEFF' + lines.join('\r\n');
}

/** 行整形后的 JSON（整形值已安全化） */
function toJson(columns, rows) {
  return JSON.stringify(rows.map((r) => {
    const o = {};
    columns.forEach((c, i) => { o[c] = r[i] !== undefined ? r[i] : null; });
    return o;
  }), null, 2);
}

// ── 工具 ─────────────────────────────────────────────────────────────────────
function fmtBytes(n) {
  if (!Number.isFinite(n) || n < 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)}${units[i]}`;
}

const SQLITE_MAGIC = Buffer.from('SQLite format 3\u0000', 'binary');

/** 库文件魔数校验（读前 16 字节；不匹配 → 大概率加密库/非 SQLite 文件） */
function looksLikeSqlite(buf) {
  if (!buf || buf.length < 16) return false;
  return SQLITE_MAGIC.compare(buf, 0, 16) === 0;
}

const DB_EXTENSIONS = ['.db', '.sqlite', '.sqlite3', '.db3', '.s3db', '.sl3'];

function isDbFileName(name) {
  const lower = name.toLowerCase();
  return DB_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** 雷达跳过目录（不进 node_modules/.git 等；Windows 系统目录跳过） */
const SKIP_DIR_NAMES = new Set([
  'node_modules', '.git', '.svn', '.hg', 'target', 'dist', 'build', 'out',
  '.gradle', '.idea', '.vs', 'vendor', '__pycache__', '.venv', 'venv',
  '$RECYCLE.BIN', 'System Volume Information', 'WindowsApps', '.reference',
]);

/** dbId：路径的稳定短 id（同文件重复打开命中同一 id） */
function dbIdOf(absPath) {
  const crypto = require('crypto');
  return crypto.createHash('sha1').update(String(absPath).toLowerCase()).digest('hex').slice(0, 12);
}

module.exports = {
  VERSION, K, DEFAULT_SETTINGS,
  PENDING_TTL_MS, AUDIT_CAP, QHIST_CAP, PENDING_CAP,
  KNOWN_SIGNATURES, matchSignature,
  READONLY_HEADS, READONLY_PRAGMAS, WRITE_HEADS,
  stripSqlComments, splitStatements,
  classifyReadonly, classifyPragma, classifyWrite, withLimit,
  CELL_TEXT_CAP, shapeCell, shapeRows,
  csvEscape, toCsv, toJson,
  fmtBytes, SQLITE_MAGIC, looksLikeSqlite,
  DB_EXTENSIONS, isDbFileName, SKIP_DIR_NAMES, dbIdOf,
};
