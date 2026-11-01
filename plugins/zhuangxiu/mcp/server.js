#!/usr/bin/env node
'use strict';
/**
 * zhuangxiu MCP Server —— 装修台账的 AI 工具层（零依赖 stdio）
 *
 * 职责：把 AI 的 tools/call 翻译为对 cap.kv（经 Polaris IPC bridge 自发现，
 * 与面板同读同一份事实库）中 zhuangxiu.* 键空间的读写。零外网请求、零服务进程。
 *
 * 工具一览（AI 侧约定：这是「家庭装修对账」，不提供造价咨询与合同法律建议；
 * 查询/小结只查不建，只有记录类动作才会自动建档）：
 *   zx_record    记一笔支出（科目按名解析；报价单外科目→引导建增项或 asExtra:true
 *                一步建增项科目；vendor 按名自动建档；id 幂等覆盖）
 *   zx_category  科目：add/set/remove/list/template(一键标准科目)/project(项目档案)
 *   zx_query     查询：budget 预算执行 / recent 流水 / extra 增项 / vendors 供应商 /
 *                milestones 节点红黄榜 / missing 常见漏项（六视图全部只查不建）
 *   zx_vendor    供应商 add/set/list
 *   zx_milestone 工期节点 add/set/done/list
 *   zx_update    按 id 改一笔支出
 *   zx_delete    删支出/科目/供应商/节点（confirm 门；科目有支出拒删）
 *   zx_summary   对账小结 markdown（预算执行/超支榜/增项/供应商/节点/漏项提醒）
 *
 * 写幂等：zx_record 传 id 时覆盖同 id 记录（AI 重试不双写）；normalize* 为唯一
 * 写入口径（与面板同源 core）；增项口径唯一 = 科目 isExtra=true。
 */
const { createKvClient } = require('../service/kvclient');
const core = require('../shared/core');

const SERVER_NAME = 'zhuangxiu';
const SERVER_VERSION = '0.1.0';
const PROTOCOL_VERSION = '2024-11-05';

const APP_CONFIG_DIR = process.argv[2] || '';

function log(level, msg) {
  process.stderr.write(`[${SERVER_NAME}:${level}] ${new Date().toISOString()} ${msg}\n`);
}

const kv = createKvClient({
  appConfigDir: APP_CONFIG_DIR,
  log: (level, msg) => log(level, msg),
});

const K = {
  project: 'zhuangxiu.project',
  cat: (id) => `zhuangxiu.cat.${id}`,
  catPrefix: 'zhuangxiu.cat.',
  exp: (id) => `zhuangxiu.exp.${id}`,
  expPrefix: 'zhuangxiu.exp.',
  ven: (id) => `zhuangxiu.ven.${id}`,
  venPrefix: 'zhuangxiu.ven.',
  mile: (id) => `zhuangxiu.mile.${id}`,
  milePrefix: 'zhuangxiu.mile.',
};

function ok(text) {
  return { content: [{ type: 'text', text }], isError: false };
}
function err(text) {
  return { content: [{ type: 'text', text }], isError: true };
}

// ── 数据访问（每记录一键；家庭量级：科目 ~30 / 支出数百，全扫可接受）──────────
async function getProject() {
  const v = await kv.kvGet(K.project).catch(() => null);
  return v && typeof v === 'object' && v.id ? v : null;
}
async function saveProject(p) { await kv.kvSet(K.project, p); return p; }

/** 变更动作前确保项目存在（首次自动建档，name 可由调用方给） */
async function ensureProject(projectName) {
  const cur = await getProject();
  if (cur) return { project: cur, created: false };
  const r = core.normalizeProject({ name: core.clip(projectName || '', 40) || '我的装修', status: 'active' }, null);
  if (r.error) return { error: r.error };
  await saveProject(r.project);
  return { project: r.project, created: true };
}

async function listByPrefix(prefix) {
  const keys = await kv.kvKeys();
  const mine = keys.filter((k) => k.startsWith(prefix));
  const out = await Promise.all(mine.map(async (k) => {
    const v = await kv.kvGet(k).catch(() => null);
    return v && typeof v === 'object' && v.id ? v : null;
  }));
  return out.filter(Boolean);
}
const listCats = () => listByPrefix(K.catPrefix);
const listExps = () => listByPrefix(K.expPrefix);
const listVens = () => listByPrefix(K.venPrefix);
const listMiles = () => listByPrefix(K.milePrefix);

const catOrder = (a, b) => core.GROUPS.indexOf(a.group) - core.GROUPS.indexOf(b.group) || a.order - b.order || (a.createdAt - b.createdAt);
const tsDesc = (a, b) => b.ts - a.ts;

