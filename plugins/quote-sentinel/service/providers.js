'use strict';
/**
 * providers.js —— 行情数据源（零依赖）
 *
 * 腾讯 qt.gtimg.cn 为主源（GBK 批量文本，实测稳定多年），
 * 东方财富 push2 为备源（JSON，fltt=2 返回已除算浮点）。
 * 两源失败由调用方（quotes.js）用上一轮缓存兜底并在 state 标 source。
 *
 * 所有 parse* 为纯函数（字符串/对象 → 结构化数据），对真实接口字节录制样本
 * 做单测；所有 fetch* 接受可注入 fetchImpl（默认全局 fetch）以便离线测试。
 *
 * 字段布局（2026-10-28 实测录制）：
 *   腾讯  ~分隔：[1]名称 [2]代码 [3]现价 [4]昨收 [5]今开 [6]量(手)
 *         [30]时间yyyyMMddHHmmss [31]涨跌 [32]涨跌% [33]高 [34]低
 *         [37]额(万) [38]换手% [44]流通市值(亿) [45]总市值(亿)
 *   东财  f2现价 f3涨跌% f4涨跌 f5量(手) f6额(元) f8换手 f12代码 f13市场
 *         f14名称 f15高 f16低 f17开 f18昨收 f124更新时间(unix秒)
 *   smartbox（搜索） market~code~name~pinyin~type 以 ^ 分隔、\uXXXX 转义
 *   minute（分时）   data.<code>.data.data[] = "HHMM 价 累计量 累计额"，
 *                    qt.<code>[4]=昨收，date=yyyyMMdd
 */

const { bjNow } = require('./normalize');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
const FETCH_TIMEOUT_MS = 8000;
const MAX_BATCH = 60; // 腾讯单次批量上限（协议支持更多，保守截断）

// ── GBK 解码（Node 内置 TextDecoder；不可用时名称降级为代码，行情数值仍可用）──
let gbkDecoder = null;
try { gbkDecoder = new TextDecoder('gbk'); } catch (_) { /* ICU 受限时 */ }

function decodeGbk(buf) {
  if (gbkDecoder) {
    try { return gbkDecoder.decode(buf); } catch (_) { /* 落入兜底 */ }
  }
  return Buffer.from(buf).toString('latin1');
}

function num(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** 统一行情对象 */
// { id, name, price, prevClose, open, high, low, chg, pct, volume, amount, turnover, time, mktcap }
// volume=手，amount=万元，turnover=%，time=yyyyMMddHHmmss

// ── 腾讯批量行情 ─────────────────────────────────────────────────────────────

/** 纯函数：腾讯返回文本（或 GBK Buffer，自动解码）→ Map<secid, quote>（无法解析/停牌无价的行跳过） */
function parseTencentQuotes(rawText) {
  const out = new Map();
  if (!rawText) return out;
  if (Buffer.isBuffer(rawText)) rawText = decodeGbk(rawText);
  const re = /v_([a-z]{2})(\d{6})="([^"]*)"/g;
  let m;
  while ((m = re.exec(rawText)) !== null) {
    const market = m[1];
    const code = m[2];
    const f = m[3].split('~');
    if (f.length < 35) continue;
    const price = num(f[3]);
    if (price === null || price <= 0) continue; // 停牌/无价
    const id = market + code;
    const prevClose = num(f[4]);
    const chg = num(f[31]);
    const pct = num(f[32]);
    out.set(id, {
      id,
      name: (f[1] || code).trim(),
      price,
      prevClose: prevClose !== null ? prevClose : price,
      open: num(f[5]) ?? price,
      high: num(f[33]) ?? price,
      low: num(f[34]) ?? price,
      chg: chg !== null ? chg : (prevClose !== null ? +(price - prevClose).toFixed(4) : 0),
      pct: pct !== null ? pct : 0,
      volume: num(f[6]) ?? 0,
      amount: num(f[37]) ?? 0,
      turnover: num(f[38]),
      time: /^\d{14}$/.test(f[30] || '') ? f[30] : bjNowStr(),
      mktcap: num(f[45]),
      source: 'tencent',
    });
  }
  return out;
}

function bjNowStr() {
  const { date, minutes } = bjNow(Date.now());
  const h = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mi = String(minutes % 60).padStart(2, '0');
  return `${date}000000`.slice(0, 8) + h + mi + '00';
}

