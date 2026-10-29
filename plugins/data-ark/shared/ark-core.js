'use strict';
/**
 * ark-core.js —— 数据备份共享核心（单一权威，零依赖）
 *
 * 被后台服务（CJS require）、MCP server（CJS require）与面板（esbuild 打包）
 * 共用：键空间、设置归一化、排除匹配（glob）、GFS 保留轮换、调度与错过补偿、
 * manifest 摘要。所有"策略与计算"必须放这里，两侧只做 IO / fs，
 * 防止口径漂移（同 ledger-core / srs-core 模式）。
 *
 * 备份库布局（<targetDir> 由设置指定，缺省 <数据根>/../polaris-ark）：
 *   objects/<h2>/<sha256>.gz        内容寻址对象（gzip 原文件，全库去重）
 *   snapshots/<snapId>.manifest.json 快照清单（tmp+rename 原子落盘）
 *   restored/<stamp>/…              恢复暂存（绝不直写数据根）
 *
 * 数据契约（cap.kv `dataark.*`，权威描述见 README）：
 *   dataark.settings / dataark.state / dataark.snapshot.<id>
 *   dataark.event.<ts>.<rand>（滚动保留 50）/ dataark.cmd.* / dataark.cmd.result.<nonce>
 */

// ── 键空间 ─────────────────────────────────────────────────────────────────
const K = {
  PREFIX: 'dataark.',
  settings: 'dataark.settings',
  state: 'dataark.state',
  snapshot: (id) => `dataark.snapshot.${id}`,
  snapshotPrefix: 'dataark.snapshot.',
  event: (ts, rand) => `dataark.event.${ts}.${rand}`,
  eventPrefix: 'dataark.event.',
  cmdBackup: 'dataark.cmd.backup',
  cmdVerify: (id) => `dataark.cmd.verify.${id}`,
  cmdGc: 'dataark.cmd.gc',
  cmdRestore: (nonce) => `dataark.cmd.restore.${nonce}`,
  cmdListFiles: (nonce) => `dataark.cmd.listfiles.${nonce}`,
  cmdResult: (nonce) => `dataark.cmd.result.${nonce}`,
  cmdPrefix: 'dataark.cmd.',
  cmdResultPrefix: 'dataark.cmd.result.',
};

const PLUGIN_ID = 'data-ark';
const SERVICE_ID = 'ark-service';

// ── 设置 ───────────────────────────────────────────────────────────────────
const DEFAULT_EXCLUDE_TOP = ['logs', 'cache', 'plugins'];
/** 内建排除：任何情况下都不进快照（锁/临时/交换文件） */
const BUILTIN_EXCLUDE = ['*.lock', '*.tmp', '*.swp', '~$*', '.ark-tmp-*', '*.ark-partial'];

const DEFAULT_SETTINGS = {
  schemaVersion: 1,
  /** 备份库根目录；空 = 服务端解析为 <数据根>/../polaris-ark */
  targetDir: '',
  /** 数据根一级条目排除（目录名或文件名） */
  excludeTop: [...DEFAULT_EXCLUDE_TOP],
  /** 额外排除 glob（相对数据根路径，支持 ** * ?） */
  extraExcludeGlobs: [],
  /** GFS 保留：近 N 天每天留最新 / 近 N 周每周留最新 / 近 N 月每月留最新 */
  retention: { daily: 7, weekly: 5, monthly: 3 },
  /** 调度：off | interval（每 N 小时） | daily（每天 HH:MM 本地时间） */
  schedule: { mode: 'interval', intervalHours: 12, at: '03:30' },
  /** 备份库总占用上限（字节，默认 5GB），超限先 GC，仍超则进入 degraded 暂停自动备份 */
  maxStoreBytes: 5 * 1024 * 1024 * 1024,
};

/**
 * 归一化设置；非法返回 { error }，合法返回 { settings }（补全缺省字段、钳制范围）。
 */