/** {catId|categoryName} → 科目（含 asExtra 新建分支；查询场景传 allowCreate=false） */
async function resolveCat(args, cats, { allowCreate = false, projectName } = {}) {
  const catId = core.clip(args.catId || '', 64);
  if (catId) {
    const hit = cats.find((c) => c.id === catId);
    return hit ? { cat: hit } : { error: `找不到科目 ${catId}` };
  }
  const wanted = core.clip(args.categoryName || args.name || '', 40);
  if (!wanted) return { error: '需提供 categoryName 或 catId' };
  const exact = cats.filter((c) => c.name === wanted);
  if (exact.length === 1) return { cat: exact[0] };
  if (exact.length > 1) return { error: `科目名称「${wanted}」重复（用 catId 指定，或先合并）` };
  const part = cats.filter((c) => c.name.includes(wanted) || wanted.includes(c.name));
  // asExtra 是「确为报价单外新增」的显式声明：模糊命中已有科目时不得静默改记普通科目
  if (allowCreate && args.asExtra && part.length >= 1) {
    return { error: `已有相近科目「${part.map((c) => c.name).join('、')}」。若就是它，请用其全名重记（记入普通科目）；若确为报价单外增项，请换一个不含现有科目名的名称再 asExtra:true` };
  }
  if (part.length === 1) return { cat: part[0] };
  if (part.length > 1) return { error: `科目「${wanted}」有多个候选：${part.map((c) => c.name).join('、')}——请用全名或 catId` };
  if (!allowCreate || !args.asExtra) {
    return { error: `预算单里没有「${wanted}」科目。若这是报价单外的新增项目（增项）：zx_record 加 asExtra:true 一步建增项科目并记账；或先 zx_category action=add isExtra:true 建科目` };
  }
  const nc = core.normalizeCategory({ name: wanted, group: args.group || '其他', isExtra: true }, null);
  if (nc.error) return { error: nc.error };
  await kv.kvSet(K.cat(nc.cat.id), nc.cat);
  return { cat: nc.cat, createdCat: true };
}

/** 供应商按名解析（记录场景自动建档；查询/更新场景不建） */
async function resolveVendor(args, vens, { allowCreate = false } = {}) {
  const vid = core.clip(args.vendorId || '', 64);
  if (vid) {
    const hit = vens.find((v) => v.id === vid);
    return hit ? { vendor: hit } : { error: `找不到供应商 ${vid}` };
  }
  const wanted = core.clip(args.vendorName || '', 40);
  if (!wanted) return { vendor: null };
  const exact = vens.filter((v) => v.name === wanted);
  if (exact.length === 1) return { vendor: exact[0] };
  if (exact.length > 1) return { error: `供应商「${wanted}」有多个同名档案（用 vendorId 指定）` };
  const part = vens.filter((v) => v.name.includes(wanted));
  if (part.length === 1) return { vendor: part[0] };
  if (part.length > 1) return { error: `供应商「${wanted}」有多个候选：${part.map((v) => v.name).join('、')}` };
  if (!allowCreate) return { error: `供应商档案里没有「${wanted}」（可 zx_vendor action=add 先建档，或确认名字）` };
  const nv = core.normalizeVendor({ name: wanted }, null);
  if (nv.error) return { error: nv.error };
  await kv.kvSet(K.ven(nv.vendor.id), nv.vendor);
  return { vendor: nv.vendor, created: true };
}

/** 记录类工具共用的科目执行快照（本笔落库后重算） */
function catDigest(row) {
  const cat = row.cat;
  const state = row.level === 'red' ? '【红·超支】' : row.level === 'yellow' ? '【黄·临超】' : row.level === 'gray' ? '【灰·未定预算】' : '【绿】';
  const budgetTxt = row.budget !== null ? `预算 ${core.fmtMoney(row.budget)}` : '未定预算';
  const pctTxt = row.pct !== null ? `进度 ${row.pct}%` : '';
  return `科目「${cat.name}」${cat.isExtra ? '（增项科目）' : ''}：${budgetTxt}，已花 ${core.fmtMoney(row.spent)}${pctTxt ? `，${pctTxt}` : ''} ${state}`;
}

// ── 工具实现 ──────────────────────────────────────────────────────────────────
async function toolRecord(args) {
  const ep = await ensureProject(args.projectName);
  if (ep.error) return err(ep.error);
  const cats = await listCats();
  // 幂等覆盖语义：同 id 重写时，未提供的字段继承旧值（重试丢字段不得抹数据）
  const oldRaw = args.id ? await kv.kvGet(K.exp(core.clipId(args.id))).catch(() => null) : null;
  const old = oldRaw && typeof oldRaw === 'object' && oldRaw.id ? oldRaw : null;
  let catId;
  let resolvedCat = null;
  if (args.categoryName !== undefined || args.catName !== undefined || args.catId !== undefined) {
    const rc = await resolveCat(args, cats, { allowCreate: true, projectName: args.projectName });
    if (rc.error) return err(rc.error);
    catId = rc.cat.id;
    resolvedCat = rc.cat;
    if (rc.createdCat) cats.push(rc.cat); // asExtra 新建科目补进本地快照，预算对比与回复可见
  } else if (old) {
    catId = old.catId;
    resolvedCat = cats.find((c) => c.id === catId) || null;
  } else {
    return err('需提供 categoryName 或 catId（新记录必须归属科目）');
  }
  const vens = await listVens();
  let vendorId;
  let vendorMeta = null;
  if (args.vendorName !== undefined || args.vendorId !== undefined) {
    const rv = await resolveVendor(args, vens, { allowCreate: true });
    if (rv.error) return err(rv.error);
    vendorId = rv.vendor ? rv.vendor.id : '';
    vendorMeta = rv.vendor;
  } else {
    vendorId = undefined; // normalizeExpense 回退 existing.vendorId
  }
  const ne = core.normalizeExpense({
    id: args.id,
    catId,
    amount: args.amount,
    date: args.date, time: args.time, ts: args.ts,
    vendorId,
    payMethod: args.payMethod,
    note: args.note,
    src: 'ai',
  }, old);
  if (ne.error) return err(ne.error);
  const expense = ne.expense;
  await kv.kvSet(K.exp(expense.id), expense);

  const allExps = await listExps();
  const cmp = core.budgetCompare(cats, allExps, ep.project.totalBudget);
  const row = cmp.rows.find((r) => r.cat.id === expense.catId);
  const t = cmp.totals;
  const lines = [];
  lines.push(`${old ? '已覆盖更新' : '已记录'}：${core.fmtMoney(expense.amount)} 元 → ${resolvedCat ? resolvedCat.name : '（科目已删）'}${vendorMeta ? ` · ${vendorMeta.name}${vendorMeta.created ? '（自动建档）' : ''}` : ''}${expense.note ? ` · ${expense.note}` : ''}`);
  if (row) lines.push(catDigest(row));
  if (resolvedCat && resolvedCat.isExtra) lines.push(`增项口径：本笔计入增项合计（当前增项 ${core.fmtMoney(cmp.extraSpent)} 元 / ${cmp.extraCount} 笔）`);
  lines.push(`项目总览：已花 ${core.fmtMoney(t.spentTotal)} / 预算 ${t.budgetTotal > 0 ? core.fmtMoney(t.budgetTotal) : '未设'}${t.pct !== null ? `（${t.pct}%）` : ''} ${t.level === 'red' ? '【红·超支】' : t.level === 'yellow' ? '【黄·≥90%】' : '【绿】'}`);
  return ok(lines.join('\n'));
}

