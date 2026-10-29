#!/usr/bin/env node
'use strict';
/**
 * duzhi MCP Server —— 消费账单的 AI 工具层（零依赖 stdio，零服务进程）
 *
 * 职责：把 AI 的 tools/call 翻译为对 cap.kv（经 Polaris IPC bridge 自发现）
 * 中 duzhi.* 键空间的读写；账单文件解析与透视全部走 shared/core（与面板同源）。
 * 本进程零外网请求；只在 duzhi_import 时读取 AI 显式给出的那一个文件路径。
 *
 * 工具一览（AI 侧约定：这是「账单导入与消费透视」，不构成理财建议——
 * 输出只陈述统计事实，不推荐任何产品）：
 *   duzhi_import   导入账单文件（微信/支付宝 zip 或 CSV；zip 需传解压密码 password）
 *   duzhi_summary  消费透视：月度现金流 / 分类占比 / 商户 top（month 或 from/to）
 *   duzhi_query    明细查询：关键词/分类/方向/金额（元）/时间过滤
 *   duzhi_rules    分类规则管理：list / add(kw,cat) / remove(kw)
 *   duzhi_recat    把已入库交易改分类：keyword 或 txnId + category（写入单笔覆盖）
 *   duzhi_forget   撤销一次导入批次：先不带 confirm 预览，再 confirm:true 执行
 *
 * 金额口径：cap.kv 里存「分」；工具入参 min/max 用「元」（AI 更自然），出参一律元字符串。
 */
const fs = require('fs');
const { createKvClient } = require('./kvclient');
const core = require('../shared/core');
const { sha256Hex } = require('../shared/sha256');

const SERVER_NAME = 'duzhi';
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

function ok(text) {
  return { content: [{ type: 'text', text }], isError: false };
}
function err(text) {
  return { content: [{ type: 'text', text }], isError: true };
}
const DISCLAIMER = '（消费账单只做账单导入与统计透视：分类为关键词规则口径，与实际消费性质可能有出入；不构成理财建议，金额以平台账单为准。）';

// ── 金额展示 ─────────────────────────────────────────────────────────────────
function fmtYuan(fen) {
  const s = core.fenToYuan(Math.round(Number(fen) || 0));
  const [i, d] = s.replace('-', '').split('.');
  const neg = (Number(fen) || 0) < 0 ? '-' : '';
  return `${neg}${i.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${d}`;
}
const signed = (fen) => (fen > 0 ? `+${fmtYuan(fen)}` : fmtYuan(fen));

// ── 存取（cap.kv：duzhi.* 键空间）────────────────────────────────────────────
async function loadMonthTxns(allKeys, ym) {
  const shardKeys = core.monthShardKeys(allKeys, ym);
  const txns = [];
  for (const k of shardKeys) {
    const v = await kv.kvGet(k).catch(() => null);
    if (v && Array.isArray(v.txns)) {
      for (const t of v.txns) {
        if (t && typeof t.id === 'string' && typeof t.amountFen === 'number') txns.push(t);
      }
    }
  }
  return txns;
}

async function loadAllTxns() {
  const keys = await kv.kvKeys();
  const monthKeys = keys.filter((k) => k.startsWith(core.MONTH_PREFIX));
  const yms = [...new Set(monthKeys.map((k) => {
    const rest = k.slice(core.MONTH_PREFIX.length);
    return rest.includes('#') ? rest.slice(0, rest.indexOf('#')) : rest;
  }))];
  const out = [];
  for (const ym of yms) out.push(...await loadMonthTxns(keys, ym));
  return { keys, txns: out };
}

async function writeMonth(allKeys, ym, txns) {
  const shards = core.packShards(txns);
  const oldKeys = core.monthShardKeys(allKeys, ym);
  for (let i = shards.length; i < oldKeys.length; i++) await kv.kvDel(oldKeys[i]);
  for (const s of shards) {
    await kv.kvSet(core.monthShardKey(ym, s.part), { v: 1, part: s.part, txns: s.txns });
  }
  return shards.length;
}

async function loadRules() {
  return core.normalizeRules(await kv.kvGet(core.RULES_KEY).catch(() => null));
}

async function loadOverrides() {
  const keys = await kv.kvKeys();
  const catKeys = keys.filter((k) => k.startsWith(core.CAT_PREFIX));
  const map = {};
  await Promise.all(catKeys.map(async (k) => {
    const v = await kv.kvGet(k).catch(() => null);
    if (v && typeof v.cat === 'string' && v.cat) map[k.slice(core.CAT_PREFIX.length)] = v;
  }));
  return map;
}

