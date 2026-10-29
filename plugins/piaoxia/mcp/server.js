#!/usr/bin/env node
'use strict';
/**
 * server.js —— 发票保险库 MCP server（stdio JSON-RPC 2.0，零 npm 依赖）
 *
 * 范式对齐 wenjin：description 即 prompt 工程；业务校验在 call() 内手写并返回
 * 中文可操作错误（错误文案里写下一步该用哪个工具）；normalize* 是写入唯一入口；
 * id 内容寻址幂等；删除有 confirm 门（AI 必须先向用户确认）。
 *
 * 与 service 共用 engine（解析）与 vault（扫描/归档）；数据面经 IPC bridge 写 cap.kv。
 */
const core = require('../shared/core.js');
const engine = require('../service/engine.js');
const vault = require('../service/vault.js');
const { createKvClient } = require('../service/kvclient.js');

const VERSION = '0.1.0';
const APP_CONFIG_DIR = process.argv[2] || '';

function log(msg) {
  process.stderr.write(`[piaoxia:mcp] ${new Date().toISOString()} ${msg}\n`);
}

// ── IPC bridge（自发现 + md5 token，样板同 service）────────────────────────
const kv = createKvClient({ appConfigDir: APP_CONFIG_DIR, log });

async function kvGet(key) {
  return kv.kvGet(key);
}
async function kvSet(key, value) {
  await kv.kvSet(key, value);
  return true;
}
async function kvDel(key) {
  await kv.kvDel(key);
  return true;
}
async function kvKeys() {
  return kv.kvKeys();
}

async function beat(by) {
  try {
    await kvSet(core.K.META + '.mcp', { by, at: new Date().toISOString(), version: VERSION });
  } catch (_) { /* 心跳失败不影响业务 */ }
}

// ── 数据装载（一条一键，规避列表并发覆盖）──────────────────────────────────

async function loadInvoices() {
  const keys = (await kvKeys()).filter((k) => k.startsWith(core.K.INVOICE));
  const map = new Map();
  await Promise.all(keys.map(async (k) => {
    try {
      const v = await kvGet(k);
      if (v && typeof v === 'object' && v.id) map.set(v.id, v);
    } catch (_) { /* 容忍单键读取失败 */ }
  }));
  return map;
}

async function loadTitles() {
  const keys = (await kvKeys()).filter((k) => k.startsWith(core.K.TITLE));
  const map = new Map();
  await Promise.all(keys.map(async (k) => {
    try {
      const v = await kvGet(k);
      if (v && typeof v === 'object' && v.id) map.set(v.id, v);
    } catch (_) { /* 容忍 */ }
  }));
  return map;
}

async function saveInvoice(inv) {
  inv.updatedAt = new Date().toISOString();
  await kvSet(core.K.INVOICE + inv.id, inv);
}

function findInvoice(map, ref) {
  if (!ref) return null;
  const num = core.digitsOnly(ref);
  if (num) {
    for (const inv of map.values()) {
      if (inv.number && inv.number === num) return inv;
    }
  }
  for (const inv of map.values()) {
    if (inv.id === ref) return inv;
  }
  return null;
}

// ── 工具实现 ────────────────────────────────────────────────────────────────

function fmtInv(inv) {
  const parts = [
    inv.number || '（无号码）',
    inv.date || '日期?',
    inv.seller.name || '销方?',
    '¥' + core.num2(inv.total),
    core.STATUSES[inv.status] || inv.status,
    core.CATEGORIES[inv.category] || inv.category,
  ];
  return parts.join(' | ') + `  [id=${inv.id}]`;
}

