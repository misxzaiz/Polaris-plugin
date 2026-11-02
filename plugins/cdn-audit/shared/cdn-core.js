'use strict';
/**
 * cdn-core.js —— CDN 体检台纯逻辑核心（零依赖，双端共用：service / 测试 / 面板类型对齐）
 *
 * 职责：URL → CDN 识别与归一（npm 系 / cdnjs 系 / gh 系）、镜像 URL 互转、
 * SRI 编解码、HTML 外链资源提取、verdict 与 findings 数学、评分。
 * 网络与 IO 一概不碰（那是 service 的单权威），保证离线可测。
 *
 * 路径族实测（2026-11-03，详见 docs/cdn-audit-selection.md §五）：
 *   npm 系（同一 tarball，路径可直接互转）：
 *     https://cdn.jsdelivr.net/npm/<pkg>@<ver>/<file>   （gcore/testingcf/fastly 同构）
 *     https://unpkg.com/<pkg>@<ver>/<file>
 *     https://registry.npmmirror.com/<pkg>/<ver>/files/<file>
 *   cdnjs 系（各自仓库，文件名常去 dist/ 前缀）：
 *     https://cdnjs.cloudflare.com/ajax/libs/<lib>/<ver>/<file>
 *     https://cdn.bootcdn.net/ajax/libs/<lib>/<ver>/<file>
 *     https://cdn.staticfile.org/[ajax/libs/]<lib>/<ver>/<file>
 *     https://libs.baomitu.com/<lib>/<ver>/<file>
 */

const VERSION = '0.1.0';

/* ── 镜像注册表 ─────────────────────────────────────────────────────────── */

const NPM_FAMILY_MIRRORS = [
  { id: 'jsdelivr', label: 'jsDelivr 主域', host: 'cdn.jsdelivr.net', template: 'https://cdn.jsdelivr.net/npm/{pkg}@{ver}/{file}' },
  { id: 'jsdelivr-gcore', label: 'jsDelivr GCore 分流', host: 'gcore.jsdelivr.net', template: 'https://gcore.jsdelivr.net/npm/{pkg}@{ver}/{file}' },
  { id: 'jsdelivr-testingcf', label: 'jsDelivr testingcf 分流', host: 'testingcf.jsdelivr.net', template: 'https://testingcf.jsdelivr.net/npm/{pkg}@{ver}/{file}' },
  { id: 'jsdelivr-fastly', label: 'jsDelivr Fastly 分流', host: 'fastly.jsdelivr.net', template: 'https://fastly.jsdelivr.net/npm/{pkg}@{ver}/{file}' },
  { id: 'unpkg', label: 'unpkg', host: 'unpkg.com', template: 'https://unpkg.com/{pkg}@{ver}/{file}' },
  { id: 'npmmirror', label: 'npmmirror（阿里）', host: 'registry.npmmirror.com', template: 'https://registry.npmmirror.com/{pkg}/{ver}/files/{file}' },
];

const CDNJSLIKE_MIRRORS = [
  { id: 'cdnjs', label: 'cdnjs (Cloudflare)', host: 'cdnjs.cloudflare.com', template: 'https://cdnjs.cloudflare.com/ajax/libs/{lib}/{ver}/{file}', prefix: 'ajax/libs/' },
  { id: 'bootcdn', label: 'BootCDN', host: 'cdn.bootcdn.net', template: 'https://cdn.bootcdn.net/ajax/libs/{lib}/{ver}/{file}', prefix: 'ajax/libs/' },
  { id: 'staticfile', label: 'Staticfile（七牛）', host: 'cdn.staticfile.org', template: 'https://cdn.staticfile.org/ajax/libs/{lib}/{ver}/{file}', prefix: 'ajax/libs/' },
  { id: 'baomitu', label: 'Baomitu（360）', host: 'libs.baomitu.com', template: 'https://libs.baomitu.com/{lib}/{ver}/{file}', prefix: '' },
];

const ALL_MIRROR_IDS = [...NPM_FAMILY_MIRRORS, ...CDNJSLIKE_MIRRORS].map((m) => m.id);

/* ── URL 归一 ───────────────────────────────────────────────────────────── */