async function listImports() {
  const keys = await kv.kvKeys();
  const mine = keys.filter((k) => k.startsWith(core.IMPORT_PREFIX));
  const out = await Promise.all(mine.map(async (k) => {
    const v = await kv.kvGet(k).catch(() => null);
    return v && typeof v.id === 'string' ? v : null;
  }));
  return out.filter(Boolean).sort((a, b) => (a.at < b.at ? 1 : -1));
}

// ── 工具实现 ─────────────────────────────────────────────────────────────────
async function toolImport(args) {
  const p = String(args.path || '').trim();
  if (!p) return err('需要 path：账单 zip 或 CSV 的本机绝对路径（例如 D:\\Downloads\\微信支付账单.zip）');
  let st;
  try { st = fs.statSync(p); } catch (_) {
    return err(`文件不存在或不可读：${p}`);
  }
  if (!st.isFile()) return err(`不是一个文件：${p}`);
  if (st.size > core.MAX_FILE_BYTES) return err(`文件 ${(st.size / 1048576).toFixed(1)}MB 超过 64MB 上限，疑似拿错文件`);
  const bytes = new Uint8Array(fs.readFileSync(p));
  const parsed = await core.parseBillFile(bytes, { password: args.password ? String(args.password) : undefined });
  const at = new Date().toISOString();
  const importId = sha256Hex(`duzhi-import|${p}|${st.size}|${at}`).slice(0, 12);
  const txns = core.buildTxns(parsed.rows, parsed.source, importId, at);

  const { keys } = await loadAllTxns();
  const byMonth = core.groupByMonth(txns);
  let added = 0;
  let dup = 0;
  const freshTxns = [];
  for (const { ym, txns: incoming } of byMonth) {
    const existing = await loadMonthTxns(keys, ym);
    const merged = core.mergeTxns(existing, incoming);
    await writeMonth(keys, ym, merged.all);
    added += merged.added.length;
    dup += merged.dup;
    freshTxns.push(...merged.added);
  }

  const span = txns.length
    ? `${core.dayOf(txns[0].date)} ~ ${core.dayOf(txns[txns.length - 1].date)}`
    : '';
  if (added === 0) {
    return ok([
      `没有新写入：${parsed.rows.length} 笔全部与已有记录重复（交易单号+金额+时间+方向完全一致）。`,
      span ? `文件跨度：${span}。` : '',
      '如需看统计：duzhi_summary；如需撤销更早的导入：duzhi_forget。',
      DISCLAIMER,
    ].filter(Boolean).join('\n'));
  }

  // 批次汇总只统计「本批新写入」的交易
  const sums = freshTxns.reduce((acc, t) => {
    if (core.isRefundRow(t)) acc.refundFen += t.amountFen;
    else if (t.dir === 'in') acc.inFen += t.amountFen;
    else if (t.dir === 'out') acc.outFen += t.amountFen;
    return acc;
  }, { inFen: 0, outFen: 0, refundFen: 0 });
  const batch = {
    id: importId, src: parsed.source, file: p, csvName: parsed.csvName || '',
    rows: txns.length, newCount: added, dupCount: dup,
    inFen: sums.inFen, outFen: sums.outFen, refundFen: sums.refundFen,
    span, at,
  };
  await kv.kvSet(`${core.IMPORT_PREFIX}${importId}`, batch);
  return ok([
    `导入完成（${parsed.source === 'wechat' ? '微信账单' : '支付宝账单'}）：解析 ${txns.length} 笔，新入库 ${added} 笔${dup ? `，与已有记录重复 ${dup} 笔（自动跳过）` : ''}。`,
    span ? `账单跨度：${span}。` : '',
    `本批金额：收入 ${fmtYuan(sums.inFen)} 元，支出 ${fmtYuan(sums.outFen)} 元${sums.refundFen ? `，退款 ${fmtYuan(sums.refundFen)} 元` : ''}。`,
    `批次号 ${importId}（撤销用 duzhi_forget）。`,
    '下一步可用 duzhi_summary 看透视、duzhi_query 查明细。',
    DISCLAIMER,
  ].filter(Boolean).join('\n'));
}