async function toolCategory(args) {
  const action = args.action;
  if (action === 'list') {
    const cats = await listCats();
    if (!cats.length) return ok('科目表为空。可用 zx_category action=template 一键采用标准科目模板（含防漏项清单）。');
    const exps = await listExps();
    const project = await getProject();
    const cmp = core.budgetCompare(cats, exps, project ? project.totalBudget : undefined);
    const lines = [`${cats.length} 个科目（已花 ${core.fmtMoney(cmp.totals.spentTotal)} / 预算 ${cmp.totals.budgetTotal > 0 ? core.fmtMoney(cmp.totals.budgetTotal) : '未设'}）：`];
    for (const r of [...cmp.rows].sort(catOrder)) {
      const mark = r.level === 'red' ? '红' : r.level === 'yellow' ? '黄' : r.level === 'gray' ? '灰' : '绿';
      lines.push(`- [${r.cat.group}] ${r.cat.name}${r.cat.isExtra ? '（增项）' : ''}：预算 ${r.budget !== null ? core.fmtMoney(r.budget) : '未定'} / 已花 ${core.fmtMoney(r.spent)}（${mark}）`);
    }
    return ok(lines.join('\n'));
  }
  if (action === 'template') {
    const ep = await ensureProject(args.projectName);
    if (ep.error) return err(ep.error);
    const cats = await listCats();
    const have = new Set(cats.map((c) => c.name));
    let created = 0; let skipped = 0; let order = cats.length;
    for (const item of core.TEMPLATE) {
      if (have.has(item.name)) { skipped += 1; continue; }
      const nc = core.normalizeCategory({ name: item.name, group: item.group, order: order++ }, null);
      if (nc.error) return err(nc.error);
      // eslint-disable-next-line no-await-in-loop
      await kv.kvSet(K.cat(nc.cat.id), nc.cat);
      created += 1;
    }
    const miss = core.missingCheck(await listCats());
    const lines = [`标准科目模板：新建 ${created} 个${skipped ? `，已存在跳过 ${skipped} 个` : ''}。`];
    lines.push(miss.length ? `提醒：当前预算单仍缺常见漏项科目——${miss.join('、')}（报价单漏报=后期增项，确认需要就补进预算）。` : '常见漏项科目已齐。');
    lines.push('下一步：逐科目录入合同/报价金额（zx_category action=set budget=…），然后每笔开销 zx_record 记账即可自动对比。');
    return ok(lines.join('\n'));
  }
  if (action === 'add') {
    const ep = await ensureProject(args.projectName);
    if (ep.error) return err(ep.error);
    const cats = await listCats();
    const name = core.clip(args.name || '', 40);
    if (!name) return err('需提供科目名称（name）');
    if (cats.some((c) => c.name === name)) return err(`科目「${name}」已存在（直接 zx_record 记账即可；要改预算用 action=set）`);
    const nc = core.normalizeCategory({ name, group: args.group, budget: args.budget, isExtra: !!args.isExtra, note: args.note, order: cats.length }, null);
    if (nc.error) return err(nc.error);
    await kv.kvSet(K.cat(nc.cat.id), nc.cat);
    return ok(`已建科目「${nc.cat.name}」（${nc.cat.group}${nc.cat.isExtra ? '，增项科目' : ''}${nc.cat.budget !== undefined ? `，预算 ${core.fmtMoney(nc.cat.budget)} 元` : '，预算未定'}）。记账：zx_record amount=… categoryName=${nc.cat.name}`);
  }
  if (action === 'set') {
    const cats = await listCats();
    const rc = await resolveCat(args, cats);
    if (rc.error) return err(rc.error);
    const nc = core.normalizeCategory({ name: args.name, group: args.group, budget: args.budget, note: args.note, order: args.order }, rc.cat);
    if (nc.error) return err(nc.error);
    await kv.kvSet(K.cat(nc.cat.id), nc.cat);
    return ok(`已更新科目「${nc.cat.name}」：${nc.cat.budget !== undefined ? `预算 ${core.fmtMoney(nc.cat.budget)} 元` : '预算未定'}${nc.cat.note ? ` · ${nc.cat.note}` : ''}`);
  }
  if (action === 'remove') {
    if (!args.confirm) return err('删除科目不可逆（金额流水仍保留为无科目归属）。确认请传 confirm:true。');
    const cats = await listCats();
    const rc = await resolveCat(args, cats);
    if (rc.error) return err(rc.error);
    const exps = await listExps();
    const used = exps.filter((e) => e.catId === rc.cat.id);
    if (used.length) return err(`科目「${rc.cat.name}」名下仍有 ${used.length} 笔支出（合计 ${core.fmtMoney(used.reduce((s, e) => s + e.amount, 0))} 元）。先 zx_update 迁移到其他科目或 zx_delete 删除这些流水，再删科目。`);
    await kv.kvDel(K.cat(rc.cat.id));
    return ok(`已删除科目「${rc.cat.name}」。`);
  }
  if (action === 'project') {
    const cur = await getProject();
    const np = core.normalizeProject({
      name: args.name, house: args.house, totalBudget: args.totalBudget,
      status: args.status, startDate: args.startDate,
    }, cur);
    if (np.error) return err(np.error);
    await saveProject(np.project);
    const p = np.project;
    const t = core.budgetCompare(await listCats(), await listExps(), p.totalBudget).totals;
    return ok(`项目档案：${p.name}${p.house ? `（${p.house}）` : ''} · 总预算 ${p.totalBudget !== undefined ? `${core.fmtMoney(p.totalBudget)} 元` : '未设定'} · 状态 ${p.status} · 已花 ${core.fmtMoney(t.spentTotal)} 元`);
  }
  return err(`未知 action：${JSON.stringify(action)}（可用 add/set/remove/list/template/project）`);
}