async function fetchQuotesTencent(secids, deps = {}) {
  const fetchImpl = deps.fetchImpl || fetch;
  if (!secids.length) return new Map();
  const quotes = new Map();
  for (let i = 0; i < secids.length; i += MAX_BATCH) {
    const batch = secids.slice(i, i + MAX_BATCH);
    const url = `https://qt.gtimg.cn/q=${batch.join(',')}`;
    const res = await fetchImpl(url, {
      headers: { Referer: 'https://gu.qq.com/', 'User-Agent': UA },
      signal: AbortSignal.timeout(deps.timeoutMs || FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`tencent HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    for (const [id, q] of parseTencentQuotes(decodeGbk(buf))) quotes.set(id, q);
  }
  return quotes;
}

// ── 东财批量行情（备源；北交所 secid 映射未确证，备源仅覆盖 sh/sz）──────────

function secidToEm(secid) {
  const market = secid.slice(0, 2);
  const code = secid.slice(2);
  if (market === 'sh') return `1.${code}`;
  if (market === 'sz') return `0.${code}`;
  return null; // bj：东财映射未确证，跳过（主源覆盖）
}

function emToSecid(emMarket, code) {
  if (emMarket === 1) return 'sh' + code;
  if (emMarket === 0) return 'sz' + code;
  return null;
}

/** 纯函数：东财 ulist JSON → Map<secid, quote> */
function parseEastmoneyQuotes(json, fetchedAtMs) {
  const out = new Map();
  const diff = json && json.data && json.data.diff;
  const list = Array.isArray(diff) ? diff : (diff && typeof diff === 'object' ? Object.values(diff) : []);
  for (const d of list) {
    const secid = emToSecid(d.f13, String(d.f12 || ''));
    const price = num(d.f2);
    if (!secid || price === null || price <= 0) continue;
    let time = bjNowStr();
    if (num(d.f124)) {
      const { date, minutes } = bjNow(num(d.f124) * 1000);
      const h = String(Math.floor(minutes / 60)).padStart(2, '0');
      const mi = String(minutes % 60).padStart(2, '0');
      time = date + h + mi + '00';
    }
    const prevClose = num(d.f18) ?? price;
    const chg = num(d.f4);
    const amtYuan = num(d.f6);
    out.set(secid, {
      id: secid,
      name: String(d.f14 || d.f12).trim(),
      price,
      prevClose,
      open: num(d.f17) ?? price,
      high: num(d.f15) ?? price,
      low: num(d.f16) ?? price,
      chg: chg !== null ? chg : +(price - prevClose).toFixed(4),
      pct: num(d.f3) ?? 0,
      volume: num(d.f5) ?? 0,
      amount: amtYuan !== null ? +(amtYuan / 1e4).toFixed(2) : 0,
      turnover: num(d.f8),
      time,
      mktcap: null,
      source: 'eastmoney',
    });
  }
  return out;
}

async function fetchQuotesEastmoney(secids, deps = {}) {
  const fetchImpl = deps.fetchImpl || fetch;
  const emIds = secids.map(secidToEm).filter(Boolean);
  if (!emIds.length) return new Map();
  const url = 'https://push2.eastmoney.com/api/qt/ulist.np/get'
    + `?secids=${emIds.join(',')}&fields=f2,f3,f4,f5,f6,f8,f12,f13,f14,f15,f16,f17,f18,f124&fltt=2&invt=2`;
  const res = await fetchImpl(url, {
    headers: { Referer: 'https://quote.eastmoney.com/', 'User-Agent': UA },
    signal: AbortSignal.timeout(deps.timeoutMs || FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`eastmoney HTTP ${res.status}`);
  const json = await res.json();
  return parseEastmoneyQuotes(json);
}

/**
 * 主源→备源自动降级。返回 { quotes, source, degraded }：
 *   - tencent 成功且命中全部 → source='tencent'
 *   - tencent 失败或部分缺失 → 用 eastmoney 补缺失（source 记实际提供方）
 *   - 两源都失败 → 抛错（由调用方决定缓存兜底）
 * 部分缺失时 quotes 内每条的 source 标注真实来源。
 */
async function fetchQuotes(secids, deps = {}) {
  let tencentQuotes = new Map();
  let tencentErr = null;
  try {
    tencentQuotes = await fetchQuotesTencent(secids, deps);
  } catch (e) {
    tencentErr = e;
  }
  // 只保留请求的标的（数据源可能多回，调用方按请求集消费）
  const wanted = new Set(secids);
  const merged = new Map([...tencentQuotes].filter(([id]) => wanted.has(id)));
  const missing = secids.filter((id) => !merged.has(id));
  if (!missing.length && !tencentErr) {
    return { quotes: merged, source: 'tencent', degraded: false };
  }
  let emQuotes = new Map();
  let emErr = null;
  try {
    emQuotes = await fetchQuotesEastmoney(missing, deps);
  } catch (e) {
    emErr = e;
  }
  // 东财只补缺，不覆盖腾讯已返回的标的（来源标注不被污染）
  for (const [id, q] of emQuotes) if (!merged.has(id)) merged.set(id, q);
  if (!merged.size) {
    const why = [tencentErr && `腾讯: ${tencentErr.message}`, emErr && `东财: ${emErr.message}`].filter(Boolean).join('；');
    throw new Error(why || '两源均未返回有效行情');
  }
  const usedEm = emQuotes.size > 0;
  const stale = secids.filter((id) => !merged.has(id));
  return {
    quotes: merged,
    source: usedEm ? 'tencent+eastmoney' : 'tencent',
    degraded: usedEm || stale.length > 0,
    missing: stale,
    errors: { tencent: tencentErr && tencentErr.message, eastmoney: emErr && emErr.message },
  };
}

// ── 搜索（smartbox；结果含 hk/jj 等不可行情标的，调用方按 tradable 过滤）────

/** 纯函数：smartbox 文本（或 GBK Buffer）→ [{market, code, id, name, type, tradable}] */
function parseSearch(rawText) {
  if (!rawText) return [];
  if (Buffer.isBuffer(rawText)) rawText = decodeGbk(rawText);
  const m = rawText.match(/v_hint="([^"]*)"/);
  if (!m) return [];
  let inner = m[1];
  try { inner = JSON.parse(`"${inner}"`); } catch (_) { /* 已是明文 */ }
  if (!inner) return [];
  return inner.split('^').map((item) => {
    const f = item.split('~');
    if (f.length < 3) return null;
    const market = (f[0] || '').trim();
    const code = (f[1] || '').trim();
    if (!market || !code) return null;
    const type = (f[4] || '').trim();
    return {
      market,
      code,
      id: market + code,
      name: f[2].trim(),
      type,
      tradable: market === 'sh' || market === 'sz' || market === 'bj',
    };
  }).filter(Boolean);
}

async function fetchSearch(query, deps = {}) {
  const fetchImpl = deps.fetchImpl || fetch;
  const url = `https://smartbox.gtimg.cn/s3/?v=2&q=${encodeURIComponent(String(query || '').trim())}&t=all`;
  const res = await fetchImpl(url, {
    headers: { Referer: 'https://gu.qq.com/', 'User-Agent': UA },
    signal: AbortSignal.timeout(deps.timeoutMs || FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`smartbox HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  return parseSearch(decodeGbk(buf));
}

// ── 当日分时（腾讯 ifzq）────────────────────────────────────────────────────

/** 纯函数：minute JSON → { date, prevClose, points:[{t,p,vol,amt}] } 或 null */
function parseMinute(json, secid) {
  const node = json && json.data && json.data[secid] && json.data[secid].data;
  if (!node || !Array.isArray(node.data)) return null;
  const points = [];
  for (const line of node.data) {
    const f = String(line).split(' ');
    if (f.length < 2) continue;
    const p = num(f[1]);
    if (p === null) continue;
    points.push({ t: f[0], p, vol: num(f[2]) ?? 0, amt: num(f[3]) ?? 0 });
  }
  if (!points.length) return null;
  const qt = (json.data[secid].qt || {})[secid];
  const prevClose = Array.isArray(qt) ? num(qt[4]) : null;
  return { date: String(node.date || bjNow(Date.now()).date), prevClose, points };
}

async function fetchMinute(secid, deps = {}) {
  const fetchImpl = deps.fetchImpl || fetch;
  const url = `https://web.ifzq.gtimg.cn/appstock/app/minute/query?code=${secid}`;
  const res = await fetchImpl(url, {
    headers: { Referer: 'https://gu.qq.com/', 'User-Agent': UA },
    signal: AbortSignal.timeout(deps.timeoutMs || FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`minute HTTP ${res.status}`);
  const json = await res.json();
  const parsed = parseMinute(json, secid);
  if (!parsed) throw new Error('分时数据为空');
  return parsed;
}

module.exports = {
  UA,
  MAX_BATCH,
  decodeGbk,
  parseTencentQuotes,
  parseEastmoneyQuotes,
  parseSearch,
  parseMinute,
  fetchQuotes,
  fetchQuotesTencent,
  fetchQuotesEastmoney,
  fetchSearch,
  fetchMinute,
};
