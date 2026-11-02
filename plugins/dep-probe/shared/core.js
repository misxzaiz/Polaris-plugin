'use strict';
/**
 * core.js —— 依赖体检台纯函数层（CJS 同构，禁止引入 Node 专属 API）
 *
 * 被 service/main.js(require)、mcp/server.js(require)、面板 src/model.ts(esbuild
 * 打包进 bundle)与 test/(node --test)四方共用，保证解析/归并/修复方案口径全端一致。
 *
 * 职责：
 *   1. 五种 lockfile 解析器（package-lock.json / pnpm-lock.yaml / Cargo.lock /
 *      requirements*.txt / go.mod）→ {name, version} 清单，坏行收集 warning 不中断
 *   2. OSV 请求构造（querybatch 分块）与响应归并（发现清单、severity 分级、fixed 版本）
 *   3. 忽略规则、最小修复方案（semver-lite 取 max fixed）、kv 投影截断
 *   4. 离线自检 fixture（selfTest，零网络验证全管道）
 *
 * OSV 生态名常量与 https://ossf.github.io/osv-schema/ 对齐：npm / crates.io / PyPI / Go。
 */

// ── 常量 ────────────────────────────────────────────────────────────────────

const OSV_BATCH_SIZE = 100;
const OSV_BASE_DEFAULT = 'https://api.osv.dev';

const SEV_ORDER = ['critical', 'high', 'medium', 'low', 'unknown'];
const SEV_RANK = { critical: 4, high: 3, medium: 2, low: 1, unknown: 0 };
const SEV_LABEL = { critical: '严重', high: '高', medium: '中', low: '低', unknown: '未分级' };

/** 目录名黑名单：依赖目录/构建产物不进（防巨树 + 防把 vendored 副本当权威） */
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'target', 'dist', 'build', 'out', '.next', '.nuxt',
  'venv', '.venv', 'env', '__pycache__', '.pnpm-store', '.cargo', 'vendor',
  '.gradle', '.mvn', 'coverage', '.tox', '.mypy_cache', '.pytest_cache',
]);

/** @param {string} fileName @returns {'npm-lock'|'pnpm-lock'|'cargo-lock'|'pip-reqs'|'go-mod'|null} */
function isLockfileName(fileName) {
  const n = String(fileName || '').toLowerCase();
  if (n === 'package-lock.json') return 'npm-lock';
  if (n === 'npm-shrinkwrap.json') return 'npm-lock';
  if (n === 'pnpm-lock.yaml') return 'pnpm-lock';
  if (n === 'cargo.lock') return 'cargo-lock';
  if (/^requirements.*\.txt$/.test(n)) return 'pip-reqs';
  if (n === 'go.mod') return 'go-mod';
  return null;
}

// ── 版本比较（semver-lite：选 max fixed 用；原始版本始终同时展示） ───────────

const PRE_RANK = { dev: -4, a: -3, alpha: -3, b: -2, beta: -2, rc: -1, pre: -1, '': 0 };

/**
 * 解析为可比较元组；无法解析返回 null。
 * 支持 npm/cargo/go 的 semver 主形态与 PyPI 常见形态（1.2.3 / 1.2.3rc1 / 1.2.3-beta.2）。
 */
function parseVer(v) {
  let s = String(v == null ? '' : v).trim().replace(/^v/i, '').split('+')[0];
  const dash = s.indexOf('-');
  let main = dash >= 0 ? s.slice(0, dash) : s;
  let pre = dash >= 0 ? s.slice(dash + 1) : '';
  if (main.startsWith('_')) main = ''; // PyPI post 段兜底
  const nums = main.split('.').map((x) => /^\d+$/.test(x) ? parseInt(x, 10) : 0);
  if (!/^\d+$/.test(main.split('.')[0] || '')) return null;
  while (nums.length < 3) nums.push(0);
  let preTok = [];
  if (pre) {
    pre = pre.replace(/^\.|^\d+[-.]?/, (m0) => (m0 === '.' ? '' : m0)); // 剥离 0.xxx / 1-xxx 式前缀噪声
    preTok = pre.split(/[._]/).map((t) => (/^\d+$/.test(t) ? { n: parseInt(t, 10) } : { a: PRE_RANK[t.toLowerCase()] != null ? PRE_RANK[t.toLowerCase()] : -3.5 }));
  }
  return { nums: nums.slice(0, 3), pre: preTok };
}