async function toolQuery(args) {
  const view = args.view || 'budget';
  const [project, cats, exps, vens, miles] = await Promise.all([
    getProject(), listCats(), listExps(), listVens(), listMiles(),
  ]);
  if (view === 'budget') {
    if (!cats.length && !exps.length) return ok('还没有科目与支出。建议先 zx_category action=template 一键采用标准科目模板，再录预算、记支出。');
    const cmp = core.budgetCompare(cats, exps, project ? project.totalBudget : undefined);
    const t = cmp.totals;
    const lines = [];
    lines.push(`预算执行${project ? `（${project.name}）` : ''}：已花 ${core.fmtMoney(t.spentTotal)} / 预算 ${t.budgetTotal > 0 ? core.fmtMoney(t.budgetTotal) : '未设'}${t.pct !== null ? `（${t.pct}%）` : ''}，剩余 ${core.fmtMoney(t.remainTotal)} 元 ${t.level === 'red' ? '【红·超支】' : t.level === 'yellow' ? '【黄·≥90%】' : '【绿】'}`);
    if (cmp.extraSpent > 0) lines.push(`增项合计：${core.fmtMoney(cmp.extraSpent)} 元（${cmp.extraCount} 笔）`);
    lines.push('分科目：');
    for (const r of [...cmp.rows].sort(catOrder)) {
      const mark = r.level === 'red' ? '红·超支' : r.level === 'yellow' ? '黄·临超' : r.level === 'gray' ? '灰·未定预算' : '绿';
      lines.push(`- [${r.cat.group}] ${r.cat.name}${r.cat.isExtra ? '（增项）' : ''}：${r.budget !== null ? core.fmtMoney(r.budget) : '未定'} / ${core.fmtMoney(r.spent)}${r.pct !== null ? `（${r.pct}%）` : ''}（${mark}）`);
    }
    return ok(lines.join('\n'));
  }
  if (view === 'recent') {
    let rs = exps;
    if (args.catName || args.catId) {
      const rc = await resolveCat({ catId: args.catId, categoryName: args.catName }, cats);
      if (rc.error) return err(rc.error);
      rs = rs.filter((e) => e.catId === rc.cat.id);
    }
    if (args.vendorName || args.vendorId) {
      const rv = await resolveVendor(args, vens);
      if (rv.error) return err(rv.error);
      if (rv.vendor) rs = rs.filter((e) => e.vendorId === rv.vendor.id);
    }
    if (args.from) {
      const t0 = core.parseDayKey(args.from);
      if (t0 === null) return err(`起始日期 ${JSON.stringify(args.from)} 无法识别`);
      rs = rs.filter((e) => e.ts >= t0);
    }
    if (args.to) {
      const t1 = core.parseDayKey(args.to);
      if (t1 === null) return err(`截止日期 ${JSON.stringify(args.to)} 无法识别`);
      rs = rs.filter((e) => e.ts < t1 + core.DAY_MS);
    }
    rs.sort(tsDesc);
    const limit = Math.min(Math.max(Number.isInteger(args.limit) ? args.limit : 20, 1), 100);
    const catById = new Map(cats.map((c) => [c.id, c]));
    const venById = new Map(vens.map((v) => [v.id, v]));
    const total = rs.reduce((s, e) => s + e.amount, 0);
    const lines = [`${rs.length} 笔流水${args.from || args.to ? `（${args.from || '…'} ~ ${args.to || '…'}）` : ''}，合计 ${core.fmtMoney(total)} 元：`];
    for (const e of rs.slice(0, limit)) {
      const c = catById.get(e.catId);
      const v = e.vendorId ? venById.get(e.vendorId) : null;
      lines.push(`- ${core.dayKeyOfTs(e.ts)} ${core.fmtMoney(e.amount)} 元 · ${c ? c.name : '（科目已删）'}${c && c.isExtra ? '（增项）' : ''}${v ? ` · ${v.name}` : ''}${e.note ? ` · ${e.note}` : ''}（id=${e.id}）`);
    }
    if (rs.length > limit) lines.push(`（仅显示最近 ${limit} 笔，共 ${rs.length} 笔）`);
    return ok(lines.join('\n'));
  }
  if (view === 'extra') {
    const extraIds = new Set(cats.filter((c) => c.isExtra).map((c) => c.id));
    const rs = exps.filter((e) => extraIds.has(e.catId)).sort(tsDesc);
    const catById = new Map(cats.map((c) => [c.id, c]));
    const lines = [`增项合计：${core.fmtMoney(rs.reduce((s, e) => s + e.amount, 0))} 元（${rs.length} 笔，报价单外新增科目）：`];
    for (const e of rs) {
      const c = catById.get(e.catId);
      lines.push(`- ${core.dayKeyOfTs(e.ts)} ${core.fmtMoney(e.amount)} 元 · ${c ? c.name : '（科目已删）'}${e.note ? ` · ${e.note}` : ''}`);
    }
    return ok(lines.join('\n'));
  }
  if (view === 'vendors') {
    if (!vens.length) return ok('还没有供应商档案。zx_vendor action=add 建档，或记账时带 vendorName 自动建档。');
    const lines = [`${vens.length} 个供应商：`];
    for (const v of vens) {
      const mine = exps.filter((e) => e.vendorId === v.id);
      const paid = mine.reduce((s, e) => s + e.amount, 0);
      lines.push(`- ${v.name}${v.role ? `（${v.role}）` : ''}${v.phone ? ` ☎${v.phone}` : ''}${v.contractAmount !== undefined ? ` 合同额 ${core.fmtMoney(v.contractAmount)}` : ''} · 已付 ${core.fmtMoney(paid)} 元 / ${mine.length} 笔`);
    }
    return ok(lines.join('\n'));
  }
  if (view === 'milestones') {
    if (!miles.length) return ok('还没有工期节点。zx_milestone action=add title=水电验收 date=2026-11-15。');
    const lines = [`${miles.length} 个节点：`];
    for (const m of [...miles].sort((a, b) => core.parseDayKey(a.date) - core.parseDayKey(b.date))) {
      const lv = core.milestoneLevel(m, Date.now());
      const tag = lv.level === 'red' ? `【红·已逾期 ${-lv.daysLeft} 天】` : lv.level === 'yellow' ? `【黄·还剩 ${lv.daysLeft} 天】` : m.done ? '【绿·已完成】' : '【绿·未到】';
      lines.push(`- ${m.date} ${m.title}${m.note ? ` · ${m.note}` : ''} ${tag}`);
    }
    return ok(lines.join('\n'));
  }
  if (view === 'missing') {
    const miss = core.missingCheck(cats);
    return ok(miss.length
      ? `常见漏项检查：预算单缺 ${miss.length} 项——${miss.join('、')}。这些是装修公司报价单最爱漏掉的刚需项，漏报=后期增项；确认需要就 zx_category action=add 补进预算。`
      : '常见漏项检查通过：垃圾清运/包立管/防水/过门石/美缝/物业押金管理费/开荒保洁 都在预算单里。');
  }
  return err(`未知 view：${JSON.stringify(view)}（可用 budget/recent/extra/vendors/milestones/missing）`);
}

