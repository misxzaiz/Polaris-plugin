/**
 * Cookie 引擎（单一权威，MCP 与面板共用）—— RFC 6265 解析 + 语义诊断 + 匹配判定 + 生成。
 *
 * 零依赖纪律：不 require 任何 node 内置模块（会被 esbuild 打进面板 browser bundle）。
 * 全局 URL 仅用于 URL 解析（浏览器 + node 双端内置，esbuild 不打包全局 API）。
 *
 * 语义基准（实现严格对照，勿凭记忆改动）：
 * - RFC 6265 §5.2  Set-Cookie 解析：第一个 = 切 name/value，后续按 ; 切属性，未知属性忽略不报错。
 * - §5.1.3 domain-match：host == domain，或 host 以 "." + domain 结尾且 host 非 IP。
 * - §5.1.4 path-match：相等；或 cookiePath 是前缀且其以 / 结尾、或 requestPath 紧随其后的是 /。
 * - §5.3 存储判定：Domain 非当前 host 及其父域 → 拒收；Secure cookie 不能经非安全来源设置
 *   （localhost 按 trustworthy 豁免，诊断里如实标注）。
 * - SameSite=None 必须 Secure（Chrome M80+/Firefox/Safari 一致强制，否则整条拒收）。
 * - __Host- 前缀：必须 Secure + 无 Domain + Path=/；__Secure- 前缀：必须 Secure（拒收级）。
 * - Max-Age 与 Expires 同存时 Max-Age 优先（§5.3 step 11）；Max-Age 非法值整属性忽略（§5.2.2）。
 */
'use strict';

// ── 基础语法 ────────────────────────────────────────────────────────────────