async function toolCollect(args) {
  const p = String(args.path || '').trim();
  if (!p) return err('需要 path 参数：一个电子发票文件（.pdf/.xml）或目录的绝对路径');
  const st = await fsStat(p);
  if (!st) return err('路径不存在：' + p);
  const map = await loadInvoices();
  const dataRoot = vault.resolveDataRoot(APP_CONFIG_DIR);

  let files = [];
  if (st.isDirectory()) {
    const scan = vault.scanInvoices(p, { recursive: args.recursive !== false });
    if (scan.error) return err(scan.error);
    files = scan.files.map((f) => ({ name: f.name, path: f.path }));
    if (!files.length) return ok('目录里没有找到 .pdf/.xml 发票文件：' + p + '（子目录递归=' + (args.recursive !== false ? '开' : '关') + '，可用 recursive=false 关闭）');
  } else {
    files = [{ name: p.replace(/\\/g, '/').split('/').pop(), path: p }];
  }

  const added = [];
  const dupes = [];
  const failed = [];
  const seenSha = new Set();
  for (const f of files.slice(0, vault.MAX_SCAN_FILES)) {
    let bytes;
    try {
      bytes = vault.readInvoiceFile(f.path);
    } catch (_) {
      bytes = null;
    }
    if (!bytes) { failed.push(f.name + '（不可读/空/超 20MB）'); continue; }
    const sha = vault.sha256FileBytes(bytes);
    // eslint-disable-next-line no-await-in-loop
    const r = await engine.parseAuto({ name: f.name, bytes });
    if (!r.ok) { failed.push(f.name + '（' + r.error + '）'); continue; }
    if (seenSha.has(sha)) { dupes.push(f.name + '（本批同文件）'); continue; }
    // eslint-disable-next-line no-await-in-loop
    const inv = core.normalizeInvoice(Object.assign({}, r.draft, {
      source: 'collect', fileName: f.name, srcPath: f.path, fileSha256: sha,
    }), null);
    seenSha.add(sha);
    const existing = map.get(inv.id);
    if (existing) {
      // 同号码已入账：把本次原件信息补进旧票（归档路径/来源），不覆盖金额等账面字段
      let touched = false;
      if (dataRoot && !existing.archivedPath) {
        // eslint-disable-next-line no-await-in-loop
        const archived = vault.archiveOriginal(dataRoot, existing, bytes, f.name);
        if (archived) { existing.archivedPath = archived; touched = true; }
      }
      if (!existing.fileSha256) { existing.fileSha256 = sha; touched = true; }
      if (touched) await saveInvoice(existing);
      dupes.push(f.name + '（发票号码 ' + inv.number + ' 已入账，状态：' + core.STATUSES[existing.status] + '）');
      continue;
    }
    if (dataRoot) {
      // eslint-disable-next-line no-await-in-loop
      const archived = vault.archiveOriginal(dataRoot, inv, bytes, f.name);
      if (archived) inv.archivedPath = archived;
      // eslint-disable-next-line no-await-in-loop
      else await Promise.resolve();
    }
    await saveInvoice(inv);
    map.set(inv.id, inv);
    added.push(fmtInv(inv) + (r.warnings && r.warnings.length ? '  ⚠ ' + r.warnings.join('；') : ''));
  }

  const lines = [];
  lines.push('收票完成：新增 ' + added.length + ' 张，重复跳过 ' + dupes.length + ' 个，失败 ' + failed.length + ' 个。');
  if (added.length) lines.push('\n【新增】\n' + added.join('\n'));
  if (dupes.length) lines.push('\n【重复（未改动账面）】\n' + dupes.join('\n'));
  if (failed.length) lines.push('\n【失败（需人工处理）】\n' + failed.join('\n'));
  if (failed.length) lines.push('\n扫描件/纸质票无法解析（发票保险库不做 OCR）：让用户在票册「手动录入」，或用 piaoxia_add 直接入账。');
  await beat('collect');
  return ok(lines.join('\n'));
}

async function fsStat(p) {
  const fs = require('fs');
  try {
    return fs.statSync(p);
  } catch (_) {
    return null;
  }
}