async function toolVendor(args) {
  const action = args.action || 'list';
  if (action === 'list') return toolQuery({ view: 'vendors' });
  if (action === 'add') {
    const vens = await listVens();
    const name = core.clip(args.name || '', 40);
    if (!name) return err('需提供供应商名称（name）');
    if (vens.some((v) => v.name === name)) return err(`供应商「${name}」已存在（用 action=set 修改）`);
    const nv = core.normalizeVendor(args, null);
    if (nv.error) return err(nv.error);
    await kv.kvSet(K.ven(nv.vendor.id), nv.vendor);
    return ok(`已建供应商「${nv.vendor.name}」${nv.vendor.role ? `（${nv.vendor.role}）` : ''}${nv.vendor.contractAmount !== undefined ? ` 合同额 ${core.fmtMoney(nv.vendor.contractAmount)} 元` : ''}。`);
  }
  if (action === 'set') {
    const vens = await listVens();
    const rv = await resolveVendor({ vendorId: args.vendorId, vendorName: args.name || args.vendorName }, vens);
    if (rv.error) return err(rv.error);
    if (!rv.vendor) return err('需提供 vendorId 或 name 定位供应商');
    const nv = core.normalizeVendor(args, rv.vendor);
    if (nv.error) return err(nv.error);
    await kv.kvSet(K.ven(nv.vendor.id), nv.vendor);
    return ok(`已更新供应商「${nv.vendor.name}」。`);
  }
  return err(`未知 action：${JSON.stringify(action)}（可用 add/set/list）`);
}

