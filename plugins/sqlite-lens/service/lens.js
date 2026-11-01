#!/usr/bin/env node
'use strict';
/**
 * lens.js —— SQLite 检查台后台服务（零 npm 依赖；node >= 22.5 用内置 node:sqlite）
 *
 * 职责（契约见 README / shared/lens-core.js）：
 *   - HTTP API（只监听 127.0.0.1 + token，面板直连 / MCP 直连共用）：
 *     radar（发现库文件）/ open（校验魔数+只读打开）/ schema / rows / query /
 *     write（两步写预览）/ confirm（确认提交）/ stats / integrity / export /
 *     maintain（backup/vacuum）/ close / settings / libs_remove / meta
 *   - 安全模型：
 *       浏览连接永久 readOnly；写走短命 RW 连接；预览=BEGIN…ROLLBACK；
 *       确认=先备份整个 .db 再真正执行；UPDATE/DELETE 无 WHERE 已在闸门拒绝；
 *       无 LIMIT 的 SELECT 自动包裹；行×列单元预算封顶；全部写留审计。
 *   - cap.kv 数据面（sqltl.* 键空间）：meta 心跳 / settings / libs 清单 /
 *     qhist 查询历史 / audit 审计 / pending.* 两步写待确认单（带 TTL）
 *
 * 生命周期由宿主 PluginServiceManager 管理（type=http + /__health；
 * node:sqlite 不可用时健康端点仍 200 防误杀，meta 标 degraded）。
 *
 * 启动参数：node lens.js {{port}} {{appConfigDir}}
 */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const core = require('../shared/lens-core');
const { createKvClient } = require('./kvclient');

// ── node:sqlite 可用性探测（degraded 模式：服务活着但引擎不可用）─────────────
let sqlite = null;
let sqliteError = '';
try {
  // eslint-disable-next-line global-require
  sqlite = require('node:sqlite');
} catch (e) {
  sqliteError = `node:sqlite 不可用（需要 node >= 22.5，当前 ${process.version}）：${e.message}`;
}

const TICK_MS = 5000;
const META_BEAT_MS = 60 * 1000;
const SETTINGS_RELOAD_MS = 30 * 1000;
const OPEN_BUDGET_ROW_PROBE = 0;           // 打开时不做逐表 COUNT（大库打开必须快）
const RADAR_DEFAULT_BUDGET_MS = 2500;
const RADAR_MAX_RESULTS = 500;
const RADAR_MAGIC_CHECK_CAP = 200;         // 只对前 N 个候选读魔数（16B/个，廉价）
const EXPORT_ROW_CAP = 500000;
const EXPORT_BYTES_CAP = 200 * 1024 * 1024;
const TABLE_COUNT_CAP = 400;               // schema 列表上限
const BACKUP_DIR = 'sqlite-lens/backups';

// ── 文件日志（宿主不收集插件服务 stdout，自行落盘）──────────────────────────
let logFile = null;
function initLog(appConfigDir) {
  const dir = appConfigDir || os.tmpdir();
  try {
    fs.mkdirSync(dir, { recursive: true });
    logFile = path.join(dir, 'sqlite-lens.log');
    try {
      const st = fs.statSync(logFile);
      if (st.size > 512 * 1024) fs.renameSync(logFile, `${logFile}.old`);
    } catch (_) { /* 不存在即首轮 */ }
  } catch (_) { logFile = null; }
}
function log(level, msg) {
  const line = `[sqlite-lens:${level}] ${new Date().toISOString()} ${msg}`;
  process.stderr.write(line + '\n');
  if (logFile) {
    try { fs.appendFileSync(logFile, line + '\n'); } catch (_) { /* 磁盘问题不打断主流程 */ }
  }
}

const now = () => Date.now();

// ── 引擎层：每个库一个只读句柄缓存 + 写用短命连接 ──────────────────────────
function createEngines() {
  const handles = new Map(); // dbId → {db, file, openedAt}

  function openReadOnly(file) {
    const db = new sqlite.DatabaseSync(file, { readOnly: true });
    return db;
  }

  function getHandle(dbId, file) {
    let h = handles.get(dbId);
    if (h && h.file === file) return h;
    if (h) { try { h.db.close(); } catch (_) {} handles.delete(dbId); }
    const db = openReadOnly(file);
    h = { db, file, openedAt: now() };
    handles.set(dbId, h);
    // 句柄上限兜底：超 12 个关最旧的（检查台场景足够）
    if (handles.size > 12) {
      const oldest = [...handles.entries()].sort((a, b) => a[1].openedAt - b[1].openedAt)[0];
      if (oldest) { try { oldest[1].db.close(); } catch (_) {} handles.delete(oldest[0]); }
    }
    return h;
  }

  function closeHandle(dbId) {
    const h = handles.get(dbId);
    if (h) { try { h.db.close(); } catch (_) {} handles.delete(dbId); }
  }

  function closeAll() {
    for (const [, h] of handles) { try { h.db.close(); } catch (_) {} }
    handles.clear();
  }

  /** 短命 RW 连接执行 fn(db)；异常回滚，finally 关闭 */
  function withWriteConn(file, fn) {
    const db = new sqlite.DatabaseSync(file);
    try {
      return fn(db);
    } finally {
      try { db.close(); } catch (_) {}
    }
  }

  return { getHandle, closeHandle, closeAll, withWriteConn, openReadOnly };
}