function normalizeSettings(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const out = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  if (s.targetDir !== undefined) {
    if (s.targetDir !== null && typeof s.targetDir !== 'string') return { error: 'targetDir 必须是字符串' };
    out.targetDir = String(s.targetDir || '').trim();
  }
  if (s.excludeTop !== undefined) {
    if (!Array.isArray(s.excludeTop)) return { error: 'excludeTop 必须是字符串数组' };
    const names = [...new Set(s.excludeTop.map((x) => String(x || '').trim().replace(/[\\/]+$/, '')).filter(Boolean))];
    for (const n of names) {
      if (n.includes('..') || n.includes('/') || n.includes('\\')) return { error: `excludeTop 只能是一级名称，非法：${n}` };
    }
    out.excludeTop = names;
  }
  if (s.extraExcludeGlobs !== undefined) {
    if (!Array.isArray(s.extraExcludeGlobs)) return { error: 'extraExcludeGlobs 必须是字符串数组' };
    out.extraExcludeGlobs = [...new Set(s.extraExcludeGlobs.map((x) => String(x || '').trim()).filter(Boolean))].slice(0, 50);
  }
  if (s.retention !== undefined) {
    const r = s.retention && typeof s.retention === 'object' ? s.retention : {};
    for (const k of ['daily', 'weekly', 'monthly']) {
      const n = Number(r[k]);
      if (Number.isFinite(n)) out.retention[k] = Math.min(366, Math.max(0, Math.round(n)));
    }
  }
  if (s.schedule !== undefined) {
    const sc = s.schedule && typeof s.schedule === 'object' ? s.schedule : {};
    const mode = sc.mode === 'off' || sc.mode === 'daily' || sc.mode === 'interval' ? sc.mode : 'interval';
    out.schedule = { mode, intervalHours: out.schedule.intervalHours, at: out.schedule.at };
    if (mode === 'interval') {
      const n = Number(sc.intervalHours);
      // 有限值按边界钳制（可预期）；垃圾值回退默认
      if (Number.isFinite(n)) out.schedule.intervalHours = Math.min(24 * 30, Math.max(1, Math.round(n)));
    }
    if (mode === 'daily') {
      const at = String(sc.at || '');
      if (/^([01]\d|2[0-3]):[0-5]\d$/.test(at)) out.schedule.at = at;
    }
  }
  if (s.maxStoreBytes !== undefined) {
    const n = Number(s.maxStoreBytes);
    if (Number.isFinite(n)) out.maxStoreBytes = Math.min(16 * 1024 * 1024 * 1024 * 1024, Math.max(64 * 1024 * 1024, Math.round(n)));
  }
  return { settings: out };
}