async function toolMilestone(args) {
  const action = args.action || 'list';
  if (action === 'list') return toolQuery({ view: 'milestones' });
  if (action === 'add') {
    const nm = core.normalizeMilestone(args, null);
    if (nm.error) return err(nm.error);
    await kv.kvSet(K.mile(nm.mile.id), nm.mile);
    const lv = core.milestoneLevel(nm.mile, Date.now());
    return ok(`已建节点「${nm.mile.title}」@ ${nm.mile.date}${lv.level === 'red' ? '（注意：日期已过）' : lv.level === 'yellow' ? `（还剩 ${lv.daysLeft} 天）` : ''}。`);
  }
  const miles = await listMiles();
  const mid = core.clip(args.mileId || args.id || '', 64);
  const hit = mid ? miles.find((m) => m.id === mid)
    : miles.filter((m) => m.title === core.clip(args.title || '', 60));
  if (!hit) return err(`找不到节点（mileId/title=${JSON.stringify(mid || args.title)}）`);
  if (Array.isArray(hit) && hit.length > 1) return err(`节点标题「${args.title}」重复，请用 mileId 指定`);
  const target = Array.isArray(hit) ? hit[0] : hit;
  if (action === 'done') {
    const nm = core.normalizeMilestone({ done: args.done === undefined ? true : !!args.done }, target);
    if (nm.error) return err(nm.error);
    await kv.kvSet(K.mile(nm.mile.id), nm.mile);
    return ok(`${nm.mile.done ? '已完成' : '已重开'}节点「${nm.mile.title}」@ ${nm.mile.date}。`);
  }
  if (action === 'set') {
    const nm = core.normalizeMilestone({ title: args.title, date: args.date, done: args.done, note: args.note }, target);
    if (nm.error) return err(nm.error);
    await kv.kvSet(K.mile(nm.mile.id), nm.mile);
    return ok(`已更新节点「${nm.mile.title}」@ ${nm.mile.date}${nm.mile.done ? '（已完成）' : ''}。`);
  }
  return err(`未知 action：${JSON.stringify(action)}（可用 add/set/done/list）`);
}

async function toolUpdate(args) {
  const id = core.clip(args.id || '', 64);
  if (!id) return err('需提供要修改的支出 id（zx_query view=recent 可查到）');
  const exps = await listExps();
  const old = exps.find((e) => e.id === id);
  if (!old) return err(`未找到支出 ${id}`);
  let catId = old.catId;
  if (args.categoryName || args.catName || args.catId) {
    const cats = await listCats();
    const rc = await resolveCat({ catId: args.catId, categoryName: args.categoryName || args.catName }, cats);
    if (rc.error) return err(rc.error);
    catId = rc.cat.id;
  }
  let vendorId = old.vendorId;
  if (args.vendorName || args.vendorId) {
    const vens = await listVens();
    const rv = await resolveVendor(args, vens);
    if (rv.error) return err(rv.error);
    vendorId = rv.vendor ? rv.vendor.id : '';
  }
  const ne = core.normalizeExpense({
    amount: args.amount, date: args.date, time: args.time,
    vendorId, payMethod: args.payMethod, note: args.note, src: 'ai',
  }, { ...old, catId });
  if (ne.error) return err(ne.error);
  await kv.kvSet(K.exp(ne.expense.id), ne.expense);
  const cats = await listCats();
  const cat = cats.find((c) => c.id === ne.expense.catId);
  const cmp = core.budgetCompare(cats, await listExps(), (await getProject())?.totalBudget);
  const row = cmp.rows.find((r) => r.cat.id === ne.expense.catId);
  const lines = [`已修改支出 ${ne.expense.id}：${core.fmtMoney(ne.expense.amount)} 元 · ${core.dayKeyOfTs(ne.expense.ts)} ${core.fmtTime(ne.expense.ts)} · ${cat ? cat.name : '（科目已删）'}${ne.expense.note ? ` · ${ne.expense.note}` : ''}`];
  if (row) lines.push(catDigest(row));
  return ok(lines.join('\n'));
}

async function toolDelete(args) {
  const kind = args.kind || 'expense';
  if (!args.confirm) return err(`删除 ${kind} 不可逆。确认请传 confirm:true（先 zx_query 查到 id）。`);
  const id = core.clip(args.id || '', 64);
  if (!id && kind === 'expense') return err('需提供支出 id');
  if (kind === 'expense') {
    const old = (await listExps()).find((e) => e.id === id);
    if (!old) return err(`未找到支出 ${id}`);
    await kv.kvDel(K.exp(old.id));
    return ok(`已删除支出 ${id}（${core.fmtMoney(old.amount)} 元）。`);
  }
  if (kind === 'category') {
    const cats = await listCats();
    const rc = await resolveCat(args, cats);
    if (rc.error) return err(rc.error);
    const used = (await listExps()).filter((e) => e.catId === rc.cat.id);
    if (used.length) return err(`科目「${rc.cat.name}」名下仍有 ${used.length} 笔支出，先迁移或删除这些流水。`);
    await kv.kvDel(K.cat(rc.cat.id));
    return ok(`已删除科目「${rc.cat.name}」。`);
  }
  if (kind === 'vendor') {
    const vens = await listVens();
    const rv = await resolveVendor(args, vens);
    if (rv.error) return err(rv.error);
    if (!rv.vendor) return err('需提供 vendorId 或 vendorName 定位供应商');
    // 保留流水中的 vendorId 悬挂（展示为无供应商）——不连锁删流水，避免误删账
    await kv.kvDel(K.ven(rv.vendor.id));
    return ok(`已删除供应商「${rv.vendor.name}」（历史流水保留，仅不再关联档案）。`);
  }
  if (kind === 'milestone') {
    const miles = await listMiles();
    const mid = core.clip(args.mileId || args.id || '', 64);
    const hit = mid ? miles.find((m) => m.id === mid) : miles.filter((m) => m.title === core.clip(args.title || '', 60));
    if (!hit) return err('未找到节点');
    const target = Array.isArray(hit) ? hit[0] : hit;
    if (Array.isArray(hit) && hit.length > 1) return err('节点标题重复，请用 mileId 指定');
    await kv.kvDel(K.mile(target.id));
    return ok(`已删除节点「${target.title}」。`);
  }
  return err(`未知 kind：${JSON.stringify(kind)}（可用 expense/category/vendor/milestone）`);
}