function cmpVerTuple(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a.nums[i] !== b.nums[i]) return a.nums[i] < b.nums[i] ? -1 : 1;
  }
  const ap = a.pre.length, bp = b.pre.length;
  if (ap === 0 && bp === 0) return 0;
  if (ap === 0) return 1; // release > 任何 pre
  if (bp === 0) return -1;
  const len = Math.max(ap, bp);
  for (let i = 0; i < len; i++) {
    const x = a.pre[i], y = b.pre[i];
    if (!x) return -1; // 短者小（1.0-beta < 1.0-beta.1）
    if (!y) return 1;
    const xv = x.n !== undefined ? x.n : x.a;
    const yv = y.n !== undefined ? y.n : y.a;
    if (xv !== yv) return xv < yv ? -1 : 1;
  }
  return 0;
}

/** @returns {number} a<b:-1 a>b:1 不可解析时按字符串比较 */
function cmpVersions(a, b) {
  const pa = parseVer(a), pb = parseVer(b);
  if (pa && pb) return cmpVerTuple(pa, pb);
  const sa = String(a || ''), sb = String(b || '');
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

function maxVersion(list) {
  const arr = (list || []).filter(Boolean);
  if (!arr.length) return null;
  return arr.reduce((m, x) => (cmpVersions(x, m) >= 0 ? x : m));
}

// ── lockfile 解析器 ──────────────────────────────────────────────────────────

function pushPkgs(map, warnings, name, version, file) {
  if (!name || !version) return;
  name = String(name).trim();
  version = String(version).trim();
  if (!name || !version) return;
  if (!/^[\w@./+._~-]+$/.test(name)) { warnings.push(`${file}: 可疑包名「${name}」跳过`); return; }
  // 注意：npm scope 包名（@scope/util）与 go 模块路径（golang.org/x/crypto）合法含 /
  // ——这里的形状校验只挡空名与奇怪字符，路径泄漏由各解析器的键抽取逻辑（lastIndexOf）保证。
  if (!/^[\w.+\-~^]+$/.test(version)) return; // file:/link:/workspace: 引用非注册表版本，跳过
  const key = `${name}@${version}`;
  if (!map.has(key)) map.set(key, { name, version });
}

/** npm package-lock v1（dependencies 树）与 v2/v3（packages 平铺） */
function parseNpmLock(content, file, warnings) {
  let j;
  try { j = JSON.parse(content); } catch (e) { throw new Error(`${file}: JSON 解析失败（${e.message}）`); }
  const map = new Map();
  if (j && typeof j.packages === 'object' && j.packages) {
    for (const [key, info] of Object.entries(j.packages)) {
      if (!key || !info || typeof info.version !== 'string') continue; // 根与 link: 条目
      const idx = key.lastIndexOf('node_modules/');
      if (idx === -1) continue; // workspace 成员路径，无注册表版本语义
      pushPkgs(map, warnings, key.slice(idx + 'node_modules/'.length), info.version, file);
    }
  } else if (j && typeof j.dependencies === 'object' && j.dependencies) {
    const walk = (deps, depth) => {
      if (depth > 24 || !deps || typeof deps !== 'object') return;
      for (const [name, info] of Object.entries(deps)) {
        if (!info || typeof info !== 'object') continue;
        if (typeof info.version === 'string') pushPkgs(map, warnings, name, info.version, file);
        if (info.dependencies) walk(info.dependencies, depth + 1);
      }
    };
    walk(j.dependencies, 0);
  } else {
    warnings.push(`${file}: 未能识别 package-lock 结构（缺 packages/dependencies）`);
  }
  return [...map.values()];
}

/** pnpm-lock.yaml（v5/v6/v9 行级解析：/name@ver(peer): 或 'name/ver': ） */
function parsePnpmLock(content, file, warnings) {
  const map = new Map();
  const lines = String(content).split(/\r?\n/);
  let section = null;
  let itemRe = /^(\s*)(.+?):\s*$/;
  for (const raw of lines) {
    const m = itemRe.exec(raw);
    if (!m) continue;
    const indent = m[1].length;
    const key = m[2].replace(/^['"]|['"]$/g, '');
    if (indent === 0) { section = key; continue; }
    if (section !== 'packages' && section !== 'snapshots') continue;
    if (!key.includes('@') && !key.includes('/')) continue;
    const clean = key.replace(/\([^)]*\)/g, ''); // 剥 (peer@x.y.z) 后缀（可多个）
    let name = null, version = null;
    const at = clean.lastIndexOf('@');
    if (at > 0) { name = clean.slice(0, at); version = clean.slice(at + 1); }
    else { const sl = clean.lastIndexOf('/'); if (sl > 0) { name = clean.slice(0, sl); version = clean.slice(sl + 1); } }
    if (!name || !version) { warnings.push(`${file}: 未能解析条目「${key}」`); continue; }
    pushPkgs(map, warnings, name.replace(/^\/+/, ''), version, file);
  }
  if (!map.size) warnings.push(`${file}: 未发现任何包条目（packages/snapshots 段为空？）`);
  return [...map.values()];
}

/** Cargo.lock（[[package]] 块，workspace 去重靠 name@version 键；块可能在任意字段后截断） */
function parseCargoLock(content, file, warnings) {
  const map = new Map();
  const lines = String(content).split(/\r?\n/);
  let cur = null;
  const flush = () => { if (cur && cur.name && cur.version) pushPkgs(map, warnings, cur.name, cur.version, file); cur = null; };
  for (const raw of lines) {
    const line = raw.trim();
    if (line === '[[package]]') { flush(); cur = {}; continue; }
    if (/^\[/.test(line)) { flush(); continue; } // [patch]/[metadata] 等其他段
    if (!cur) continue;
    let m = /^name\s*=\s*"([^"]+)"\s*$/.exec(line);
    if (m) { cur.name = m[1]; continue; }
    m = /^version\s*=\s*"([^"]+)"\s*$/.exec(line);
    if (m) { cur.version = m[1]; continue; }
  }
  flush(); // 文件末尾悬挂的块
  if (!map.size) warnings.push(`${file}: 未发现任何 [[package]] 条目`);
  return [...map.values()];
}