function scopeOf(args) {
  const from = args.month ? `${args.month}-01` : (args.from || '');
  const to = args.month ? `${args.month}-31` : (args.to || '');
  return { from, to, month: args.month || '' };
}

async function toolSummary(args) {
  const { txns } = await loadAllTxns();
  if (!txns.length) {
    return ok(`还没有任何账单入库。导入方式：\n1. 手机/电脑上把微信（服务→钱包→账单→下载账单）或支付宝（我的→账单→开具交易流水证明）的账单发到邮箱；\n2. 下载 zip，把路径给我：duzhi_import path=... password=...（解压密码在微信支付通知消息/支付宝申请页）；\n3. 或者直接把 CSV 拖进消费账单面板。\n${DISCLAIMER}`);
  }
  const rules = await loadRules();
  const overrides = await loadOverrides();
  const sc = scopeOf(args);
  const scoped = core.filterTxns(txns, { from: sc.from, to: sc.to, month: sc.month, userRules: rules.rules, overrides });
  if (!scoped.length) return ok(`该范围（${sc.month || `${sc.from} ~ ${sc.to}`}）没有交易。${DISCLAIMER}`);
  const agg = core.aggregate(scoped, { userRules: rules.rules, overrides });
  const lines = [];
  const label = sc.month ? `【消费账单总览 ${sc.month}】` : `【消费账单总览 ${sc.from || '最早'} ~ ${sc.to || '最新'}】`;
  lines.push(label);
  lines.push(`合计：收入 ${fmtYuan(agg.totals.inFen)}，支出 ${fmtYuan(agg.totals.outFen)}，退款 ${fmtYuan(agg.totals.refundFen)}，净流 ${signed(agg.totals.netFen)}（${agg.totals.count} 笔）`);
  lines.push('');
  lines.push('月度现金流：');
  for (const m of agg.months) {
    lines.push(`  ${m.ym}  收 ${fmtYuan(m.inFen)} | 支 ${fmtYuan(m.outFen)} | 退 ${fmtYuan(m.refundFen)} | 净 ${signed(m.netFen)}（${m.count} 笔）`);
  }
  if (agg.categories.length) {
    lines.push('');
    lines.push(`支出分类 top${Math.min(agg.categories.length, 8)}（仅支出）：`);
    for (const c of agg.categories.slice(0, 8)) {
      const pct = agg.totals.outFen ? Math.round((c.outFen / agg.totals.outFen) * 100) : 0;
      lines.push(`  ${c.cat}  ${fmtYuan(c.outFen)} 元（${c.count} 笔，${pct}%）`);
    }
  }
  if (agg.merchants.length) {
    lines.push('');
    lines.push('商户 top：');
    for (const m of agg.merchants) {
      lines.push(`  ${m.name}  ${fmtYuan(m.outFen)} 元（${m.count} 笔）`);
    }
  }
  if (agg.neutralCount) {
    lines.push('');
    lines.push(`另有 ${agg.neutralCount} 笔中性交易（充值、理财互转等）未计入收支。`);
  }
  lines.push('');
  lines.push(DISCLAIMER);
  return ok(lines.join('\n'));
}