async function toolAdd(args) {
  if (!args || (args.total === undefined && args.number === undefined)) {
    return err('需要 total（价税合计，正数）；纸质票没有号码可不给 number，但金额必须有');
  }
  const map = await loadInvoices();
  let inv;
  try {
    inv = core.normalizeInvoice(Object.assign({}, args, {
      source: 'manual',
      seller: { name: args.sellerName || '', taxId: args.sellerTaxId || '' },
      buyer: { name: args.buyerName || '', taxId: args.buyerTaxId || '' },
    }), null);
  } catch (e) {
    return err('入账失败：' + e.message + '。date 用 YYYY-MM-DD；total 是价税合计正数；category 可给：' +
      Object.keys(core.CATEGORIES).join('/'));
  }
  const existing = map.get(inv.id);
  if (existing && inv.number) {
    return err('发票号码 ' + inv.number + ' 已入账（状态：' + core.STATUSES[existing.status] + '，¥' + core.num2(existing.total) + '）。' +
      '重复票不要重复入账；要改信息用 piaoxia_update，要推进报销用 piaoxia_set_status。');
  }
  await saveInvoice(inv);
  await beat('add');
  return ok('已入账：' + fmtInv(inv) + (inv.warrantyUntil ? '  保修至 ' + inv.warrantyUntil : '') +
    '\n提示：推进报销状态用 piaoxia_set_status（submit→settle）；纸质票原件请自行妥善保存。');
}