/** PEP 503 规范名（lower + 连续 -_. 归一为 -） */
function normalizePypiName(name) {
  return String(name || '').trim().toLowerCase().replace(/[-_.]+/g, '-');
}

/** requirements.txt（仅锁钉 == / === 的行；范围/URL 依赖记 warning 跳过） */
function parsePipReqs(content, file, warnings) {
  const map = new Map();
  const lines = String(content).split(/\r?\n/);
  let skippedRange = 0;
  for (let raw of lines) {
    const line = raw.replace(/\s+#.*$/, '').trim(); // 行尾注释
    if (!line || line.startsWith('#') || line.startsWith('-')) continue;
    const semi = line.indexOf(';');
    const req = (semi >= 0 ? line.slice(0, semi) : line).trim();
    let m = /^([A-Za-z0-9][A-Za-z0-9._-]*)\s*(?:\[[^\]]*\])?\s*(===|==)\s*(.+?)\s*$/.exec(req);
    if (m) {
      pushPkgs(map, warnings, normalizePypiName(m[1]), m[3].replace(/^['"]|['"]$/g, ''), file); // m[3]=版本（m[2] 是 ===/== 运算符）
      continue;
    }
    m = /^([A-Za-z0-9][A-Za-z0-9._-]*)\s*(?:\[[^\]]*\])?\s*@/.exec(req);
    if (m) { pushPkgs(map, warnings, normalizePypiName(m[1]), '', file); continue; } // URL 依赖：名字入清单，version 空 → 后续剔除
    if (/^[A-Za-z0-9][A-Za-z0-9._-]*(\[[^\]]*\])?\s*(===|==|~=|!=|>=|<=|>|<)/.test(req)) skippedRange += 1;
  }
  if (skippedRange) warnings.push(`${file}: ${skippedRange} 条范围依赖（非 == 精确钉版）无法比对漏洞，已跳过`);
  return [...map.values()].filter((p) => p.version); // URL 依赖无版本，剔除
}

/** go.mod（require 单行与块；indirect 注释剥离；v 前缀与 +incompatible 剥离） */
function stripGoVersion(v) {
  return String(v || '').trim().replace(/^v/, '').split('+')[0];
}
function parseGoMod(content, file, warnings) {
  const map = new Map();
  const lines = String(content).split(/\r?\n/);
  let inRequire = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('//')) continue;
    if (inRequire) {
      if (line === ')') { inRequire = false; continue; }
      const m = /^([\w./~\-]+)\s+(v[\w.+\-]+)/.exec(line);
      if (m) pushPkgs(map, warnings, m[1], stripGoVersion(m[2]), file);
      continue;
    }
    if (/^require\s*\(/.test(line)) { inRequire = true; continue; }
    const m = /^require\s+([\w./~\-]+)\s+(v[\w.+\-]+)/.exec(line);
    if (m) pushPkgs(map, warnings, m[1], stripGoVersion(m[2]), file);
  }
  if (!map.size) warnings.push(`${file}: 未发现 require 条目`);
  return [...map.values()];
}

