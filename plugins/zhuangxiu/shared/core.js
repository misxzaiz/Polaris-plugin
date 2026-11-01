'use strict';
/**
 * 装修台账 shared core —— 纯函数单一权威（面板 / MCP 双方同源）
 *
 * 只做：项目/科目/供应商/节点/支出五类数据的规范化（唯一写入口径）、
 * 预算执行对比与红黄标色、增项口径、常见漏项检查、节点红黄榜、
 * 对账小结生成、科目按名解析。不做任何 IO（cap.kv 由调用方持有）、
 * 不做造价咨询与合同法律建议（对账结果用于家庭自查）。
 *
 * 键空间契约（权威表见 README）：
 *   zhuangxiu.project   单项目对象（v1 单项目）
 *   zhuangxiu.cat.<id>  科目（isExtra=true 即增项科目）
 *   zhuangxiu.exp.<id>  支出
 *   zhuangxiu.ven.<id>  供应商
 *   zhuangxiu.mile.<id> 工期节点
 *
 * 增项口径（唯一）：科目 isExtra=true ⇒ 其全部支出计入增项合计。
 * 标色口径（唯一）：spent>budget 红；spent≥90%·budget 黄；budget 未定灰；其余绿。
 * 节点口径（唯一）：过期未完红；3 天内到期黄；已完成绿。
 */

const DAY_MS = 86400000;
const MAX_AMOUNT = 1e9;