async function toolQuery(args) {
  const { txns } = await loadAllTxns();
  if (!txns.length) return ok(`还没有任何账单入库：先用 duzhi_import 导入账单文件。${DISCLAIMER}`);
  const rules = await loadRules();
  const overrides = await loadOverrides();
  const sc = scopeOf(args);
  const minFen = args.min !== undefined && args.min !== null && args.min !== '' ? core.moneyToFen(String(args.min)) : null;
  const maxFen = args.max !== undefined && args.max !== null && args.max !== '' ? core.moneyToFen(String(args.max)) : null;
  if (args.min !== undefined && args.min !== null && args.min !== '' && minFen === null) return err('min 不是合法金额（例如 35 或 35.5）');
  if (args.max !== undefined && args.max !== null && args.max !== '' && maxFen === null) return err('max 不是合法金额（例如 200）');
  const q = {
    keyword: args.keyword, category: args.category, dir: args.dir,
    month: sc.month, from: sc.from, to: sc.to,
    minFen: minFen === null ? undefined : minFen, maxFen: maxFen === null ? undefined : maxFen,
    userRules: rules.rules, overrides,
  };
  const hits = core.filterTxns(txns, q).sort((a, b) => (a.date < b.date ? 1 : -1));
  const limit = Math.max(1, Math.min(50, Number(args.limit) || 20));
  const shown = hits.slice(0, limit);
  const sum = hits.reduce((acc, t) => {
    if (core.isRefundRow(t)) acc.refundFen += t.amountFen;
    else if (t.dir === 'in') acc.inFen += t.amountFen;
    else if (t.dir === 'out') acc.outFen += t.amountFen;
    return acc;
  }, { inFen: 0, outFen: 0, refundFen: 0 });
  const lines = [`命中 ${hits.length} 笔${hits.length > shown.length ? `（显示最近 ${shown.length} 笔）` : ''}：收入 ${fmtYuan(sum.inFen)}，支出 ${fmtYuan(sum.outFen)}${sum.refundFen ? `，退款 ${fmtYuan(sum.refundFen)}` : ''}`];
  lines.push('');
  for (const t of shown) {
    const amt = core.isRefundRow(t) ? `退款 ${fmtYuan(t.amountFen)}` : `${t.dir === 'in' ? '+' : t.dir === 'out' ? '-' : '±'}${fmtYuan(t.amountFen)}`;
    const cat = core.categorize(t, rules.rules, overrides);
    lines.push(`  ${t.date}  ${amt}  ${t.name || '(未知商户)'}${t.item ? `（${t.item}）` : ''} [${cat}] ${t.method ? `· ${t.method}` : ''} · id=${t.id}`);
  }
  lines.push('');
  lines.push('改分类可用 duzhi_recat（按 id 或关键词），或 duzhi_rules 加规则让以后自动归。');
  lines.push(DISCLAIMER);
  return ok(lines.join('\n'));
}

async function toolRules(args) {
  const action = String(args.action || 'list');
  const cur = await loadRules();
  if (action === 'list') {
    const lines = [`自定义分类规则 ${cur.rules.length} 条（先命中先用；未命中走内置 ${core.DEFAULT_RULES.length} 条默认规则）：`];
    for (const r of cur.rules) lines.push(`  「${r.kw}」→ ${r.cat}`);
    if (!cur.rules.length) lines.push('  （空：所有分类先走内置默认规则，再落到「其他」）');
    lines.push('');
    lines.push(`内置默认规则示例：${core.DEFAULT_RULES.slice(0, 10).map((r) => `${r.kw}→${r.cat}`).join('、')}…`);
    lines.push('加规则：duzhi_rules action=add kw=瑞幸 cat=咖啡奶茶；删规则：action=remove kw=瑞幸');
    return ok(lines.join('\n'));
  }
  if (action === 'add') {
    const kw = String(args.kw || '').trim();
    const cat = String(args.cat || '').trim();
    if (!kw || !cat) return err('需要 kw（关键词，匹配交易对方/商品/类型）和 cat（分类名）');
    const next = cur.rules.filter((r) => r.kw !== kw);
    next.unshift({ kw, cat });
    const norm = core.normalizeRules({ rules: next });
    await kv.kvSet(core.RULES_KEY, norm);
    return ok(`已加规则「${kw}」→ ${cat}（排最前，优先命中；共 ${norm.rules.length} 条自定义规则）。对已入库的存量交易不生效——要改存量用 duzhi_recat。`);
  }
  if (action === 'remove') {
    const kw = String(args.kw || '').trim();
    if (!kw) return err('需要 kw：要删除的规则关键词（duzhi_rules action=list 可查）');
    const next = cur.rules.filter((r) => r.kw !== kw);
    if (next.length === cur.rules.length) return err(`没有关键词为「${kw}」的自定义规则`);
    await kv.kvSet(core.RULES_KEY, core.normalizeRules({ rules: next }));
    return ok(`已删规则「${kw}」（剩 ${next.length} 条自定义规则）。`);
  }
  return err('action 只支持 list / add / remove');
}