/**
 * 统一入口。
 * @returns {{ecosystem: string, packages: Array<{name:string, version:string}>, warnings: string[]}}
 * @throws 内容完全不可解析（如坏 JSON）时抛错，调用方按文件粒度容错。
 */
function parseLockfile(kind, fileName, content) {
  const warnings = [];
  let ecosystem, packages;
  switch (kind) {
    case 'npm-lock': ecosystem = 'npm'; packages = parseNpmLock(content, fileName, warnings); break;
    case 'pnpm-lock': ecosystem = 'npm'; packages = parsePnpmLock(content, fileName, warnings); break;
    case 'cargo-lock': ecosystem = 'crates.io'; packages = parseCargoLock(content, fileName, warnings); break;
    case 'pip-reqs': ecosystem = 'PyPI'; packages = parsePipReqs(content, fileName, warnings); break;
    case 'go-mod': ecosystem = 'Go'; packages = parseGoMod(content, fileName, warnings); break;
    default: throw new Error(`未知 lockfile 类型：${kind}`);
  }
  return { ecosystem, packages, warnings };
}

// ── OSV 请求构造与响应归并 ───────────────────────────────────────────────────

/** @param pkgs [{name, version, ecosystem}] @returns Array<Array<{package:{ecosystem,name}, version}>> */
function buildQueryBatches(pkgs, size) {
  const s = Math.max(1, Math.min(500, size || OSV_BATCH_SIZE));
  const batches = [];
  for (let i = 0; i < pkgs.length; i += s) {
    batches.push(pkgs.slice(i, i + s).map((p) => ({
      package: { ecosystem: p.ecosystem, name: p.name },
      version: p.version,
    })));
  }
  return batches;
}

function severityOf(vuln) {
  if (!vuln) return 'unknown';
  const dbs = vuln.database_specific && vuln.database_specific.severity;
  if (typeof dbs === 'string') {
    const s = dbs.trim().toUpperCase();
    if (s === 'CRITICAL') return 'critical';
    if (s === 'HIGH' || s === 'IMPORTANT') return 'high';
    if (s === 'MODERATE' || s === 'MEDIUM') return 'medium';
    if (s === 'LOW' || s === 'MINOR') return 'low';
  }
  if (Array.isArray(vuln.severity)) {
    for (const sv of vuln.severity) {
      if (sv && typeof sv.score === 'number') return sevBucket(sv.score);
      if (sv && typeof sv.score === 'string' && /^\d+(\.\d+)?$/.test(sv.score.trim())) return sevBucket(parseFloat(sv.score));
    }
  }
  return 'unknown';
}
function sevBucket(score) {
  if (!Number.isFinite(score) || score <= 0) return 'unknown';
  if (score >= 9) return 'critical';
  if (score >= 7) return 'high';
  if (score >= 4) return 'medium';
  return 'low';
}