// ── 备份：优先 node:sqlite backup API，回退 checkpoint+复制 ─────────────────
async function backupDbFile(file, backupDir) {
  fs.mkdirSync(backupDir, { recursive: true });
  const base = path.basename(file).replace(/\.[^.]+$/, '');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(backupDir, `${base}.${stamp}.db`);
  let how = 'unknown';
  if (sqlite && sqlite.backup) {
    try {
      const src = new sqlite.DatabaseSync(file, { readOnly: true });
      try { await sqlite.backup(src, dest); } finally { try { src.close(); } catch (_) {} }
      how = 'backup-api';
    } catch (e) {
      log('warn', `backup API 失败，回退文件复制: ${e.message}`);
    }
  }
  if (how === 'unknown') {
    // 回退：直接复制 .db（+ -wal/-shm 若在）。对静止库等价于快照；活跃库以
    // backup API 为主路径（上面失败才走到这），审计里如实标注方式。
    fs.copyFileSync(file, dest);
    for (const suffix of ['-wal', '-shm']) {
      if (fs.existsSync(file + suffix)) fs.copyFileSync(file + suffix, dest + suffix);
    }
    how = 'file-copy';
  }
  const size = (() => { try { return fs.statSync(dest).size; } catch (_) { return 0; } })();
  return { dest, size, how };
}