/** 输入宽容化：去空白/包裹引号，无协议补 https://。返回 {ok, url} */
function normalizeUrlInput(raw) {
  let s = String(raw == null ? '' : raw).trim().replace(/^["'<]+|["'>]+$/g, '');
  if (!s) return { ok: false, error: 'URL 为空' };
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) {
    if (/^\/\//.test(s)) s = 'https:' + s;
    else if (/^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(s)) s = 'https://' + s;
    else return { ok: false, error: `不像一个 URL：${s.slice(0, 80)}` };
  }
  let u;
  try { u = new URL(s); } catch (_) { return { ok: false, error: `URL 无法解析：${s.slice(0, 80)}` }; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { ok: false, error: `仅支持 http/https，收到 ${u.protocol}` };
  }
  return { ok: true, url: u };
}

/* ── CDN 识别 ───────────────────────────────────────────────────────────── */

/**
 * 识别一个资源 URL 属于哪个 CDN / 包 / 版本 / 文件。
 * 返回 { family:'npm'|'cdnjs'|'gh'|'unknown', cdnId, cdnLabel, pkg, ver, file, cdnjsLib? }
 * file 恒为包内路径（无查询串）；unknown 时只给 host。
 */
function classifyResourceUrl(urlStr) {
  const n = normalizeUrlInput(urlStr);
  if (!n.ok) return { family: 'unknown', cdnId: '', cdnLabel: '', parseError: n.error };
  const u = n.url;
  const host = u.hostname.toLowerCase();
  const pathname = decodeURIComponent(u.pathname.replace(/;[a-z]+=?/i, '')); // 去 jsDelivr 的 ;minify 等修饰
  // npm 系：jsDelivr 家（含 gh/ 形态单独归 gh）
  const jsd = NPM_FAMILY_MIRRORS.find((m) => m.host === host && m.id.startsWith('jsdelivr'));
  if (jsd) {
    const gh = /^\/gh\/([^/]+)\/([^/@]+)@([^/]+)\/(.+)$/.exec(pathname);
    if (gh) return { family: 'gh', cdnId: jsd.id, cdnLabel: jsd.label, ghUser: gh[1], ghRepo: gh[2], ver: gh[3], file: gh[4], host };
    const npm = parseNpmPath(pathname.replace(/^\/npm\//, '/'));
    if (npm) return { family: 'npm', cdnId: jsd.id, cdnLabel: jsd.label, ...npm, host };
    return { family: 'unknown', cdnId: jsd.id, cdnLabel: jsd.label, host };
  }
  if (host === 'unpkg.com') {
    const npm = parseNpmPath(pathname);
    if (npm) return { family: 'npm', cdnId: 'unpkg', cdnLabel: 'unpkg', ...npm, host };
    return { family: 'unknown', cdnId: 'unpkg', cdnLabel: 'unpkg', host };
  }
  if (host === 'registry.npmmirror.com') {
    const npm = parseNpmmirrorPath(pathname);
    if (npm) return { family: 'npm', cdnId: 'npmmirror', cdnLabel: 'npmmirror（阿里）', ...npm, host };
    return { family: 'unknown', cdnId: 'npmmirror', cdnLabel: 'npmmirror（阿里）', host };
  }
  // cdnjs 系
  const cm = CDNJSLIKE_MIRRORS.find((m) => m.host === host);
  if (cm) {
    const cdnjs = parseCdnjsLikePath(pathname, cm.prefix);
    if (cdnjs) return { family: 'cdnjs', cdnId: cm.id, cdnLabel: cm.label, ...cdnjs, host };
    return { family: 'unknown', cdnId: cm.id, cdnLabel: cm.label, host };
  }
  return { family: 'unknown', cdnId: '', cdnLabel: '', host };
}

/** '/pkg@ver/file…' 或 '/@scope/pkg@ver/file…' → {pkg, ver, file}；无版本→ ver:null */
function parseNpmPath(pathname) {
  const p = pathname.replace(/^\/+/, '');
  if (!p) return null;
  // 去尾查询已由 URL 处理；可能还有 # 由 URL 处理
  let rest = p;
  let pkg = '';
  if (rest.startsWith('@')) {
    const m = /^(@[^/]+)\/([^/@]+)(?:@([^/]*))?(?:\/(.*))?$/.exec(rest);
    if (!m) return null;
    pkg = `${m[1]}/${m[2]}`;
    const ver = m[3] || null;
    const file = m[4] || '';
    return { pkg, ver, file };
  }
  const m = /^([^/@]+)(?:@([^/]*))?(?:\/(.*))?$/.exec(rest);
  if (!m) return null;
  pkg = m[1];
  return { pkg, ver: m[2] || null, file: m[3] || '' };
}

/** '/<pkg>/<ver>/files/<file>'（含 @scope 两段）→ {pkg, ver, file} */
function parseNpmmirrorPath(pathname) {
  const p = pathname.replace(/^\/+/, '');
  const parts = p.split('/');
  let pkg, ver, tail;
  if (parts[0] && parts[0].startsWith('@')) {
    if (parts.length < 4) return null;
    pkg = `${parts[0]}/${parts[1]}`; ver = parts[2]; tail = parts.slice(3);
  } else {
    if (parts.length < 3) return null;
    pkg = parts[0]; ver = parts[1]; tail = parts.slice(2);
  }
  if (!ver) return null;
  if (tail[0] === 'files') tail = tail.slice(1);
  const file = tail.join('/');
  if (!file) return null;
  return { pkg, ver, file };
}

/** '/[ajax/libs/]<lib>/<ver>/<file>' → {pkg, ver, file}（pkg=lib，cdnjs 语义） */
function parseCdnjsLikePath(pathname, prefix) {
  let p = pathname.replace(/^\/+/, '');
  if (prefix) {
    if (p.startsWith(prefix)) p = p.slice(prefix.length);
    else if (prefix === 'ajax/libs/' && p.includes('/')) {
      // staticfile 等存在无前缀形态：/<lib>/<ver>/<file>，同样接受
    } else return null;
  }
  const m = /^([^/]+)\/([^/]+)\/(.+)$/.exec(p);
  if (!m) return null;
  return { pkg: m[1], ver: m[2], file: m[3] };
}

/* ── 镜像 URL 互转 ──────────────────────────────────────────────────────── */

/** npm 系同文件的全部镜像 URL（含来源本身）。ref = classifyResourceUrl 结果 */
function npmMirrorUrls(ref) {
  if (ref.family !== 'npm' || !ref.pkg || !ref.ver || !ref.file) return [];
  return NPM_FAMILY_MIRRORS.map((m) => ({
    cdnId: m.id, label: m.label,
    url: m.template.replace('{pkg}', ref.pkg).replace('{ver}', ref.ver).replace('{file}', ref.file),
  }));
}

/**
 * cdnjs 系同文件镜像 URL。cdnjsFile 由调用方用 cdnjs sri 表核对后传入
 * （npm 的 dist/xxx.min.js 在 cdnjs 常为根下 xxx.min.js；映射只做 basename best-effort）。
 */
function cdnjsMirrorUrls(lib, ver, cdnjsFile) {
  return CDNJSLIKE_MIRRORS.map((m) => ({
    cdnId: m.id, label: m.label,
    url: m.template.replace('{lib}', encodeURIComponent(lib)).replace('{ver}', encodeURIComponent(ver)).replace('{file}', cdnjsFile),
  }));
}

/* ── SRI ────────────────────────────────────────────────────────────────── */

/** 解析 integrity 属性：'sha384-abc' → {alg:'sha384', digest:'abc'}；非法 → null */
function parseSri(value) {
  const s = String(value || '').trim();
  const m = /^(sha256|sha384|sha512)-([A-Za-z0-9+/=]+)$/.exec(s);
  if (!m) return null;
  return { alg: m[1], digest: m[2] };
}

function sriTag(alg, b64digest) {
  return `${alg}-${b64digest}`;
}

/** 由 SRI 属性与实际内容摘要判断：'match'|'mismatch'|'unknown-alg' */
function compareSri(sriAttr, digests) {
  const p = parseSri(sriAttr);
  if (!p) return 'invalid';
  const d = digests[p.alg];
  if (!d) return 'unknown-alg';
  return d === p.digest ? 'match' : 'mismatch';
}

/* ── HTML 外链提取 ──────────────────────────────────────────────────────── */

const ATTR_RE = /\b(src|href|integrity|crossorigin|rel|as)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;

function extractAttrs(tagText) {
  const out = {};
  let m;
  ATTR_RE.lastIndex = 0;
  while ((m = ATTR_RE.exec(tagText))) {
    const key = m[1].toLowerCase();
    const val = m[2] != null ? m[2] : m[3] != null ? m[3] : m[4] || '';
    if (!(key in out)) out[key] = val.trim();
  }
  return out;
}

/**
 * 从 HTML 提取外链资源（script[src] + link[rel≈stylesheet|preload|modulepreload]）。
 * baseUrl 用于同源判定（可空）。返回
 * { resources:[{tag, url, integrity, crossorigin}], skipped:{relative,dataUri,other,sameOrigin}, total }
 */
function extractExternalResources(html, baseUrl) {
  const resources = [];
  const skipped = { relative: 0, dataUri: 0, sameOrigin: 0, other: 0 };
  let base = null;
  if (baseUrl) { try { base = new URL(baseUrl); } catch (_) { base = null; } }
  const seen = new Set();
  const push = (tag, attrs) => {
    const raw = attrs.src || attrs.href || '';
    if (!raw) return;
    const url = resolveResourceUrl(raw, base);
    if (url.kind === 'data') { skipped.dataUri++; return; }
    if (url.kind === 'same-origin') { skipped.sameOrigin++; return; }
    if (url.kind === 'relative') { skipped.relative++; return; }
    if (url.kind !== 'absolute') { skipped.other++; return; }
    const key = url.value;
    if (seen.has(key)) return;
    seen.add(key);
    resources.push({ tag, url: url.value, integrity: attrs.integrity || '', crossorigin: attrs.crossorigin || '' });
  };
  const scriptOpen = /<script\b([^>]*)>/gi;
  let m;
  while ((m = scriptOpen.exec(html))) {
    const attrs = extractAttrs(m[1]);
    if (attrs.src) push('script', attrs);
  }
  const linkOpen = /<link\b([^>]*)>/gi;
  while ((m = linkOpen.exec(html))) {
    const attrs = extractAttrs(m[1]);
    const rel = String(attrs.rel || '').toLowerCase();
    const as = String(attrs.as || '').toLowerCase();
    const interesting = rel === 'stylesheet' || rel === 'preload' || rel === 'modulepreload' || rel === 'prefetch' || rel === 'preplugin'
      || (rel === 'preload' && (as === 'script' || as === 'style'));
    if (attrs.href && interesting) push('link', attrs);
  }
  return { resources, skipped, total: resources.length };
}

function resolveResourceUrl(raw, base) {
  const s = String(raw || '').trim();
  if (!s) return { kind: 'other' };
  if (/^(data|blob|mailto|javascript|about|ws|wss):/i.test(s)) return { kind: 'data' };
  if (s.startsWith('#')) return { kind: 'data' };
  if (/^\/\//.test(s)) return { kind: 'absolute', value: 'https:' + s };
  if (/^https?:\/\//i.test(s)) {
    if (base) {
      try {
        const u = new URL(s);
        if (u.origin === base.origin) return { kind: 'same-origin' };
      } catch (_) { /* fallthrough */ }
    }
    return { kind: 'absolute', value: s };
  }
  if (base) {
    try {
      const u = new URL(s, base);
      if (u.origin === base.origin) return { kind: 'same-origin' };
      return { kind: 'absolute', value: u.toString() };
    } catch (_) { return { kind: 'relative' }; }
  }
  return { kind: 'relative' };
}

/* ── findings 与评分 ────────────────────────────────────────────────────── */

function F(sev, code, title, detail, fix) {
  return { sev, code, title, detail: detail || '', fix: fix || '' };
}

const SEV_ORDER = { red: 0, yellow: 1, info: 2, green: 3 };

function sortFindings(findings) {
  return [...findings].sort((a, b) => (SEV_ORDER[a.sev] - SEV_ORDER[b.sev]));
}

function countFindings(findings) {
  const c = { red: 0, yellow: 0, info: 0, green: 0 };
  for (const f of findings) c[f.sev] = (c[f.sev] || 0) + 1;
  return c;
}

/** 评分：100 起，red -30 / yellow -12 / green +0，同类 finding 最多计罚 3 次，下限 0 */
function computeScore(findings) {
  const seen = {};
  let score = 100;
  for (const f of findings) {
    if (f.sev !== 'red' && f.sev !== 'yellow') continue;
    seen[f.code] = (seen[f.code] || 0) + 1;
    if (seen[f.code] > 3) continue;
    score -= f.sev === 'red' ? 30 : 12;
  }
  return Math.max(0, Math.min(100, score));
}

/* ── verdict 文案 ───────────────────────────────────────────────────────── */

const VERDICT_CN = {
  match: { cn: '与官方一致', bad: 0 },
  'match-origin': { cn: '与源仓库一致', bad: 0 },
  mismatch: { cn: '与官方不一致（疑似篡改）', bad: 2 },
  'cdn-generated': { cn: 'CDN 现场生成文件（不在官方包内，无法权威核验）', bad: 1 },
  unreachable: { cn: '从本机网络不可达', bad: 1 },
  unverifiable: { cn: '无法核对（无权威哈希源）', bad: 1 },
  error: { cn: '核验过程出错', bad: 1 },
};

function verdictBadge(verdict) {
  const v = VERDICT_CN[verdict] || { cn: verdict, bad: 1 };
  if (verdict === 'match' || verdict === 'match-origin') return '✅ ' + v.cn;
  if (verdict === 'mismatch') return '🚨 ' + v.cn;
  if (verdict === 'cdn-generated' || verdict === 'unverifiable') return '⚠️ ' + v.cn;
  if (verdict === 'unreachable') return '🚫 ' + v.cn;
  return '❔ ' + v.cn;
}

module.exports = {
  VERSION,
  NPM_FAMILY_MIRRORS,
  CDNJSLIKE_MIRRORS,
  ALL_MIRROR_IDS,
  normalizeUrlInput,
  classifyResourceUrl,
  parseNpmPath,
  parseNpmmirrorPath,
  parseCdnjsLikePath,
  npmMirrorUrls,
  cdnjsMirrorUrls,
  parseSri,
  sriTag,
  compareSri,
  extractExternalResources,
  resolveResourceUrl,
  F,
  sortFindings,
  countFindings,
  computeScore,
  VERDICT_CN,
  verdictBadge,
};