async function toolQuery(args) {
  const type = String((args && args.type) || 'stats');
  const map = await loadInvoices();
  const invoices = Array.from(map.values());
  const titles = await loadTitles();
  const view = core.buildView(invoices, titles, Date.now());
  const nowMs = Date.now();

  if (type === 'pending') {
    if (!view.pending.count) return ok('当前没有待报销的票。');
    const lines = view.pending.list.map((inv, i) => (i + 1) + '. ' + fmtInv(inv));
    let s = '待报销共 ' + view.pending.count + ' 张，合计 ¥' + core.num2(view.pending.total) + '：\n' + lines.join('\n');
    if (view.pending.stale.length) {
      s += '\n\n⚠ 开票超过 60 天仍未报销 ' + view.pending.stale.length + ' 张（最早的 ' + view.pending.stale[0].date + '），小心报销过期。';
    }
    return ok(s);
  }

  if (type === 'month') {
    const month = /^\d{4}-\d{2}$/.test(String(args.month || '')) ? args.month : view.thisMonth;
    const list = invoices
      .filter((inv) => inv.date && inv.date.slice(0, 7) === month && inv.status !== 'excluded')
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
    if (!list.length) return ok(month + ' 没有开票记录。');
    const total = list.reduce((s, x) => s + x.total, 0);
    const byStatus = {};
    for (const inv of list) byStatus[inv.status] = (byStatus[inv.status] || 0) + inv.total;
    const statLine = Object.keys(byStatus).map((k) => core.STATUSES[k] + ' ¥' + core.num2(byStatus[k])).join('，');
    return ok(month + ' 共开票 ' + list.length + ' 张、¥' + core.num2(total) + '（' + statLine + '）：\n' +
      list.map((inv, i) => (i + 1) + '. ' + fmtInv(inv)).join('\n'));
  }

  if (type === 'category') {
    const rows = view.byCategory.map((r) => r.label + '：' + r.count + ' 张 / ¥' + core.num2(r.total));
    const cat = args.category ? core.labelToKey(core.CATEGORIES, String(args.category)) : null;
    if (cat) {
      const list = invoices.filter((inv) => inv.category === cat && inv.status !== 'excluded');
      return ok('分类「' + core.CATEGORIES[cat] + '」共 ' + list.length + ' 张 / ¥' +
        core.num2(list.reduce((s, x) => s + x.total, 0)) + '：\n' + list.map((inv, i) => (i + 1) + '. ' + fmtInv(inv)).join('\n'));
    }
    return ok('分类汇总（不含不报销）：\n' + rows.join('\n'));
  }

  if (type === 'seller') {
    const q = core.normName(args.seller || '');
    if (!q) return ok('全年销方 TOP：\n' + view.sellers.map((s, i) => (i + 1) + '. ' + s.name + '：' + s.count + ' 张 / ¥' + core.num2(s.total)).join('\n'));
    const list = invoices.filter((inv) => core.normName(inv.seller.name).indexOf(q) !== -1)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    if (!list.length) return ok('没有找到销方含「' + args.seller + '」的票。');
    return ok('销方含「' + args.seller + '」共 ' + list.length + ' 张：\n' + list.map((inv, i) => (i + 1) + '. ' + fmtInv(inv)).join('\n'));
  }

  if (type === 'reimburse') {
    if (args.reimburseId) {
      const list = invoices.filter((inv) => inv.reimburseId === String(args.reimburseId))
        .sort((a, b) => String(a.date).localeCompare(String(b.date)));
      if (!list.length) return ok('没有报销单号为「' + args.reimburseId + '」的票。');
      const total = list.reduce((s, x) => s + x.total, 0);
      const settled = list.filter((x) => x.status === 'settled').length;
      return ok('报销单 ' + args.reimburseId + '：' + list.length + ' 张 / ¥' + core.num2(total) + '，其中已到账 ' + settled + ' 张：\n' +
        list.map((inv, i) => (i + 1) + '. ' + fmtInv(inv)).join('\n'));
    }
    if (!view.reimburseGroups.length) return ok('还没有登记过报销单号（提交报销时用 piaoxia_set_status 的 submit + reimburseId 登记）。');
    return ok('报销单一览（按最近活动）：\n' + view.reimburseGroups.map((g, i) => {
      const stSummary = Object.keys(g.statuses).map((k) => core.STATUSES[k] + '×' + g.statuses[k]).join('，');
      return (i + 1) + '. ' + g.id + '：' + g.count + ' 张 / ¥' + core.num2(g.total) + '（' + stSummary + '）';
    }).join('\n'));
  }

  if (type === 'warranty') {
    if (!view.warrantyUpcoming.length) {
      const withW = invoices.filter((inv) => inv.warrantyUntil).length;
      return ok('没有 90 天内到期的保修。' + (withW ? '（已登记保修的票共 ' + withW + ' 张）' : '还没有票登记保修期——给票补保修用 piaoxia_update 的 warrantyMonths（从开票日起算）。'));
    }
    return ok('保修到期榜（90 天内）：\n' + view.warrantyUpcoming.map((x, i) => {
      const d = x.daysLeft;
      const when = d < 0 ? '已过期 ' + (-d) + ' 天' : (d === 0 ? '今天到期' : '还剩 ' + d + ' 天');
      return (i + 1) + '. ' + (x.inv.seller.name || '销方?') + ' ¥' + core.num2(x.inv.total) + '（' + x.inv.date + '）保修至 ' + x.inv.warrantyUntil + '，' + when +
        (x.inv.archivedPath ? '\n   原件：' + x.inv.archivedPath : '');
    }).join('\n'));
  }

  if (type === 'search') {
    const q = core.normName(args.q || '');
    if (!q) return err('search 需要 q 参数（号码/销方/品名/备注关键词）');
    const list = invoices.filter((inv) => {
      const hay = core.normName([inv.number, inv.seller.name, inv.buyer.name, inv.note, inv.fileName, inv.reimburseId]
        .concat(inv.items.map((x) => x.name)).join('|'));
      return hay.indexOf(q) !== -1;
    }).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    if (!list.length) return ok('没有匹配「' + args.q + '」的票。');
    return ok('匹配「' + args.q + '」共 ' + list.length + ' 张：\n' + list.map((inv, i) => (i + 1) + '. ' + fmtInv(inv)).join('\n'));
  }

  // stats（默认）
  const catRows = view.byCategory.map((r) => r.label + ' ¥' + core.num2(r.total) + '（' + r.count + '张）').join('，');
  return ok([
    '发票保险库总览：共 ' + view.counts.all + ' 张。',
    '待报销 ' + view.pending.count + ' 张 / ¥' + core.num2(view.pending.total) + '；在途（已提交未到账）' + view.inFlight.count + ' 张 / ¥' + core.num2(view.inFlight.total) + '。',
    view.thisMonth + '：开票 ' + view.month.opened.count + ' 张 / ¥' + core.num2(view.month.opened.total) +
    '；到账 ' + view.month.settled.count + ' 张 / ¥' + core.num2(view.month.settled.total) + '。',
    view.year.key + ' 年累计开票 ¥' + core.num2(view.year.total) + '（' + view.year.count + ' 张，不含不报销）。',
    '分类：' + (catRows || '暂无') + '。',
    view.pending.stale.length ? '⚠ 有 ' + view.pending.stale.length + ' 张待报销票开票已超 60 天。' : '',
  ].filter(Boolean).join('\n'));
}