async function toolRecat(args) {
  const category = String(args.category || '').trim();
  if (!category) return err('需要 category：新的分类名');
  const kw = String(args.keyword || '').trim();
  const txnId = String(args.txnId || '').trim();
  if (!kw && !txnId) return err('需要 keyword（按关键词批量改）或 txnId（改单笔）；两者都可给');
  const { txns } = await loadAllTxns();
  if (!txns.length) return ok(`还没有账单入库。${DISCLAIMER}`);
  let targets;
  if (txnId) {
    targets = txns.filter((t) => t.id === txnId);
    if (!targets.length) return err(`找不到 id=${txnId} 的交易（duzhi_query 输出里有每笔的 id）`);
  } else {
    targets = txns.filter((t) => `${t.name}\n${t.item}\n${t.type}`.includes(kw));
    if (!targets.length) return err(`没有交易对方/商品/类型包含「${kw}」的已入库交易`);
    if (targets.length > 1000) {
      return err(`「${kw}」命中 ${targets.length} 笔，超过单次 1000 笔上限：请加更具体的关键词，或改用 duzhi_rules 加规则让以后自动归类`);
    }
  }
  let n = 0;
  for (const t of targets) {
    await kv.kvSet(`${core.CAT_PREFIX}${t.id}`, { cat: category });
    n++;
  }
  return ok(`已把 ${n} 笔交易改分类为「${category}」（单笔覆盖，优先于规则）。要以后自动归，再 duzhi_rules action=add kw=${kw || txnId} cat=${category}。`);
}

async function toolForget(args) {
  const batches = await listImports();
  if (!batches.length) return ok('还没有任何导入批次可撤销。');
  let target = null;
  if (args.importId) {
    target = batches.find((b) => b.id === String(args.importId));
    if (!target) return err(`找不到批次 ${args.importId}（现有批次：${batches.slice(0, 5).map((b) => `${b.id} ${b.file}`).join('；')}）`);
  } else if (args.latest) {
    target = batches[0];
  } else {
    const lines = ['可撤销的导入批次（最近的在前）：'];
    for (const b of batches.slice(0, 10)) {
      lines.push(`  ${b.id}  ${b.src === 'wechat' ? '微信' : '支付宝'}  ${b.newCount} 笔  ${b.span || ''}  ${b.file}  ${b.at}`);
    }
    lines.push('');
    lines.push('撤销：duzhi_forget importId=... confirm=true（先不带 confirm 可预览）');
    return ok(lines.join('\n'));
  }
  const preview = `${target.src === 'wechat' ? '微信' : '支付宝'}账单批次 ${target.id}：${target.newCount} 笔（解析 ${target.rows}，重复跳过 ${target.dupCount}），${target.span || ''}，收入 ${fmtYuan(target.inFen)} 支出 ${fmtYuan(target.outFen)}，来源 ${target.file}`;
  if (!args.confirm) {
    return ok(`将撤销：${preview}\n确认执行请再调一次并传 confirm=true。`);
  }
  const { keys, txns } = await loadAllTxns();
  const byMonth = core.groupByMonth(txns);
  let removed = 0;
  for (const { ym, txns: monthTxns } of byMonth) {
    const r = core.removeByImport(monthTxns, args.importId ? String(args.importId) : target.id);
    if (r.removed > 0) {
      await writeMonth(keys, ym, r.keep);
      removed += r.removed;
    }
  }
  await kv.kvDel(`${core.IMPORT_PREFIX}${target.id}`);
  // 批次撤销后，其单笔分类覆盖一并清理
  const removedIds = new Set();
  const gone = txns.filter((t) => t.importId === target.id);
  for (const t of gone) removedIds.add(t.id);
  for (const id of removedIds) await kv.kvDel(`${core.CAT_PREFIX}${id}`).catch(() => {});
  return ok(`已撤销：${preview}\n实际移除 ${removed} 笔。数据可重新导入（重复导入会自动去重）。`);
}

