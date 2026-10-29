'use strict';
/**
 * core.js —— 发票保险库三方同源唯一计算权威（面板 / MCP / service 共用）
 *
 * 设计约束（对齐 wenjin 范式）：
 *   - 零 IO、零 Node 内建依赖（require sha256.js 除外），浏览器与 node 同源一致。
 *   - 所有写入侧唯一入口是 normalizeInvoice / normalizeTitle：非法枚举降级不报错、
 *     数值钳制、文本 clip 截断；prev 参数实现部分补丁语义（未传字段继承旧值）。
 *   - id 内容寻址：同一张票（发票号码相同）无论从面板、AI 还是服务写入，id 一致，
 *     cap.kv 覆盖写不分裂——这就是并发「原子性」的实现方式。
 *   - 所有「洞察」（报销透视/保修榜/分类统计）都是确定性纯函数；AI 只是记账员和读账人。
 */

const { sha256Hex } = require('./sha256.js');

// ── 键空间契约（cap.kv）─────────────────────────────────────────────────────

const K = {
  INVOICE: 'piaoxia.invoice.',
  TITLE: 'piaoxia.title.',
  META: 'piaoxia.meta',
};

// ── 字典 ────────────────────────────────────────────────────────────────────

/** 发票种类（内部键 → 展示名）。判定顺序即优先级：先专后普、先细分后一般。 */
const KINDS = {
  dpt_special: '数电专票',
  dpt_common: '数电普票',
  e_special: '电子专票',
  e_common: '电子普票',
  rail: '铁路客票',
  air: '航空行程单',
  toll: '通行费发票',
  taxi: '出租车票',
  other: '其他',
};

const KIND_KEYWORDS = [
  ['dpt_special', ['电子发票（增值税专用发票）', '电子发票(增值税专用发票)']],
  ['dpt_common', ['电子发票（普通发票）', '电子发票(普通发票)']],
  ['e_special', ['增值税电子专用发票']],
  ['e_common', ['增值税电子普通发票']],
  ['toll', ['收费公路通行费', '通行费电子票据']],
  ['rail', ['铁路电子客票', '铁路电子发票', '电子客票（铁路']],
  ['air', ['航空运输电子客票行程单', '航空运输电子客票']],
  ['taxi', ['出租汽车', '出租车发票', '出租车']],
];

/** 报销状态机（内部键 → 展示名） */
const STATUSES = {
  pending: '待报销',
  submitted: '已提交',
  settled: '已到账',
  rejected: '已退回',
  excluded: '不报销',
};

/** 允许的状态转移；同态自返视为 no-op。 */
const TRANSITIONS = {
  pending: ['submitted', 'excluded'],
  submitted: ['settled', 'rejected', 'excluded', 'pending'],
  settled: ['submitted'],
  rejected: ['submitted', 'pending', 'excluded'],
  excluded: ['pending'],
};

/** 用途 */
const PURPOSES = {
  expense: '报销',
  warranty: '保修',
  rights: '维权',
  archive: '存档',
};

/** 分类（内部键 → 展示名）+ 确定性关键词分类器（先后即优先，先具体后宽泛） */
const CATEGORIES = {
  meal: '餐饮',
  transport: '交通',
  hotel: '住宿',
  telecom: '通讯',
  event: '会务培训',
  logistics: '快递物流',
  office: '办公服务',
  purchase: '采购',
  other: '其他',
};

const CATEGORY_KEYWORDS = [
  ['meal', ['餐饮', '饭店', '餐厅', '食品', '小吃', '火锅', '咖啡', '茶饮', '奶茶', '面馆', '烧烤', '快餐', '外卖', '饮食', '面包', '烘焙', '酒楼', '菜馆']],
  ['transport', ['出租', '网约车', '出行', '客运', '铁路', '火车', '高铁', '航空', '机票', '打车', '地铁', '公交', '客运服务', '运输', '交通']],
  ['hotel', ['酒店', '宾馆', '住宿', '旅馆', '民宿', '公寓管理']],
  ['telecom', ['通讯', '通信', '电信', '移动通信', '联通', '网络服务', '宽带']],
  ['event', ['会议', '会务', '会展', '培训', '论坛', '门票']],
  ['logistics', ['快递', '物流', '邮政', '货运', '速运', '运输代理']],
  ['office', ['办公', '文具', '打印', '复印', '耗材', '软件', '信息技术', '技术服务', '咨询', '设计', '开发', '服务费', '推广', '广告']],
  ['purchase', ['百货', '超市', '商场', '电器', '电子', '五金', '建材', '贸易', '商店', '家居', '器械', '设备']],
];