/** 汇聚某漏洞所有 affected.ranges[].events[].fixed 版本（跨生态段照单全收，修复方案里取 max） */
function fixedVersionsOf(vuln) {
  const out = new Set();
  const affs = (vuln && Array.isArray(vuln.affected)) ? vuln.affected : [];
  for (const aff of affs) {
    const ranges = Array.isArray(aff && aff.ranges) ? aff.ranges : [];
    for (const r of ranges) {
      const events = Array.isArray(r && r.events) ? r.events : [];
      for (const ev of events) {
        if (ev && typeof ev.fixed === 'string' && ev.fixed) out.add(ev.fixed);
      }
    }
  }
  return [...out];
}

function vulnUrlOf(vuln, id) {
  if (vuln && vuln.references && Array.isArray(vuln.references)) {
    const web = vuln.references.find((r) => r && r.type === 'WEB' && r.url);
    if (web) return web.url;
  }
  const s = String(id || '');
  if (s.startsWith('GHSA-')) return `https://github.com/advisories/${s}`;
  if (s.startsWith('CVE-')) return `https://nvd.nist.gov/vuln/detail/${s}`;
  if (s.startsWith('RUSTSEC-')) return `https://rustsec.org/advisories/${s}`;
  return vuln && typeof vuln.id === 'string' ? `https://osv.dev/vulnerability/${vuln.id}` : '';
}

/**
 * 归并：packages[i] ↔ batchResults[i].vulns[ref] ↔ detailMap[ref.id]。
 * @returns findings [{pkg, version, ecosystem, file, repoDir, vulnId, severity, summary, aliases, fixed, url, detailOk}]
 */
function collectFindings(pkgs, batchResults, detailMap) {
  const findings = [];
  for (let i = 0; i < pkgs.length; i++) {
    const res = batchResults[i];
    const vulns = res && Array.isArray(res.vulns) ? res.vulns : [];
    const p = pkgs[i];
    for (const ref of vulns) {
      const id = ref && (ref.id || (ref.vulns && ref.vulns[0] && ref.vulns[0].id));
      if (!id) continue;
      const detail = detailMap ? detailMap.get(String(id)) : null;
      findings.push({
        pkg: p.name, version: p.version, ecosystem: p.ecosystem, file: p.file || '', repoDir: p.repoDir || '',
        vulnId: String(id),
        severity: detail ? severityOf(detail) : 'unknown',
        summary: detail ? String(detail.summary || detail.details || '').split('\n')[0].slice(0, 300) : '',
        aliases: detail && Array.isArray(detail.aliases) ? detail.aliases.slice(0, 6) : [],
        fixed: detail ? fixedVersionsOf(detail) : [],
        url: vulnUrlOf(detail, id),
        detailOk: !!detail,
      });
    }
  }
  findings.sort((a, b) => (SEV_RANK[b.severity] - SEV_RANK[a.severity])
    || a.pkg.localeCompare(b.pkg) || String(a.vulnId).localeCompare(String(b.vulnId)));
  return findings;
}

// ── 忽略规则与修复方案 ───────────────────────────────────────────────────────

function matchIgnore(ig, f) {
  if (!ig || typeof ig !== 'object') return false;
  if (ig.pkg && ig.pkg !== f.pkg) return false;
  if (ig.ecosystem && ig.ecosystem !== f.ecosystem) return false;
  if (ig.vulnId && ig.vulnId !== f.vulnId) return false;
  return !!(ig.pkg || ig.vulnId); // 必须至少锚定 pkg 或 vulnId，防止空规则吞掉一切
}

/** @returns {findings, ignoredCount} */
function applyIgnores(findings, ignores) {
  const list = Array.isArray(ignores) ? ignores : [];
  const kept = findings.filter((f) => !list.some((ig) => matchIgnore(ig, f)));
  return { findings: kept, ignoredCount: findings.length - kept.length };
}

