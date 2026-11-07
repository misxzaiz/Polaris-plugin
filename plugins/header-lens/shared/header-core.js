'use strict';
/**
 * header-core.js —— HTTP 头解析台共享核心（单一权威，零依赖纯函数、零 node 内置 require）
 *
 * 被 MCP server（CJS require）与面板（esbuild 打包进 browser bundle）共用，
 * 禁止 require 任何 node 内置模块（exec-sandbox 实证坑）。
 *
 * 解析语义（如实声明）：
 *   - 原始头块：`Name: value` 逐行；头名大小写不敏感（规范化为小写键）；多值头
 *     （Set-Cookie 等）保留多行（不合并——合并会丢语义）；续行（前导空白折叠）支持
 *   - 只解析不判威胁：CSP 危险项标注是「配置提示」非安全审计
 *   - Cookie/Set-Cookie 只做「分离与计数」，深检衔接 cookie-lens（044）
 */

/** 原始头块 → { name: value } 多值保留（value 数组） */
function parseHeaderBlock(text) {
  const headers = {};
  const order = [];
  const rawLines = String(text == null ? '' : text).split(/\r?\n/);
  let lastKey = null;
  for (const raw of rawLines) {
    if (!raw.trim()) continue;
    if (/^[ \t]/.test(raw) && lastKey) {
      // 续行折叠
      const idx = order.indexOf(lastKey);
      headers[lastKey][headers[lastKey].length - 1] += ' ' + raw.trim();
      void idx;
      continue;
    }
    const m = raw.match(/^([A-Za-z0-9_-]+)\s*:\s?(.*)$/);
    if (!m) continue; // 非头行（如请求行/状态行）跳过
    const name = m[1].toLowerCase();
    if (!headers[name]) { headers[name] = []; order.push(name); }
    headers[name].push(m[2].trim());
    lastKey = name;
  }
  return { headers, order };
}

/** 状态行/请求行剥离（HTTP/1.1 200 OK / GET /path HTTP/1.1） */
function stripStatusLine(text) {
  const lines = String(text == null ? '').split(/\r?\n/);
  while (lines.length && !/^[A-Za-z0-9_-]+\s*:/.test(lines[0])) lines.shift();
  return lines.join('\n');
}

// ── Cache-Control ──────────────────────────────────────────────────────────

const CACHE_DIRECTIVES = {
  'max-age': { semantic: '新鲜寿命（秒）', value: true },
  's-maxage': { semantic: '共享缓存（CDN）新鲜寿命（秒）', value: true },
  'no-cache': { semantic: '可缓存但须回源验证', value: false },
  'no-store': { semantic: '禁止缓存', value: false },
  'public': { semantic: '允许共享缓存', value: false },
  'private': { semantic: '仅私有缓存（浏览器）', value: false },
  'must-revalidate': { semantic: '过期后必须回源验证', value: false },
  'immutable': { semantic: '内容永不变化（强缓存友好）', value: false },
  'stale-while-revalidate': { semantic: '过期后可先回旧值再后台刷新（秒）', value: true },
  'stale-if-error': { semantic: '回源失败可用旧值（秒）', value: true },
  'max-stale': { semantic: '接受过期秒数', value: true },
  'min-fresh': { semantic: '要求剩余新鲜度（秒）', value: true },
  'only-if-cached': { semantic: '只取缓存', value: false },
};

function parseCacheControl(value) {
  const directives = [];
  for (const part of String(value || '').split(',')) {
    const t = part.trim();
    if (!t) continue;
    const eq = t.indexOf('=');
    const name = (eq === -1 ? t : t.slice(0, eq)).trim().toLowerCase();
    const val = eq === -1 ? null : t.slice(eq + 1).replace(/^"|"$/g, '').trim();
    const known = CACHE_DIRECTIVES[name];
    directives.push({
      name,
      value: val,
      known: !!known,
      semantic: known ? known.semantic : '（非标准/未收录指令）',
    });
  }
  const by = (n) => directives.find((d) => d.name === n);
  const notes = [];
  const maxAge = by('max-age');
  const noStore = by('no-store');
  const noCache = by('no-cache');
  if (noStore) notes.push('no-store：完全禁缓存——敏感接口常用');
  if (noCache && maxAge) notes.push('no-cache 与 max-age 并存：可存但每次回源验证');
  if (maxAge && !noStore && Number(maxAge.value) > 31536000) notes.push('max-age 超过 1 年：配合 immutable 即永久强缓存');
  return { directives, notes };
}