// ── 基础工具 ────────────────────────────────────────────────────────────────

function clip(s, n) {
  if (s === null || s === undefined) return '';
  return String(s).slice(0, n);
}

/** 判重键归一：trim + 去全部空白 + 小写 */
function normName(s) {
  return clip(s, 400).replace(/\s+/g, '').toLowerCase();
}

/** 展示名：保留原写法（首尾去空白） */
function displayName(s) {
  return clip(s, 400).trim();
}

/** 稳定 id：'p' + sha256(seed) 前 12 位（内容寻址幂等） */
function idFor(seed) {
  return 'p' + sha256Hex(String(seed)).slice(0, 12);
}

/** 发票实体 id：有号码用号码（唯一判重键）；手录无号码用内容种子 */
function invoiceId(inv) {
  const num = digitsOnly(inv.number);
  if (num) return idFor('inv|' + num);
  return idFor('inv-manual|' + dateKeyOf(inv.date) + '|' + normName(inv.seller && inv.seller.name) + '|' + num2(inv.total) + '|' + normName(firstItemName(inv)));
}

/** 只留数字（发票号码提取自 PDF 常夹空格/换行） */
function digitsOnly(s) {
  if (s === null || s === undefined) return '';
  const d = String(s).replace(/\D+/g, '');
  return d;
}

function num2(v) {
  const n = Number(v);
  if (!isFinite(n)) return '0.00';
  return (Math.round(n * 100) / 100).toFixed(2);
}

function firstItemName(inv) {
  const items = (inv && Array.isArray(inv.items)) ? inv.items : [];
  const first = items[0];
  return first && first.name ? first.name : '';
}

/** 宽容时间解析：ISO / YYYY-MM-DD HH:mm / YYYY-MM-DD / YYYY年M月D日 / 时间戳。只日期按本地时区。 */
function parseTs(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number' && isFinite(v)) {
    const n = v > 1e12 ? v : v * 1000;
    const d = new Date(n);
    return isNaN(d.getTime()) ? null : d.getTime();
  }
  const s = String(v).trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})日?$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  m = s.match(/^(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})[日T\s](\d{1,2}):(\d{1,2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])).getTime();
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.getTime();
}

