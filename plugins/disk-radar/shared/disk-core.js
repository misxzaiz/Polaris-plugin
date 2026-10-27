'use strict';
/**
 * disk-core.js —— 磁盘雷达纯函数核心（零 IO、零依赖）
 *
 * 面板（经 esbuild 打包）、服务（require）、单测三方共用，语义唯一权威。
 * 所有「判断/计算/守卫」都不许在 service 里内联实现——改语义只改这里，跑单测。
 */
const crypto = requireNodeBuiltin('crypto');
const path = requireNodeBuiltin('path');

/**
 * node 内置模块动态探测：面板 bundle 跑在浏览器里（esbuild 打包），没有
 * require/crypto/path——这里绕开静态解析，浏览器侧保持 null。md5/path 类
 * 函数仅服务与 MCP 进程使用；面板只用纯计算函数（squarify/growthDiff/fmt*）。
 */
function requireNodeBuiltin(name) {
  try {
    if (typeof require === 'function') return require(name);
  } catch (_) { /* 浏览器环境 */ }
  return null;
}

const VERSION = '0.1.0';
const TRASH_DIR = '.DiskRadarTrash';
const MAX_WALK_DEPTH = 40;          // junction 环兜底硬上限
const SNAP_NODE_BUDGET = 4000;      // 快照树节点预算
const SNAP_CHILD_KEEP = 64;         // 剪枝时每层保 top-N
const JUNK_ITEM_CAP = 500;          // 单根垃圾条目上限

// ── 键空间契约（与 README / service / mcp / 面板四方一致）────────────────────
const K = {
  settings: 'diskrad.settings',
  meta: 'diskrad.meta',
  roots: 'diskrad.roots',
  scan: 'diskrad.scan',
  state: 'diskrad.state',
  snap: (rid, seq) => `diskrad.snap.${rid}.${String(seq).padStart(4, '0')}`,
  snapPrefix: (rid) => `diskrad.snap.${rid}.`,
  snapPrefixAll: 'diskrad.snap.',
  junk: (rid) => `diskrad.junk.${rid}`,
  junkPrefixAll: 'diskrad.junk.',
  qman: (rid) => `diskrad.qman.${rid}`,
  qmanPrefixAll: 'diskrad.qman.',
  cmd: (op, nonce) => `diskrad.cmd.${op}.${nonce}`,
  cmdPrefix: 'diskrad.cmd.',
  result: (nonce) => `diskrad.result.${nonce}`,
  resultPrefix: 'diskrad.result.',
};

const DEFAULT_SETTINGS = {
  autoSnapshot: true,
  snapshotHours: 24,
  keepSnapshots: 12,
  autoBudgetSec: 90,
  deepBudgetMin: 10,
  quarantineDays: 14,
  extraJunkDirs: [],
  excludeNames: [],
};

// ── 基础工具 ────────────────────────────────────────────────────────────────
function md5(s) {
  if (!crypto) throw new Error('md5 仅在 node 环境（服务/MCP）可用');
  return crypto.createHash('md5').update(String(s)).digest('hex');
}

/** 根目录 id：路径 resolve 后取 md5 前 10 位（同一目录稳定，大小写不敏感平台天然归一） */
function rootIdOf(resolvedPath) {
  return md5(String(resolvedPath).toLowerCase()).slice(0, 10);
}

/**
 * 根路径规范化：去引号/首尾空白/尾分隔符（盘根除外），返回 { ok, path, error }。
 * 不触盘（resolve 是纯字符串运算）。
 */
function normalizeRootPath(raw) {
  let p = String(raw == null ? '' : raw).trim();
  if ((p.startsWith('"') && p.endsWith('"')) || (p.startsWith('\'') && p.endsWith('\''))) {
    p = p.slice(1, -1).trim();
  }
  if (!p) return { ok: false, error: '路径为空' };
  // 先验原始输入是否绝对——path.resolve 会把相对路径洗白成绝对，必须在其之前拦下
  const looksAbsolute = /^[a-zA-Z]:[\\/]/.test(p) || p.startsWith('\\\\') || p.startsWith('/');
  if (!looksAbsolute) return { ok: false, error: '需要绝对路径（如 D:\\space）' };
  let resolved;
  try { resolved = path.resolve(p); } catch (_) { return { ok: false, error: '路径无法解析' }; }
  // 盘根（D:\ 或 /）保留分隔符，其余去尾
  const isDriveRoot = /^[a-zA-Z]:\\?$/.test(resolved) || resolved === path.parse(resolved).root;
  if (!isDriveRoot) resolved = resolved.replace(/[\\/]+$/, '');
  if (!/^[a-zA-Z]:[\\/]/.test(resolved) && !resolved.startsWith('\\\\') && !resolved.startsWith('/')) {
    return { ok: false, error: '需要绝对路径（如 D:\\space）' };
  }
  if (resolved.includes(TRASH_DIR)) return { ok: false, error: `不能把隔离区目录（${TRASH_DIR}）登记为根` };
  return { ok: true, path: resolved };
}