const STATUS_ACTIONS = {
  submit: 'submitted', settle: 'settled', reject: 'rejected',
  reopen: 'pending', restore: 'pending', archive: 'excluded',
};

async function toolSetStatus(args) {
  const action = String((args && args.action) || '');
  if (!STATUS_ACTIONS[action]) {
    return err('action 必须是：submit（已提交）/ settle（已到账）/ reject（已退回）/ reopen（放回待报销）/ archive（不报销）/ restore（恢复）');
  }
  const map = await loadInvoices();
  const inv = findInvoice(map, args.number || args.id);
  if (!inv) return err('找不到这张票（number=' + (args.number || '') + '）。先用 piaoxia_query type=search 查号码，或 piaoxia_collect 收票。');
  const to = STATUS_ACTIONS[action];
  let next;
  try {
    next = core.applyTransition(inv, to, {
      nowMs: Date.now(),
      nowIso: new Date().toISOString(),
      reimburseId: args.reimburseId,
      rejectNote: args.rejectNote,
    });
  } catch (e) {
    return err('状态流转失败：' + e.message + '。当前 ' + core.STATUSES[inv.status] + '，先查 piaoxia_query 确认。');
  }
  if (inv.status === to) return ok('状态未变化（已是' + core.STATUSES[to] + '）：' + fmtInv(inv));
  await saveInvoice(next);
  await beat('set_status');
  let extra = '';
  if (to === 'submitted' && next.reimburseId) extra = '（报销单 ' + next.reimburseId + '）';
  if (to === 'rejected' && next.rejectNote) extra = '（原因：' + next.rejectNote + '）';
  return ok('已流转：' + (inv.number || '（无号码）') + ' ' + core.STATUSES[inv.status] + ' → ' + core.STATUSES[to] + extra + '\n' + fmtInv(next));
}

async function toolUpdate(args) {
  const map = await loadInvoices();
  const inv = findInvoice(map, args.number || args.id);
  if (!inv) return err('找不到这张票（number=' + (args.number || '') + '）。先用 piaoxia_query type=search 定位。');
  const patch = {};
  const FIELDS = ['number', 'code', 'kind', 'title', 'date', 'category', 'purpose', 'reimburseId', 'note', 'warrantyMonths'];
  for (const f of FIELDS) {
    if (args[f] !== undefined) patch[f] = args[f];
  }
  if (args.sellerName !== undefined || args.sellerTaxId !== undefined) {
    patch.seller = { name: args.sellerName !== undefined ? args.sellerName : inv.seller.name, taxId: args.sellerTaxId !== undefined ? args.sellerTaxId : inv.seller.taxId };
  }
  if (args.buyerName !== undefined || args.buyerTaxId !== undefined) {
    patch.buyer = { name: args.buyerName !== undefined ? args.buyerName : inv.buyer.name, taxId: args.buyerTaxId !== undefined ? args.buyerTaxId : inv.buyer.taxId };
  }
  if (args.total !== undefined && Number(args.total) > 0) patch.total = Number(args.total);
  let next;
  try {
    next = core.normalizeInvoice(patch, inv); // prev 继承：部分补丁语义
  } catch (e) {
    return err('更新失败：' + e.message);
  }
  const idChanged = next.id !== inv.id; // 改号码会换 id
  if (idChanged && map.get(next.id)) {
    return err('目标发票号码 ' + next.number + ' 已存在另一张票，不能改成重复号码。');
  }
  await saveInvoice(next);
  if (idChanged) {
    next.createdAt = inv.createdAt || next.createdAt;
    await kvDel(core.K.INVOICE + inv.id);
  }
  await beat('update');
  return ok('已更新：' + fmtInv(next) + (idChanged ? '（号码变更，旧记录已迁移）' : '') +
    (next.warrantyUntil ? '  保修至 ' + next.warrantyUntil : ''));
}

