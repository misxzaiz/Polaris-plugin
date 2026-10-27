'use strict';
/**
 * ledger-core.js —— 口袋账本共享核心（单一权威，零依赖）
 *
 * 被 MCP server（CJS require）与面板（esbuild 打包进 bundle）共用：
 * 键空间、账单归一化、日键追加（幂等去重）、月度统计/预算、CSV 导出。
 * 所有"计算"必须放这里，两侧只做 IO（cap.kv 读写），防止口径漂移。
 *
 * 数据契约（cap.kv `ledger.*` 键空间，权威描述见 README）：
 *   ledger.day.<YYYY-MM-DD>  → Bill[]（按设备本地时区归属日期；
 *                              追加=读改写+按 id 去重，写重试幂等，
 *                              双端同日并发写入的丢失窗口为毫秒级，已文档化）
 *   ledger.settings          → Settings（分类/预算/币种）
 */

// ── 键空间 ─────────────────────────────────────────────────────────────────
const K = {
  day: (dateStr) => `ledger.day.${dateStr}`,          // YYYY-MM-DD
  dayPrefix: 'ledger.day.',
  dayPrefixOf: (month) => `ledger.day.${month}-`,     // YYYY-MM
  settings: 'ledger.settings',
  /** 附件独立键空间：ledger.att.<id> → { id, name, mime, size, data(base64), ts }
   *  账单只存 attachmentId 引用，查询列表不拉 base64（默认不查询图片，点开才取）。 */
  att: (id) => `ledger.att.${id}`,
  attPrefix: 'ledger.att.',
};

const DEFAULT_CATEGORIES = ['餐饮', '交通', '购物', '居住', '娱乐', '医疗', '学习', '人情', '其他'];
const INCOME_CATEGORIES = ['工资', '理财', '红包', '退款', '其他收入'];
const DEFAULT_SETTINGS = {
  schemaVersion: 2,
  currency: 'CNY',
  currencySymbol: '¥',
  categories: [...DEFAULT_CATEGORIES],
  incomeCategories: [...INCOME_CATEGORIES],
  /** 每类月预算（仅支出类），如 { 餐饮: 2000 }；缺省该类不控预算 */
  budgets: {},
  /** 月度总预算（支出合计），null = 不启用 */
  monthlyTotalBudget: null,
  /** 不参与汇总的分类（如工资）：账单照记、明细照见，但统计/结余/排行/逐日排除。
   *  语义为"隐藏出汇总"，并非删除账单。 */
  excludeFromStats: [],
};

/** 附件原始字节上限（单张 ≤ 2MB；base64 后约 2.7MB，避免 IPC/sqlite 膨胀） */
const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;

/** 分类是否被排除出汇总（settings.excludeFromStats） */
function isExcludedFromStats(category, settings) {
  const ex = (settings && settings.excludeFromStats) || [];
  return Array.isArray(ex) && ex.includes(category);
}

// ── 日期（本地时区）────────────────────────────────────────────────────────
const pad2 = (n) => String(n).padStart(2, '0');

