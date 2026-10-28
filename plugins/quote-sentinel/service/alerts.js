'use strict';
/**
 * alerts.js —— 提醒规则引擎（纯函数，可单测）
 *
 * 规则：{ id, code, type, value, enabled, lastFiredDate }
 *   type: price_above / price_below / pct_above / pct_below（value 为价格或百分比）
 *
 * 触发语义：
 *   - 条件满足且该规则在「该交易日」尚未触发过 → 触发（单日单次去重）
 *   - 只对「行情时间日期 == 今天（北京时间）」的数据评估——节假日/周末
 *     行情时间停留在上一交易日，天然不触发，无需节假日表
 *   - 数据新鲜度由服务端保证（评估只在轮询成功后进行）
 */

const TYPES = new Set(['price_above', 'price_below', 'pct_above', 'pct_below']);

/** 单条规则评估；触发返回原因对象，否则 null */
function shouldFire(alert, quote, today) {
  if (!alert || !quote || alert.enabled === false) return null;
  if (!TYPES.has(alert.type)) return null;
  if (!Number.isFinite(Number(alert.value))) return null;
  // 行情必须属于今天（北京时间）才参与评估
  const qt = String(quote.time || '');
  if (!/^\d{8}/.test(qt) || qt.slice(0, 8) !== today) return null;
  if (alert.lastFiredDate === today) return null; // 单日单次
  const price = Number(quote.price);
  const pct = Number(quote.pct);
  const value = Number(alert.value);
  switch (alert.type) {
    case 'price_above': return price >= value ? { price, pct } : null;
    case 'price_below': return price <= value ? { price, pct } : null;
    case 'pct_above': return pct >= value ? { price, pct } : null;
    case 'pct_below': return pct <= value ? { price, pct } : null;
    default: return null;
  }
}

/**
 * 批量评估。
 * @param alerts {Array} 规则列表
 * @param states {Map<secid, quote>} 最新行情
 * @param today {string} 北京时间 yyyyMMdd
 * @returns {Array<{alert, quote, price, pct}>} 本次应触发的列表
 */
function evaluateAlerts(alerts, states, today) {
  const fires = [];
  for (const alert of alerts || []) {
    const quote = states && states.get(alert.code);
    const hit = shouldFire(alert, quote, today);
    if (hit) fires.push({ alert, quote, price: hit.price, pct: hit.pct });
  }
  return fires;
}

/** 规则规范化（防御面板/MCP 之外的脏数据）；非法返回 null */
function normalizeAlert(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 40) : null;
  const code = typeof raw.code === 'string' && /^(sh|sz|bj)\d{6}$/.test(raw.code) ? raw.code : null;
  const type = TYPES.has(raw.type) ? raw.type : null;
  const value = Number(raw.value);
  if (!id || !code || !type || !Number.isFinite(value)) return null;
  const a = {
    id,
    code,
    type,
    value: +value.toFixed(4),
    enabled: raw.enabled !== false,
    createdAt: Number(raw.createdAt) || Date.now(),
  };
  if (raw.note) a.note = String(raw.note).slice(0, 120);
  if (typeof raw.lastFiredDate === 'string' && /^\d{8}$/.test(raw.lastFiredDate)) {
    a.lastFiredDate = raw.lastFiredDate;
  }
  return a;
}

/** 规则的人类可读描述（服务/面板/MCP 共用措辞） */
function describeAlert(a) {
  const v = a.value;
  switch (a.type) {
    case 'price_above': return `价格 ≥ ${v}`;
    case 'price_below': return `价格 ≤ ${v}`;
    case 'pct_above': return `涨幅 ≥ ${v}%`;
    case 'pct_below': return `跌幅 ≥ ${Math.abs(v)}%（${v}%）`;
    default: return String(a.type);
  }
}

module.exports = { TYPES, shouldFire, evaluateAlerts, normalizeAlert, describeAlert };