async function toolDelete(args) {
  if (!args || args.confirm !== true) {
    return err('删除需要 confirm=true（不可恢复）。请先向用户复述这张票（' + '号码/销方/金额' + '）并确认后再删。');
  }
  const map = await loadInvoices();
  const inv = findInvoice(map, args.number || args.id);
  if (!inv) return err('找不到要删的票（number=' + (args.number || '') + '）。');
  await kvDel(core.K.INVOICE + inv.id);
  await beat('delete');
  let extra = '';
  if (inv.archivedPath) extra = '注意：归档原件 ' + inv.archivedPath + ' 未删除，需要的话手动清理。';
  return ok('已删除：' + fmtInv(inv) + '\n' + extra);
}

async function toolTitles(args) {
  const action = String((args && args.action) || 'list');
  const map = await loadTitles();
  if (action === 'list') {
    if (!map.size) return ok('还没有抬头。添加用 piaoxia_titles action=add（name 必填，taxId 是统一社会信用代码）。');
    const list = Array.from(map.values()).sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0) || a.name.localeCompare(b.name));
    return ok('抬头 ' + list.length + ' 个：\n' + list.map((t, i) => {
      return (i + 1) + '. ' + t.name + (t.taxId ? '（' + t.taxId + '）' : '') + (t.isDefault ? '【默认】' : '') + ' [id=' + t.id + ']';
    }).join('\n') + '\n复制完整开票信息用 action=copy。');
  }
  if (action === 'copy') {
    const t = args.id ? map.get(args.id) : Array.from(map.values()).find((x) => x.isDefault) || Array.from(map.values())[0];
    if (!t) return ok('还没有抬头可复制。');
    return ok('【' + t.name + '】开票信息（可直接贴给开票员）：\n' + core.titleCopyText(t));
  }
  if (action === 'add') {
    let t;
    try {
      t = core.normalizeTitle(args, null);
    } catch (e) {
      return err('抬头添加失败：' + e.message + '（name 必填；taxId 为统一社会信用代码 18 位）');
    }
    const existing = map.get(t.id);
    if (existing) return err('抬头「' + t.name + '」已存在（相同名称+税号）。要改用 action=delete 后重加，或直接用现有抬头。');
    if (t.isDefault) {
      for (const other of map.values()) {
        if (other.isDefault) { other.isDefault = false; await kvSet(core.K.TITLE + other.id, other); }
      }
    }
    await kvSet(core.K.TITLE + t.id, t);
    await beat('titles');
    return ok('已保存抬头：' + t.name + (t.isDefault ? '【默认】' : '') + '\n开票信息：\n' + core.titleCopyText(t));
  }
  if (action === 'delete') {
    if (!args || args.confirm !== true) return err('删除抬头需要 confirm=true（先向用户确认）。');
    const t = map.get(String(args.id || ''));
    if (!t) return err('找不到抬头 id=' + (args.id || '') + '。先 action=list 查看。');
    await kvDel(core.K.TITLE + t.id);
    return ok('已删除抬头：' + t.name);
  }
  return err('action 必须是 list / add / copy / delete');
}

// ── 工具注册表（description 即 prompt）─────────────────────────────────────