/** epoch ms → 本地日期 YYYY-MM-DD */
function dayKeyOf(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** 'YYYY-MM-DD' | Date | epoch → 'YYYY-MM' */
function monthOf(input) {
  if (typeof input === 'string') return input.slice(0, 7);
  const d = typeof input === 'number' ? new Date(input) : input;
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

/** 本月/上月的 'YYYY-MM'（基于 given epoch 或当前时间） */
function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function currentMonth(now) {
  return monthOf(typeof now === 'number' ? now : Date.now());
}

// ── 账单归一化 ─────────────────────────────────────────────────────────────
function makeId(now) {
  const t = typeof now === 'number' ? now : Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return 'b' + t.toString(36) + rand;
}

/**
 * 归一化一笔账单；非法返回 { error }，合法返回 { bill }。
 * raw: { id?, ts?, type?, amount, category?, note?, source?, attachmentId? }
 * validCategories: 校验用分类集合（settings.categories + incomeCategories + 透传自定义）
 */
function normalizeBill(raw, validCategories) {
  if (!raw || typeof raw !== 'object') return { error: '缺少账单数据' };
  const amount = Number(raw.amount);
  if (!Number.isFinite(amount) || amount <= 0) return { error: `金额必须是正数（收到：${raw.amount}）` };
  if (amount > 1e9) return { error: '金额过大，疑似输入错误' };
  const type = raw.type === 'income' ? 'income' : 'expense';
  const ts = Number.isFinite(Number(raw.ts)) && Number(raw.ts) > 0 ? Number(raw.ts) : Date.now();
  const bill = {
    id: typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 40) : makeId(ts),
    ts,
    type,
    amount: Math.round(amount * 100) / 100,
    category: String(raw.category || (type === 'income' ? '其他收入' : '其他')).slice(0, 20),
    note: String(raw.note || '').slice(0, 200),
    source: raw.source === 'panel' || raw.source === 'ai' || raw.source === 'import' ? raw.source : 'ai',
    /** 附件引用（ledger.att.<id>）；未附图为 undefined，避免写入空串。 */
    attachmentId: typeof raw.attachmentId === 'string' && raw.attachmentId ? raw.attachmentId.slice(0, 60) : undefined,
  };
  if (Array.isArray(validCategories) && validCategories.length && !validCategories.includes(bill.category)) {
    return { error: `未知分类「${bill.category}」，可用：${validCategories.join('/')}（可先在设置里添加自定义分类）` };
  }
  return { bill };
}

/** 追加账单到日数组：按 id 去重（写重试/双端并发幂等），按 ts 排序 */
function appendBills(existing, bills) {
  const map = new Map();
  for (const b of existing || []) {
    if (b && typeof b === 'object' && typeof b.id === 'string') map.set(b.id, b);
  }
  for (const b of bills) map.set(b.id, b);
  return [...map.values()].sort((a, b) => a.ts - b.ts);
}

/** 从日数组删除一笔；返回 { arr, removed } */
function removeBill(existing, id) {
  const arr = (existing || []).filter((b) => b && b.id !== id);
  return { arr, removed: arr.length !== (existing || []).length };
}

// ── 查询与统计 ─────────────────────────────────────────────────────────────
function filterBills(bills, { category, type, keyword, minAmount, maxAmount } = {}) {
  return (bills || []).filter((b) => {
    if (category && b.category !== category) return false;
    if (type && b.type !== type) return false;
    if (minAmount !== undefined && b.amount < Number(minAmount)) return false;
    if (maxAmount !== undefined && b.amount > Number(maxAmount)) return false;
    if (keyword) {
      const kw = String(keyword).toLowerCase();
      if (!(b.note || '').toLowerCase().includes(kw) && !b.category.toLowerCase().includes(kw)) return false;
    }
    return true;
  });
}

/**
 * 月度统计。
 * @param bills 该月全部账单
 * @param settings 口袋账本设置（预算/币种/排除汇总分类）
 * @param month 'YYYY-MM'
 *
 * excludeFromStats（如工资）语义：账单照记、明细照见，但不参与收入/支出/结余/排行/逐日。
 * byCategory 仍列出该类（带 excluded:true 标记），count 仍为全月真实笔数。
 */
function computeStats(bills, settings, month) {
  const exclude = (settings && settings.excludeFromStats) || [];
  let income = 0;
  let expense = 0;
  let excludedSum = 0;
  const byCategoryMap = new Map();
  const byDayMap = new Map();
  for (const b of bills || []) {
    const isExcluded = Array.isArray(exclude) && exclude.includes(b.category);
    if (isExcluded) {
      excludedSum += b.amount;
    } else if (b.type === 'income') {
      income += b.amount;
    } else {
      expense += b.amount;
    }
    const c = byCategoryMap.get(b.category) || { category: b.category, type: b.type, sum: 0, count: 0, excluded: isExcluded };
    c.sum += b.amount;
    c.count += 1;
    if (!isExcluded) {
      if (b.type === 'income') c.incomeSum = (c.incomeSum || 0) + b.amount;
      else c.expenseSum = (c.expenseSum || 0) + b.amount;
    }
    byCategoryMap.set(b.category, c);
    if (!isExcluded && b.type === 'expense') {
      const day = dayKeyOf(b.ts);
      byDayMap.set(day, (byDayMap.get(day) || 0) + b.amount);
    }
  }
  const round2 = (n) => Math.round(n * 100) / 100;
  const budgets = (settings && settings.budgets) || {};
  const totalBudget = settings && settings.monthlyTotalBudget != null ? Number(settings.monthlyTotalBudget) : null;

  const byCategory = [...byCategoryMap.values()]
    .map((c) => ({
      ...c,
      sum: round2(c.sum),
      incomeSum: c.incomeSum != null ? round2(c.incomeSum) : undefined,
      expenseSum: c.expenseSum != null ? round2(c.expenseSum) : undefined,
      budget: budgets[c.category] != null ? Number(budgets[c.category]) : null,
    }))
    .sort((a, b) => b.sum - a.sum);

  // 按自然日补齐整月序列（供图表面板直接渲染）
  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const byDay = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${month}-${pad2(d)}`;
    byDay.push({ date: key, expense: round2(byDayMap.get(key) || 0) });
  }

  const usedCount = {};
  for (const c of byCategory) {
    if (c.budget != null && c.budget > 0) {
      usedCount[c.category] = c.sum / c.budget;
    }
  }
  return {
    month,
    income: round2(income),
    expense: round2(expense),
    balance: round2(income - expense),
    count: (bills || []).length,
    /** 被排除分类的合计（如工资），供面板展示"另有 X 不计入" */
    excludedSum: round2(excludedSum),
    byCategory,
    byDay,
    totalBudget,
    totalBudgetUsed: totalBudget && totalBudget > 0 ? round2(expense / totalBudget) : null,
    categoryBudgetUsed: usedCount,
    currencySymbol: (settings && settings.currencySymbol) || '¥',
  };
}

/** 预算提示文案（入账后给 AI/面板的即时反馈）；无预算返回空串 */
function budgetHint(stats) {
  const lines = [];
  if (stats.totalBudgetUsed != null) {
    const pct = Math.round(stats.totalBudgetUsed * 100);
    if (pct >= 100) lines.push(`⚠️ 本月总预算已超支（${pct}%，支出 ${stats.expense} / 预算 ${stats.totalBudget}）`);
    else if (pct >= 90) lines.push(`本月总预算已用 ${pct}%（支出 ${stats.expense} / 预算 ${stats.totalBudget}），注意控制`);
  }
  return lines.join('；');
}

// ── 导出 ───────────────────────────────────────────────────────────────────
function toCsv(bills, symbol) {
  const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const head = '日期时间,类型,分类,金额(' + (symbol || '¥') + '),备注,来源,ID';
  const rows = (bills || [])
    .slice()
    .sort((a, b) => a.ts - b.ts)
    .map((b) => [
      new Date(b.ts).toLocaleString('zh-CN', { hour12: false }),
      b.type === 'income' ? '收入' : '支出',
      b.category,
      b.amount.toFixed(2),
      b.note,
      b.source || '',
      b.id,
    ].map(esc).join(','));
  return [head, ...rows].join('\n');
}

function fmtMoney(n, symbol) {
  return `${symbol || '¥'}${(Math.round(n * 100) / 100).toFixed(2)}`;
}

// ── 附件 ───────────────────────────────────────────────────────────────────
/**
 * 归一化一份附件元数据（不含 base64 主体，主体单独随 data 传入）。
 * raw: { id?, name?, mime?, size?, ts? }
 * 返回 { error } 或 { att }；att 不含 data，实际数据由调用方按 K.att(id) 存。
 */
function normalizeAttachment(raw) {
  if (!raw || typeof raw !== 'object') return { error: '缺少附件数据' };
  const id = typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 60) : makeId(Date.now());
  const size = Number(raw.size);
  if (!Number.isFinite(size) || size <= 0) return { error: '附件大小不合法' };
  if (size > MAX_ATTACHMENT_BYTES) {
    return { error: `附件过大（${Math.round(size / 1024)}KB），单张上限 ${Math.round(MAX_ATTACHMENT_BYTES / 1024)}KB` };
  }
  const name = String(raw.name || 'attachment').slice(0, 120);
  const mime = String(raw.mime || (name.toLowerCase().endsWith('.png') ? 'image/png' : 'application/octet-stream')).slice(0, 80);
  return {
    att: {
      id,
      name,
      mime,
      size: Math.round(size),
      ts: Number.isFinite(Number(raw.ts)) && Number(raw.ts) > 0 ? Number(raw.ts) : Date.now(),
    },
  };
}

/** 附件是否图片（用于面板决定 <img> 还是下载链接） */
function isImageMime(mime) {
  return /^image\//.test(String(mime || ''));
}

module.exports = {
  K, DEFAULT_CATEGORIES, INCOME_CATEGORIES, DEFAULT_SETTINGS, MAX_ATTACHMENT_BYTES,
  dayKeyOf, monthOf, shiftMonth, currentMonth,
  makeId, normalizeBill, appendBills, removeBill,
  filterBills, computeStats, budgetHint, toCsv, fmtMoney,
  isExcludedFromStats, normalizeAttachment, isImageMime,
};