async function toolSummary() {
  const [project, cats, exps, vens, miles] = await Promise.all([
    getProject(), listCats(), listExps(), listVens(), listMiles(),
  ]);
  if (!cats.length && !exps.length) return ok('还没有任何记账数据——先用 zx_category action=template 采用标准科目模板，再录预算、记支出，然后就能生成对账小结。');
  return ok(core.buildSummary({ project, cats, expenses: exps, vendors: vens, milestones: miles }, Date.now()));
}

// ── 工具声明（JSON Schema）────────────────────────────────────────────────────
const money = { type: 'number', description: '金额（元）' };
const dateStr = { type: 'string', description: '日期 YYYY-MM-DD（缺省今天）' };

const TOOLS = [
  {
    name: 'zx_record',
    description: '记一笔装修支出。科目按名解析（精确→包含）；报价单外的科目会拒单并提示用 asExtra:true 一步建增项科目并记账（增项口径=科目 isExtra:true）。供应商按名自动建档。传 id 时幂等覆盖（AI 重试不双写）。返回该科目预算执行快照与项目总进度。',
    inputSchema: {
      type: 'object',
      properties: {
        amount: { ...money, description: '金额（元），必填，>0' },
        categoryName: { type: 'string', description: '科目名称（与 catId 二选一；如 瓷砖/水电改造）' },
        catId: { type: 'string', description: '科目 id（与 categoryName 二选一）' },
        asExtra: { type: 'boolean', description: '科目不存在时=true 则新建增项科目并记账；缺省拒单并提示' },
        date: dateStr,
        time: { type: 'string', description: '时间 HH:MM（缺省 12:00）' },
        vendorName: { type: 'string', description: '供应商名称（不存在自动建档）' },
        vendorId: { type: 'string', description: '供应商 id' },
        payMethod: { type: 'string', description: '支付方式（如 微信/转账/现金）' },
        note: { type: 'string', description: '备注（如 80x80 灰砖 3 箱）' },
        id: { type: 'string', description: '幂等键：同 id 覆盖旧记录' },
        projectName: { type: 'string', description: '首次使用时自动建项目，可指定项目名' },
      },
      required: ['amount'],
    },
  },
  {
    name: 'zx_category',
    description: '装修科目管理：add 建科目（isExtra:true 即增项科目）/ set 改预算与档案 / remove 删科目（有支出拒删，confirm 门）/ list 科目表含执行进度 / template 一键采用标准科目模板（内嵌防漏项清单）/ project 项目档案与总预算。',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['add', 'set', 'remove', 'list', 'template', 'project'], description: '动作' },
        name: { type: 'string', description: '科目名称' },
        group: { type: 'string', description: `分组：${core.GROUPS.join('/')}` },
        budget: { type: 'number', description: '科目预算（元）；传 null/空 清除' },
        isExtra: { type: 'boolean', description: '是否增项科目（报价单外新增）' },
        note: { type: 'string', description: '备注' },
        catId: { type: 'string', description: '科目 id（set/remove 定位用）' },
        confirm: { type: 'boolean', description: 'remove 删除确认' },
        projectName: { type: 'string', description: '首次使用时自动建项目名' },
        // project 动作
        house: { type: 'string', description: 'project: 房子/小区' },
        totalBudget: { type: 'number', description: 'project: 总预算（元，优先于科目预算合计）' },
        status: { type: 'string', enum: ['planning', 'active', 'done'], description: 'project: 状态' },
        startDate: dateStr,
      },
      required: ['action'],
    },
  },
  {
    name: 'zx_query',
    description: '查询装修台账（只查不建）：budget 预算执行总览与分科目红黄绿 / recent 支出流水（可按科目/供应商/日期过滤）/ extra 增项明细与合计 / vendors 供应商与已付 / milestones 节点红黄榜 / missing 常见漏项检查（报价单最爱漏的科目）。',
    inputSchema: {
      type: 'object',
      properties: {
        view: { type: 'string', enum: ['budget', 'recent', 'extra', 'vendors', 'milestones', 'missing'], description: '视图（缺省 budget）' },
        catName: { type: 'string', description: 'recent: 按科目过滤' },
        catId: { type: 'string', description: 'recent: 按科目 id 过滤' },
        vendorName: { type: 'string', description: 'recent: 按供应商过滤' },
        vendorId: { type: 'string', description: 'recent: 按供应商 id 过滤' },
        from: dateStr,
        to: dateStr,
        limit: { type: 'integer', description: 'recent: 返回条数（缺省 20，上限 100）' },
      },
    },
  },
  {
    name: 'zx_vendor',
    description: '装修供应商/工长档案：add 建档（角色/电话/合同额）/ set 修改 / list 一览含已付款统计。',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['add', 'set', 'list'], description: '动作（缺省 list）' },
        name: { type: 'string', description: '供应商名称' },
        role: { type: 'string', description: '角色（如 瓦工/全包公司/定制柜）' },
        phone: { type: 'string', description: '电话' },
        contractAmount: { type: 'number', description: '合同额（元）' },
        note: { type: 'string', description: '备注' },
        vendorId: { type: 'string', description: 'set 定位用' },
      },
    },
  },
  {
    name: 'zx_milestone',
    description: '装修工期节点：add 建（标题+日期）/ set 改 / done 标完成 / list 红黄榜（逾期红、3 天内黄）。节点只做记录与提示，不主动推送提醒。',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['add', 'set', 'done', 'list'], description: '动作（缺省 list）' },
        title: { type: 'string', description: '节点标题（如 水电验收/油工进场/竣工验收）' },
        date: dateStr,
        done: { type: 'boolean', description: '是否完成' },
        note: { type: 'string', description: '备注' },
        mileId: { type: 'string', description: 'set/done 定位用' },
      },
    },
  },
  {
    name: 'zx_update',
    description: '按 id 修改一笔装修支出（金额/科目/日期/供应商/备注；科目可迁移，改后返回该科目预算执行快照）。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '支出 id（zx_query view=recent 可查）' },
        amount: money,
        categoryName: { type: 'string', description: '迁移目标科目名' },
        catId: { type: 'string', description: '迁移目标科目 id' },
        date: dateStr,
        time: { type: 'string', description: '时间 HH:MM' },
        vendorName: { type: 'string', description: '供应商（须已建档）' },
        vendorId: { type: 'string', description: '供应商 id；空串清除' },
        payMethod: { type: 'string', description: '支付方式' },
        note: { type: 'string', description: '备注' },
      },
      required: ['id'],
    },
  },
  {
    name: 'zx_delete',
    description: '删除支出/科目/供应商/节点（confirm 门，不可逆）。科目有支出时拒删；删供应商保留历史流水。',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['expense', 'category', 'vendor', 'milestone'], description: '删除对象（缺省 expense）' },
        id: { type: 'string', description: '对象 id（expense 必填）' },
        catId: { type: 'string', description: 'category 定位' },
        categoryName: { type: 'string', description: 'category 定位（按名）' },
        vendorId: { type: 'string', description: 'vendor 定位' },
        vendorName: { type: 'string', description: 'vendor 定位（按名）' },
        mileId: { type: 'string', description: 'milestone 定位' },
        title: { type: 'string', description: 'milestone 定位（按标题）' },
        confirm: { type: 'boolean', description: '删除确认（必传 true）' },
      },
    },
  },
  {
    name: 'zx_summary',
    description: '生成装修对账小结 markdown：预算执行总览、分科目明细表、超支科目榜、常见漏项提醒、供应商付款、工期节点。可直接发给家人或用于与装修公司对账。只查不建。',
    inputSchema: { type: 'object', properties: {} },
  },
];