/**
 * Windows 长路径前缀：≥250 字符加 \\?\（UNC 走 \\?\UNC\）。
 * 非 Windows 或已带前缀原样返回。
 */
function longPath(p) {
  const s = String(p);
  if (process.platform !== 'win32') return s;
  if (s.startsWith('\\\\?\\')) return s;
  if (s.length < 250) return s;
  if (s.startsWith('\\\\')) return '\\\\?\\UNC\\' + s.slice(2);
  return '\\\\?\\' + s;
}

// ── 垃圾识别（兄弟文件锚定，可解释）─────────────────────────────────────────
const JUNK_KIND_LABEL = { deps: '依赖包', build: '构建产物', cache: '缓存', custom: '自定义' };

const JUNK_RULES = [
  { names: ['node_modules'], kind: 'deps', require: ['package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb', 'pnpm-workspace.yaml', 'deno.lock'] },
  { names: ['bower_components'], kind: 'deps', require: [] },
  { names: ['.venv', 'venv'], kind: 'deps', require: [] },
  { names: ['target'], kind: 'build', require: ['Cargo.toml', 'cargo.lock'] },
  { names: ['cmake-build-debug', 'cmake-build-release'], kind: 'build', require: [] },
  { names: ['DerivedData'], kind: 'build', require: [] },
  { names: ['.next', '.nuxt', '.turbo', '.parcel-cache', '.gradle', '.dart_tool'], kind: 'build', require: [] },
  { names: ['dist', 'build', 'out'], kind: 'build', require: ['package.json', 'tsconfig.json', 'jsconfig.json', 'Cargo.toml', 'pyproject.toml', 'setup.py', 'go.mod', 'deno.json'] },
  { names: ['bin', 'obj'], kind: 'build', requireSuffix: ['.csproj', '.fsproj', '.vbproj', '.sln', '.vcxproj'] },
  { names: ['__pycache__', '.pytest_cache', '.mypy_cache', '.ruff_cache', '.ipynb_checkpoints'], kind: 'cache', require: [] },
  { names: ['.pnpm-store', 'pnpm-cache', '.npm-cache', '.yarn-cache'], kind: 'cache', require: [], note: '包管理器全局缓存——优先用其自带 prune/clean 命令更安全' },
];

/**
 * 判定一个目录名是否为开发垃圾。
 * @param opts {{ name: string, siblings: string[], extraDirs?: string[] }}
 *   siblings = 该目录同级其它条目名（来自父目录 readdir，含文件）。
 * @returns {hit:boolean, kind?:string, note?:string, rule?:string}
 */
function classifyJunkDir({ name, siblings, extraDirs }) {
  if (!name || name === TRASH_DIR || name.startsWith('.DiskRadarTrash')) return { hit: false };
  const sib = Array.isArray(siblings) ? siblings : [];
  for (const rule of JUNK_RULES) {
    if (!rule.names.includes(name)) continue;
    if (rule.require && rule.require.length) {
      const hit = sib.some((s) => rule.require.includes(s));
      if (!hit) return { hit: false };
    }
    if (rule.requireSuffix && rule.requireSuffix.length) {
      const hit = sib.some((s) => rule.requireSuffix.some((suf) => s.endsWith(suf)));
      if (!hit) return { hit: false };
    }
    return { hit: true, kind: rule.kind, note: rule.note, rule: rule.names[0] };
  }
  if (Array.isArray(extraDirs) && extraDirs.includes(name)) {
    return { hit: true, kind: 'custom', rule: name };
  }
  return { hit: false };
}

/** 垃圾条目 id：relPath 小写 md5 前 12 位（Windows 大小写不敏感，重扫幂等） */
function junkItemId(relPath) {
  return md5(String(relPath).toLowerCase().replace(/[\\/]+/g, '/')).slice(0, 12);
}

const ITEM_ID_RE = /^[0-9a-f]{12}$/;

// ── relPath 安全（隔离/恢复的注入防线）──────────────────────────────────────
/**
 * 校验扫描产出的 relPath（分隔符统一 '/'）：
 * 禁绝对、禁 .. 段、禁空段、禁 NUL。合法返回归一化的平台相对路径，否则 null。
 */