const tools = [
  {
    name: 'piaoxia_collect',
    description: [
      '发票保险库·收票：扫描一个文件或目录，把电子发票（PDF 文本层 / 数电票 XML）解析入账并归档原件，20 位发票号码自动判重。',
      '用户说「把下载文件夹/桌面/XX目录里的发票收进来」「导入这张发票」时用。',
      '参数 path 必填（绝对路径）；recursive 默认递归子目录。',
      '扫描件/纸质票无文字层会失败——这时引导用户用 piaoxia_add 手动入账，不要硬重试。',
    ].join('\n'),
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '文件或目录绝对路径' },
        recursive: { type: 'boolean', description: '目录时是否递归子目录，默认 true' },
      },
      required: ['path'],
    },
    call: toolCollect,
  },
  {
    name: 'piaoxia_add',
    description: [
      '发票保险库·手动入账：纸质票/对话里直接说票时用。',
      '用户说「昨天开了张 280 的餐费发票」「记一张出租车票 45」时用。',
      'total（价税合计正数）必填；date 建议 YYYY-MM-DD（用户说「昨天/上周」时按今天推算）；',
      'number 是发票号码（数电票 20 位、旧票 8 位），纸质票没有可不填；',
      'sellerName/sellerTaxId 销方、buyerName/buyerTaxId 购方、items 可给品名数组；',
      'category 可给：餐饮/交通/住宿/通讯/会务培训/快递物流/办公服务/采购/其他（不给会按销方+品名自动分类）；',
      'purpose：报销(默认)/保修/维权/存档；保修场景给 warrantyMonths（从开票日起算）。',
      '同号码已入账会拒绝重复入账（判重）。',
    ].join('\n'),
    inputSchema: {
      type: 'object',
      properties: {
        total: { type: 'number', description: '价税合计（必填正数）' },
        date: { type: 'string', description: '开票日期 YYYY-MM-DD' },
        number: { type: 'string', description: '发票号码（纸质票可省）' },
        code: { type: 'string', description: '发票代码（旧版票 12 位）' },
        kind: { type: 'string', description: '数电普票/数电专票/电子普票/电子专票/铁路客票/航空行程单/其他' },
        sellerName: { type: 'string' }, sellerTaxId: { type: 'string' },
        buyerName: { type: 'string' }, buyerTaxId: { type: 'string' },
        items: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, amount: { type: 'number' } } } },
        amount: { type: 'number', description: '不含税金额' },
        tax: { type: 'number', description: '税额' },
        category: { type: 'string', description: '餐饮/交通/住宿/通讯/会务培训/快递物流/办公服务/采购/其他' },
        purpose: { type: 'string', description: '报销/保修/维权/存档' },
        warrantyMonths: { type: 'number', description: '保修月数（从开票日起算）' },
        note: { type: 'string' },
        fileName: { type: 'string', description: '来源文件名（如有）' },
      },
      required: ['total'],
    },
    call: toolAdd,
  },
  {
    name: 'piaoxia_query',
    description: [
      '发票保险库·查询：报销透视/统计/找票全走这里。',
      'type=pending 待报销清单（「哪些票还没报」「这个月能报多少」）；type=stale 场景也看 pending 的逾期段。',
      'type=month 月度（参数 month=YYYY-MM，默认本月）；type=category 分类汇总（参数 category 可选，中文）；',
      'type=seller 按销方（参数 seller）；type=reimburse 报销单分组或明细（参数 reimburseId）；',
      'type=warranty 保修到期榜（「空调保修到什么时候」「有什么快过保」）；',
      'type=search 找票（参数 q：号码/销方/品名/备注片段）；type=stats 总览（默认）。',
    ].join('\n'),
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', description: 'pending/month/category/seller/reimburse/warranty/search/stats' },
        month: { type: 'string', description: 'YYYY-MM' },
        category: { type: 'string' },
        seller: { type: 'string' },
        reimburseId: { type: 'string' },
        q: { type: 'string' },
      },
    },
    call: toolQuery,
  },
  {
    name: 'piaoxia_set_status',
    description: [
      '发票保险库·报销状态流转：submit（已提交，可带 reimburseId 报销单号）/ settle（已到账）/ reject（已退回，带 rejectNote 原因）/ reopen（退回或误操作后放回待报销）/ archive（不报销）/ restore（恢复）。',
      '用户说「这批发上去了，单号 R202611」「报销到账了」「财务打回了说抬头错」时用。',
      'number 用发票号码定位；不确定先 piaoxia_query type=search。',
    ].join('\n'),
    inputSchema: {
      type: 'object',
      properties: {
        number: { type: 'string', description: '发票号码（或 id）' },
        action: { type: 'string', description: 'submit/settle/reject/reopen/archive/restore' },
        reimburseId: { type: 'string', description: '报销单号（submit 时）' },
        rejectNote: { type: 'string', description: '退回原因（reject 时）' },
      },
      required: ['number', 'action'],
    },
    call: toolSetStatus,
  },
  {
    name: 'piaoxia_update',
    description: [
      '发票保险库·改票：改类别/用途/保修期/备注/销方等账面字段（金额改错也可改 total）。',
      '用户说「那张火锅票算招待不是餐饮」「这台空调保修三年」「改成公司抬头」时用。',
      'number 定位；只传要改的字段（部分补丁）。category 用中文即可；warrantyMonths 是月数。',
    ].join('\n'),
    inputSchema: {
      type: 'object',
      properties: {
        number: { type: 'string', description: '发票号码（或 id）' },
        category: { type: 'string' }, purpose: { type: 'string' },
        warrantyMonths: { type: 'number' }, note: { type: 'string' },
        sellerName: { type: 'string' }, sellerTaxId: { type: 'string' },
        buyerName: { type: 'string' }, buyerTaxId: { type: 'string' },
        total: { type: 'number' }, date: { type: 'string' },
        reimburseId: { type: 'string' },
      },
      required: ['number'],
    },
    call: toolUpdate,
  },
  {
    name: 'piaoxia_delete',
    description: [
      '发票保险库·删票：需要 confirm=true，且必须先向用户复述票面（号码/销方/金额）确认后才调用。',
      '归档原件不会被删除。用户只是想改状态时不要用这个（用 piaoxia_set_status）。',
    ].join('\n'),
    inputSchema: {
      type: 'object',
      properties: {
        number: { type: 'string', description: '发票号码（或 id）' },
        confirm: { type: 'boolean', description: '必须 true 且已向用户确认' },
      },
      required: ['number'],
    },
    call: toolDelete,
  },
  {
    name: 'piaoxia_titles',
    description: [
      '发票保险库·抬头管理：开发票用的购方信息。',
      'action=list 列出；action=add 添加（name 必填、taxId 统一社会信用代码、bank/account/address/phone 可选、isDefault 设默认）；',
      'action=copy 输出可直接贴给开票员的完整文本（参数 id 可选，缺省用默认抬头）；action=delete（confirm=true）。',
      '用户说「记一下我们公司开票信息」「我的发票抬头」时用。',
    ].join('\n'),
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'list/add/copy/delete' },
        name: { type: 'string' }, taxId: { type: 'string' },
        bank: { type: 'string' }, account: { type: 'string' },
        address: { type: 'string' }, phone: { type: 'string' },
        isDefault: { type: 'boolean' }, id: { type: 'string' },
        confirm: { type: 'boolean' },
      },
    },
    call: toolTitles,
  },
];

