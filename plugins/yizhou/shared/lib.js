'use strict';
/**
 * lib.js —— 双语阅读共享工具（Node 侧；面板不引用本文件）
 *
 * 常量与 clip 精简自 amber service/lib.js（语义一致）；
 * isFetchableUrl 与 fetchUrl 拷贝自 amber（feed-radar/clip-relay 同源的 SSRF 守卫与
 * 抓取实现，生产验证数月）：URL 是任意端可写的第三方数据，不得让「翻译一篇文章」
 * 变成对 localhost/内网/云元数据的探测。改动必须保留测试覆盖。
 */

const TITLE_CAP = 300;
const BYLINE_CAP = 80;
const TEXT_CAP = 60000;      // 单篇正文字符上限（超限截断并如实标注）
const IMG_CAP = 800;
const URL_CAP = 2048;
const FETCH_TIMEOUT_MS = 20000;
const MAX_HTML_BYTES = 3 * 1024 * 1024;

function clip(s, cap) {
  const t = String(s == null ? '' : s).trim();
  if (!cap || cap <= 0) return t;
  return t.length > cap ? t.slice(0, cap - 1) + '…' : t;
}

// ── SSRF 守卫（与 amber/feed-radar/clip-relay 同源，勿改协议语义） ───────────
function isFetchableUrl(rawUrl) {
  let u;
  try { u = new URL(String(rawUrl || '')); } catch (_) { return false; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const h = u.hostname.toLowerCase().replace(/\.$/, '');
  if (!h) return false;
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return false;
  if (h === '::1' || h === '[::1]' || h === '0.0.0.0') return false;
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const oct = v4.slice(1).map((x) => parseInt(x, 10));
    if (oct.some((x) => x > 255)) return false;
    const [a, b] = oct;
    if (a === 127 || a === 10 || a === 0) return false;
    if (a === 192 && b === 168) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 169 && b === 254) return false; // 链路本地/云元数据
  }
  return true;
}

function normalizeUrl(rawUrl) {
  let url = String(rawUrl || '').trim();
  if (!url) return { error: 'URL 为空' };
  // 已带协议的输入：非 http(s) 一律拒绝（否则 gopher:// 会被下面补成 https://gopher:// 蒙混过关）
  const mScheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(url);
  if (mScheme && !/^https?$/i.test(mScheme[1])) return { error: `不支持的协议：${mScheme[1]}` };
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url.replace(/^\/+/, '');
  if (url.length > URL_CAP) return { error: `URL 超长（>${URL_CAP}）` };
  let u;
  try { u = new URL(url); } catch (_) { return { error: 'URL 无法解析' }; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { error: '仅支持 http(s) 地址' };
  return { url };
}

function safeHost(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch (_) { return ''; }
}

/** 浏览器 UA 抓取（部分站点对机器人 UA 返回降级页）+ 超时 + 字节上限 */
async function fetchUrl(url, { timeoutMs, maxBytes, headers } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs || FETCH_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        ...headers,
      },
    });
  } catch (e) {
    clearTimeout(timer);
    return { ok: false, error: e && e.name === 'AbortError' ? '抓取超时' : String((e && e.message) || e) };
  }
  clearTimeout(timer);
  if (!res.ok) {
    if (res.body && res.body.cancel) res.body.cancel().catch(() => {});
    return { ok: false, error: `HTTP ${res.status}`, status: res.status };
  }
  // undici web ReadableStream：reader 循环，超限 cancel（防超大响应撑爆内存）
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      chunks.push(Buffer.from(value));
      if (size >= (maxBytes || MAX_HTML_BYTES)) { await reader.cancel().catch(() => {}); break; }
    }
  } catch (_) {
    return { ok: false, error: '读取响应失败' };
  }
  return {
    ok: true,
    status: res.status,
    buffer: Buffer.concat(chunks),
    contentType: res.headers.get('content-type') || '',
    truncated: size >= (maxBytes || MAX_HTML_BYTES),
  };
}

module.exports = {
  TITLE_CAP, BYLINE_CAP, TEXT_CAP, IMG_CAP, URL_CAP, FETCH_TIMEOUT_MS, MAX_HTML_BYTES,
  clip, isFetchableUrl, normalizeUrl, safeHost, fetchUrl,
};