function safeRelPath(rel) {
  const s = String(rel == null ? '' : rel).replace(/\\/g, '/');
  if (!s || s.startsWith('/') || /^[a-zA-Z]:/.test(s)) return null;
  const segs = s.split('/');
  for (const seg of segs) {
    if (!seg || seg === '.' || seg === '..' || seg.includes('\0')) return null;
  }
  return segs.join(path.sep);
}

/** 断言 targetPath 在 rootPath 之下（含等于 root 本身时的调用方自行排除） */
function assertUnderRoot(rootPath, targetPath) {
  const r = path.resolve(String(rootPath));
  const t = path.resolve(String(targetPath));
  if (t === r) return true;
  const withSep = r.endsWith(path.sep) ? r : r + path.sep;
  if (t.startsWith(withSep)) return true;
  throw new Error(`路径越界：${t} 不在根 ${r} 之下`);
}

/** 隔离区路径（必须经此函数产生——守卫集中一处） */
function trashPathFor(rootPath, itemId) {
  if (!ITEM_ID_RE.test(String(itemId))) throw new Error(`非法条目 id：${itemId}`);
  const t = path.join(String(rootPath), TRASH_DIR, String(itemId));
  assertUnderRoot(rootPath, t);
  return t;
}

// ── 快照树 ──────────────────────────────────────────────────────────────────
/**
 * 树节点：{ n: 名称, b: bytes, f: files, c?: 子节点[], j?: junkKind, d?: denied }
 * dirs 数组按 b 降序。
 */
function sortTree(nodes) {
  if (!Array.isArray(nodes)) return nodes;
  nodes.sort((a, b) => (b.b || 0) - (a.b || 0) || String(a.n).localeCompare(String(b.n)));
  for (const nd of nodes) if (nd.c) sortTree(nd.c);
  return nodes;
}

function countTreeNodes(nodes) {
  let n = 0;
  for (const nd of nodes || []) {
    n += 1;
    if (nd.c) n += countTreeNodes(nd.c);
  }
  return n;
}

/** 节点预算剪枝：每层按 bytes 保 top-K，K 从 SNAP_CHILD_KEEP 逐轮减半直到进预算 */
function pruneTree(nodes, budget) {
  let count = countTreeNodes(nodes);
  if (count <= budget) return nodes;
  const apply = (k) => {
    const walk = (list) => {
      if (!Array.isArray(list) || !list.length) return;
      list.sort((a, b) => (b.b || 0) - (a.b || 0));
      for (let i = k; i < list.length; i++) {
        if (list[i].c) { count -= countTreeNodes(list[i].c); delete list[i].c; }
        count -= 1;
      }
      list.length = Math.min(list.length, k);
      for (const nd of list) if (nd.c) walk(nd.c);
    };
    walk(nodes);
  };
  let keep = SNAP_CHILD_KEEP;
  while (count > budget && keep > 1) {
    apply(keep);
    if (count > budget) keep = Math.max(1, Math.floor(keep / 2));
  }
  return sortTree(nodes);
}

/** 树总量一致性校验用 */
function treeTotal(nodes) {
  let s = 0;
  for (const nd of nodes || []) s += nd.b || 0;
  return s;
}

/**
 * 增量归因（「谁偷了我的磁盘」）：prev/cur 为两棵快照 dirs 树（name 对齐）。
 * 返回 movers: [{ path, from, to, delta }]，按 |delta| 降序；
 * 未匹配名 → 新增(from=0)/移除(to=0)。只展开 delta≠0 的匹配对，深度 ≤2 层。
 */
function growthDiff(prevDirs, curDirs, { depth = 2 } = {}) {
  const out = [];
  const diffLevel = (prev, cur, prefix, lvl) => {
    const pmap = new Map((prev || []).map((n) => [n.n, n]));
    const cmap = new Map((cur || []).map((n) => [n.n, n]));
    const names = new Set([...pmap.keys(), ...cmap.keys()]);
    for (const name of names) {
      const p = pmap.get(name);
      const c = cmap.get(name);
      const from = p ? (p.b || 0) : 0;
      const to = c ? (c.b || 0) : 0;
      const delta = to - from;
      // 先展开子层再看父层增减：顶层总量没变但内部挪动（a 涨 b 跌）恰恰是最值得归因的
      if (lvl < depth && p && c && p.c && c.c) {
        diffLevel(p.c, c.c, prefix ? `${prefix}/${name}` : name, lvl + 1);
      }
      if (delta === 0) continue;
      out.push({ path: prefix ? `${prefix}/${name}` : name, from, to, delta });
    }
  };
  diffLevel(prevDirs, curDirs, '', 1);
  out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return out;
}