/** 本地时区 YYYY-MM-DD */
function dateKeyOf(v) {
  const ts = parseTs(v);
  if (ts === null) return '';
  const d = new Date(ts);
  const p = (x) => String(x).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

/** 本地时区 YYYY-MM */
function monthKeyOf(v) {
  const dk = dateKeyOf(v);
  return dk ? dk.slice(0, 7) : '';
}

function todayKey(nowMs) {
  return dateKeyOf(new Date(nowMs === undefined ? Date.now() : nowMs));
}

function addMonths(dateKey, months) {
  const m = String(dateKey).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const day = d.getDate();
  d.setMonth(d.getMonth() + Number(months || 0));
  if (d.getDate() < day) d.setDate(0); // 月末溢出钳制（1/31 + 1mo → 2/28）
  const p = (x) => String(x).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

function daysBetween(fromKey, toKey) {
  const a = parseTs(fromKey);
  const b = parseTs(toKey);
  if (a === null || b === null) return null;
  return Math.round((b - a) / 86400000);
}

// ── 分类器（确定性，AI 可随后用 update 改）────────────────────────────────

/** 票种 → 分类提示（行程单/客票没有常规销方与品名时，票种本身就是分类） */
const KIND_CATEGORY_HINT = {
  rail: 'transport',
  air: 'transport',
  toll: 'transport',
  taxi: 'transport',
};

function classifyCategory(sellerName, itemNames, kindHint) {
  if (kindHint && KIND_CATEGORY_HINT[kindHint]) {
    const cat = CATEGORIES[KIND_CATEGORY_HINT[kindHint]] ? KIND_CATEGORY_HINT[kindHint] : null;
    if (cat) return cat;
  }
  const hay = normName([sellerName].concat(Array.isArray(itemNames) ? itemNames : []).join('|'));
  if (!hay) return 'other';
  for (const [key, words] of CATEGORY_KEYWORDS) {
    for (const w of words) {
      if (hay.indexOf(normName(w)) !== -1) return key;
    }
  }
  return 'other';
}

// ── normalize：写入侧唯一入口 ───────────────────────────────────────────────

function normParty(raw) {
  const p = (raw && typeof raw === 'object') ? raw : {};
  return {
    name: displayName(p.name),
    taxId: clip(String(p.taxId || '')).replace(/[^0-9A-Za-z]/g, '').toUpperCase().slice(0, 32),
  };
}

function normalizeItems(raw, prev) {
  const arr = Array.isArray(raw) ? raw : (raw === undefined && prev ? prev : []);
  const out = [];
  for (const it of arr.slice(0, 30)) {
    if (!it || typeof it !== 'object') continue;
    const name = displayName(it.name);
    if (!name) continue;
    const item = { name: clip(name, 120) };
    const amount = Number(it.amount);
    if (isFinite(amount) && amount >= 0) item.amount = Math.round(amount * 100) / 100;
    const qty = Number(it.qty);
    if (isFinite(qty) && qty > 0) item.qty = qty;
    out.push(item);
  }
  return out;
}

/**
 * 归一化一张发票。必填：total > 0（没有金额的不成票）。
 * 其余字段宽容降级。prev 传旧实体实现部分补丁。
 */
function normalizeInvoice(raw, prev) {
  const r = (raw && typeof raw === 'object') ? raw : {};
  const p = (prev && typeof prev === 'object') ? prev : {};

  const pick = (v, pv) => (v === undefined ? pv : v);

  const total = roundMoney(pick(r.total, p.total));
  if (total === null || total <= 0 || total > 1e12) {
    throw new Error('价税合计必须是正数（没有金额的不成票）');
  }

  const number = digitsOnly(pick(r.number, p.number)).slice(0, 30);
  const code = digitsOnly(pick(r.code, p.code)).slice(0, 20);

  const kindRaw = pick(r.kind, p.kind);
  const kind = KINDS[kindRaw] ? kindRaw : 'other';

  const statusRaw = pick(r.status, p.status);
  const status = STATUSES[statusRaw] ? statusRaw : 'pending';

  const purposeRaw = pick(r.purpose, p.purpose);
  const purpose = PURPOSES[purposeRaw] ? purposeRaw : 'expense';

  const categoryRaw = pick(r.category, p.category);
  const category = CATEGORIES[categoryRaw] ? categoryRaw : null; // null → 入库前由 classify 兜底

  const date = pick(r.date, p.date);
  const dateKey = dateKeyOf(date);

  const warrantyMonthsRaw = pick(r.warrantyMonths, p.warrantyMonths);
  let warrantyMonths = null;
  if (warrantyMonthsRaw !== null && warrantyMonthsRaw !== undefined && warrantyMonthsRaw !== '') {
    const n = Math.round(Number(warrantyMonthsRaw));
    if (isFinite(n) && n >= 0 && n <= 120) warrantyMonths = n;
  }

  const inv = {
    id: '',
    number,
    code,
    kind,
    title: clip(pick(r.title, p.title), 60),
    date: dateKey,
    buyer: normParty(pick(r.buyer, p.buyer)),
    seller: normParty(pick(r.seller, p.seller)),
    items: normalizeItems(pick(r.items, p.items), p.items),
    amount: roundMoney(pick(r.amount, p.amount)),
    tax: roundMoney(pick(r.tax, p.tax)),
    total: Math.round(total * 100) / 100,
    category,
    purpose,
    status,
    reimburseId: clip(pick(r.reimburseId, p.reimburseId), 40).trim(),
    submittedAt: clip(pick(r.submittedAt, p.submittedAt), 20),
    settledAt: clip(pick(r.settledAt, p.settledAt), 20),
    rejectNote: clip(pick(r.rejectNote, p.rejectNote), 300),
    warrantyMonths,
    source: pick(r.source, p.source) === 'manual' ? 'manual' : 'collect',
    srcPath: clip(pick(r.srcPath, p.srcPath), 500),
    fileName: clip(pick(r.fileName, p.fileName), 200),
    fileSha256: clip(pick(r.fileSha256, p.fileSha256), 64).toLowerCase(),
    archivedPath: clip(pick(r.archivedPath, p.archivedPath), 500),
    note: clip(pick(r.note, p.note), 500),
    createdAt: pick(r.createdAt, p.createdAt) || '',
    updatedAt: '',
  };

  // 分类兜底：没给合法 category 时按票种提示 + 销方+品名确定性分类
  if (!inv.category) {
    inv.category = classifyCategory(inv.seller.name, inv.items.map((x) => x.name), inv.kind);
  }

  // 保修到期派生（date 缺失则留空，补录日期后重算）
  inv.warrantyUntil = (inv.warrantyMonths !== null && inv.date) ? addMonths(inv.date, inv.warrantyMonths) : '';

  inv.id = invoiceId(inv);
  return inv;
}

function roundMoney(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(/[,¥￥\s]/g, ''));
  if (!isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

/** 状态转移校验。返回 { ok, message }；同态视为 no-op ok。 */
function canTransition(from, to) {
  if (!STATUSES[from] || !STATUSES[to]) return { ok: false, message: '未知状态' };
  if (from === to) return { ok: true, message: '状态未变化' };
  if ((TRANSITIONS[from] || []).indexOf(to) !== -1) return { ok: true, message: '' };
  return {
    ok: false,
    message: '不允许 ' + STATUSES[from] + ' → ' + STATUSES[to] + '（允许：' +
      (TRANSITIONS[from] || []).map((s) => STATUSES[s]).join('、') + '）',
  };
}

/** 应用状态流转到实体（返回新实体或抛错；时间戳由调用方注入 nowMs） */
function applyTransition(inv, to, opts) {
  const o = opts || {};
  const gate = canTransition(inv.status, to);
  if (!gate.ok) throw new Error(gate.message);
  const next = Object.assign({}, inv, { updatedAt: o.nowIso || '' });
  if (inv.status === to) return next;
  next.status = to;
  if (to === 'submitted') {
    next.submittedAt = dateKeyOf(o.nowMs || Date.now()) || next.submittedAt;
    if (o.reimburseId !== undefined) next.reimburseId = clip(o.reimburseId, 40).trim();
  }
  if (to === 'settled') {
    next.settledAt = dateKeyOf(o.nowMs || Date.now()) || next.settledAt;
    if (!next.submittedAt) next.submittedAt = next.settledAt; // 直接到账（现金报销）补提交日
  }
  if (to === 'rejected') {
    if (o.rejectNote !== undefined) next.rejectNote = clip(o.rejectNote, 300);
  }
  if (to === 'pending' || to === 'excluded') {
    // 退出报销流：清在途痕迹（到账记录只被 settled→submitted 纠错保留）
    if (to === 'excluded') { next.submittedAt = ''; next.settledAt = ''; }
  }
  return next;
}

// ── 抬头 ────────────────────────────────────────────────────────────────────

function titleId(t) {
  return idFor('title|' + normName(t.name) + '|' + normName(t.taxId));
}

function normalizeTitle(raw, prev) {
  const r = (raw && typeof raw === 'object') ? raw : {};
  const p = (prev && typeof prev === 'object') ? prev : {};
  const pick = (v, pv) => (v === undefined ? pv : v);
  const name = displayName(pick(r.name, p.name));
  if (!name) throw new Error('抬头名称必填');
  const t = {
    id: '',
    name: clip(name, 120),
    taxId: clip(String(pick(r.taxId, p.taxId) || '')).replace(/[^0-9A-Za-z]/g, '').toUpperCase().slice(0, 32),
    bank: clip(pick(r.bank, p.bank), 120),
    account: clip(pick(r.account, p.account), 40).replace(/\s+/g, ''),
    address: clip(pick(r.address, p.address), 200),
    phone: clip(pick(r.phone, p.phone), 30).replace(/\s+/g, ''),
    isDefault: !!pick(r.isDefault, p.isDefault),
    note: clip(pick(r.note, p.note), 200),
    createdAt: pick(r.createdAt, p.createdAt) || '',
    updatedAt: '',
  };
  t.id = titleId(t);
  return t;
}

/** 抬头一键复制文本（开发票时贴给开票员/表单） */
function titleCopyText(t) {
  if (!t) return '';
  const lines = ['名称：' + t.name];
  if (t.taxId) lines.push('税号：' + t.taxId);
  if (t.address) lines.push('地址：' + t.address);
  if (t.phone) lines.push('电话：' + t.phone);
  if (t.bank) lines.push('开户行：' + t.bank);
  if (t.account) lines.push('账号：' + t.account);
  return lines.join('\n');
}

// ── 透视（全部纯派生，零写路径）────────────────────────────────────────────

const MIN_SAMPLE = 5; // 少于该样本数不出占比，防小样本误导

function buildView(invoices, titles, nowMs) {
  const now = nowMs === undefined ? Date.now() : nowMs;
  const today = todayKey(now);
  const thisMonth = today.slice(0, 7);
  const thisYear = today.slice(0, 4);

  const byStatus = {};
  for (const s of Object.keys(STATUSES)) byStatus[s] = { count: 0, total: 0 };
  const byCategory = {};
  const byMonth = {}; // 近 12 个月在下面初始化
  const sellerMap = new Map();
  const reimburseMap = new Map();
  let pendingList = [];
  let warrantyRows = [];

  for (let i = 0; i < 12; i++) {
    const d = new Date(now);
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    const p = (x) => String(x).padStart(2, '0');
    byMonth[d.getFullYear() + '-' + p(d.getMonth() + 1)] = { count: 0, total: 0 };
  }

  let openedThisMonth = { count: 0, total: 0 };
  let settledThisMonth = { count: 0, total: 0 };
  let submittedThisMonth = { count: 0, total: 0 };
  let yearTotal = 0;
  let yearCount = 0;
  let neverFiled = []; // 60 天前开的票仍待报销（遗忘警戒）

  for (const inv of invoices) {
    const st = byStatus[inv.status];
    if (st) { st.count += 1; st.total += inv.total; }

    if (inv.status !== 'excluded') {
      const cat = CATEGORIES[inv.category] ? inv.category : 'other';
      if (!byCategory[cat]) byCategory[cat] = { count: 0, total: 0 };
      byCategory[cat].count += 1;
      byCategory[cat].total += inv.total;

      const mk = inv.date ? inv.date.slice(0, 7) : '';
      if (byMonth[mk]) { byMonth[mk].count += 1; byMonth[mk].total += inv.total; }
      if (inv.date && inv.date.slice(0, 4) === thisYear) { yearTotal += inv.total; yearCount += 1; }
      if (mk === thisMonth) { openedThisMonth.count += 1; openedThisMonth.total += inv.total; }
    }

    if (inv.status === 'settled' && inv.settledAt && inv.settledAt.slice(0, 7) === thisMonth) {
      settledThisMonth.count += 1;
      settledThisMonth.total += inv.total;
    }
    if (inv.status === 'submitted' && inv.submittedAt && inv.submittedAt.slice(0, 7) === thisMonth) {
      submittedThisMonth.count += 1;
      submittedThisMonth.total += inv.total;
    }

    if (inv.status === 'pending') {
      pendingList.push(inv);
      if (inv.date && daysBetween(inv.date, today) >= 60) neverFiled.push(inv);
    }

    const sellerKey = normName(inv.seller.name);
    if (sellerKey) {
      if (!sellerMap.has(sellerKey)) {
        sellerMap.set(sellerKey, { name: displayName(inv.seller.name), count: 0, total: 0 });
      }
      const s = sellerMap.get(sellerKey);
      s.count += 1;
      s.total += inv.total;
    }

    if (inv.reimburseId) {
      if (!reimburseMap.has(inv.reimburseId)) {
        reimburseMap.set(inv.reimburseId, { id: inv.reimburseId, count: 0, total: 0, statuses: {}, latest: '' });
      }
      const g = reimburseMap.get(inv.reimburseId);
      g.count += 1;
      g.total += inv.total;
      g.statuses[inv.status] = (g.statuses[inv.status] || 0) + 1;
      const activity = [inv.settledAt, inv.submittedAt, inv.date].filter(Boolean).sort().pop() || '';
      if (activity > g.latest) g.latest = activity;
    }

    if (inv.warrantyUntil) {
      warrantyRows.push(inv);
    }
  }

  pendingList.sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.id).localeCompare(String(a.id)));
  warrantyRows.sort((a, b) => String(a.warrantyUntil).localeCompare(String(b.warrantyUntil)));
  const warrantyUpcoming = warrantyRows
    .map((inv) => {
      const d = daysBetween(today, inv.warrantyUntil);
      return { inv, daysLeft: d };
    })
    .filter((x) => x.daysLeft !== null && x.daysLeft <= 90)
    .slice(0, 20);

  const sellers = Array.from(sellerMap.values()).sort((a, b) => b.total - a.total).slice(0, 10);
  const reimburseGroups = Array.from(reimburseMap.values()).sort((a, b) => String(b.latest).localeCompare(String(a.latest)));

  const catRows = Object.keys(CATEGORIES)
    .filter((k) => byCategory[k])
    .map((k) => ({ key: k, label: CATEGORIES[k], count: byCategory[k].count, total: byCategory[k].total }))
    .sort((a, b) => b.total - a.total);

  return {
    today,
    thisMonth,
    counts: {
      all: invoices.length,
      byStatus: mapTotal(byStatus),
    },
    pending: {
      count: byStatus.pending.count,
      total: byStatus.pending.total,
      list: pendingList.slice(0, 100),
      stale: neverFiled.sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(0, 10),
    },
    inFlight: { count: byStatus.submitted.count, total: byStatus.submitted.total },
    month: {
      opened: openedThisMonth,
      settled: settledThisMonth,
      submitted: submittedThisMonth,
    },
    year: { key: thisYear, total: yearTotal, count: yearCount },
    byCategory: catRows,
    byMonth: Object.keys(byMonth).sort().map((k) => ({ key: k, count: byMonth[k].count, total: byMonth[k].total })),
    sellers,
    reimburseGroups,
    warrantyUpcoming,
    minSample: MIN_SAMPLE,
  };
}

function mapTotal(m) {
  const out = {};
  for (const k of Object.keys(m)) out[k] = { count: m[k].count, total: Math.round(m[k].total * 100) / 100 };
  return out;
}

// ── CSV（Excel 中文不乱码：BOM 前缀由导出方决定，这里给出带 BOM 的文本）────

const CSV_COLUMNS = [
  'number', 'code', 'kind', 'date', 'seller', 'sellerTaxId', 'buyer', 'total', 'amount', 'tax',
  'category', 'purpose', 'status', 'reimburseId', 'submittedAt', 'settledAt', 'warrantyMonths', 'warrantyUntil',
  'fileName', 'note',
];

function csvEscape(v) {
  const s = v === null || v === undefined ? '' : String(v);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function invoiceRow(inv) {
  return [
    inv.number, inv.code, KINDS[inv.kind] || inv.kind, inv.date,
    inv.seller.name, inv.seller.taxId, inv.buyer.name,
    num2(inv.total), inv.amount === null ? '' : num2(inv.amount), inv.tax === null ? '' : num2(inv.tax),
    CATEGORIES[inv.category] || inv.category, PURPOSES[inv.purpose] || inv.purpose, STATUSES[inv.status] || inv.status,
    inv.reimburseId, inv.submittedAt, inv.settledAt,
    inv.warrantyMonths === null ? '' : String(inv.warrantyMonths), inv.warrantyUntil,
    inv.fileName, inv.note,
  ].map(csvEscape).join(',');
}

function exportCSV(invoices) {
  return '\uFEFF' + CSV_COLUMNS.join(',') + '\n' + invoices.map(invoiceRow).join('\n') + '\n';
}

/** 手写 CSV 解析（引号内逗号/换行/双写转义），返回 rows（含表头） */
function parseCSV(text) {
  const s = String(text).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rows = [];
  let row = [];
  let cell = '';
  let inQ = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQ) {
      if (c === '"') {
        if (s[i + 1] === '"') { cell += '"'; i++; } else { inQ = false; }
      } else {
        cell += c;
      }
    } else if (c === '"') {
      inQ = true;
    } else if (c === ',') {
      row.push(cell); cell = '';
    } else if (c === '\n') {
      row.push(cell); rows.push(row); row = []; cell = '';
    } else {
      cell += c;
    }
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/** CSV → 发票草稿数组（判重跳过由调用方做；未知枚举降级计入 warns 不静默吞） */
function importCSV(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) return { drafts: [], warns: ['CSV 为空或只有表头'] };
  const header = rows[0].map((h) => h.trim());
  const idx = {};
  CSV_COLUMNS.forEach((c) => { idx[c] = header.indexOf(c); });
  const drafts = [];
  const warns = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (r.length === 1 && !r[0].trim()) continue;
    const get = (c) => (idx[c] >= 0 ? r[idx[c]] : '');
    const rowWarns = [];
    const kindKey = labelToKey(KINDS, get('kind'));
    if (get('kind') && !kindKey) rowWarns.push('第' + (i + 1) + '行未知种类「' + get('kind') + '」按其他处理');
    const statusKey = labelToKey(STATUSES, get('status')) || 'pending';
    if (get('status') && !labelToKey(STATUSES, get('status'))) rowWarns.push('第' + (i + 1) + '行未知状态「' + get('status') + '」按待报销处理');
    const catKey = labelToKey(CATEGORIES, get('category'));
    if (get('category') && !catKey) rowWarns.push('第' + (i + 1) + '行未知分类「' + get('category') + '」按其他处理');
    const purposeKey = labelToKey(PURPOSES, get('purpose')) || 'expense';
    if (get('purpose') && !labelToKey(PURPOSES, get('purpose'))) rowWarns.push('第' + (i + 1) + '行未知用途「' + get('purpose') + '」按报销处理');
    try {
      const draft = normalizeInvoice({
        number: get('number'),
        code: get('code'),
        kind: kindKey || 'other',
        date: get('date'),
        seller: { name: get('seller'), taxId: get('sellerTaxId') },
        buyer: { name: get('buyer') },
        total: Number(String(get('total')).replace(/[,¥￥\s]/g, '')) || 0,
        amount: Number(String(get('amount')).replace(/[,¥￥\s]/g, '')) || null,
        tax: Number(String(get('tax')).replace(/[,¥￥\s]/g, '')) || null,
        category: catKey || undefined,
        purpose: purposeKey,
        status: statusKey,
        reimburseId: get('reimburseId'),
        submittedAt: get('submittedAt'),
        settledAt: get('settledAt'),
        warrantyMonths: get('warrantyMonths') === '' ? null : Number(get('warrantyMonths')),
        fileName: get('fileName'),
        note: get('note'),
        source: 'manual',
      }, null);
      drafts.push(draft);
    } catch (e) {
      warns.push('第' + (i + 1) + '行跳过：' + e.message);
    }
    warns.push(...rowWarns);
  }
  return { drafts, warns };
}

function labelToKey(dict, label) {
  const l = clip(label, 40).trim();
  if (!l) return null;
  if (dict[l]) return l;
  for (const k of Object.keys(dict)) {
    if (dict[k] === l) return k;
  }
  return null;
}

// ── module ──────────────────────────────────────────────────────────────────

module.exports = {
  K, KINDS, KIND_KEYWORDS, STATUSES, TRANSITIONS, PURPOSES, CATEGORIES, CATEGORY_KEYWORDS,
  clip, normName, displayName, idFor, invoiceId, digitsOnly, num2, firstItemName,
  parseTs, dateKeyOf, monthKeyOf, todayKey, addMonths, daysBetween,
  classifyCategory, normalizeInvoice, normalizeItems, canTransition, applyTransition,
  normalizeTitle, titleId, titleCopyText,
  buildView, MIN_SAMPLE,
  CSV_COLUMNS, csvEscape, invoiceRow, exportCSV, parseCSV, importCSV, labelToKey,
};