// ── 服务主体 ─────────────────────────────────────────────────────────────────
function createLens({ port, appConfigDir }) {
  const kv = createKvClient({ appConfigDir, log });
  const engines = createEngines();
  const startedAt = now();

  const settings = { ...core.DEFAULT_SETTINGS };
  let libs = [];              // 已打开库清单（LRU）
  let bridgeOk = false;
  let lastSettingsLoad = 0;
  let lastMetaAt = 0;

  const dataRootDir = (() => {
    // 备份目录锚定数据根：anchor.json > appConfigDir
    for (const p of [
      process.env.APPDATA ? path.join(process.env.APPDATA, 'Polaris', 'anchor.json') : '',
      path.join(os.homedir(), '.config', 'Polaris', 'anchor.json'),
    ]) {
      try {
        const a = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (a && typeof a.dataRoot === 'string' && a.dataRoot) return a.dataRoot;
      } catch (_) { /* 跳过 */ }
    }
    return appConfigDir || os.tmpdir();
  })();
  const backupDir = path.join(dataRootDir, ...BACKUP_DIR.split('/'));

  // ── 设置 / 清单 / 历史 / 审计 ──
  async function loadSettings() {
    const raw = await kv.kvGet(core.K.settings).catch(() => null);
    if (raw && typeof raw === 'object') {
      Object.assign(settings, raw);
      settings.radarRoots = Array.isArray(raw.radarRoots) ? raw.radarRoots.filter((r) => typeof r === 'string') : [];
    }
  }
  async function saveSettings() {
    await kv.kvSet(core.K.settings, settings).catch(() => {});
  }
  async function loadLibs() {
    const raw = await kv.kvGet(core.K.libs).catch(() => null);
    libs = raw && Array.isArray(raw.libs) ? raw.libs : [];
  }
  async function saveLibs() {
    await kv.kvSet(core.K.libs, { libs: libs.slice(0, 30) }).catch(() => {});
  }
  async function pushQhist(entry) {
    try {
      const raw = await kv.kvGet(core.K.qhist).catch(() => null);
      const items = raw && Array.isArray(raw.items) ? raw.items : [];
      items.unshift({ ...entry, at: now() });
      await kv.kvSet(core.K.qhist, { items: items.slice(0, core.QHIST_CAP) });
    } catch (_) {}
  }
  async function pushAudit(entry) {
    try {
      const raw = await kv.kvGet(core.K.audit).catch(() => null);
      const items = raw && Array.isArray(raw.items) ? raw.items : [];
      items.unshift({ ...entry, at: now() });
      await kv.kvSet(core.K.audit, { items: items.slice(0, core.AUDIT_CAP) });
    } catch (_) {}
  }

  function findLib(dbId) {
    return libs.find((l) => l.dbId === dbId) || null;
  }
  function fileOf(dbId) {
    const lib = findLib(dbId);
    if (lib) return lib.path;
    // 未在清单（MCP 直接传 id 而清单还没同步）——容忍：句柄缓存里有也算
    return null;
  }

  async function upsertLib({ file, sizeBytes, tables, knownAs }) {
    const dbId = core.dbIdOf(file);
    libs = libs.filter((l) => l.dbId !== dbId);
    libs.unshift({
      dbId, path: file, label: path.basename(file),
      sizeBytes: sizeBytes || 0, tables: tables || [], knownAs: knownAs || null,
      addedAt: libs.length ? undefined : now(), lastOpenedAt: now(),
    });
    for (const l of libs) if (l.addedAt === undefined) l.addedAt = now();
    await saveLibs();
    return dbId;
  }

  // ── 雷达：预算制遍历发现 .db 文件 ──
  function defaultRadarRoots() {
    const h = os.homedir();
    const roots = [];
    for (const p of [
      process.env.USERPROFILE || h,
      process.env.LOCALAPPDATA || '',
      process.env.APPDATA || '',
      path.join(h, 'Downloads'), path.join(h, 'Documents'), path.join(h, 'Desktop'),
    ]) {
      if (p && !roots.includes(p)) roots.push(p);
    }
    return roots;
  }

  function radarScan({ root, maxDepth, budgetMs }) {
    const depthCap = Math.max(1, Math.min(Number(maxDepth) || 5, 8));
    const deadline = now() + Math.max(500, Math.min(Number(budgetMs) || RADAR_DEFAULT_BUDGET_MS, 15000));
    const startDir = root
      ? path.resolve(root)
      : null;
    const roots = startDir ? [startDir] : [...defaultRadarRoots(), ...settings.radarRoots];
    const found = new Map(); // absPath → {path,sizeBytes,mtimeMs,depth}
    let walked = 0;
    let denied = 0;
    let partial = false;

    function walk(dir, depth) {
      if (now() > deadline) { partial = true; return; }
      if (depth > depthCap) return;
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { denied++; return; }
      walked++;
      for (const ent of entries) {
        if (now() > deadline) { partial = true; return; }
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          if (core.SKIP_DIR_NAMES.has(ent.name)) continue;
          if (ent.name.startsWith('$')) continue;
          walk(full, depth + 1);
        } else if (ent.isFile() && core.isDbFileName(ent.name)) {
          // 排除伴随文件（x.db-wal 已被扩展名规则排除；再防 x.db.bak 之类误收）
          try {
            const st = fs.statSync(full);
            if (found.size < RADAR_MAX_RESULTS) {
              found.set(full, { path: full, sizeBytes: st.size, mtimeMs: st.mtimeMs, depth });
            }
          } catch (_) { /* 刚被删/无权限 */ }
        }
      }
    }

    for (const r of roots) {
      if (now() > deadline) { partial = true; break; }
      let st = null;
      try { st = fs.statSync(r); } catch (_) { continue; }
      if (!st.isDirectory()) continue;
      walk(r, 1);
    }

    const items = [...found.values()].sort((a, b) => b.sizeBytes - a.sizeBytes);
    // 魔数校验：只看前 16 字节，把「碰巧叫 .db」的文件标出来
    for (let i = 0; i < Math.min(items.length, RADAR_MAGIC_CHECK_CAP); i++) {
      try {
        const fd = fs.openSync(items[i].path, 'r');
        const buf = Buffer.alloc(16);
        const n = fs.readSync(fd, buf, 0, 16, 0);
        fs.closeSync(fd);
        items[i].sqlite = core.looksLikeSqlite(buf.subarray(0, n));
      } catch (_) {
        items[i].sqlite = null; // 读不了就不下结论
      }
    }
    return {
      items, partial, walked, denied,
      elapsedMs: now() - (deadline - Math.max(500, Math.min(Number(budgetMs) || RADAR_DEFAULT_BUDGET_MS, 15000))),
      roots: startDir ? [startDir] : roots,
    };
  }

  // ── 打开库（只读）：魔数校验 + 表清单 + 签名识别 ──
  function openDb(file) {
    const abs = path.resolve(file);
    let st;
    try { st = fs.statSync(abs); } catch (_) {
      return { ok: false, error: `文件不存在或不可读：${abs}` };
    }
    if (!st.isFile()) return { ok: false, error: `不是文件：${abs}` };
    if (st.size < 16) return { ok: false, error: '文件太小，不是 SQLite 库' };
    try {
      const fd = fs.openSync(abs, 'r');
      const buf = Buffer.alloc(16);
      const n = fs.readSync(fd, buf, 0, 16, 0);
      fs.closeSync(fd);
      if (!core.looksLikeSqlite(buf.subarray(0, n))) {
        return { ok: false, error: '不是 SQLite 库文件（魔数不匹配——可能是加密库/SQLCipher/其他格式）。本插件不支持加密库。' };
      }
    } catch (e) {
      return { ok: false, error: `读文件头失败：${e.message}` };
    }

    const h = engines.getHandle(core.dbIdOf(abs), abs);
    const tables = [];
    let views = 0;
    let indexes = 0;
    try {
      const rows = h.db.prepare(
        `SELECT name, type FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name`,
      ).all();
      for (const r of rows) {
        if (r.type === 'table') tables.push(String(r.name));
        else if (r.type === 'view') views++;
        else if (r.type === 'index') indexes++;
      }
      if (tables.length > TABLE_COUNT_CAP) tables.length = TABLE_COUNT_CAP;
    } catch (e) {
      return { ok: false, error: `读 schema 失败（库可能被其他进程排他锁住）: ${e.message}` };
    }
    const sig = core.matchSignature(tables);
    return {
      ok: true,
      file: abs,
      sizeBytes: st.size,
      journalMode: (() => { try { return Object.values(h.db.prepare('PRAGMA journal_mode').get())[0]; } catch (_) { return '?'; } })(),
      tables, views, indexes,
      knownAs: sig ? sig.knownAs : null,
    };
  }

  // ── schema ──
  function schemaOf(dbId, table) {
    const file = fileOf(dbId);
    if (!file) return { ok: false, error: `未打开的库 ${dbId}` };
    const h = engines.getHandle(dbId, file);
    const out = {};
    try {
      if (table) {
        const q = String(table).replace(/"/g, '""');
        const ddl = h.db.prepare(
          `SELECT type, name, sql FROM sqlite_master WHERE name = ?`,
        ).all(table);
        const cols = h.db.prepare(`PRAGMA table_info("${q}")`).all();
        const idx = h.db.prepare(`PRAGMA index_list("${q}")`).all().map((r) => ({
          name: r.name, unique: !!r.unique, origin: r.origin, partial: !!r.partial,
        }));
        const fks = h.db.prepare(`PRAGMA foreign_key_list("${q}")`).all();
        let rowCount = null;
        try { rowCount = Object.values(h.db.prepare(`SELECT COUNT(*) AS c FROM "${q}"`).get())[0]; } catch (_) {}
        return {
          ok: true, table: String(table),
          ddl: ddl.map((d) => ({ type: d.type, name: d.name, sql: d.sql })),
          columns: cols.map((c) => ({ name: c.name, type: c.type, notNull: !!c['notnull'], dflt: c.dflt_value, pk: c.pk })),
          indexes: idx, foreignKeys: fks,
          rowCount,
        };
      }
      const rows = h.db.prepare(
        `SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name`,
      ).all();
      out.objects = rows.slice(0, TABLE_COUNT_CAP).map((r) => ({ type: r.type, name: r.name, sql: r.sql }));
      return { ok: true, ...out };
    } catch (e) {
      return { ok: false, error: `读 schema 失败: ${e.message}` };
    }
  }

  // ── 数据浏览（分页 + 可选过滤/排序）──
  function rowsOf(dbId, { table, offset, limit, where, orderBy, desc }) {
    const file = fileOf(dbId);
    if (!file) return { ok: false, error: `未打开的库 ${dbId}` };
    const h = engines.getHandle(dbId, file);
    const q = String(table || '').replace(/"/g, '""');
    if (!q) return { ok: false, error: '缺 table 参数' };

    // 排序列白名单：必须真实存在于 table_info（防注入）
    let orderSql = '';
    if (orderBy) {
      const cols = (() => { try { return h.db.prepare(`PRAGMA table_info("${q}")`).all(); } catch (_) { return []; } })();
      const hit = cols.find((c) => String(c.name).toLowerCase() === String(orderBy).toLowerCase());
      if (!hit) return { ok: false, error: `排序列不存在：${orderBy}` };
      orderSql = ` ORDER BY "${String(hit.name).replace(/"/g, '""')}" ${desc ? 'DESC' : 'ASC'}`;
    }
    const whereSql = where && String(where).trim() ? ` WHERE ${String(where).trim()}` : '';
    const lim = Math.max(1, Math.min(Number(limit) || 100, 500));
    const off = Math.max(0, Number(offset) || 0);

    try {
      const cellBudget = Math.max(1000, Number(settings.cellBudget) || core.DEFAULT_SETTINGS.cellBudget);
      const maxRows = Math.max(1, Math.min(lim, Math.floor(cellBudget / 8)));
      const total = Object.values(h.db.prepare(`SELECT COUNT(*) AS c FROM "${q}"${whereSql}`).get())[0];
      const stmt = h.db.prepare(`SELECT * FROM "${q}"${whereSql}${orderSql} LIMIT ${maxRows} OFFSET ${off}`);
      const rawRows = stmt.all();
      const columns = rawRows.length ? Object.keys(rawRows[0]) : (() => {
        try { return h.db.prepare(`PRAGMA table_info("${q}")`).all().map((c) => c.name); } catch (_) { return []; }
      })();
      const shaped = core.shapeRows(columns, rawRows.map((r) => columns.map((c) => r[c])));
      return {
        ok: true, table: String(table), total, offset: off,
        columns, rows: shaped,
        truncated: total > off + rawRows.length,
      };
    } catch (e) {
      return { ok: false, error: `查询失败: ${e.message}` };
    }
  }

  // ── 只读查询 ──
  function runQuery(dbId, { sql, limit }) {
    const file = fileOf(dbId);
    if (!file) return { ok: false, error: `未打开的库 ${dbId}` };
    const cls = core.classifyReadonly(sql);
    if (!cls.ok) return { ok: false, error: cls.error };
    let single = cls.single;
    if (cls.head === 'pragma') {
      const p = core.classifyPragma(single);
      if (!p.ok) return { ok: false, error: p.error };
    } else {
      single = core.withLimit(single, limit);
    }
    const h = engines.getHandle(dbId, file);
    const t0 = now();
    try {
      const stmt = h.db.prepare(single);
      const rawRows = stmt.all();
      const ms = now() - t0;
      const columns = rawRows.length ? Object.keys(rawRows[0]) : [];
      const cellBudget = Math.max(1000, Number(settings.cellBudget) || core.DEFAULT_SETTINGS.cellBudget);
      const cap = Math.max(10, Math.floor(cellBudget / Math.max(1, columns.length || 1)));
      const trimmed = rawRows.length > cap ? rawRows.slice(0, cap) : rawRows;
      const shaped = core.shapeRows(columns, trimmed.map((r) => columns.map((c) => r[c])));
      return {
        ok: true, sql: single, columns, rows: shaped,
        totalRows: rawRows.length, truncated: rawRows.length > trimmed.length,
        ms,
      };
    } catch (e) {
      return { ok: false, error: `执行失败: ${e.message}`, sql: single };
    }
  }

  const backedUpFiles = new Map(); // dbId → backupInfo（每次服务生命周期只备一次）
  const pendings = new Map();      // pendingId → 待确认单（内存权威；kv 只做镜像）

  // ── 两步写：预览（BEGIN…ROLLBACK）→ 待确认单 ──
  async function previewWrite(dbId, sql) {
    const file = fileOf(dbId);
    if (!file) return { ok: false, error: `未打开的库 ${dbId}` };
    const cls = core.classifyWrite(sql);
    if (!cls.ok) return { ok: false, error: cls.error };
    const single = cls.single;

    // 待确认单容量闸（内存权威 + kv 镜像合并计数）
    const alive = [...pendings.values()].filter((p) => now() <= p.expiresAt);
    let mirrored = 0;
    try {
      const keys = await kv.kvKeys();
      mirrored = keys.filter((k) => k.startsWith(core.K.pendingPrefix)
        && !pendings.has(k.slice(core.K.pendingPrefix.length))).length;
    } catch (_) { /* 桥不可达时只按内存计数 */ }
    if (alive.length + mirrored >= core.PENDING_CAP) {
      return { ok: false, error: `已有 ${alive.length + mirrored} 张待确认单未处理——先确认或取消` };
    }

    let preview;
    if (cls.head === 'vacuum') {
      preview = { head: 'vacuum', note: 'VACUUM 将重建整个数据库文件（回收空闲页），无行级影响数', changes: null };
    } else {
      try {
        preview = engines.withWriteConn(file, (db) => {
          db.exec('BEGIN IMMEDIATE');
          try {
            const stmt = db.prepare(single);
            const r = stmt.run();
            const out = {
              head: cls.head, changes: Number(r.changes),
              lastInsertRowid: r.lastInsertRowid !== undefined ? String(r.lastInsertRowid) : null,
              note: '预览已在事务中回滚，未写入任何数据',
            };
            return out;
          } finally {
            try { db.exec('ROLLBACK'); } catch (_) { /* 已回滚/无事务 */ }
          }
        });
      } catch (e) {
        return { ok: false, error: `预览执行失败（未写入）: ${e.message}` };
      }
    }

    const id = crypto.randomBytes(8).toString('hex');
    const pending = {
      id, dbId, file, sql: single, preview, createdAt: now(),
      expiresAt: now() + core.PENDING_TTL_MS,
    };
    pendings.set(id, pending);
    // kv 镜像（尽力而为）：面板跨端横幅与「服务重启后仍可确认」靠它；
    // 镜像失败不阻塞两步写（内存权威仍在）。
    await kv.kvSet(core.K.pendingPrefix + id, pending).catch((e) => {
      log('warn', `待确认单 kv 镜像失败（内存权威不受影响）: ${e.message}`);
    });
    log('info', `两步写预览 db=${file} changes=${preview.changes}`);
    return { ok: true, pendingId: id, ...pending };
  }

  // ── 两步写：确认（先备份再提交）/ 取消 ──
  async function confirmWrite(pendingId, decision) {
    const pid = String(pendingId);
    let raw = pendings.get(pid) || null;
    if (!raw) {
      // 服务重启后内存丢了——kv 镜像兜底
      raw = await kv.kvGet(core.K.pendingPrefix + pid).catch(() => null);
    }
    if (!raw || typeof raw !== 'object' || !raw.file) {
      return { ok: false, error: '待确认单不存在（可能已处理或过期）' };
    }
    if (decision !== 'commit') {
      pendings.delete(pid);
      await kv.kvDel(core.K.pendingPrefix + pid).catch(() => {});
      return { ok: true, executed: false, note: '已取消，数据库未改动' };
    }
    if (now() > raw.expiresAt) {
      pendings.delete(pid);
      await kv.kvDel(core.K.pendingPrefix + pid).catch(() => {});
      return { ok: false, error: '待确认单已过期（10 分钟），请重新预览' };
    }
    const file = raw.file;
    const sql = raw.sql;

    // 首次写前自动备份（每文件每次服务生命周期只备一次）
    const already = backedUpFiles.get(core.dbIdOf(file));
    let backupInfo = already || null;
    if (!already && settings.autoBackup) {
      try {
        backupInfo = await backupDbFile(file, backupDir);
        backedUpFiles.set(core.dbIdOf(file), backupInfo);
        log('info', `写前备份 ${file} → ${backupInfo.dest} (${backupInfo.how})`);
      } catch (e) {
        return { ok: false, error: `写前备份失败，为安全起见已中止写入: ${e.message}` };
      }
    }

    try {
      const r = engines.withWriteConn(file, (db) => {
        if (raw.preview && raw.preview.head === 'vacuum') {
          db.exec(sql); // VACUUM 不能在事务内
          return { changes: 0, note: 'VACUUM 完成' };
        }
        db.exec('BEGIN IMMEDIATE');
        try {
          const stmt = db.prepare(sql);
          const rr = stmt.run();
          db.exec('COMMIT');
          return { changes: Number(rr.changes), lastInsertRowid: rr.lastInsertRowid !== undefined ? String(rr.lastInsertRowid) : null };
        } catch (e) {
          try { db.exec('ROLLBACK'); } catch (_) {}
          throw e;
        }
      });
      pendings.delete(pid); // 一次性：提交即销毁（重放确认会走「不存在」路径）
      await kv.kvDel(core.K.pendingPrefix + pid).catch(() => {});
      await pushAudit({
        dbPath: file, sql, status: 'committed', changes: r.changes,
        backupPath: backupInfo ? backupInfo.dest : null,
      });
      log('info', `两步写提交 db=${file} changes=${r.changes}`);
      return { ok: true, executed: true, changes: r.changes, lastInsertRowid: r.lastInsertRowid, backup: backupInfo };
    } catch (e) {
      await pushAudit({ dbPath: file, sql, status: 'failed', changes: null, error: e.message });
      return { ok: false, error: `执行失败（已回滚，未改动）: ${e.message}` };
    }
  }

  // ── 维护：页统计 / 完整性 / 手动备份 / VACUUM ──
  function statsOf(dbId) {
    const file = fileOf(dbId);
    if (!file) return { ok: false, error: `未打开的库 ${dbId}` };
    const h = engines.getHandle(dbId, file);
    try {
      const one = (p) => { try { return Object.values(h.db.prepare(p).get())[0]; } catch (_) { return null; } };
      const pageSize = Number(one('PRAGMA page_size')) || 0;
      const pageCount = Number(one('PRAGMA page_count')) || 0;
      const freelist = Number(one('PRAGMA freelist_count')) || 0;
      const journalMode = one('PRAGMA journal_mode');
      let counts = { tables: 0, views: 0, indexes: 0, triggers: 0 };
      try {
        for (const r of h.db.prepare(`SELECT type, COUNT(*) AS c FROM sqlite_master GROUP BY type`).all()) {
          if (r.type === 'table') counts.tables = Number(r.c);
          if (r.type === 'view') counts.views = Number(r.c);
          if (r.type === 'index') counts.indexes = Number(r.c);
          if (r.type === 'trigger') counts.triggers = Number(r.c);
        }
      } catch (_) {}
      const walSize = (() => { try { return fs.existsSync(file + '-wal') ? fs.statSync(file + '-wal').size : 0; } catch (_) { return 0; } })();
      let fileSize = 0;
      try { fileSize = fs.statSync(file).size; } catch (_) {}
      return {
        ok: true, fileSize, pageSize, pageCount, freelistPages: freelist,
        reclaimableBytes: freelist * pageSize, journalMode, walSize, counts,
        hint: freelist * pageSize > 4 * 1024 * 1024
          ? `空闲页 ${core.fmtBytes(freelist * pageSize)}——VACUUM 可回收`
          : null,
      };
    } catch (e) {
      return { ok: false, error: `统计失败: ${e.message}` };
    }
  }

  function integrityOf(dbId) {
    const file = fileOf(dbId);
    if (!file) return { ok: false, error: `未打开的库 ${dbId}` };
    const h = engines.getHandle(dbId, file);
    try {
      const rows = h.db.prepare('PRAGMA quick_check').all();
      const lines = rows.map((r) => Object.values(r)[0]).map(String);
      return { ok: true, healthy: lines.length === 1 && lines[0] === 'ok', lines: lines.slice(0, 20) };
    } catch (e) {
      return { ok: false, error: `完整性检查失败: ${e.message}` };
    }
  }

  async function maintain(dbId, op) {
    const file = fileOf(dbId);
    if (!file) return { ok: false, error: `未打开的库 ${dbId}` };
    if (op === 'backup') {
      try {
        const info = await backupDbFile(file, backupDir);
        await pushAudit({ dbPath: file, sql: '(手动备份)', status: 'backup', backupPath: info.dest });
        return { ok: true, ...info };
      } catch (e) {
        return { ok: false, error: `备份失败: ${e.message}` };
      }
    }
    if (op === 'vacuum') {
      // VACUUM 走两步写闸（有全文件重建风险），这里直接做但先备份
      try {
        const info = await backupDbFile(file, backupDir);
        const before = (() => { try { return fs.statSync(file).size; } catch (_) { return 0; } })();
        engines.withWriteConn(file, (db) => { db.exec('VACUUM'); });
        const after = (() => { try { return fs.statSync(file).size; } catch (_) { return 0; } })();
        await pushAudit({ dbPath: file, sql: 'VACUUM', status: 'committed', changes: 0, backupPath: info.dest });
        return { ok: true, beforeBytes: before, afterBytes: after, freedBytes: Math.max(0, before - after), backup: info };
      } catch (e) {
        return { ok: false, error: `VACUUM 失败: ${e.message}` };
      }
    }
    return { ok: false, error: `未知维护操作 ${op}` };
  }

  // ── 导出 ──
  async function exportData(dbId, { sql, table, format, fileName, outDir }) {
    const file = fileOf(dbId);
    if (!file) return { ok: false, error: `未打开的库 ${dbId}` };
    let columns = [];
    let rawRows = []; // 行 = 与 columns 对齐的值数组（原生值）
    if (table) {
      const q = String(table).replace(/"/g, '""');
      const h = engines.getHandle(dbId, file);
      try {
        const stmt = h.db.prepare(`SELECT * FROM "${q}" LIMIT ${EXPORT_ROW_CAP}`);
        const objs = stmt.all();
        columns = objs.length ? Object.keys(objs[0]) : (() => {
          try { return h.db.prepare(`PRAGMA table_info("${q}")`).all().map((c) => c.name); } catch (_) { return []; }
        })();
        rawRows = objs.map((o) => columns.map((c) => o[c]));
      } catch (e) {
        return { ok: false, error: `导出表失败: ${e.message}` };
      }
    } else if (sql) {
      const cls = core.classifyReadonly(sql);
      if (!cls.ok) return { ok: false, error: cls.error };
      let single = cls.single;
      if (cls.head === 'pragma') {
        const p = core.classifyPragma(single);
        if (!p.ok) return { ok: false, error: p.error };
      } else {
        single = core.withLimit(single, EXPORT_ROW_CAP);
      }
      const h = engines.getHandle(dbId, file);
      try {
        const objs = h.db.prepare(single).all();
        columns = objs.length ? Object.keys(objs[0]) : [];
        rawRows = objs.map((o) => columns.map((c) => o[c]));
      } catch (e) {
        return { ok: false, error: `执行失败: ${e.message}` };
      }
    } else {
      return { ok: false, error: '缺 sql 或 table 参数' };
    }

    const fmt = format === 'json' ? 'json' : 'csv';
    const shaped = core.shapeRows(columns, rawRows);
    // BLOB 在文本导出里标注为 BLOB(nB)，与其他通道展示口径一致
    const plain = shaped.map((row) => row.map((c) => (c.t === 'blob' ? c.v : c.v)));
    const content = fmt === 'csv' ? core.toCsv(columns, plain) : core.toJson(columns, plain);
    if (Buffer.byteLength(content, 'utf8') > EXPORT_BYTES_CAP) {
      return { ok: false, error: '导出内容超过 200MB 上限——请缩小查询范围' };
    }
    const dir = outDir && path.isAbsolute(String(outDir)) ? String(outDir)
      : path.join(os.homedir(), 'Downloads');
    try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
    const base = (fileName && String(fileName).replace(/[\\/:*?"<>|]/g, '_')) || `${path.basename(file).replace(/\.[^.]+$/, '')}-export`;
    let dest = path.join(dir, `${base}.${fmt}`);
    for (let i = 1; fs.existsSync(dest); i++) dest = path.join(dir, `${base}-${i}.${fmt}`);
    try { fs.writeFileSync(dest, content, 'utf8'); } catch (e) {
      return { ok: false, error: `写文件失败: ${e.message}` };
    }
    return { ok: true, path: dest, rows: plain.length, columns, format: fmt, bytes: Buffer.byteLength(content, 'utf8') };
  }

  // ── 待确认单清扫 ──
  async function sweepPendings() {
    for (const [id, p] of pendings) {
      if (now() > p.expiresAt) { pendings.delete(id); log('info', `内存过期待确认单已清扫 ${id}`); }
    }
    try {
      const keys = await kv.kvKeys();
      for (const k of keys) {
        if (!k.startsWith(core.K.pendingPrefix)) continue;
        const v = await kv.kvGet(k).catch(() => null);
        if (v && typeof v === 'object' && typeof v.expiresAt === 'number' && now() > v.expiresAt) {
          await kv.kvDel(k).catch(() => {});
          log('info', `过期待确认单已清扫 ${k}`);
        }
      }
    } catch (_) { /* 桥不可达时静默，下轮再试 */ }
  }

  // ── meta 心跳 ──
  async function beatMeta(state) {
    await kv.kvSet(core.K.meta, {
      version: core.VERSION, port: state.port, token: state.token,
      startedAt, pid: process.pid, degraded: sqliteError || null,
      updatedAt: now(),
    }).catch(() => {});
  }

  // ── HTTP 层 ──
  function sendJson(res, code, obj) {
    const body = JSON.stringify(obj);
    res.writeHead(code, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, X-SqliteLens-Token',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    });
    res.end(body);
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let body = '';
      let size = 0;
      req.on('data', (c) => {
        size += c.length;
        if (size > 2 * 1024 * 1024) { reject(new Error('请求体过大')); req.destroy(); return; }
        body += c;
      });
      req.on('end', () => resolve(body));
      req.on('error', reject);
    });
  }

  async function handleApi(req, res, pathname) {
    // token 闸（/__health 与 CORS 预检除外）
    if (req.method === 'OPTIONS') { sendJson(res, 204, {}); return; }
    if (pathname !== '/__health') {
      if (!state.token || String(req.headers['x-sqlitelens-token'] || '') !== state.token) {
        sendJson(res, 401, { ok: false, error: '缺少或错误的 token（面板应从 cap.kv sqltl.meta 读取）' });
        return;
      }
    }
    if (sqliteError && pathname !== '/__health' && pathname !== '/api/meta') {
      sendJson(res, 200, { ok: false, error: `引擎不可用：${sqliteError}` });
      return;
    }

    let body = {};
    if (req.method === 'POST') {
      const raw = await readBody(req).catch((e) => { sendJson(res, 400, { ok: false, error: e.message }); return null; });
      if (raw === null) return;
      try { body = raw ? JSON.parse(raw) : {}; } catch (_) { sendJson(res, 400, { ok: false, error: '请求体不是 JSON' }); return; }
    }

    // 桥未就绪时 /api/meta 返回内存态（libs/settings 为空数组），面板轮询自然恢复

    try {
      switch (pathname) {
        case '/__health':
          sendJson(res, 200, { ok: true, service: 'sqlite-lens', version: core.VERSION, degraded: !!sqliteError });
          return;
        case '/api/meta': {
          // 待确认单：内存权威 + kv 镜像（服务重启前遗留的）合并去重
          const pendList = [...pendings.values()].filter((p) => now() <= p.expiresAt);
          try {
            const keys = (await kv.kvKeys()).filter((k) => k.startsWith(core.K.pendingPrefix));
            for (const k of keys) {
              const id = k.slice(core.K.pendingPrefix.length);
              if (!pendings.has(id)) {
                const v = await kv.kvGet(k).catch(() => null);
                if (v && typeof v === 'object' && now() <= v.expiresAt) pendList.push(v);
              }
            }
          } catch (_) { /* 桥不可达：只有内存单 */ }
          sendJson(res, 200, {
            ok: true, version: core.VERSION, degraded: sqliteError || null,
            bridgeOk, libs: bridgeOk ? libs : [], settings: bridgeOk ? settings : { ...core.DEFAULT_SETTINGS },
            pendingCount: pendList.length,
            pendingList: pendList,
            audit: bridgeOk ? (await kv.kvGet(core.K.audit).catch(() => null))?.items || [] : [],
            qhist: bridgeOk ? (await kv.kvGet(core.K.qhist).catch(() => null))?.items || [] : [],
          });
          return;
        }
        case '/api/radar': {
          const r = radarScan({ root: body.root, maxDepth: body.maxDepth, budgetMs: body.budgetMs });
          sendJson(res, 200, { ok: true, ...r });
          return;
        }
        case '/api/open': {
          const r = openDb(String(body.path || ''));
          if (!r.ok) { sendJson(res, 200, r); return; }
          const dbId = await upsertLib({ file: r.file, sizeBytes: r.sizeBytes, tables: r.tables, knownAs: r.knownAs });
          await pushAudit({ dbPath: r.file, sql: '(打开)', status: 'open' });
          sendJson(res, 200, { ok: true, dbId, ...r });
          return;
        }
        case '/api/schema':
          sendJson(res, 200, schemaOf(String(body.dbId || ''), body.table ? String(body.table) : null));
          return;
        case '/api/rows':
          sendJson(res, 200, rowsOf(String(body.dbId || ''), {
            table: body.table, offset: body.offset, limit: body.limit,
            where: body.where, orderBy: body.orderBy, desc: body.desc === true,
          }));
          return;
        case '/api/query': {
          const r = runQuery(String(body.dbId || ''), { sql: body.sql, limit: body.limit });
          if (r.ok) {
            await pushQhist({ sql: r.sql, dbPath: fileOf(String(body.dbId || '')) || '', ok: true, ms: r.ms, rows: r.totalRows });
          }
          sendJson(res, 200, r);
          return;
        }
        case '/api/write':
          sendJson(res, 200, await previewWrite(String(body.dbId || ''), String(body.sql || '')));
          return;
        case '/api/confirm':
          sendJson(res, 200, await confirmWrite(String(body.pendingId || ''), body.decision));
          return;
        case '/api/stats':
          sendJson(res, 200, statsOf(String(body.dbId || '')));
          return;
        case '/api/integrity':
          sendJson(res, 200, integrityOf(String(body.dbId || '')));
          return;
        case '/api/maintain':
          sendJson(res, 200, await maintain(String(body.dbId || ''), String(body.op || '')));
          return;
        case '/api/export':
          sendJson(res, 200, await exportData(String(body.dbId || ''), body));
          return;
        case '/api/close': {
          engines.closeHandle(String(body.dbId || ''));
          sendJson(res, 200, { ok: true });
          return;
        }
        case '/api/settings': {
          if (body && typeof body === 'object' && body.settings && typeof body.settings === 'object') {
            const next = { ...settings, ...body.settings };
            next.radarRoots = Array.isArray(next.radarRoots) ? next.radarRoots.filter((r) => typeof r === 'string' && r) : [];
            Object.assign(settings, next);
            await saveSettings();
          }
          sendJson(res, 200, { ok: true, settings });
          return;
        }
        case '/api/libs_remove': {
          const dbId = String(body.dbId || '');
          const before = libs.length;
          libs = libs.filter((l) => l.dbId !== dbId);
          engines.closeHandle(dbId);
          if (libs.length !== before) await saveLibs();
          sendJson(res, 200, { ok: true, removed: libs.length !== before });
          return;
        }
        default:
          sendJson(res, 404, { ok: false, error: `未知路径 ${pathname}` });
      }
    } catch (e) {
      log('error', `${pathname} 处理异常: ${e.message}`);
      sendJson(res, 200, { ok: false, error: `服务内部错误: ${e.message}` });
    }
  }

  const state = { port, token: '', startedAt };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    handleApi(req, res, url.pathname).catch((e) => {
      log('error', `API 异常: ${e.message}`);
      try { sendJson(res, 500, { ok: false, error: e.message }); } catch (_) {}
    });
  });

  async function boot() {
    await loadSettings();
    await loadLibs();
    // token 持久化：重启不换（面板/MCP 缓存的 meta 持续可用，api-bench 同款）
    try {
      const meta = await kv.kvGet(core.K.meta);
      state.token = (meta && typeof meta.token === 'string' && meta.token) || crypto.randomBytes(16).toString('hex');
    } catch (_) {
      state.token = crypto.randomBytes(16).toString('hex');
    }
    bridgeOk = true;
    await beatMeta(state);
    log('info', `boot: port=${port} dataRoot=${dataRootDir} libs=${libs.length} engine=${sqliteError ? 'DEGRADED' : 'node:sqlite OK'}`);
  }

  const timers = [];
  timers.push(setInterval(() => { sweepPendings(); }, TICK_MS));
  timers.push(setInterval(() => { if (bridgeOk) beatMeta(state); }, META_BEAT_MS));
  timers.push(setInterval(async () => {
    if (now() - lastSettingsLoad < SETTINGS_RELOAD_MS) return;
    lastSettingsLoad = now();
    await loadSettings();
  }, SETTINGS_RELOAD_MS + 1));

  return { server, state, boot, close: () => { timers.forEach(clearInterval); engines.closeAll(); } };
}

// ── main ─────────────────────────────────────────────────────────────────────
function main() {
  const port = parseInt(process.argv[2] || '', 10);
  const appConfigDir = process.argv[3] || '';
  if (!Number.isFinite(port) || port <= 0) {
    process.stderr.write('[sqlite-lens:fatal] 缺少端口参数\n');
    process.exit(2);
  }
  initLog(appConfigDir);
  log('info', `launch: port=${port} node=${process.version}`);
  if (sqliteError) log('warn', sqliteError);

  const lens = createLens({ port, appConfigDir });
  lens.server.listen(port, '127.0.0.1', () => {
    log('info', `listening 127.0.0.1:${port}`);
    lens.boot();
  });
  lens.server.on('error', (e) => {
    log('error', `listen 失败: ${e.message}`);
    process.exit(3);
  });
  process.on('message', (m) => { if (m && m.type === 'ready') { /* 宿主无消费者，忽略 */ } });
  const shutdown = () => { try { lens.close(); } catch (_) {} process.exit(0); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (require.main === module) main();

module.exports = { createLens, backupDbFile };