/** 最小修复方案：按 (ecosystem,pkg) 聚合，取全部 fixed 的 max 版本 */
function buildFixPlan(findings) {
  const groups = new Map();
  for (const f of findings) {
    const key = `${f.ecosystem}::${f.pkg}`;
    if (!groups.has(key)) groups.set(key, { ecosystem: f.ecosystem, pkg: f.pkg, from: f.version, fixed: new Set(), vulnIds: [], sevRank: 0 });
    const g = groups.get(key);
    for (const v of f.fixed || []) g.fixed.add(v);
    g.vulnIds.push(f.vulnId);
    g.sevRank = Math.max(g.sevRank, SEV_RANK[f.severity] || 0);
    if (cmpVersions(f.version, g.from) > 0) g.from = f.version;
  }
  return [...groups.values()]
    .map((g) => ({ ecosystem: g.ecosystem, pkg: g.pkg, from: g.from, to: maxVersion([...g.fixed]), fixedAll: [...g.fixed], vulnIds: [...new Set(g.vulnIds)], severity: SEV_ORDER.find((s) => SEV_RANK[s] === g.sevRank) || 'unknown' }))
    .sort((a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity] || a.pkg.localeCompare(b.pkg));
}

function summarizeCounts(findings) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 };
  for (const f of findings) counts[f.severity] = (counts[f.severity] || 0) + 1;
  return counts;
}

// ── kv 投影截断 ──────────────────────────────────────────────────────────────

function truncateText(s, max) {
  const str = String(s == null ? '' : s);
  if (str.length <= max) return { text: str, truncated: false };
  return { text: `${str.slice(0, Math.max(0, max - 1))}…`, truncated: true };
}

function projectFinding(f, textCap) {
  const cap = textCap || 200;
  return {
    ...f,
    summary: truncateText(f.summary, cap).text,
    aliases: (f.aliases || []).slice(0, 4),
    fixed: (f.fixed || []).slice(0, 8),
  };
}

// ── 离线自检（fixture 全管道，零网络）────────────────────────────────────────

const SELFTEST_NPM_LOCK = JSON.stringify({
  name: 'root', lockfileVersion: 3,
  packages: {
    '': { name: 'root', version: '1.0.0' },
    'node_modules/lodash': { version: '4.17.15' },
    'node_modules/react': { version: '18.2.0' },
    'node_modules/foo/node_modules/left-pad': { version: '1.1.0' },
    'packages/app': { name: 'app', version: '0.0.0', link: true },
  },
});
const SELFTEST_PNPM_LOCK = [
  'lockfileVersion: \'9.0\'', '', 'importers:', '', '  .:', '    dependencies:', '      lodash:', '      specifier: ^4.0.0', '',
  'packages:', '', '  /lodash@4.17.15:', '    resolution: {integrity: sha512-xxx}', '', '  /@scope/util@1.2.0(react@18.2.0):', '    resolution: {integrity: sha512-yyy}', '',
].join('\n');
const SELFTEST_CARGO_LOCK = ['version = 3', '', '[[package]]', 'name = "libc"', 'version = "0.2.100"', 'source = "registry+https://github.com/rust-lang/crates.io-index"', '', '[[package]]', 'name = "polaris-app"', 'version = "1.0.0"'].join('\n');
const SELFTEST_REQS = ['requests==2.28.0', 'flask==2.0.1  # web', 'numpy>=1.20', 'pluggy==1.0.0; python_version < "3.10"', '-r dev.txt'].join('\n');
const SELFTEST_GOMOD = ['module example.com/m', '', 'go 1.21', '', 'require (', '\tgolang.org/x/crypto v0.14.0', '\tgithub.com/pkg/errors v0.9.1 // indirect', ')'].join('\n');

const FAKE_VULN = {
  id: 'GHSA-xxxx-test', summary: 'Prototype pollution in lodash', aliases: ['CVE-2020-8203'],
  database_specific: { severity: 'HIGH' },
  affected: [{ ranges: [{ type: 'SEMVER', events: [{ introduced: '0' }, { fixed: '4.17.19' }] }] }],
  references: [{ type: 'WEB', url: 'https://example.com/advisory' }],
};