// RFC 6265 §4.1.1 cookie-name 是 token：排除控制字符、空格与分隔符 ()<>@,;:\"/[]?={}
const TOKEN_BAD = /[\x00-\x20\x7f()<>@,;:"/\\[\]?={}]|\x09/;
// cookie-value 排除控制字符、空格、反斜杠与双引号（逗号在 RFC 6265 里合法但多后端会崩，单独诊断）
const VALUE_BAD = /[\x00-\x20\x7f"\\]|\x09/;
const IP_RE = /^\d{1,3}(\.\d{1,3}){3}$|^\[[0-9a-fA-F:]+\]$/;

function isIp(host) { return IP_RE.test(host); }

/** 取字符串里第一个数字时间戳：用于 cookie 属性对齐后的报告。 */
function clampStr(s, n) { return s.length > n ? s.slice(0, n) + '…' : s; }

// ── RFC 6265 §5.1.3 / §5.1.4 匹配算法 ──────────────────────────────────────

/** host 对 domain 做 domain-match（cookie 的 Domain 属性是否覆盖 host）。 */
function domainMatch(host, domain) {
  const h = String(host || '').toLowerCase();
  const d = String(domain || '').toLowerCase().replace(/^\./, '');
  if (!h || !d) return false;
  if (h === d) return true;
  if (isIp(h)) return false; // IP 主机不做 domain-match
  return h.endsWith('.' + d);
}

/** requestPath 对 cookiePath 做 path-match。 */
function pathMatch(requestPath, cookiePath) {
  const rp = requestPath || '/';
  const cp = cookiePath || '/';
  if (rp === cp) return true;
  if (rp.startsWith(cp)) {
    if (cp.endsWith('/')) return true;
    if (rp.charAt(cp.length) === '/') return true;
  }
  return false;
}

/** RFC 6265 §5.1.4 默认路径：去掉最后一段与 query，保底 /（不以 / 开头则记为 /）。 */
function defaultPath(requestPath) {
  const p = String(requestPath || '/');
  const clean = p.split('?')[0].split('#')[0];
  if (!clean.startsWith('/') || clean === '/') return '/';
  const idx = clean.lastIndexOf('/');
  return idx <= 0 ? '/' : clean.slice(0, idx);
}

// ── URL 归一 ────────────────────────────────────────────────────────────────

function parseRequestUrl(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return { ok: false, error: '缺少 requestUrl（Set-Cookie 的接收来源，判定 Domain/Path/Secure 语义必需）' };
  let u;
  try { u = new URL(raw.trim()); } catch (_) { return { ok: false, error: `requestUrl 不是合法 URL：${clampStr(raw, 80)}` }; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { ok: false, error: `requestUrl 协议须为 http/https，收到 ${u.protocol}` };
  }
  return { ok: true, url: u, host: u.hostname.toLowerCase(), secure: u.protocol === 'https:', path: u.pathname || '/' };
}

// ── Set-Cookie 解析 + 诊断 ─────────────────────────────────────────────────

/**
 * 解析一条 Set-Cookie 值（不含 "Set-Cookie:" 前缀，带也能容忍——剥离）。
 * 返回 {ok, cookie, scope, findings, verdict}
 * - cookie: {name, value, expires, maxAge, domain, path, secure, httpOnly, sameSite, partitioned}
 * - scope: 浏览器视角生效范围 {domain(Effective), path, secure}
 * - findings: [{level: error|warn|info, code, message}]
 * - verdict: 'rejected'（浏览器拒收）| 'accepted'（会存）
 */
function parseSetCookie(raw, requestUrl, nowMs) {
  if (typeof raw !== 'string' || !raw.trim()) return { ok: false, error: '缺少 setCookie 值' };
  const src = raw.trim().replace(/^set-cookie\s*:\s*/i, '');
  const ctx = parseRequestUrl(requestUrl);
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const firstEq = src.indexOf('=');
  if (firstEq <= 0) return { ok: false, error: firstEq === 0 ? 'cookie 名为空（= 开头）' : '整串没有 = 号，不是合法 Set-Cookie 结构' };
  const name = src.slice(0, firstEq).trim();
  const rest = src.slice(firstEq + 1);
  const semi = rest.indexOf(';');
  const value = semi === -1 ? rest.trim() : rest.slice(0, semi).trim();

  const cookie = { name, value, expires: null, maxAge: null, domain: null, path: null, secure: false, httpOnly: false, sameSite: null, partitioned: false };
  const findings = [];
  const add = (level, code, message) => findings.push({ level, code, message });

  if (!name) return { ok: false, error: 'cookie 名为空' };
  let rejected = false;
  if (TOKEN_BAD.test(name)) { add('error', 'NAME_INVALID', `名称含 token 非法字符（${[...name].filter((c) => TOKEN_BAD.test(c)).map((c) => JSON.stringify(c)).join(' ')}）——浏览器与多数解析器拒绝`); rejected = true; }
  if (VALUE_BAD.test(value)) add('warn', 'VALUE_CHARS', '值含 RFC 6265 非规范字符（控制字符/空格/反斜杠/双引号）');
  if (value.includes(',')) add('warn', 'VALUE_COMMA', '值含逗号：RFC 6265 合法，但会被不少后端/网关按多 cookie 切碎——历史遗留的高频坑');
  if (value === '') add('info', 'VALUE_EMPTY', '值为空串：常用于「删除 cookie」（配合过期时间）');

  // 属性解析（RFC 6265 §5.2：属性名大小写不敏感；重复属性取首个）
  const seen = {};
  const parts = semi === -1 ? [] : rest.slice(semi + 1).split(';');
  for (const partRaw of parts) {
    const part = partRaw.trim();
    if (!part) continue;
    const eq = part.indexOf('=');
    const aname = (eq === -1 ? part : part.slice(0, eq)).trim().toLowerCase();
    const aval = eq === -1 ? '' : part.slice(eq + 1).trim();
    if (seen[aname] !== undefined) { add('info', 'ATTR_DUP', `属性 ${aname} 重复出现，按规范取首个`); continue; }
    seen[aname] = true;
    if (aname === 'expires') {
      const t = Date.parse(aval);
      if (Number.isNaN(t)) add('warn', 'EXPIRES_INVALID', `Expires 无法解析为日期（${clampStr(aval, 40)}）——按 §5.2.1 整属性忽略，退化为会话 cookie`);
      else { cookie.expires = { raw: aval, time: t }; if (t < (nowMs || Date.now())) add('info', 'EXPIRED', 'Expires 已过期：浏览器会立刻删除（或拒收）该 cookie——「删除 cookie」的标准手法'); }
    } else if (aname === 'max-age') {
      if (!/^-?\d+$/.test(aval)) add('warn', 'MAX_AGE_INVALID', `Max-Age 非整数（${clampStr(aval, 30)}）——按 §5.2.2 整属性忽略，退化为会话 cookie`);
      else { cookie.maxAge = parseInt(aval, 10); if (cookie.maxAge <= 0) add('info', 'MAX_AGE_EXPIRE', 'Max-Age ≤ 0：等价于立刻删除'); }
    } else if (aname === 'domain') {
      const d = aval.toLowerCase().replace(/^\./, '');
      if (!d) add('warn', 'DOMAIN_EMPTY', 'Domain 值为空——整属性忽略（§5.2.3）');
      else cookie.domain = d;
    } else if (aname === 'path') {
      if (!aval.startsWith('/')) add('warn', 'PATH_NOT_ROOTED', `Path 不以 / 开头（${clampStr(aval, 30)}）——按 §5.2.4 整属性忽略，用默认路径`);
      else cookie.path = aval;
    } else if (aname === 'secure') cookie.secure = true;
    else if (aname === 'httponly') cookie.httpOnly = true;
    else if (aname === 'partitioned') cookie.partitioned = true;
    else if (aname === 'samesite') {
      const v = aval.toLowerCase();
      if (v === 'strict' || v === 'lax' || v === 'none') cookie.sameSite = v.charAt(0).toUpperCase() + v.slice(1);
      else add('warn', 'SAMESITE_UNKNOWN', `SameSite 值非法（${clampStr(aval, 30)}）——按浏览器默认 Lax 处理；写错值是「cookie 在跨站请求里不带上」的常见根因`);
    } else add('info', 'ATTR_UNKNOWN', `未识别属性 ${clampStr(aname, 20)}——按规范忽略（兼容层友好）`);
  }

  // ── 拒收级判定（§5.3 + 现代浏览器强制语义）──
  const effDomain = cookie.domain || ctx.host;
  const effPath = cookie.path || defaultPath(ctx.path);

  if (cookie.domain && !domainMatch(ctx.host, cookie.domain)) {
    add('error', 'DOMAIN_MISMATCH', `Domain=${cookie.domain} 不是 ${ctx.host} 及其父域——浏览器整条拒收（§5.3 step 6）`);
    rejected = true;
  }
  if (cookie.sameSite === 'None' && !cookie.secure) {
    add('error', 'SAMESITE_NONE_NO_SECURE', 'SameSite=None 未配 Secure——Chrome M80 起整条拒收并告警；这是「session cookie 突然全丢」的头号根因');
    rejected = true;
  }
  if (name.startsWith('__Host-')) {
    if (!cookie.secure) { add('error', 'HOST_PREFIX_NO_SECURE', '__Host- 前缀必须带 Secure——浏览器拒收'); rejected = true; }
    if (cookie.domain) { add('error', 'HOST_PREFIX_HAS_DOMAIN', '__Host- 前缀禁止 Domain 属性（锁定精确主机）——浏览器拒收'); rejected = true; }
    if (cookie.path !== '/') { add('error', 'HOST_PREFIX_PATH', `__Host- 前缀必须 Path=/（收到 ${cookie.path || '缺省→' + effPath}）——浏览器拒收`); rejected = true; }
  }
  if (name.startsWith('__Secure-') && !cookie.secure) {
    add('error', 'SECURE_PREFIX_NO_SECURE', '__Secure- 前缀必须带 Secure——浏览器拒收');
    rejected = true;
  }
  // 警告级
  if (cookie.secure && !ctx.secure && !isLocalhost(ctx.host)) {
    add('warn', 'SECURE_ON_HTTP', '响应经 http（非 localhost）设置 Secure cookie——现代浏览器按 trustworthy 判定，生产 http 页面下会被拒收');
  }
  if (cookie.secure && !ctx.secure && isLocalhost(ctx.host)) {
    add('info', 'SECURE_ON_LOCALHOST', 'http://localhost 被视为安全来源，可设置 Secure cookie（trustworthy origin 豁免）');
  }
  if (cookie.maxAge !== null && cookie.expires) add('info', 'MAX_AGE_WINS', 'Max-Age 与 Expires 同存：按 §5.3 以 Max-Age 为准，Expires 被忽略');
  if (cookie.maxAge === null && !cookie.expires) add('info', 'SESSION_COOKIE', '无 Expires/Max-Age：会话 cookie，浏览器关闭即失效');
  if (isIp(ctx.host) && cookie.domain) add('warn', 'DOMAIN_ON_IP', 'IP 主机不做 domain-match，Domain 属性通常无效');
  if (!cookie.sameSite) add('info', 'SAMESITE_DEFAULT', '未指定 SameSite：现代浏览器默认 Lax（跨站 POST/子请求不带）——如果这是登录态 cookie，跨站场景会「看起来没登录」');

  const scope = { domain: effDomain, path: effPath, secure: cookie.secure, hostOnly: !cookie.domain };
  return { ok: true, cookie, scope, findings, verdict: rejected ? 'rejected' : 'accepted' };
}

function isLocalhost(host) { return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]'; }

/** cookie（scope 视角）会被发往给定 URL 吗？（domain-match + path-match + Secure 通道判定） */
function cookieMatchesUrl(cookie, url) {
  const ctx = parseRequestUrl(url);
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const scope = cookie.scope || cookie;
  const reasons = [];
  if (!domainMatch(ctx.host, scope.domain) || (scope.hostOnly && ctx.host !== scope.domain)) reasons.push(`域不匹配（${ctx.host} vs ${scope.domain}${scope.hostOnly ? '，hostOnly' : ''}）`);
  if (!pathMatch(ctx.path, scope.path)) reasons.push(`路径不匹配（${ctx.path} 不在 ${scope.path} 下）`);
  if (scope.secure && !ctx.secure && !isLocalhost(ctx.host)) reasons.push('Secure cookie 不经明文 http 发送（localhost 豁免）');
  return { ok: true, matches: reasons.length === 0, reasons, ctx: { host: ctx.host, path: ctx.path, secure: ctx.secure } };
}

// ── 请求侧 Cookie 头解析 ───────────────────────────────────────────────────

/** 解析请求 Cookie 头：; 与 , 双分隔宽容切分（, 在老式 servlet 系仍常见）。 */
function parseRequestCookie(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return { ok: false, error: '缺少 Cookie 头内容' };
  const src = raw.trim().replace(/^cookie\s*:\s*/i, '');
  const items = [];
  const findings = [];
  const add = (level, code, message) => findings.push({ level, code, message });
  const chunks = src.split(';');
  for (let i = 0; i < chunks.length; i++) {
    const part = chunks[i].trim();
    if (!part) { add('warn', 'EMPTY_SEGMENT', `第 ${i + 1} 段为空（连续分号或尾分号）`); continue; }
    // 宽容处理 ", " 连接的老式格式：段内出现 name=value, name=value 时按逗号再切
    for (const piece of part.includes(', ') ? part.split(/,\s*(?=[^=]+(?:=|$))/) : [part]) {
      const eq = piece.indexOf('=');
      if (eq === -1) { add('warn', 'NO_EQUALS', `无 = 号的裸片段「${clampStr(piece, 30)}」——RFC 6265 请求侧只接受 name=value，服务端多按丢弃处理`); continue; }
      const name = piece.slice(0, eq).trim();
      items.push({ name, value: piece.slice(eq + 1).trim() });
      if (!name) add('warn', 'EMPTY_NAME', '存在空名键值对');
    }
  }
  const dup = {};
  for (const it of items) dup[it.name] = (dup[it.name] || 0) + 1;
  for (const n of Object.keys(dup)) if (dup[n] > 1) add('warn', 'DUP_NAME', `重复键 ${n}×${dup[n]}——服务端框架取值口径不一（PHP 取最后、Express 原样暴露），判重/鉴权逻辑易被绕过`);
  return { ok: true, items, findings };
}

// ── 生成器（Set-Cookie / 删除指令）+ round-trip 自检 ────────────────────────

/**
 * 从结构对象生成 Set-Cookie 头。
 * spec: {name, value, domain?, path?, expires?(RFC1123 串|maxAgeDays 数字), maxAge?, secure?, httpOnly?, sameSite?('Strict'|'Lax'|'None'), partitioned?}
 * 生成后强制 round-trip 自检：重解析须为 accepted 且字段一致，不过则如实报错（生成器铁律：终验不过不给半成品）。
 */
function generateSetCookie(spec) {
  if (!spec || typeof spec !== 'object') return { ok: false, error: '缺少 spec 对象' };
  const name = String(spec.name || '');
  if (!name) return { ok: false, error: '缺少 name' };
  if (TOKEN_BAD.test(name)) return { ok: false, error: `name 含非法 token 字符：${name}` };
  const value = String(spec.value ?? '');
  if (VALUE_BAD.test(value)) return { ok: false, error: 'value 含控制字符/空格/反斜杠/双引号（RFC 6265 非法）——先编码再放值' };

  const parts = [`${name}=${value}`];
  const sameSite = spec.sameSite ? String(spec.sameSite) : null;
  if (spec.domain) {
    const d = String(spec.domain).toLowerCase();
    if (!d) return { ok: false, error: 'domain 为空串' };
    parts.push(`Domain=${d}`);
  }
  parts.push(`Path=${spec.path ? String(spec.path) : '/'}`);
  if (spec.maxAge !== undefined && spec.maxAge !== null) {
    if (!Number.isInteger(spec.maxAge)) return { ok: false, error: `maxAge 须为整数秒，收到 ${spec.maxAge}` };
    parts.push(`Max-Age=${spec.maxAge}`);
  }
  if (typeof spec.expires === 'string' && spec.expires) {
    const t = Date.parse(spec.expires);
    if (Number.isNaN(t)) return { ok: false, error: `expires 无法解析为日期：${spec.expires}` };
    parts.push(`Expires=${new Date(t).toUTCString()}`);
  }
  const secure = spec.secure === undefined ? sameSite === 'None' : !!spec.secure; // None 时缺省自动补 Secure（防手滑踩拒收坑）
  if (secure) parts.push('Secure');
  if (spec.httpOnly) parts.push('HttpOnly');
  if (sameSite) {
    if (!['Strict', 'Lax', 'None'].includes(sameSite)) return { ok: false, error: `sameSite 只接受 Strict/Lax/None，收到 ${sameSite}` };
    parts.push(`SameSite=${sameSite}`);
  }
  if (spec.partitioned) parts.push('Partitioned');

  const header = parts.join('; ');
  // 终验：生成产物必须过解析器且语义一致——生成器与解析器互为对方的不变式闸
  const self = parseSetCookie(header, spec.requestUrl || `https://${spec.domain || 'example.com'}/`);
  if (!self.ok) return { ok: false, error: `round-trip 自检失败（解析器拒收生成产物）：${self.error}` };
  const drift = [];
  if (self.cookie.name !== name || self.cookie.value !== value) drift.push('name/value 漂移');
  if ((self.cookie.domain || null) !== (spec.domain ? String(spec.domain).toLowerCase().replace(/^\./, '') : null)) drift.push('domain 漂移');
  if ((self.cookie.path || '/') !== (spec.path ? String(spec.path) : '/')) drift.push('path 漂移');
  if (drift.length) return { ok: false, error: `round-trip 自检失败：${drift.join('；')}` };
  return { ok: true, header, verdict: self.verdict, findings: self.findings, scope: self.scope };
}

// ── 报告渲染（MCP 文本输出用）──────────────────────────────────────────────

const LEVEL_TAG = { error: '[拒收]', warn: '[警告]', info: '[说明]' };

function renderSetCookieReport(r) {
  if (!r.ok) return `解析失败：${r.error}`;
  const c = r.cookie;
  const lines = [];
  lines.push(`判定：${r.verdict === 'rejected' ? '浏览器将【拒收】这条 cookie' : 'cookie 会被浏览器接受'}`);
  lines.push(`  name = ${c.name}`);
  lines.push(`  value = ${c.value === '' ? '(空)' : clampStr(c.value, 120)}`);
  const attrs = [];
  if (c.domain) attrs.push(`Domain=${c.domain}`);
  if (c.path) attrs.push(`Path=${c.path}`);
  if (c.maxAge !== null) attrs.push(`Max-Age=${c.maxAge}`);
  if (c.expires) attrs.push(`Expires=${c.expires.raw}`);
  if (c.secure) attrs.push('Secure');
  if (c.httpOnly) attrs.push('HttpOnly');
  if (c.sameSite) attrs.push(`SameSite=${c.sameSite}`);
  if (c.partitioned) attrs.push('Partitioned');
  lines.push(`  属性 = ${attrs.length ? attrs.join(' ') : '(无)'}`);
  lines.push(`  生效范围 = domain:${r.scope.domain}${r.scope.hostOnly ? '(hostOnly)' : ''} path:${r.scope.path} secure:${r.scope.secure}`);
  if (r.findings.length) {
    lines.push('诊断：');
    for (const f of r.findings) lines.push(`  ${LEVEL_TAG[f.level]} ${f.code} ${f.message}`);
  } else lines.push('诊断：无异常');
  return lines.join('\n');
}

module.exports = {
  domainMatch, pathMatch, defaultPath, isLocalhost,
  parseSetCookie, parseRequestUrl, cookieMatchesUrl, parseRequestCookie, generateSetCookie,
  renderSetCookieReport,
};