// ── 矩形树图（squarified treemap）───────────────────────────────────────────
/**
 * squarify：items=[{name,value}]（内部会过滤非正值并降序）→ rects=[{name,value,x,y,w,h}]。
 * 面积守恒：Σrect 面积 = Σ有效 value 面积。无效输入返回 []。
 */
function squarify(items, x, y, w, h) {
  const rect = { x, y, w, h };
  if (!(rect.w > 0) || !(rect.h > 0) || !Array.isArray(items)) return [];
  const vals = items
    .map((it) => ({ name: it.name, value: Number(it.value) }))
    .filter((it) => Number.isFinite(it.value) && it.value > 0)
    .sort((a, b) => b.value - a.value);
  if (!vals.length) return [];
  const total = vals.reduce((s, v) => s + v.value, 0);
  const scale = (rect.w * rect.h) / total;
  const out = [];
  let row = [];
  let rowSum = 0;
  // 让当前行的最差长宽比优于「把下一项也放进来」的方案
  const worst = (sum, len) => {
    const s2 = sum * sum * scale * scale;
    const l2 = len * len;
    let worstRatio = 0;
    for (const it of row) {
      const area = it.value * scale;
      const r = Math.max((l2 * area) / s2, s2 / (l2 * area));
      if (r > worstRatio) worstRatio = r;
    }
    return worstRatio;
  };
  let cx = rect.x;
  let cy = rect.y;
  let cw = rect.w;
  let ch = rect.h;
  const layoutRow = () => {
    if (!row.length) return;
    const frac = rowSum * scale / (cw * ch);
    if (cw >= ch) {
      // 竖条（沿左边）
      const rw = cw * frac;
      let ry = cy;
      for (const it of row) {
        const rh = (it.value * scale) / rw;
        out.push({ name: it.name, value: it.value, x: cx, y: ry, w: rw, h: rh });
        ry += rh;
      }
      cx += rw;
      cw -= rw;
    } else {
      // 横条（沿上边）
      const rh = ch * frac;
      let rx = cx;
      for (const it of row) {
        const rwid = (it.value * scale) / rh;
        out.push({ name: it.name, value: it.value, x: rx, y: cy, w: rwid, h: rh });
        rx += rwid;
      }
      cy += rh;
      ch -= rh;
    }
    row = [];
    rowSum = 0;
  };
  for (const it of vals) {
    if (!row.length) {
      row = [it]; rowSum = it.value; continue;
    }
    const len = Math.min(cw, ch);
    const before = worst(rowSum, len);
    const after = worst(rowSum + it.value, len);
    if (after <= before) { row.push(it); rowSum += it.value; }
    else { layoutRow(); row = [it]; rowSum = it.value; }
  }
  layoutRow();
  return out;
}

// ── fsutil 输出解析（statfs 兜底）───────────────────────────────────────────
/**
 * `fsutil volume diskfree <drive>` 输出 → { free, total } | null。
 * 兼容中英文输出：取前两个括号里的字节数（免费/总量）。
 */