// ── 排除匹配 ───────────────────────────────────────────────────────────────
/** glob → RegExp：** 跨段、* 段内、? 单字符；pattern 含 / 以相对路径整体匹配，否则匹配 basename */
function globToRegex(pattern) {
  const p = String(pattern).trim().replace(/^\.\//, '').replace(/^\/+|\/+$/g, '');
  let re = '';
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === '*') {
      if (p[i + 1] === '*') {
        // `**/` = 任意层级目录；尾部 `**` = 任意余文
        if (p[i + 2] === '/') { re += '(?:.*/)?'; i += 2; } else { re += '.*'; i += 1; }
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`, 'i');
}

const _globCache = new Map();
function compileGlob(pattern) {
  let re = _globCache.get(pattern);
  if (!re) {
    re = globToRegex(pattern);
    if (_globCache.size > 200) _globCache.clear();
    _globCache.set(pattern, re);
  }
  return re;
}

/**
 * 相对路径（/ 分隔）是否被排除。
 * 规则优先级：内建排除 > excludeTop（一级条目） > extraExcludeGlobs。
 */
function isExcluded(relPath, { excludeTop, extraExcludeGlobs } = {}) {
  const rel = String(relPath).replace(/\\/g, '/').replace(/^\/+/, '');
  if (!rel || rel.split('/').includes('..')) return true; // 空/越界一律排除
  const base = rel.slice(rel.lastIndexOf('/') + 1);
  for (const pat of BUILTIN_EXCLUDE) {
    if (compileGlob(pat).test(base)) return true;
  }
  const top = rel.split('/')[0];
  if (Array.isArray(excludeTop) && excludeTop.includes(top)) return true;
  if (Array.isArray(extraExcludeGlobs)) {
    for (const pat of extraExcludeGlobs) {
      const re = compileGlob(pat);
      if (re.test(rel) || re.test(base)) return true;
    }
  }
  return false;
}

// ── 调度与错过补偿 ─────────────────────────────────────────────────────────
const FIRST_RUN_DELAY_MS = 90 * 1000; // 全新安装：90 秒后自动做第一次快照

/**
 * 计算下一次应跑时间（本地时区）。
 * @returns epoch ms；schedule.mode==='off' 时返回 null
 */
function planNextRun(schedule, now, lastRunAt) {
  const sc = schedule && typeof schedule === 'object' ? schedule : DEFAULT_SETTINGS.schedule;
  if (sc.mode === 'off') return null;
  if (sc.mode === 'interval') {
    const ivl = Math.max(1, Number(sc.intervalHours) || 12) * 3600 * 1000;
    if (!Number.isFinite(Number(lastRunAt)) || Number(lastRunAt) <= 0) return now + FIRST_RUN_DELAY_MS;
    return Number(lastRunAt) + ivl;
  }
  // daily：下一个 at 时刻（若今天 at 还没到且今天没跑过，则今天；否则明天）
  const [hh, mm] = String(sc.at || '03:30').split(':').map(Number);
  const d = new Date(now);
  const todayAt = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm, 0, 0).getTime();
  const ranToday = Number.isFinite(Number(lastRunAt)) && Number(lastRunAt) >= todayAt;
  return ranToday ? todayAt + 86400000 : (now < todayAt ? todayAt : todayAt + 86400000);
}

/** 是否错过调度（应用关机/服务停过）；返回 { overdue, missed }（补偿策略：无论错过几次只补跑一次） */
function catchUpInfo(state, schedule, now) {
  const next = state && Number.isFinite(Number(state.nextRunAt)) ? Number(state.nextRunAt) : null;
  if (!next || schedule?.mode === 'off') return { overdue: false, missed: 0 };
  if (now < next) return { overdue: false, missed: 0 };
  const sc = schedule || {};
  let unit = 86400000;
  if (sc.mode === 'interval') unit = Math.max(1, Number(sc.intervalHours) || 12) * 3600 * 1000;
  const missed = Math.min(99, Math.max(1, Math.floor((now - next) / unit) + 1));
  return { overdue: true, missed };
}

// ── GFS 保留轮换（纯函数）─────────────────────────────────────────────────
const pad2 = (n) => String(n).padStart(2, '0');
function dayKeyOf(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function weekKeyOf(ts) {
  const d = new Date(ts);
  // ISO 周：周四归属
  const day = (d.getDay() + 6) % 7;
  const thursday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day + 3);
  return `${thursday.getFullYear()}-W${pad2(isoWeekNumber(thursday))}`;
}
function isoWeekNumber(d) {
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayNr = (target.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const fDayNr = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - fDayNr + 3);
  return 1 + Math.round((target - firstThursday) / (7 * 86400000));
}
function monthKeyOf(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

/**
 * GFS 轮换决策。
 * @param manifests [{ id, finishedAt, ok }]（乱序可）
 * @param retention { daily, weekly, monthly }
 * @returns { keep: string[], prune: string[] }
 * 规则：永不裁最新一份；每个 日/周/月 桶留最新；桶范围外不留（除最新两份保底）。
 */
function planRotation(manifests, retention, now) {
  const r = { daily: 7, weekly: 5, monthly: 3, ...(retention && typeof retention === 'object' ? retention : {}) };
  const ok = (manifests || [])
    .filter((m) => m && m.id && Number.isFinite(Number(m.finishedAt)))
    .sort((a, b) => Number(b.finishedAt) - Number(a.finishedAt));
  if (!ok.length) return { keep: [], prune: [] };
  const keep = new Set([ok[0].id]);
  if (ok[1]) keep.add(ok[1].id); // 最新两份保底（防"上份损坏、这份被裁"的窗口）

  const buckets = { day: new Map(), week: new Map(), month: new Map() };
  const windows = { day: r.daily * 86400000, week: r.weekly * 7 * 86400000, month: r.monthly * 30 * 86400000 };
  const keyFns = { day: dayKeyOf, week: weekKeyOf, month: monthKeyOf };
  for (const m of ok) {
    const t = Number(m.finishedAt);
    for (const g of ['day', 'week', 'month']) {
      if (r[g] <= 0) continue;
      if (now - t > windows[g]) continue; // 桶窗口之外
      const k = keyFns[g](t);
      if (!buckets[g].has(k)) buckets[g].set(k, m.id); // 每桶留最新（ok 已按新→旧）
    }
  }
  for (const g of Object.keys(buckets)) {
    for (const id of buckets[g].values()) keep.add(id);
  }
  const prune = ok.filter((m) => !keep.has(m.id)).map((m) => m.id);
  return { keep: [...keep], prune };
}

// ── manifest 摘要 ──────────────────────────────────────────────────────────
/**
 * 增量决策：size 或 mtime 与上一份不同 → 需要重读重哈希。
 * mtime 精度 1ms；同 mtime 同 size 视为未变（服务端以 sha256 为最终事实）。
 */
function needsHash(prevEntry, stat) {
  if (!prevEntry) return true;
  return Number(prevEntry.s) !== stat.size || Math.abs(Number(prevEntry.m) - stat.mtimeMs) > 1;
}

/** 快照摘要（供 kv 索引与面板/MCP 展示） */
function summarizeManifest(manifest) {
  return {
    id: manifest.id,
    startedAt: manifest.startedAt,
    finishedAt: manifest.finishedAt,
    durationMs: manifest.finishedAt - manifest.startedAt,
    type: manifest.baseId ? 'incremental' : 'full',
    baseId: manifest.baseId || null,
    totalFiles: (manifest.files || []).length,
    changedFiles: (manifest.files || []).filter((f) => f.c).length,
    skipped: (manifest.skipped || []).length,
    logicalBytes: (manifest.files || []).reduce((a, f) => a + (Number(f.s) || 0), 0),
    newObjects: manifest.stats?.newObjects || 0,
    storedBytes: manifest.stats?.storedBytes || 0,
    ok: manifest.ok !== false,
    error: manifest.error || null,
  };
}

// ── 展示辅助 ───────────────────────────────────────────────────────────────
function formatBytes(n) {
  const b = Number(n) || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1048576).toFixed(1)} MB`;
  return `${(b / 1073741824).toFixed(2)} GB`;
}

function fmtDuration(ms) {
  const s = Math.round((Number(ms) || 0) / 1000);
  if (s < 60) return `${s} 秒`;
  if (s < 3600) return `${Math.floor(s / 60)} 分 ${s % 60} 秒`;
  return `${Math.floor(s / 3600)} 时 ${Math.floor((s % 3600) / 60)} 分`;
}

function timeAgo(ts, now) {
  const n = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  if (!Number.isFinite(Number(ts)) || ts <= 0) return '从未';
  const d = n - ts;
  if (d < 60 * 1000) return '刚刚';
  if (d < 3600 * 1000) return `${Math.floor(d / 60000)} 分钟前`;
  if (d < 86400 * 1000) return `${Math.floor(d / 3600000)} 小时前`;
  return `${Math.floor(d / 86400000)} 天前`;
}

/** 事件滚动保留裁剪（保留最新 cap 条） */
function pruneEvents(entries, cap = 50) {
  const arr = (entries || [])
    .filter((e) => e && typeof e === 'object' && Number.isFinite(Number(e.at)))
    .sort((a, b) => Number(b.at) - Number(a.at));
  return arr.slice(0, cap);
}

/** 恢复暂存目录名（分钟级戳，防同分钟冲突加 rand） */
function restoreStamp(now) {
  const d = new Date(Number.isFinite(Number(now)) ? Number(now) : Date.now());
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}-${Math.random().toString(36).slice(2, 6)}`;
}

module.exports = {
  K, PLUGIN_ID, SERVICE_ID,
  DEFAULT_SETTINGS, DEFAULT_EXCLUDE_TOP, BUILTIN_EXCLUDE, FIRST_RUN_DELAY_MS,
  normalizeSettings, isExcluded, globToRegex,
  planNextRun, catchUpInfo, planRotation,
  needsHash, summarizeManifest,
  formatBytes, fmtDuration, timeAgo, pruneEvents, restoreStamp,
  dayKeyOf, weekKeyOf, monthKeyOf,
};