// ── CSP ────────────────────────────────────────────────────────────────────

function parseCsp(value) {
  const directives = [];
  for (const part of String(value || '').split(';')) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    if (!tokens.length) continue;
    const name = tokens[0];
    const sources = tokens.slice(1);
    const dangers = sources.filter((s) => s === "'unsafe-inline'" || s === "'unsafe-eval'" || s === '*' || s === "'unsafe-hashes'");
    directives.push({
      name,
      sources,
      dangerous: dangers.length ? dangers : null,
      note: dangers.length ? `包含危险源 ${dangers.join(' ')}（放宽了该方向限制）` : '',
    });
  }
  const names = directives.map((d) => d.name);
  const notes = [];
  if (!names.includes('default-src')) notes.push('缺 default-src：未列方向不受限（回退行为依赖实现）');
  if (!names.includes('object-src')) notes.push('缺 object-src：<object> 嵌入未受限');
  if (!names.includes('base-uri')) notes.push('缺 base-uri：<base> 注入未受限');
  const unsafeTotal = directives.filter((d) => d.dangerous).length;
  if (unsafeTotal) notes.push(`${unsafeTotal} 个方向含危险源——CSP 防护被削弱`);
  return { directives, notes };
}

// ── Retry-After / Link / Content-Disposition ───────────────────────────────

function parseRetryAfter(value) {
  const v = String(value || '').trim();
  if (/^\d+$/.test(v)) return { kind: 'seconds', seconds: Number(v), note: `${v} 秒后重试` };
  if (/^[A-Za-z]{3},/.test(v) || /\d{4}/.test(v)) {
    const ts = Date.parse(v);
    if (!Number.isNaN(ts)) {
      const secs = Math.max(0, Math.round((ts - Date.now()) / 1000));
      return { kind: 'http-date', date: v, secondsFromNow: secs, note: `HTTP-date ${v}（距今约 ${secs} 秒——按解析时刻计算）` };
    }
    return { kind: 'invalid', note: `无法解析的日期：${v}` };
  }
  return { kind: 'invalid', note: `无法识别的 Retry-After：${v}` };
}

function parseLink(value) {
  const out = [];
  for (const part of String(value || '').split(/,(?=<)/)) {
    const m = part.trim().match(/^<([^>]+)>\s*(.*)$/);
    if (!m) continue;
    const params = {};
    for (const p of m[2].split(';')) {
      const pm = p.trim().match(/^(\w+)="?([^"]*)"?$/);
      if (pm) params[pm[1]] = pm[2];
    }
    out.push({ uri: m[1], rel: params.rel || '', params });
  }
  return out;
}

function parseContentDisposition(value) {
  const v = String(value || '');
  const typeM = v.match(/^\s*(inline|attachment|form-data)/i);
  const filenameM = v.match(/filename="([^"]*)"/i) || v.match(/filename=([^;]+)/i);
  let filenameUtf8 = null;
  const starM = v.match(/filename\*=(?:UTF-8|utf-8)''([^;]+)/i);
  if (starM) {
    try { filenameUtf8 = decodeURIComponent(starM[1]); } catch (_) { filenameUtf8 = starM[1]; }
  }
  return {
    type: typeM ? typeM[1].toLowerCase() : null,
    filename: filenameM ? filenameM[1].replace(/^"|"$/g, '') : null,
    filenameUtf8,
    note: filenameUtf8 ? `RFC5987 扩展名（非 ASCII 文件名）：${filenameUtf8}` : '',
  };
}

/** 多 Set-Cookie 分离（衔接 cookie-lens 044） */
function splitSetCookie(headers) {
  const list = headers['set-cookie'] || [];
  return list.map((v, i) => {
    const pair = v.split(';')[0];
    const eq = pair.indexOf('=');
    return { index: i + 1, name: eq === -1 ? '' : pair.slice(0, eq).trim(), raw: v, hint: '深检（SameSite/Secure/前缀/Domain 校验）请用 cookie-lens' };
  });
}

module.exports = {
  parseHeaderBlock, stripStatusLine,
  parseCacheControl, parseCsp, parseRetryAfter, parseLink, parseContentDisposition, splitSetCookie,
  CACHE_DIRECTIVES,
};
