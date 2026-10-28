'use strict';
/**
 * normalize.js —— 代码规范化 / 交易时段 / 展示格式化（纯函数，可单测）
 *
 * 代码规范化规则（MVP 仅沪深北场内标的；场外基金/港股/美股搜索命中时明确拒绝）：
 *   - 显式前缀 sh|sz|bj 优先（指数与股票同码冲突时唯一可靠消歧手段，如 sh000001 上证指数 vs 000001 平安银行）
 *   - 裸 6 位按号段推断：60/68→sh 股票，50/51/56/58→sh 基金(ETF/LOF)，
 *     00/30→sz 股票，12/15/16/18→sz 基金，43/83/87/92→bj 北交所
 *   - 000xxx 裸码默认深市股票（上证指数必须显式 sh000001）
 */

const MARKETS = new Set(['sh', 'sz', 'bj']);

/** 6 位代码 → 交易所推断；null 表示无法识别 */
function inferMarket(code) {
  if (!/^\d{6}$/.test(code)) return null;
  const p2 = code.slice(0, 2);
  const p3 = code.slice(0, 3);
  if (p3 === '600' || p3 === '601' || p3 === '603' || p3 === '605' || p3 === '688' || p3 === '689') return 'sh';
  if (p2 === '51' || p2 === '56' || p2 === '58' || p2 === '50') return 'sh';
  if (p2 === '00' || p2 === '30') return 'sz';
  if (p2 === '12' || p2 === '15' || p2 === '16' || p2 === '18') return 'sz';
  if (p2 === '43' || p2 === '83' || p2 === '87' || p2 === '92') return 'bj';
  return null;
}

/**
 * 用户输入 → 规范 secid（如 sh600519）。
 * @returns {{id:string, code:string, market:string} | {error:string}}
 */
function normalizeCode(input) {
  const raw = String(input || '').trim().toLowerCase().replace(/\s+/g, '');
  if (!raw) return { error: '请输入代码（如 600519 / 510300）或带前缀（如 sh000001）' };
  const m = raw.match(/^(sh|sz|bj)?(\d{6})$/);
  if (!m) {
    return { error: '无法识别的代码格式：' + raw + '（支持 6 位数字，可带 sh/sz/bj 前缀；名称请用搜索）' };
  }
  const code = m[2];
  if (m[1]) {
    if (!MARKETS.has(m[1])) return { error: '未知市场前缀：' + m[1] };
    return { id: m[1] + code, code, market: m[1] };
  }
  const market = inferMarket(code);
  if (!market) {
    return { error: `无法推断 ${code} 所属市场（请带前缀重试，如 sh${code} / sz${code}）` };
  }
  return { id: market + code, code, market };
}

/** 搜索结果里的 market 标记 → 是否为 MVP 可行情的场内标的 */
function isTradableMarket(marketTag) {
  return marketTag === 'sh' || marketTag === 'sz' || marketTag === 'bj';
}

/** 标的类型推断（用于展示；类型码来自 smartbox：GP-A/GP=股票，ETF=ETF，ZS=指数） */
function inferType(secid, typeTag) {
  if (typeTag === 'ZS') return 'index';
  if (typeTag === 'ETF' || typeTag === 'LOF') return 'etf';
  const market = secid.slice(0, 2);
  const code = secid.slice(2);
  const p3 = code.slice(0, 3);
  if (market === 'sh' && (p2IsFund(p3))) return 'etf';
  if (market === 'sz' && (p2IsFund(p3))) return 'etf';
  return 'stock';
}
function p2IsFund(p3) {
  const p2 = p3.slice(0, 2);
  return p2 === '51' || p2 === '56' || p2 === '58' || p2 === '50' || p2 === '12' || p2 === '15' || p2 === '16' || p2 === '18';
}

// ── 交易时段（Asia/Shanghai 固定 UTC+8；节假日不建模，用盘外降频兜底）────────

/** 现在（或给定 UTC ms）对应的北京时间日期与分钟数 */
function bjNow(nowMs) {
  const d = new Date(nowMs + 8 * 3600 * 1000);
  // 用 UTC 分量表达北京时间
  const y = d.getUTCFullYear();
  const mo = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const minutes = d.getUTCHours() * 60 + d.getUTCMinutes();
  return { date: `${y}${String(mo).padStart(2, '0')}${String(day).padStart(2, '0')}`, minutes, weekday: d.getUTCDay() };
}

const SESSIONS = [
  [9 * 60 + 15, 11 * 60 + 35], // 09:15–11:35（含集合竞价与午前收盘缓冲）
  [12 * 60 + 55, 15 * 60 + 10], // 12:55–15:10（含午后开盘与收盘缓冲）
];

/** 是否在交易时段（周一~五 + 会话区间；收盘后 15:10 起算盘外） */
function inTradingSession(nowMs) {
  const { minutes, weekday } = bjNow(nowMs);
  if (weekday === 0 || weekday === 6) return false;
  return SESSIONS.some(([a, b]) => minutes >= a && minutes < b);
}

/** 从交易所行情时间（yyyyMMddHHmmss）取日期，用于提醒单日去重 */
function tradeDateOf(quoteTime) {
  const s = String(quoteTime || '');
  return /^\d{8}/.test(s) ? s.slice(0, 8) : bjNow(Date.now()).date;
}

// ── 展示格式化 ───────────────────────────────────────────────────────────────

function fmtNum(v, digits = 2) {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return '—';
  return Number(v).toFixed(digits);
}

function fmtAmountWan(wan) {
  const v = Number(wan);
  if (!Number.isFinite(v) || v <= 0) return '—';
  if (v >= 1e4) return (v / 1e4).toFixed(2) + ' 亿';
  return Math.round(v).toLocaleString('en-US') + ' 万';
}

function fmtVolumeHand(hand) {
  const v = Number(hand);
  if (!Number.isFinite(v) || v <= 0) return '—';
  if (v >= 1e6) return (v / 1e6).toFixed(2) + ' 百万手';
  if (v >= 1e4) return (v / 1e4).toFixed(2) + ' 万手';
  return Math.round(v) + ' 手';
}

/** 行情时间 yyyyMMddHHmmss → 'MM-dd HH:mm'（同日省略年份；跨年显示完整） */
function fmtQuoteTime(ts) {
  const s = String(ts || '');
  if (!/^\d{14}$/.test(s)) return '—';
  const y = s.slice(0, 4);
  const nowY = bjNow(Date.now()).date.slice(0, 4);
  const md = `${s.slice(4, 6)}-${s.slice(6, 8)}`;
  const hm = `${s.slice(8, 10)}:${s.slice(10, 12)}`;
  return (y === nowY ? '' : y + '-') + md + ' ' + hm;
}

module.exports = {
  inferMarket,
  normalizeCode,
  isTradableMarket,
  inferType,
  bjNow,
  inTradingSession,
  tradeDateOf,
  fmtNum,
  fmtAmountWan,
  fmtVolumeHand,
  fmtQuoteTime,
};