/**
 * 全管道离线自检：解析→造 OSV 响应→归并→忽略→修复方案。
 * @returns {{ok: boolean, checks: string[]}}
 */
function selfTest() {
  const checks = [];
  let ok = true;
  const expect = (cond, msg) => { checks.push(`${cond ? 'PASS' : 'FAIL'} ${msg}`); if (!cond) ok = false; };

  const npm = parseLockfile('npm-lock', 'package-lock.json', SELFTEST_NPM_LOCK);
  expect(npm.ecosystem === 'npm' && npm.packages.length === 3, `npm-lock 解析 3 包（嵌套 node_modules 归一）：${JSON.stringify(npm.packages)}`);
  const pnpm = parseLockfile('pnpm-lock', 'pnpm-lock.yaml', SELFTEST_PNPM_LOCK);
  expect(pnpm.packages.length === 2, `pnpm v9 解析 2 包（peer 后缀剥离）：${JSON.stringify(pnpm.packages)}`);
  const cargo = parseLockfile('cargo-lock', 'Cargo.lock', SELFTEST_CARGO_LOCK);
  expect(cargo.ecosystem === 'crates.io' && cargo.packages.length === 2, `Cargo.lock 解析 2 包：${JSON.stringify(cargo.packages)}`);
  const reqs = parseLockfile('pip-reqs', 'requirements.txt', SELFTEST_REQS);
  expect(reqs.packages.length === 3 && reqs.packages.some((p) => p.name === 'pluggy'), `requirements 解析 3 包（范围行/env marker/注释容错）：${JSON.stringify(reqs.packages)}`);
  const gomod = parseLockfile('go-mod', 'go.mod', SELFTEST_GOMOD);
  expect(gomod.ecosystem === 'Go' && gomod.packages.length === 2 && gomod.packages.every((p) => !p.version.startsWith('v')), `go.mod 解析 2 包（v 前缀剥离）：${JSON.stringify(gomod.packages)}`);

  const pkgs = [{ name: 'lodash', version: '4.17.15', ecosystem: 'npm', file: 'package-lock.json', repoDir: 'repoA' }];
  const batches = buildQueryBatches(pkgs, 100);
  expect(batches.length === 1 && batches[0][0].package.name === 'lodash', 'querybatch 请求构造');
  const findings = collectFindings(pkgs, [{ vulns: [{ id: FAKE_VULN.id }] }], new Map([[FAKE_VULN.id, FAKE_VULN]]));
  expect(findings.length === 1 && findings[0].severity === 'high' && findings[0].fixed[0] === '4.17.19', `归并出 HIGH 发现且 fixed 正确：${JSON.stringify(findings[0] && findings[0].severity)}`);
  const plan = buildFixPlan(findings);
  expect(plan.length === 1 && plan[0].to === '4.17.19', `修复方案给出版本：${JSON.stringify(plan[0] && plan[0].to)}`);
  const ig = applyIgnores(findings, [{ pkg: 'lodash', vulnId: FAKE_VULN.id, reason: 'test' }]);
  expect(ig.findings.length === 0 && ig.ignoredCount === 1, '忽略规则生效');
  expect(cmpVersions('4.17.19', '4.17.15') > 0 && cmpVersions('1.0.0', '1.0.0-beta.2') > 0 && cmpVersions('0.2.100', '0.2.99') > 0, '版本比较三例');
  return { ok, checks };
}

module.exports = {
  OSV_BATCH_SIZE, OSV_BASE_DEFAULT, SEV_ORDER, SEV_RANK, SEV_LABEL, SKIP_DIRS,
  isLockfileName, parseLockfile,
  parseNpmLock, parsePnpmLock, parseCargoLock, parsePipReqs, parseGoMod,
  normalizePypiName, stripGoVersion,
  cmpVersions, parseVer, maxVersion,
  buildQueryBatches, severityOf, sevBucket, fixedVersionsOf, vulnUrlOf, collectFindings,
  matchIgnore, applyIgnores, buildFixPlan, summarizeCounts,
  truncateText, projectFinding,
  selfTest, FAKE_VULN,
};