// ── 分发 ──────────────────────────────────────────────────────────────────────
const HANDLERS = {
  zx_record: toolRecord,
  zx_category: toolCategory,
  zx_query: toolQuery,
  zx_vendor: toolVendor,
  zx_milestone: toolMilestone,
  zx_update: toolUpdate,
  zx_delete: toolDelete,
  zx_summary: toolSummary,
};

process.stdin.setEncoding('utf8');
let buf = '';
process.stdin.on('data', (chunk) => {
  buf += chunk;
  let idx;
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (line) void handleLine(line);
  }
});
process.stdin.on('end', () => process.exit(0));

async function handleLine(line) {
  let msg;
  try { msg = JSON.parse(line); } catch (_) { return; }
  if (msg.method === 'initialize') {
    respond(msg.id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
    });
    return;
  }
  if (msg.method === 'ping') { respond(msg.id, {}); return; }
  if (msg.method === 'tools/list') {
    respond(msg.id, { tools: TOOLS });
    return;
  }
  if (msg.method === 'tools/call') {
    const name = msg.params && msg.params.name;
    const args = (msg.params && msg.params.arguments) || {};
    const fn = HANDLERS[name];
    if (!fn) {
      respond(msg.id, { result: err(`未知工具：${name}`) });
      return;
    }
    try {
      const result = await fn(args);
      respond(msg.id, { result });
    } catch (e) {
      log('error', `${name} failed: ${e && e.message}`);
      respond(msg.id, { result: err(`工具执行失败：${e && e.message}`) });
    }
    return;
  }
  if (msg.id !== undefined && (msg.method === 'notifications/initialized' || String(msg.method).startsWith('notifications/'))) return;
  if (msg.id !== undefined) respond(msg.id, { error: { code: -32601, message: `method not found: ${msg.method}` } });
}

function respond(id, payload) {
  const out = { jsonrpc: '2.0', id, ...(payload.error ? { error: payload.error } : { result: payload.result !== undefined ? payload.result : payload }) };
  process.stdout.write(JSON.stringify(out) + '\n');
}
