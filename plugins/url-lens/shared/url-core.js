'use strict';
/**
 * url-core.js —— URL 调试台共享核心（单一权威，零依赖、零 node 内置 require）
 *
 * 被 MCP server（CJS require）与面板（esbuild 打包进 browser bundle）共用。
 * 使用全局 URL / URLSearchParams（浏览器与 node 均内置，esbuild 不打包全局
 * API，不违反 core 零 node 内置 require 纪律——exec-sandbox 实证坑）。
 *
 * 语义边界（如实声明，log-lens URLSearchParams 坑的系统化）：
 *   - 参数解析走 URLSearchParams 标准（application/x-www-form-urlencoded）：
 *     + 解码为空格（query 惯例）；%XX 百分号解码；重复键保留多行（get 只取
 *     首个是经典坑，本工具展开全部）。
 *   - 不做 punycode 特判、不发网络请求、不对 scheme 语义特判（http/https/
 *     自定义 scheme 一律按 URL 语法解析；非特殊 scheme 的 host/path 归属由
 *     WHATWG URL 规则决定，工具如实呈现原生行为）。
 */

/**
 * 结构分解（纯函数）。
 * @param {string} urlStr 待解析 URL
 * @returns {{ ok: true, parts: object, params: Array<{name:string,value:string}>, rawParams: string } |
 *           { ok: false, error: string }}
 */
function parseUrl(urlStr) {
  const raw = String(urlStr == null ? '' : urlStr).trim();
  if (!raw) return { ok: false, error: 'URL 为空' };
  let u;
  try {
    u = new URL(raw);
  } catch (e) {
    return { ok: false, error: `URL 语法错误：${String(e.message || e).slice(0, 120)}` };
  }
  const params = [];
  for (const [name, value] of new URLSearchParams(u.search)) {
    params.push({ name, value });
  }
  const parts = {
    protocol: u.protocol.replace(/:$/, ''),
    username: u.username || '',
    password: u.password ? '(已隐藏)' : '',
    hostname: u.hostname,
    port: u.port || (u.protocol === 'https:' ? '443(默认)' : u.protocol === 'http:' ? '80(默认)' : ''),
    origin: u.origin,
    pathname: u.pathname,
    search: u.search || '(无)',
    hash: u.hash || '(无)',
    href: u.href,
  };
  return { ok: true, parts, params, rawParams: u.search.replace(/^\?/, '') };
}

/**
 * 参数重建 URL（纯函数）。
 * @param {object} spec { protocol, hostname, port?, pathname?, params?: Array<{name,value}>, hash? }
 * @returns {{ ok: true, url: string } | { ok: false, error: string }}
 */
function buildUrl(spec) {
  if (!spec || typeof spec !== 'object') return { ok: false, error: '缺少 spec 对象' };
  const protocol = String(spec.protocol || 'https').replace(/:$/, '');
  const hostname = String(spec.hostname || '').trim();
  if (!hostname) return { ok: false, error: '缺少 hostname' };
  const pathname = String(spec.pathname || '/').startsWith('/') ? String(spec.pathname || '/') : '/' + String(spec.pathname || '');
  const usp = new URLSearchParams();
  const params = Array.isArray(spec.params) ? spec.params : [];
  for (const p of params) {
    if (!p || typeof p.name !== 'string' || p.name === '') continue; // 无名参数跳过（如实丢弃）
    usp.append(p.name, String(p.value ?? ''));
  }
  const port = spec.port ? String(spec.port) : '';
  const hash = spec.hash ? (String(spec.hash).startsWith('#') ? String(spec.hash) : '#' + String(spec.hash)) : '';
  const qs = usp.toString();
  const url = `${protocol}://${hostname}${port ? ':' + port : ''}${pathname}${qs ? '?' + qs : ''}${hash}`;
  try {
    return { ok: true, url: new URL(url).href, normalized: url };
  } catch (e) {
    return { ok: false, error: `重建的 URL 非法：${String(e.message || e).slice(0, 120)}` };
  }
}