// ── 日期/金额工具（L=本地分量；月份一律 1 起）─────────────────────────────────
function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function parseDayKey(s) {
  if (typeof s !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12 || d < 1) return null;
  const dim = new Date(y, mo, 0).getDate();
  if (d > dim) return null;
  return new Date(y, mo - 1, d).getTime();
}
/** date(YYYY-MM-DD)+time(HH:MM) → 本地毫秒；time 缺省当天 12:00（避免零点时区歧义） */
function dayMinTs(date, minutes) {
  const base = parseDayKey(date);
  if (base === null) return null;
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1439) return null;
  return base + minutes * 60000;
}
function parseTimeHM(s) {
  if (s === undefined || s === null || s === '') return 720; // 缺省 12:00
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s).trim());
  if (!m) return null;
  const h = +m[1], mi = +m[2];
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}
function fmtTime(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function fmtDT(ts) { return `${dayKey(ts)} ${fmtTime(ts)}`; }
function fmtMoney(n) {
  const v = Math.round(n * 100) / 100;
  const [int, dec] = String(v).split('.');
  const s = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return dec ? `${s}.${dec}` : s;
}
function round2(n) { return Math.round(n * 100) / 100; }
function clip(s, n) {
  if (s === undefined || s === null) return '';
  return String(s).trim().slice(0, n);
}
/** 幂等 id：仅接受可见 ASCII 安全字符，防注入与误用 */
function clipId(s) {
  const v = clip(s, 64);
  return /^[\x21-\x7e]+$/.test(v) ? v : '';
}
function id4(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

// ── 科目组与标准模板（模板内嵌「反漏项」清单，来自装修漏项坑证据）─────────────
const GROUPS = ['前期', '拆改', '水电', '泥瓦', '木工', '油漆', '主材', '家具家电', '软装', '其他'];

/** 标准科目模板（25 项，budget 留空待用户按报价单录入） */
const TEMPLATE = [
  { name: '设计费', group: '前期' },
  { name: '监理费', group: '前期' },
  { name: '物业押金与管理费', group: '前期' },
  { name: '拆除改造', group: '拆改' },
  { name: '垃圾清运', group: '拆改' },
  { name: '包立管', group: '拆改' },
  { name: '水电改造', group: '水电' },
  { name: '开关插座面板', group: '水电' },
  { name: '弱电网络布线', group: '水电' },
  { name: '瓷砖', group: '泥瓦' },
  { name: '瓦工人工', group: '泥瓦' },
  { name: '防水', group: '泥瓦' },
  { name: '过门石挡水条', group: '泥瓦' },
  { name: '美缝', group: '泥瓦' },
  { name: '吊顶', group: '木工' },
  { name: '定制柜体', group: '木工' },
  { name: '木门门套窗套', group: '木工' },
  { name: '墙面基层处理', group: '油漆' },
  { name: '乳胶漆', group: '油漆' },
  { name: '壁纸壁布', group: '油漆' },
  { name: '地板', group: '主材' },
  { name: '卫浴洁具', group: '主材' },
  { name: '橱柜', group: '主材' },
  { name: '灯具', group: '主材' },
  { name: '家具', group: '家具家电' },
  { name: '家电', group: '家具家电' },
  { name: '窗帘布艺', group: '软装' },
  { name: '软装饰品', group: '软装' },
  { name: '开荒保洁', group: '其他' },
  { name: '其他杂项', group: '其他' },
];

/** 常见漏项检查表（装修公司报价单最爱漏的刚需项，漏了就是后期的「增项」） */
const COMMON_MISS = ['垃圾清运', '包立管', '防水', '过门石挡水条', '美缝', '物业押金与管理费', '开荒保洁'];

// ── 项目 ──────────────────────────────────────────────────────────────────────
/** @returns {{project?: object, error?: string}} */
function normalizeProject(input, existing) {
  const now = Date.now();
  const name = clip(input.name !== undefined ? input.name : (existing && existing.name) || '', 40);
  if (!name) return { error: '项目名称不能为空' };
  let totalBudget;
  if (input.totalBudget !== undefined) {
    if (input.totalBudget === null || input.totalBudget === '') totalBudget = undefined;
    else {
      const n = Number(input.totalBudget);
      if (!Number.isFinite(n) || n < 0 || n > MAX_AMOUNT) return { error: `总预算需在 0-${fmtMoney(MAX_AMOUNT)} 元之间` };
      totalBudget = round2(n);
    }
  } else totalBudget = existing ? existing.totalBudget : undefined;
  const status = ['planning', 'active', 'done'].includes(input.status) ? input.status
    : (existing && existing.status) || 'active';
  let startDate;
  if (input.startDate !== undefined) {
    if (input.startDate === null || input.startDate === '') startDate = undefined;
    else if (parseDayKey(input.startDate) === null) return { error: `开始日期 ${JSON.stringify(input.startDate)} 无法识别（需 YYYY-MM-DD）` };
    else startDate = input.startDate;
  } else startDate = existing ? existing.startDate : undefined;
  return {
    project: {
      id: (existing && existing.id) || id4('p'),
      name,
      house: input.house !== undefined ? clip(input.house, 60) : (existing && existing.house) || '',
      totalBudget,
      status,
      startDate,
      createdAt: (existing && existing.createdAt) || now,
      updatedAt: now,
    },
  };
}

// ── 科目 ──────────────────────────────────────────────────────────────────────
/** @returns {{cat?: object, error?: string}} */
function normalizeCategory(input, existing) {
  const now = Date.now();
  const name = clip(input.name !== undefined ? input.name : (existing && existing.name) || '', 40);
  if (!name) return { error: '科目名称不能为空' };
  let budget = existing ? existing.budget : undefined;
  if (input.budget !== undefined) {
    if (input.budget === null || input.budget === '') budget = undefined;
    else {
      const n = Number(input.budget);
      if (!Number.isFinite(n) || n < 0 || n > MAX_AMOUNT) return { error: `科目预算需在 0-${fmtMoney(MAX_AMOUNT)} 元之间` };
      budget = round2(n);
    }
  }
  const group = input.group !== undefined ? clip(input.group, 10) : (existing && existing.group) || '其他';
  if (!GROUPS.includes(group)) return { error: `科目分组须为 ${GROUPS.join('/')} 之一` };
  const isExtra = input.isExtra !== undefined ? !!input.isExtra : !!(existing && existing.isExtra);
  if (isExtra && existing && !existing.isExtra) return { error: '普通科目不能改为增项科目（增项科目只能新建）' };
  const order = Number.isFinite(+input.order) ? +input.order : (existing && existing.order) || 999;
  return {
    cat: {
      id: (existing && existing.id) || id4('c'),
      name, group, budget, isExtra, order,
      note: input.note !== undefined ? clip(input.note, 100) : (existing && existing.note) || '',
      createdAt: (existing && existing.createdAt) || now,
      updatedAt: now,
    },
  };
}

/** 科目按名解析：先精确后包含；包含命中多个则返回候选（拒绝歧义，不猜） */
function resolveCatName(name, cats) {
  const q = clip(name, 40);
  if (!q) return { error: '需提供科目名称（categoryName）或科目 id（catId）' };
  const exact = cats.filter((c) => c.name === q);
  if (exact.length === 1) return { cat: exact[0] };
  if (exact.length > 1) return { error: `科目名称「${q}」重复（请用 catId 指定或先合并科目）` };
  const part = cats.filter((c) => c.name.includes(q) || q.includes(c.name));
  if (part.length === 1) return { cat: part[0] };
  if (part.length > 1) return { error: `科目「${q}」有多个候选：${part.map((c) => c.name).join('、')}——请用全名或 catId` };
  return { error: `预算单里没有「${q}」科目。若这是报价单外的新增项目（增项），先 zx_category action=add 并 isExtra:true 建科目，或本工具直接 asExtra:true` };
}

// ── 供应商 / 节点 ─────────────────────────────────────────────────────────────
/** @returns {{vendor?: object, error?: string}} */
function normalizeVendor(input, existing) {
  const now = Date.now();
  const name = clip(input.name !== undefined ? input.name : (existing && existing.name) || '', 40);
  if (!name) return { error: '供应商名称不能为空' };
  let contractAmount = existing ? existing.contractAmount : undefined;
  if (input.contractAmount !== undefined) {
    if (input.contractAmount === null || input.contractAmount === '') contractAmount = undefined;
    else {
      const n = Number(input.contractAmount);
      if (!Number.isFinite(n) || n < 0 || n > MAX_AMOUNT) return { error: `合同额需在 0-${fmtMoney(MAX_AMOUNT)} 元之间` };
      contractAmount = round2(n);
    }
  }
  return {
    vendor: {
      id: (existing && existing.id) || id4('v'),
      name,
      role: input.role !== undefined ? clip(input.role, 30) : (existing && existing.role) || '',
      phone: input.phone !== undefined ? clip(input.phone, 30) : (existing && existing.phone) || '',
      contractAmount,
      note: input.note !== undefined ? clip(input.note, 200) : (existing && existing.note) || '',
      createdAt: (existing && existing.createdAt) || now,
      updatedAt: now,
    },
  };
}

/** @returns {{mile?: object, error?: string}} */
function normalizeMilestone(input, existing) {
  const now = Date.now();
  const title = clip(input.title !== undefined ? input.title : (existing && existing.title) || '', 60);
  if (!title) return { error: '节点标题不能为空' };
  const date = input.date !== undefined ? input.date : (existing && existing.date);
  if (parseDayKey(date) === null) return { error: `节点日期 ${JSON.stringify(date)} 无法识别（需 YYYY-MM-DD）` };
  const done = input.done !== undefined ? !!input.done : !!(existing && existing.done);
  return {
    mile: {
      id: (existing && existing.id) || id4('m'),
      title, date, done,
      note: input.note !== undefined ? clip(input.note, 200) : (existing && existing.note) || '',
      createdAt: (existing && existing.createdAt) || now,
      updatedAt: now,
    },
  };
}

/** 节点红黄榜口径：过期未完红；3 天内黄；已完成绿 */
function milestoneLevel(mile, now) {
  if (mile.done) return { level: 'green', daysLeft: null };
  const t = parseDayKey(mile.date);
  if (t === null) return { level: 'gray', daysLeft: null };
  const today = parseDayKey(dayKey(now === undefined ? Date.now() : now));
  const daysLeft = Math.round((t - today) / DAY_MS);
  if (daysLeft < 0) return { level: 'red', daysLeft };
  if (daysLeft <= 3) return { level: 'yellow', daysLeft };
  return { level: 'green', daysLeft };
}

// ── 支出 ──────────────────────────────────────────────────────────────────────
/** @returns {{expense?: object, error?: string}} */
function normalizeExpense(input, existing) {
  const now = Date.now();
  const catId = clip(input.catId !== undefined ? input.catId : (existing && existing.catId) || '', 64);
  if (!catId) return { error: '支出必须归属一个科目（catId）' };
  let amount = existing ? existing.amount : undefined;
  if (input.amount !== undefined) {
    const n = Number(input.amount);
    if (!Number.isFinite(n) || n <= 0 || n > MAX_AMOUNT) return { error: `金额需在 0 与 ${fmtMoney(MAX_AMOUNT)} 元之间（不含 0）` };
    amount = round2(n);
  }
  if (!Number.isFinite(amount)) return { error: '金额缺失或非法' };
  let ts = existing ? existing.ts : undefined;
  if (input.ts !== undefined && (input.date === undefined && input.time === undefined)) {
    const n = Number(input.ts);
    if (!Number.isFinite(n) || n <= 0) return { error: 'ts 需为毫秒时间戳' };
    ts = n;
  } else if (input.date !== undefined || input.time !== undefined || !existing) {
    const date = input.date !== undefined ? input.date : (existing ? dayKeyOfTs(existing.ts) : dayKey(now));
    const minutes = parseTimeHM(input.time !== undefined ? input.time : (existing ? fmtTime(existing.ts) : undefined));
    if (parseDayKey(date) === null) return { error: `日期 ${JSON.stringify(date)} 无法识别（需 YYYY-MM-DD）` };
    if (minutes === null) return { error: `时间 ${JSON.stringify(input.time)} 无法识别（需 HH:MM）` };
    const t = dayMinTs(date, minutes);
    if (t === null) return { error: '日期或时间非法' };
    ts = t;
  }
  if (!Number.isFinite(ts)) return { error: '时间缺失或非法' };
  return {
    expense: {
      // 幂等契约：调用方传 id 即覆盖同 id 记录（AI 重试不双写）；否则沿用旧 id 或新造
      id: clipId(input.id) || (existing && existing.id) || id4('e'),
      catId,
      amount,
      ts,
      vendorId: input.vendorId !== undefined ? (input.vendorId ? clip(input.vendorId, 64) : '') : ((existing && existing.vendorId) || ''),
      payMethod: input.payMethod !== undefined ? clip(input.payMethod, 20) : (existing && existing.payMethod) || '',
      note: input.note !== undefined ? clip(input.note, 200) : (existing && existing.note) || '',
      src: input.src === 'ai' ? 'ai' : 'panel',
      createdAt: (existing && existing.createdAt) || now,
      updatedAt: now,
    },
  };
}

function dayKeyOfTs(ts) { return dayKey(ts); }

// ── 预算执行（唯一口径）──────────────────────────────────────────────────────
/**
 * 预算 vs 实际对比。
 * @returns {{rows, totals:{budgetTotal,spentTotal,remainTotal,pct,level,catBudgetTotal}, extraSpent, extraCount}}
 *   rows: [{cat, spent, budget, level: 'red'|'yellow'|'gray'|'green', pct, spentOfTotal}]
 */
function budgetCompare(cats, expenses, totalBudget) {
  const spentByCat = new Map();
  for (const e of expenses) spentByCat.set(e.catId, (spentByCat.get(e.catId) || 0) + e.amount);
  const rows = cats.map((cat) => {
    const spent = round2(spentByCat.get(cat.id) || 0);
    const b = cat.budget;
    let level = 'green';
    let pct = null;
    if (b === undefined || b === null) level = 'gray';
    else {
      pct = b > 0 ? Math.round((spent / b) * 100) : (spent > 0 ? null : 0);
      if (spent > b) level = 'red';
      else if (b > 0 && spent >= b * 0.9) level = 'yellow';
      else if (b === 0 && spent > 0) level = 'red';
    }
    return { cat, spent, budget: b === undefined ? null : b, level, pct };
  });
  const catBudgetTotal = round2(cats.reduce((s, c) => s + (c.budget || 0), 0));
  const budgetTotal = totalBudget !== undefined && totalBudget !== null ? totalBudget : catBudgetTotal;
  const spentTotal = round2(expenses.reduce((s, e) => s + e.amount, 0));
  const extraCats = new Set(cats.filter((c) => c.isExtra).map((c) => c.id));
  let extraSpent = 0; let extraCount = 0;
  for (const e of expenses) {
    if (extraCats.has(e.catId)) { extraSpent += e.amount; extraCount += 1; }
  }
  const level = budgetTotal > 0 && spentTotal > budgetTotal ? 'red'
    : (budgetTotal > 0 && spentTotal >= budgetTotal * 0.9 ? 'yellow' : 'green');
  return {
    rows,
    totals: {
      budgetTotal, catBudgetTotal,
      spentTotal: round2(spentTotal),
      remainTotal: round2(budgetTotal - spentTotal),
      pct: budgetTotal > 0 ? Math.round((spentTotal / budgetTotal) * 100) : null,
      level,
    },
    extraSpent: round2(extraSpent),
    extraCount,
  };
}

/** 常见漏项检查：COMMON_MISS 中不在用户科目表里的项 */
function missingCheck(cats) {
  const names = new Set(cats.map((c) => c.name));
  return COMMON_MISS.filter((n) => !names.has(n));
}

// ── 小结（对账 markdown；只读）───────────────────────────────────────────────
function buildSummary({ project, cats, expenses, vendors, milestones }, now) {
  const cmp = budgetCompare(cats, expenses, project && project.totalBudget);
  const L = [];
  L.push(`# 装修对账小结（${project ? project.name : '未命名项目'}）`);
  L.push('');
  L.push(`> 生成时间：${fmtDT(now === undefined ? Date.now() : now)} · 数据仅存本机 · 用于家庭自查，不构成造价/法律建议`);
  L.push('');
  L.push('## 预算执行总览');
  L.push('');
  L.push(`- 总预算：${cmp.totals.budgetTotal > 0 ? `${fmtMoney(cmp.totals.budgetTotal)} 元` : '未设定'}${project && project.totalBudget !== undefined && project.totalBudget !== null && cmp.totals.catBudgetTotal !== project.totalBudget ? `（科目预算合计 ${fmtMoney(cmp.totals.catBudgetTotal)} 元）` : ''}`);
  L.push(`- 已支出：${fmtMoney(cmp.totals.spentTotal)} 元（${cmp.totals.pct !== null ? `${cmp.totals.pct}%` : '无预算基数'}）`);
  L.push(`- 剩余：${fmtMoney(cmp.totals.remainTotal)} 元${cmp.totals.level === 'red' ? ' · **已超支**' : cmp.totals.level === 'yellow' ? ' · 逼近预算（≥90%）' : ''}`);
  if (cmp.extraSpent > 0) L.push(`- 增项合计：**${fmtMoney(cmp.extraSpent)} 元**（${cmp.extraCount} 笔，报价单外新增）`);
  L.push('');
  L.push('## 分科目明细');
  L.push('');
  L.push('| 科目 | 组 | 预算 | 已花 | 进度 | 状态 |');
  L.push('|---|---|---:|---:|---:|---|');
  const sorted = [...cmp.rows].sort((a, b) => {
    const g = (c) => GROUPS.indexOf(c.cat.group);
    return g(a) - g(b) || (a.cat.order - b.cat.order);
  });
  for (const r of sorted) {
    const state = r.level === 'red' ? '**超支**' : r.level === 'yellow' ? '临超(≥90%)' : r.level === 'gray' ? '未定预算' : '正常';
    L.push(`| ${r.cat.name}${r.cat.isExtra ? '（增）' : ''} | ${r.cat.group} | ${r.budget !== null ? fmtMoney(r.budget) : '—'} | ${fmtMoney(r.spent)} | ${r.pct !== null ? `${r.pct}%` : '—'} | ${state} |`);
  }
  const overRows = cmp.rows.filter((r) => r.level === 'red');
  if (overRows.length) {
    L.push('');
    L.push('## 超支科目');
    L.push('');
    for (const r of overRows) L.push(`- **${r.cat.name}**：预算 ${r.budget !== null ? fmtMoney(r.budget) : '未定'}，已花 ${fmtMoney(r.spent)}${r.budget ? `（超 ${fmtMoney(r.spent - r.budget)} 元）` : ''}`);
  }
  const miss = missingCheck(cats);
  if (miss.length) {
    L.push('');
    L.push('## 常见漏项提醒');
    L.push('');
    L.push(`你的预算单还没有这些「报价单最爱漏掉」的科目：**${miss.join('、')}**。装修公司漏报 = 后期增项，建议先确认是否需要，需要就补进预算。`);
  }
  if (vendors.length) {
    L.push('');
    L.push('## 供应商与付款');
    L.push('');
    L.push('| 供应商 | 角色 | 合同额 | 已付 | 笔数 |');
    L.push('|---|---|---:|---:|---:|');
    for (const v of vendors) {
      const mine = expenses.filter((e) => e.vendorId === v.id);
      const paid = round2(mine.reduce((s, e) => s + e.amount, 0));
      L.push(`| ${v.name}${v.phone ? `（${v.phone}）` : ''} | ${v.role || '—'} | ${v.contractAmount !== undefined ? fmtMoney(v.contractAmount) : '—'} | ${fmtMoney(paid)} | ${mine.length} |`);
    }
  }
  if (milestones.length) {
    L.push('');
    L.push('## 工期节点');
    L.push('');
    for (const m of [...milestones].sort((a, b) => parseDayKey(a.date) - parseDayKey(b.date))) {
      const lv = milestoneLevel(m, now);
      const tag = lv.level === 'red' ? '已逾期' : lv.level === 'yellow' ? `还剩 ${lv.daysLeft} 天` : m.done ? '已完成' : '未到';
      L.push(`- ${m.date} ${m.title}（${tag}）`);
    }
  }
  return L.join('\n');
}

module.exports = {
  DAY_MS, MAX_AMOUNT, GROUPS, TEMPLATE, COMMON_MISS,
  dayKey, parseDayKey, dayMinTs, parseTimeHM, fmtTime, fmtDT, fmtMoney, round2, clip, clipId, id4,
  normalizeProject, normalizeCategory, resolveCatName,
  normalizeVendor, normalizeMilestone, milestoneLevel,
  normalizeExpense, dayKeyOfTs,
  budgetCompare, missingCheck, buildSummary,
};