function parseFsutilOutput(text) {
  if (!text) return null;
  const nums = [];
  const re = /\(([\d,.]+)\s*(?:bytes|字节)\)/gi;
  let m;
  while ((m = re.exec(text)) !== null && nums.length < 4) {
    const n = Number(m[1].replace(/[,.]/g, ''));
    if (Number.isFinite(n)) nums.push(n);
  }
  // 中文输出顺序：总字节、可用字节、配额可用；英文：free、total、quota free
  if (nums.length >= 2) {
    if (/总字节|Total bytes/i.test(text) && /可用|Free/i.test(text)) {
      const totalLine = text.split(/\r?\n/).find((l) => /总字节|Total bytes/i.test(l));
      const freeLine = text.split(/\r?\n/).find((l) => /可用|Free/i.test(l));
      const pick = (line) => {
        if (!line) return NaN;
        const mm = /\(([\d,.]+)/.exec(line);
        return mm ? Number(mm[1].replace(/[,.]/g, '')) : NaN;
      };
      const total = pick(totalLine);
      const free = pick(freeLine);
      if (Number.isFinite(total) && Number.isFinite(free)) return { free, total };
    }
    return { free: nums[0], total: nums[1] };
  }
  return null;
}

// ── 格式化 ──────────────────────────────────────────────────────────────────
function fmtBytes(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '?';
  if (v < 0) return '-' + fmtBytes(-v);
  if (v < 1024) return `${Math.round(v)} B`;
  const units = ['KB', 'MB', 'GB', 'TB', 'PB'];
  let x = v;
  let i = -1;
  while (x >= 1024 && i < units.length - 1) { x /= 1024; i += 1; }
  return `${x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x.toFixed(2)} ${units[i]}`;
}

function fmtCount(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '?';
  if (v < 10000) return String(Math.round(v));
  if (v < 1e8) return `${(v / 1e4).toFixed(1)} 万`;
  return `${(v / 1e8).toFixed(2)} 亿`;
}

function fmtDelta(n) {
  const d = Number(n) || 0;
  if (d === 0) return '±0';
  return (d > 0 ? '+' : '-') + fmtBytes(Math.abs(d));
}

/** 快照键序号推进 + 保留裁剪：keys 为该根全部快照键（乱序） */
function nextSeq(keys, rid) {
  const pre = K.snapPrefix(rid);
  let max = 0;
  for (const k of keys || []) {
    if (!k.startsWith(pre)) continue;
    const n = Number(k.slice(pre.length));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max + 1;
}

/** 裁剪：按 seq 升序保留最新 keep 份，返回待删键数组 */
function pickExpiredSnaps(keys, rid, keep) {
  const pre = K.snapPrefix(rid);
  const list = (keys || [])
    .filter((k) => k.startsWith(pre))
    .map((k) => ({ k, seq: Number(k.slice(pre.length)) || 0 }))
    .sort((a, b) => a.seq - b.seq);
  return list.length <= keep ? [] : list.slice(0, list.length - keep).map((x) => x.k);
}

/** settings 归一化（面板/MCP 写入侧与服务读取侧共用一套边界） */
function normalizeSettings(raw) {
  const s = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== 'object') return s;
  s.autoSnapshot = raw.autoSnapshot !== false;
  s.snapshotHours = Math.min(24 * 30, Math.max(1, Number(raw.snapshotHours) || DEFAULT_SETTINGS.snapshotHours));
  s.keepSnapshots = Math.min(60, Math.max(3, Number(raw.keepSnapshots) || DEFAULT_SETTINGS.keepSnapshots));
  s.autoBudgetSec = Math.min(1800, Math.max(10, Number(raw.autoBudgetSec) || DEFAULT_SETTINGS.autoBudgetSec));
  s.deepBudgetMin = Math.min(120, Math.max(1, Number(raw.deepBudgetMin) || DEFAULT_SETTINGS.deepBudgetMin));
  const qd = Number(raw.quarantineDays);
  // 0 = 关闭自动清理（隔离区只进不出）；未设置才取默认
  s.quarantineDays = Number.isFinite(qd) ? Math.min(365, Math.max(0, Math.floor(qd))) : DEFAULT_SETTINGS.quarantineDays;
  for (const key of ['extraJunkDirs', 'excludeNames']) {
    if (Array.isArray(raw[key])) {
      s[key] = [...new Set(raw[key].map((x) => String(x).trim()).filter(Boolean))].slice(0, 50);
    }
  }
  return s;
}

/** Windows 旧版系统 junction 名单（遍历时跳过，防环/防重复计数） */
const LEGACY_JUNCTIONS = new Set([
  'application data', 'application shortcut', 'documents and settings', 'local settings',
  'my documents', 'nethood', 'printhood', 'recent', 'sendto', 'start menu', 'templates',
  'all users', 'default user', 'cookies', 'history',
]);

function isLegacyJunctionName(name) {
  return LEGACY_JUNCTIONS.has(String(name).toLowerCase());
}

module.exports = {
  VERSION, TRASH_DIR, MAX_WALK_DEPTH, SNAP_NODE_BUDGET, SNAP_CHILD_KEEP, JUNK_ITEM_CAP,
  K, DEFAULT_SETTINGS,
  md5, rootIdOf, normalizeRootPath, longPath,
  JUNK_RULES, JUNK_KIND_LABEL, classifyJunkDir, junkItemId, ITEM_ID_RE,
  safeRelPath, assertUnderRoot, trashPathFor,
  sortTree, countTreeNodes, pruneTree, treeTotal, growthDiff,
  squarify, parseFsutilOutput,
  fmtBytes, fmtCount, fmtDelta,
  nextSeq, pickExpiredSnaps, normalizeSettings,
  LEGACY_JUNCTIONS, isLegacyJunctionName,
};