/**
 * 各段编码解码对照（纯函数）：raw 原样 vs 解码后，标注编码语义坑。
 * @param {string} urlStr
 * @returns {{ ok: true, rows: Array<{ segment: string, raw: string, decoded: string, note: string }> } |
 *           { ok: false, error: string }}
 */
function decodeSegments(urlStr) {
  const parsed = parseUrl(urlStr);
  if (!parsed.ok) return parsed;
  const u = new URL(String(urlStr).trim());
  const rows = [];
  const addRow = (segment, raw, decoded, note) => rows.push({ segment, raw, decoded, note: note || '' });

  addRow('href（整体）', u.href, decodeURIComponentSafe(u.href));
  addRow('pathname', u.pathname, decodeURIComponentSafe(u.pathname), '路径段：%XX 解码（+ 不转空格——路径里 + 是字面量）');
  // query 对照：raw 取原始 search 串里的编码原样（按 & 切、= 分首名），decoded 取
  // URLSearchParams 迭代产物（标准保证与原始串按序一一对应）——zip 配对。
  const rawPairs = u.search.replace(/^\?/, '')
    .split('&')
    .filter((s) => s.length > 0)
    .map((pair) => {
      const i = pair.indexOf('=');
      return i === -1 ? { rawName: pair, rawValue: null } : { rawName: pair.slice(0, i), rawValue: pair.slice(i + 1) };
    });
  const sp = new URLSearchParams(u.search);
  const spList = [...sp];
  let qi = 0;
  for (; qi < spList.length; qi++) {
    const [name, value] = spList[qi];
    const rp = rawPairs[qi] || { rawName: name, rawValue: value };
    addRow(`query[${qi + 1}] name`, rp.rawName, name, 'URLSearchParams 标准：+ → 空格、%XX 解码');
    addRow(
      `query[${qi + 1}] value`,
      rp.rawValue === null ? '(无值)' : rp.rawValue,
      value,
      rp.rawValue !== null && rp.rawValue !== value ? '编码形态 → 解码形态（注意 + 与 %20 语义差异）' : 'URLSearchParams 标准；重复键全展开（.get 只取首个是经典坑）',
    );
  }
  if (!u.search) addRow('query', '(无)', '(无)');
  if (u.hash) addRow('hash', u.hash, decodeURIComponentSafe(u.hash), 'fragment：%XX 解码');
  return { ok: true, rows };
}

/** 宽容解码：非法 % 序列原样返回（不抛错） */
function decodeURIComponentSafe(s) {
  try {
    return decodeURIComponent(s);
  } catch (_) {
    return s;
  }
}

/**
 * 渲染解析报告（多行文本）。
 */
function renderReport(parsed) {
  if (!parsed.ok) return `❌ ${parsed.error}`;
  const p = parsed.parts;
  const lines = [];
  lines.push(`结构分解：`);
  lines.push(`  protocol  ${p.protocol}`);
  lines.push(`  hostname  ${p.hostname}${p.port ? `（port ${p.port}）` : ''}`);
  if (p.username) lines.push(`  username  ${p.username}`);
  lines.push(`  origin    ${p.origin}`);
  lines.push(`  pathname  ${p.pathname}`);
  lines.push(`  search    ${p.search}`);
  lines.push(`  hash      ${p.hash}`);
  if (parsed.params.length) {
    lines.push(`query 参数 ${parsed.params.length} 项（重复键全展开）：`);
    let idx = 1;
    for (const pr of parsed.params) {
      lines.push(`  [${idx++}] ${pr.name} = ${pr.value === '' ? '(空值)' : pr.value}`);
    }
    const dupNames = findDuplicateNames(parsed.params);
    if (dupNames.length) lines.push(`  ⚠ 重复键：${dupNames.join(', ')}（searchParams.get 只取首个——整组取值用 getAll）`);
  } else {
    lines.push('query 参数：无');
  }
  return lines.join('\n');
}

function findDuplicateNames(params) {
  const seen = new Set();
  const dups = new Set();
  for (const p of params) {
    if (seen.has(p.name)) dups.add(p.name);
    seen.add(p.name);
  }
  return [...dups];
}

module.exports = { parseUrl, buildUrl, decodeSegments, renderReport, findDuplicateNames, decodeURIComponentSafe };