// ── MCP 协议层 ───────────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: 'duzhi_import',
    description: '导入微信/支付宝官方导出的账单文件（zip 或 CSV）到本地账本。zip 已加密时必须传 password（微信账单解压密码在「微信支付」通知消息里；支付宝在申请导出时设置）。自动跨月去重：同单号+金额+时间+方向的重复交易不会重复入库。',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '账单文件的本机绝对路径（如 D:\\Downloads\\微信支付账单(20250101-20251031).zip）' },
        password: { type: 'string', description: 'zip 解压密码（仅加密 zip 需要；不落盘、不写日志）' },
      },
      required: ['path'],
    },
  },
  {
    name: 'duzhi_summary',
    description: '消费透视报表：月度现金流（收入/支出/退款/净流）、支出分类占比、商户 top。可传 month（如 2025-10）或 from/to（YYYY-MM-DD），都不传则全量。',
    inputSchema: {
      type: 'object',
      properties: {
        month: { type: 'string', description: '按月看，如 2025-10' },
        from: { type: 'string', description: '起始日 YYYY-MM-DD' },
        to: { type: 'string', description: '结束日 YYYY-MM-DD' },
      },
    },
  },
  {
    name: 'duzhi_query',
    description: '查账单明细：按关键词（匹配交易对方/商品/类型/备注/支付方式）、分类、方向（in/out/neutral）、金额范围（元）、时间过滤；返回逐笔列表（含 id，供改分类）与合计。回答「上月奶茶花了多少」这类问题用它。',
    inputSchema: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: '关键词，如 瑞幸' },
        category: { type: 'string', description: '按分类过滤，如 咖啡奶茶' },
        dir: { type: 'string', description: 'in=收入 out=支出 neutral=中性' },
        min: { type: 'string', description: '最小金额（元）' },
        max: { type: 'string', description: '最大金额（元）' },
        month: { type: 'string', description: '按月，如 2025-10' },
        from: { type: 'string', description: '起始日 YYYY-MM-DD' },
        to: { type: 'string', description: '结束日 YYYY-MM-DD' },
        limit: { type: 'number', description: '返回条数上限，默认 20，最大 50' },
      },
    },
  },
  {
    name: 'duzhi_rules',
    description: '管理分类关键词规则（自定义规则优先于内置默认规则；对已入库存量不生效，改存量用 duzhi_recat）。',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'list / add / remove' },
        kw: { type: 'string', description: '关键词（add/remove 必填）' },
        cat: { type: 'string', description: '分类名（add 必填）' },
      },
      required: ['action'],
    },
  },
  {
    name: 'duzhi_recat',
    description: '把已入库交易的分类改掉（写单笔覆盖，优先于规则）：keyword 按关键词批量（≤1000 笔）或 txnId 改单笔。要以后导入自动归，请配合 duzhi_rules action=add。',
    inputSchema: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: '按关键词批量改（匹配交易对方/商品/类型）' },
        txnId: { type: 'string', description: '改单笔（id 见 duzhi_query 输出）' },
        category: { type: 'string', description: '新分类名' },
      },
      required: ['category'],
    },
  },
  {
    name: 'duzhi_forget',
    description: '撤销一次导入批次（按批次整批移除；已做单笔改分类的记录一并清理）。不带参数列出批次；带 importId 预览；再传 confirm=true 执行。',
    inputSchema: {
      type: 'object',
      properties: {
        importId: { type: 'string', description: '批次号（duzhi_forget 不带参数可查）' },
        latest: { type: 'boolean', description: '撤销最近一次导入' },
        confirm: { type: 'boolean', description: '确认执行；不传只预览' },
      },
    },
  },
];

async function callTool(name, args) {
  switch (name) {
    case 'duzhi_import': return toolImport(args || {});
    case 'duzhi_summary': return toolSummary(args || {});
    case 'duzhi_query': return toolQuery(args || {});
    case 'duzhi_rules': return toolRules(args || {});
    case 'duzhi_recat': return toolRecat(args || {});
    case 'duzhi_forget': return toolForget(args || {});
    default: return err(`未知工具 ${name}`);
  }
}

process.stdout.setEncoding('utf8');
process.stdin.setEncoding('utf8');
let buf = '';
process.stdin.on('data', (c) => {
  buf += c;
  while (true) {
    const i = buf.indexOf('\n');
    if (i === -1) break;
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch (_) { continue; }
    handleMessage(msg);
  }
});
process.stdin.on('end', () => process.exit(0));

function handleMessage(msg) {
  if (!msg || msg.id === undefined || msg.id === null) return; // notification
  if (msg.method === 'initialize') {
    respond(msg.id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
    });
    return;
  }
  if (msg.method === 'tools/list') {
    respond(msg.id, { tools: TOOLS });
    return;
  }
  if (msg.method === 'tools/call') {
    const { name, arguments: args } = msg.params || {};
    callTool(name, args)
      .then((r) => respond(msg.id, r))
      .catch((e) => {
        log('error', `tools/call ${name}: ${e && e.stack ? e.stack.split('\n')[0] : e}`);
        respond(msg.id, err(`执行失败：${e && e.message ? e.message : String(e)}`));
      });
    return;
  }
  respond(msg.id, err(`不支持的方法 ${msg.method}`));
}
function respond(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`);
}

log('info', 'duzhi MCP server ready (stdio, zero-service)');