// ── JSON-RPC stdio 主循环 ───────────────────────────────────────────────────

function ok(text) {
  return { content: [{ type: 'text', text }], isError: false };
}
function err(text) {
  return { content: [{ type: 'text', text }], isError: true };
}

async function handleMessage(msg) {
  const { id, method, params } = msg;
  if (method === 'initialize') {
    return {
      jsonrpc: '2.0', id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'piaoxia', version: VERSION },
      },
    };
  }
  if (method === 'notifications/initialized' || (method || '').startsWith('notifications/')) {
    return null;
  }
  if (method === 'ping') {
    return { jsonrpc: '2.0', id, result: {} };
  }
  if (method === 'tools/list') {
    return {
      jsonrpc: '2.0', id,
      result: {
        tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
      },
    };
  }
  if (method === 'tools/call') {
    const name = params && params.name;
    const tool = tools.find((t) => t.name === name);
    if (!tool) {
      return { jsonrpc: '2.0', id, result: err('未知工具：' + name) };
    }
    try {
      const result = await tool.call((params && params.arguments) || {});
      return { jsonrpc: '2.0', id, result };
    } catch (e) {
      log('tool ' + name + ' failed: ' + (e && e.message));
      return { jsonrpc: '2.0', id, result: err('执行失败：' + String((e && e.message) || e)) };
    }
  }
  return { jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found: ' + method } };
}

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  let idx;
  while ((idx = buf.indexOf('\n')) !== -1) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch (_) {
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }) + '\n');
      continue;
    }
    handleMessage(msg)
      .then((resp) => {
        if (resp) process.stdout.write(JSON.stringify(resp) + '\n');
      })
      .catch((e) => {
        log('handler crashed: ' + (e && e.stack || e));
        if (msg && msg.id !== undefined && msg.id !== null) {
          process.stdout.write(JSON.stringify({
            jsonrpc: '2.0', id: msg.id,
            error: { code: -32603, message: 'Internal error: ' + String((e && e.message) || e) },
          }) + '\n');
        }
      });
  }
});
process.stdin.on('end', () => process.exit(0));

log('piaoxia mcp server started (pid ' + process.pid + ')');
