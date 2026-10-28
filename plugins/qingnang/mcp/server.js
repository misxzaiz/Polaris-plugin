#!/usr/bin/env node
'use strict';
/**
 * qingnang MCP Server —— 青囊的 AI 工具层（零依赖 stdio）
 *
 * 职责：把 AI 的 tools/call 翻译为对 cap.kv（经 Polaris IPC bridge 自发现）
 * 中 qingnang.* 键空间的读写。本进程零外网请求；派生投影（qingnang.doses /
 * qingnang.stocks）由后台服务单写维护，本 server 读取或按需用 core 现算。
 *
 * 工具一览（AI 侧约定：这是「家庭药事记录」，不是医疗建议——工具描述与输出均不
 * 提供剂量推荐/相互作用判断）：
 *   qingnang_today   今日（或指定日）全家药单 + 应服未打卡 + 预警摘要 + 依从率
 *   qingnang_add     建档案/药品(可带首批)/批次(补货)/用药方案（支持按名字自动配档）
 *   qingnang_log     服药打卡（已服/跳过/撤销；可补记日期；报剩余库存）
 *   qingnang_query   查询：药箱库存/效期/补货/方案/档案/打卡记录/依从率
 *   qingnang_update  改：方案（剂量/时刻/频次/停用）、批次（qty/效期）、药品、档案
 *   qingnang_delete  删（confirm 门；方案删除连带清其打卡记录保持库存口径一致）
 *
 * 写幂等：打卡 occKey 覆盖语义；normalize* 为唯一写入口径（与面板/服务同源 core）。
 */
const crypto = require('crypto');

const { createKvClient } = require('../service/kvclient');
const core = require('../shared/core');

const SERVER_NAME = 'qingnang';
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
  profile: (id) => `qingnang.profile.${id}`,
  profilePrefix: 'qingnang.profile.',
  med: (id) => `qingnang.med.${id}`,
  medPrefix: 'qingnang.med.',
  batch: (id) => `qingnang.batch.${id}`,
  batchPrefix: 'qingnang.batch.',
  reg: (id) => `qingnang.reg.${id}`,
  regPrefix: 'qingnang.reg.',
  log: (occKey) => `qingnang.log.${occKey}`,
  logPrefix: 'qingnang.log.',
  settings: 'qingnang.settings',
  doses: 'qingnang.doses',
  stocks: 'qingnang.stocks',
};

function ok(text) {
  return { content: [{ type: 'text', text }], isError: false };
}
function err(text) {
  return { content: [{ type: 'text', text }], isError: true };
}

// ── 数据访问（单次调用内现算；量级=家庭药箱，几十实体+千级日志）──────────────
async function listByPrefix(prefix) {
  const keys = await kv.kvKeys();
  const mine = keys.filter((k) => k.startsWith(prefix));
  const out = await Promise.all(mine.map(async (k) => {
    const v = await kv.kvGet(k).catch(() => null);
    return v && typeof v === 'object' && v.id ? v : null;
  }));
  return out.filter(Boolean);
}
const listProfiles = () => listByPrefix(K.profilePrefix);
const listMeds = () => listByPrefix(K.medPrefix);
const listBatches = () => listByPrefix(K.batchPrefix);
const listRegimens = () => listByPrefix(K.regPrefix);
async function listLogs() {
  const keys = await kv.kvKeys();
  const mine = keys.filter((k) => k.startsWith(K.logPrefix));
  const out = await Promise.all(mine.map(async (k) => {
    const v = await kv.kvGet(k).catch(() => null);
    return v && typeof v === 'object' && v.occKey === k.slice(K.logPrefix.length) ? v : null;
  }));
  return out.filter(Boolean);
}
async function readSettings() {
  return core.normalizeSettings(await kv.kvGet(K.settings).catch(() => null));
}
async function readStocks() {
  const v = await kv.kvGet(K.stocks).catch(() => null);
  return v && typeof v === 'object' && Array.isArray(v.refill) ? v : null;
}
function ctxOf(profiles, meds, regimens, logs, settings) {
  return { profiles, meds, regimens, logs, settings };
}
async function fullCtx() {
  const [profiles, meds, batches, regimens, logs, settings] = await Promise.all([
    listProfiles(), listMeds(), listBatches(), listRegimens(), listLogs(), readSettings(),
  ]);
  return { profiles, meds, batches, regimens, logs, settings };
}

// ── 名字自动配档（对话式建档的友好层）────────────────────────────────────────
async function resolveProfile(input, profiles) {
  const pid = String(input.profileId || '').trim();
  if (pid) {
    const hit = profiles.find((p) => p.id === pid);
    if (!hit) return { error: `找不到成员 ${pid}（先 qingnang_add kind=profile 或用 profileName）` };
    return { profile: hit };
  }
  const name = core.clip(input.profileName || input.name, 40);
  if (!name) return { error: '需提供 profileId 或 profileName' };
  const hit = profiles.find((p) => p.name === name);
  if (hit) return { profile: hit, reused: true };
  const r = core.normalizeProfile({ name, kind: input.profileKind === 'pet' ? 'pet' : 'human', note: input.profileNote });
  if (r.error) return { error: r.error };
  await kv.kvSet(K.profile(r.profile.id), r.profile);
  return { profile: r.profile, created: true };
}
async function resolveMed(input, meds) {
  const mid = String(input.medId || '').trim();
  if (mid) {
    const hit = meds.find((m) => m.id === mid);
    if (!hit) return { error: `找不到药品 ${mid}（先 qingnang_add kind=med 或用 medName）` };
    return { med: hit };
  }
  const name = core.clip(input.medName || input.name, 40);
  if (!name) return { error: '需提供 medId 或 medName' };
  const spec = core.clip(input.spec, 60);
  const hit = meds.find((m) => m.name === name && (!spec || m.spec === spec));
  if (hit) return { med: hit, reused: true };
  const r = core.normalizeMed({ name, spec, form: input.form, unit: input.unit, note: input.medNote });
  if (r.error) return { error: r.error };
  await kv.kvSet(K.med(r.med.id), r.med);
  return { med: r.med, created: true };
}

function fmtStockLine(med, stock) {
  const parts = [`剩 ${stock.totalUsable}${med.unit || ''}`];
  if (stock.daysLeft != null) parts.push(`约够 ${stock.daysLeft} 天`);
  if (stock.totalExpired > 0) parts.push(`过期待清理 ${stock.totalExpired}${med.unit || ''}`);
  if (stock.over) parts.push('⚠打卡消耗已超账面库存（盘点后改批次数量）');
  return parts.join('，');
}

// ── 工具实现 ─────────────────────────────────────────────────────────────────
async function toolToday(args) {
  const date = args.date ? String(args.date) : core.dayKey(Date.now());
  if (core.parseDayKey(date) == null) return err(`日期不合法：${date}（YYYY-MM-DD）`);
  const c = await fullCtx();
  if (!c.profiles.length) return ok('青囊还没有家庭成员。请用 qingnang_add kind=profile 建档，或引导用户说「给妈妈建个档案」。');
  const now = Date.now();
  const plan = core.todayPlan(c, date, now);
  const sections = [];
  for (const g of plan) {
    const head = `${g.profile.name}${g.profile.kind === 'pet' ? '（宠物）' : ''}` +
      (g.items.length ? '' : '：今天没有排期用药');
    if (!g.items.length) { sections.push(head); continue; }
    const lines = g.items.map((it) => {
      const mark = it.state === 'done' ? '✅已服' : it.state === 'skip' ? '⏭已跳过'
        : it.state === 'now' ? '🟡现在该吃' : it.state === 'overdue' ? '🔴过点未服' : '⏳未到点';
      return `  [${it.occKey}] ${it.time} ${it.medName} ${it.amount}${it.unit} · ${mark}`;
    });
    sections.push(`${head}\n${lines.join('\n')}`);
  }
  const proj = core.dosesProjection(c, date, now);
  const alerts = [];
  if (date === core.dayKey(now)) {
    if (proj.items.length) {
      alerts.push(`应服未打卡 ${proj.items.length} 次：` +
        proj.items.map((i) => `${i.profileName} ${i.time} ${i.medName}`).join('；'));
    } else alerts.push('当前没有待服药。');
    const adh = core.adherence(c, null, now, 7);
    alerts.push(`近7天依从率 ${adh.rate == null ? '暂无数据' : `${adh.rate}%`}（计划 ${adh.scheduled} 次，已服 ${adh.taken}，跳过 ${adh.skipped}，漏 ${adh.missed}）`);
    const stocks = await readStocks();
    const a = stocks && Date.now() - stocks.at < 5 * 60 * 1000 ? stocks.alerts
      : null;
    const low = a ? a.lowStock : core.refillForecast(c, now).filter((r) => r.urgency === 'low').length;
    const expired = a ? a.expiredBatches : core.expiryBands(c.batches, c.meds, now).filter((r) => r.band === 'expired').length;
    const soon = a ? a.soonExpiry : core.expiryBands(c.batches, c.meds, now).filter((r) => r.band === 'soon').length;
    if (low) alerts.push(`🛒 ${low} 种药库存不足（建议尽快补货，qingnang_query scope=refill 看清单）`);
    if (expired) alerts.push(`🔴 ${expired} 个批次已过期（qingnang_query scope=expiry 看清单）`);
    if (soon) alerts.push(`🟡 ${soon} 个批次效期临近`);
  }
  return ok(`${date} 药单\n${sections.join('\n')}\n\n${alerts.join('\n')}\n\n（青囊只做药事记录，不提供医疗建议。）`);
}

async function toolAdd(args) {
  const kind = String(args.kind || '');
  if (kind === 'profile') {
    const r = core.normalizeProfile({ name: args.name, kind: args.profileKind, note: args.note }, null);
    if (r.error) return err(r.error);
    await kv.kvSet(K.profile(r.profile.id), r.profile);
    return ok(`已建成员档案：${r.profile.name}${r.profile.kind === 'pet' ? '（宠物）' : ''}（id=${r.profile.id}）`);
  }
  if (kind === 'med') {
    const r = core.normalizeMed(args, null);
    if (r.error) return err(r.error);
    await kv.kvSet(K.med(r.med.id), r.med);
    const lines = [`已建药品：${r.med.name}${r.med.spec ? `（${r.med.spec}）` : ''}，单位 ${r.med.unit}（id=${r.med.id}）`];
    if (args.batchQty != null) {
      const b = core.normalizeBatch({ medId: r.med.id, qty: args.batchQty, expiry: args.batchExpiry, note: args.batchNote }, null);
      if (b.error) return err(`药品已建，但首批批次失败：${b.error}`);
      await kv.kvSet(K.batch(b.batch.id), b.batch);
      lines.push(`首批入库 ${b.batch.qty}${r.med.unit}${b.batch.expiry ? `，效期 ${b.batch.expiry}` : '（未登记效期）'}（batchId=${b.batch.id}）`);
    }
    return ok(lines.join('\n'));
  }
  if (kind === 'batch') {
    const c = await fullCtx();
    const med = c.meds.find((m) => m.id === args.medId);
    if (!med) return err(`找不到药品 ${args.medId}（补货请用 medId，或 kind=med 带 batchQty 新建）`);
    const r = core.normalizeBatch(args, null);
    if (r.error) return err(r.error);
    await kv.kvSet(K.batch(r.batch.id), r.batch);
    return ok(`已入库：${med.name} +${r.batch.qty}${med.unit}${r.batch.expiry ? `，效期 ${r.batch.expiry}` : ''}（batchId=${r.batch.id}）。库存为派生值，几秒内药箱快照自动更新。`);
  }
  if (kind === 'regimen') {
    const c = await fullCtx();
    const pr = await resolveProfile(args, c.profiles);
    if (pr.error) return err(pr.error);
    const mr = await resolveMed(args, c.meds);
    if (mr.error) return err(mr.error);
    const r = core.normalizeRegimen({
      profileId: pr.profile.id, medId: mr.med.id,
      dose: args.dose, times: args.times, freq: args.freq,
      startDate: args.startDate, endDate: args.endDate, active: args.active, note: args.note,
    }, null);
    if (r.error) return err(r.error);
    await kv.kvSet(K.reg(r.regimen.id), r.regimen);
    const med = c.meds.find((m) => m.id === mr.med.id);
    const lines = [
      `已立方案：${pr.profile.name} · ${core.describeRegimen(r.regimen, mr.med)}（regId=${r.regimen.id}）`,
    ];
    if (pr.created) lines.push(`（顺手新建了成员「${pr.profile.name}」）`);
    if (mr.created) lines.push(`（顺手新建了药品「${mr.med.name}」）`);
    if (r.regimen.freq.type !== 'prn') {
      const stock = core.stockForMed(mr.med.id, c.batches, c.logs, c.regimens, core.dayKey(Date.now()));
      if (stock.totalUsable <= 0) lines.push(`⚠ ${mr.med.name} 当前账面库存为 0——记得补录批次（kind=batch）。`);
      else {
        const f = core.refillForecast({ ...c, regimens: [...c.regimens, r.regimen] }, Date.now()).find((x) => x.medId === mr.med.id);
        if (f && f.daysLeft != null) lines.push(`当前库存${fmtStockLine(mr.med, { ...stock, daysLeft: f.daysLeft })}。`);
      }
    }
    lines.push('（青囊只做药事记录，不提供医疗建议；剂量请遵医嘱。）');
    return ok(lines.join('\n'));
  }
  return err(`kind 不合法：${kind}（profile/med/batch/regimen）`);
}

async function toolLog(args) {
  const c = await fullCtx();
  const occ = args.occKey ? core.parseOccKey(String(args.occKey)) : null;
  let reg = null;
  if (occ) reg = c.regimens.find((r) => r.id === occ.regId) || null;
  else if (args.regId) reg = c.regimens.find((r) => r.id === String(args.regId)) || null;
  if ((args.occKey || args.regId) && !reg) return err('找不到对应方案（可能已删除）；撤销历史打卡可只传 occKey。');
  const r = core.normalizeLog(args, reg, Date.now());
  if (r.error) return err(r.error);
  const med = reg ? c.meds.find((m) => m.id === reg.medId) : null;
  const profile = reg ? c.profiles.find((p) => p.id === reg.profileId) : null;
  if (r.del) {
    await kv.kvDel(K.log(r.del));
    return ok(`已撤销打卡：${med ? med.name : ''}${profile ? `（${profile.name}）` : ''} ${r.del.split('|').slice(1).join(' ')}`);
  }
  await kv.kvSet(K.log(r.log.occKey), r.log);
  const lines = [];
  if (reg && med) {
    lines.push(`已记录：${profile ? profile.name : ''} ${r.log.date} ${r.log.time} ${med.name} ${r.log.amount != null ? r.log.amount : reg.dose}${med.unit} · ${r.log.status === 'taken' ? '已服' : '已跳过'}`);
    const merged = r.log.status === 'taken' ? [...c.logs.filter((l) => l.occKey !== r.log.occKey), r.log] : c.logs;
    const stock = core.stockForMed(med.id, c.batches, merged, c.regimens, core.dayKey(Date.now()));
    lines.push(`${med.name} ${fmtStockLine(med, stock)}`);
  } else {
    lines.push(`已撤销/记录：${r.log.occKey}`);
  }
  return ok(lines.join('\n'));
}

async function toolQuery(args) {
  const scope = String(args.scope || 'stock');
  const c = await fullCtx();
  const now = Date.now();
  const today = core.dayKey(now);
  if (scope === 'profiles') {
    if (!c.profiles.length) return ok('暂无成员档案。');
    return ok(c.profiles.map((p) => `[${p.id}] ${p.name}${p.kind === 'pet' ? '（宠物）' : ''}${p.note ? ` · ${p.note}` : ''}`).join('\n'));
  }
  if (scope === 'meds') {
    if (!c.meds.length) return ok('药箱为空。');
    const stocks = await readStocks();
    return ok(c.meds.map((m) => {
      const s = stocks && stocks.meds[m.id];
      return `[${m.id}] ${m.name}${m.spec ? `（${m.spec}）` : ''} · 单位${m.unit}${s ? ` · 剩${s.totalUsable}${m.unit}${s.daysLeft != null ? ` · 约够${s.daysLeft}天` : ''}` : ''}`;
    }).join('\n'));
  }
  if (scope === 'stock' || scope === 'refill') {
    if (!c.meds.length) return ok('药箱为空。');
    const rows = scope === 'stock' ? core.refillForecast(c, now).slice().sort((a, b) => (a.name < b.name ? -1 : 1)) : core.refillForecast(c, now);
    const lines = rows.map((r) => {
      const tag = r.urgency === 'low' ? '🛒需补货' : r.urgency === 'watch' ? '🟡留意' : '';
      const rate = r.ratePerDay > 0 ? `，日均 ${r.ratePerDay}${r.unit}${r.estimated ? '（按方案排量估算）' : ''}` : '';
      const left = r.daysLeft != null ? `，约够 ${r.daysLeft} 天` : '';
      return `${tag ? tag + ' ' : ''}${r.name}${r.spec ? `（${r.spec}）` : ''}：剩 ${r.remaining}${r.unit}${left}${rate}${r.expired ? `；过期待清理 ${r.expired}${r.unit}` : ''}`;
    });
    return ok((scope === 'refill' ? '补货清单（紧的在前）\n' : '药箱库存\n') + lines.join('\n'));
  }
  if (scope === 'expiry') {
    const rows = core.expiryBands(c.batches, c.meds, now);
    const shown = rows.filter((r) => r.band !== 'ok' || args.all === true);
    if (!shown.length) return ok('没有效期临近或过期的批次。');
    const lines = shown.map((r) => {
      const tag = r.band === 'expired' ? '🔴已过期' : r.band === 'soon' ? `🟡剩 ${r.daysLeft} 天` : r.band === 'unknown' ? '⚪未登记效期' : '🟢';
      return `${tag} ${r.medName} 批次 ${r.qty}${r.unit} · 效期 ${r.expiry || '未登记'}（batchId=${r.batchId}）`;
    });
    return ok('效期榜\n' + lines.join('\n'));
  }
  if (scope === 'regimens') {
    const regs = c.regimens.filter((r) => (!args.profileId || r.profileId === args.profileId) && (args.includeInactive !== false || r.active !== false));
    if (!regs.length) return ok('暂无用药方案。');
    const medById = new Map(c.meds.map((m) => [m.id, m]));
    const profById = new Map(c.profiles.map((p) => [p.id, p]));
    return ok(regs.map((r) => {
      const p = profById.get(r.profileId);
      return `[${r.id}] ${p ? p.name : '?'} · ${core.describeRegimen(r, medById.get(r.medId))}`;
    }).join('\n'));
  }
  if (scope === 'logs') {
    let logs = c.logs;
    if (args.date) logs = logs.filter((l) => l.date === args.date);
    if (args.sinceDate) logs = logs.filter((l) => l.date >= args.sinceDate);
    if (args.profileId) {
      const regIds = new Set(c.regimens.filter((r) => r.profileId === args.profileId).map((r) => r.id));
      logs = logs.filter((l) => regIds.has(l.regId));
    }
    if (args.medId) {
      const regIds = new Set(c.regimens.filter((r) => r.medId === args.medId).map((r) => r.id));
      logs = logs.filter((l) => regIds.has(l.regId));
    }
    logs.sort((a, b) => (a.date + a.time < b.date + b.time ? 1 : -1));
    if (!logs.length) return ok('该范围没有打卡记录。');
    const regById = new Map(c.regimens.map((r) => [r.id, r]));
    const medById = new Map(c.meds.map((m) => [m.id, m]));
    const profById = new Map(c.profiles.map((p) => [p.id, p]));
    return ok(logs.slice(0, 100).map((l) => {
      const r = regById.get(l.regId);
      const m = r ? medById.get(r.medId) : null;
      const p = r ? profById.get(r.profileId) : null;
      return `${l.date} ${l.time} ${p ? p.name : '?'} ${m ? m.name : '?'} · ${l.status === 'taken' ? '已服' : '已跳过'}${l.amount != null ? ` ${l.amount}` : ''}（occKey=${l.occKey}）`;
    }).join('\n') + (logs.length > 100 ? `\n（仅最近 100 条，共 ${logs.length} 条）` : ''));
  }
  if (scope === 'adherence') {
    const days = Math.max(1, Math.min(90, Math.floor(Number(args.days) || 7)));
    if (args.profileId) {
      const a = core.adherence(c, args.profileId, now, days);
      return ok(`近${days}天依从率：${a.rate == null ? '暂无已判定的服药记录' : `${a.rate}%`}（计划 ${a.scheduled}，已服 ${a.taken}，跳过 ${a.skipped}，漏 ${a.missed}）`);
    }
    const lines = c.profiles.map((p) => {
      const a = core.adherence(c, p.id, now, days);
      return `${p.name}：${a.rate == null ? '暂无数据' : `${a.rate}%`}（计划 ${a.scheduled}，已服 ${a.taken}，跳过 ${a.skipped}，漏 ${a.missed}）`;
    });
    return ok(`近${days}天依从率\n` + (lines.join('\n') || '暂无成员。'));
  }
  return err(`scope 不合法：${scope}（stock/refill/expiry/regimens/profiles/meds/logs/adherence）`);
}

async function toolUpdate(args) {
  const kind = String(args.kind || '');
  const id = String(args.id || '').trim();
  if (!id) return err('需提供 id');
  const patch = args.patch && typeof args.patch === 'object' ? args.patch : {};
  if (kind === 'profile') {
    const prev = await kv.kvGet(K.profile(id)).catch(() => null);
    if (!prev) return err(`找不到成员 ${id}`);
    const r = core.normalizeProfile(patch, prev);
    if (r.error) return err(r.error);
    await kv.kvSet(K.profile(id), r.profile);
    return ok(`已更新成员：${r.profile.name}${r.profile.note ? ` · ${r.profile.note}` : ''}`);
  }
  if (kind === 'med') {
    const prev = await kv.kvGet(K.med(id)).catch(() => null);
    if (!prev) return err(`找不到药品 ${id}`);
    const r = core.normalizeMed(patch, prev);
    if (r.error) return err(r.error);
    await kv.kvSet(K.med(id), r.med);
    return ok(`已更新药品：${r.med.name}${r.med.spec ? `（${r.med.spec}）` : ''}`);
  }
  if (kind === 'batch') {
    const prev = await kv.kvGet(K.batch(id)).catch(() => null);
    if (!prev) return err(`找不到批次 ${id}`);
    const r = core.normalizeBatch(patch, prev);
    if (r.error) return err(r.error);
    await kv.kvSet(K.batch(id), r.batch);
    return ok(`已更新批次：qty=${r.batch.qty}${r.batch.expiry ? `，效期 ${r.batch.expiry}` : ''}（盘点修正即改 qty，库存自动重算）`);
  }
  if (kind === 'regimen') {
    const prev = await kv.kvGet(K.reg(id)).catch(() => null);
    if (!prev) return err(`找不到方案 ${id}`);
    const r = core.normalizeRegimen(patch, prev);
    if (r.error) return err(r.error);
    await kv.kvSet(K.reg(id), r.regimen);
    const c = await fullCtx();
    const med = c.meds.find((m) => m.id === r.regimen.medId);
    return ok(`已更新方案：${core.describeRegimen(r.regimen, med)}`);
  }
  return err(`kind 不合法：${kind}（profile/med/batch/regimen）`);
}

async function toolDelete(args) {
  const kind = String(args.kind || '');
  const id = String(args.id || '').trim();
  if (!id) return err('需提供 id');
  if (args.confirm !== true) return err('删除需显式 confirm=true（不可逆）。');
  if (kind === 'profile') {
    const regs = (await listRegimens()).filter((r) => r.profileId === id);
    if (regs.length && args.purge !== true) {
      return err(`成员仍有 ${regs.length} 个用药方案。请先停用/删除方案，或传 purge=true 连同方案与打卡记录一起删除。`);
    }
    if (regs.length) {
      for (const r of regs) {
        await kv.kvDel(K.reg(r.id));
        const keys = await kv.kvKeys();
        for (const k of keys.filter((k) => k.startsWith(K.logPrefix + r.id + '|'))) await kv.kvDel(k);
      }
    }
    await kv.kvDel(K.profile(id));
    return ok(`已删除成员及其${regs.length ? ` ${regs.length} 个方案与全部打卡记录` : '档案'}。`);
  }
  if (kind === 'med') {
    const [regs, batches] = await Promise.all([listRegimens(), listBatches()]);
    if (regs.some((r) => r.medId === id) || batches.some((b) => b.medId === id)) {
      return err('该药品仍有方案或批次引用。请先删除相关方案与批次。');
    }
    await kv.kvDel(K.med(id));
    return ok('已删除药品。');
  }
  if (kind === 'batch') {
    const prev = await kv.kvGet(K.batch(id)).catch(() => null);
    if (!prev) return err(`找不到批次 ${id}`);
    await kv.kvDel(K.batch(id));
    return ok('已删除批次（库存派生自动更新；若是过期清理，建议先看看是否还有剩量需要登记）。');
  }
  if (kind === 'regimen') {
    const prev = await kv.kvGet(K.reg(id)).catch(() => null);
    if (!prev) return err(`找不到方案 ${id}`);
    // 连带清打卡：方案没了，medId 映射断，保留记录会破坏库存派生口径（FIFO 找不到归属）
    const keys = await kv.kvKeys();
    const logKeys = keys.filter((k) => k.startsWith(K.logPrefix + id + '|'));
    for (const k of logKeys) await kv.kvDel(k);
    await kv.kvDel(K.reg(id));
    return ok(`已删除方案${logKeys.length ? `及 ${logKeys.length} 条打卡记录` : ''}。若只是暂停用药，建议用 qingnang_update kind=regimen patch={active:false} 停用保留历史。`);
  }
  return err(`kind 不合法：${kind}（profile/med/batch/regimen）`);
}

// ── 工具清单 ─────────────────────────────────────────────────────────────────
const FREQ_HINT = '五型：{type:"daily"} 每天｜{type:"weekly",weekdays:[0-6]}（0=周日）｜{type:"interval",intervalDays:N} 每 N 天｜{type:"cycle",onDays:N,offDays:N} 吃 N 停 M｜{type:"prn"} 需要时';

const tools = [
  {
    name: 'qingnang_today',
    description: '青囊·今日药单：全家成员今天各自要吃什么药、几点吃、吃了没；当前应服未打卡提醒；库存/效期预警数；近7天依从率。用户问「今天要吃什么药」「现在该吃哪颗」时用。',
    inputSchema: {
      type: 'object',
      properties: { date: { type: 'string', description: 'YYYY-MM-DD，缺省今天' } },
    },
  },
  {
    name: 'qingnang_add',
    description: '青囊·建档：kind=profile 建家庭成员（human/pet）；kind=med 建药品（可带 batchQty/batchExpiry 顺手首批入库）；kind=batch 给已有药补货入库（新买一盒）；kind=regimen 立用药方案（谁+什么药+每次剂量+每天几点+频次，支持 profileName/medName 按名自动建/配）。用户说「我妈每天早晚各一片氨氯地平」→ kind=regimen, profileName=妈妈, medName=氨氯地平, dose=1, times=["08:00","20:00"], freq={"type":"daily"}, unit=片。剂量必须来自用户/医嘱，不得自行推断推荐。',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['profile', 'med', 'batch', 'regimen'] },
        name: { type: 'string', description: 'profile/med 的名称' },
        profileKind: { type: 'string', enum: ['human', 'pet'], description: '（profile/regimen 按名建档时）成员类型' },
        spec: { type: 'string', description: '（med）规格，如 5mg×24片' },
        form: { type: 'string', enum: ['tablet', 'capsule', 'granule', 'liquid', 'injection', 'patch', 'other'] },
        unit: { type: 'string', description: '计量单位：片/粒/袋/支/贴/ml/喷' },
        medId: { type: 'string', description: '（batch/regimen）挂靠药品 id' },
        qty: { type: 'number', description: '（batch）本批数量' },
        expiry: { type: 'string', description: '（batch）效期 YYYY-MM-DD' },
        batchQty: { type: 'number', description: '（med）顺手首批入库数量' },
        batchExpiry: { type: 'string', description: '（med）首批效期' },
        profileId: { type: 'string', description: '（regimen）成员 id（或 profileName）' },
        profileName: { type: 'string', description: '（regimen）成员名，不存在会自动建档' },
        medName: { type: 'string', description: '（regimen）药品名，不存在会自动建药' },
        dose: { type: 'number', description: '（regimen）每次剂量（用户给的，不得自行推断）' },
        times: { type: 'array', items: { type: 'string' }, description: '（regimen）服药时刻 HH:MM 数组；prn 可空' },
        freq: { type: 'object', description: '（regimen）' + FREQ_HINT },
        startDate: { type: 'string', description: '（regimen）开始日期 YYYY-MM-DD，缺省今天' },
        endDate: { type: 'string', description: '（regimen）结束日期，疗程药必填' },
        note: { type: 'string', description: '备注' },
      },
      required: ['kind'],
    },
  },
  {
    name: 'qingnang_log',
    description: '青囊·打卡：记录某次服药「已服(taken)/跳过(skip)/撤销(none)」。从 qingnang_today 的 occKey 直接回填；也可 regId+date+time。支持补记（date 传过去的日子）。打卡会自动按 FEFO 消耗库存并在回复里报剩余。用户说「今晚的药吃了」→ 找到对应 occKey → status=taken。',
    inputSchema: {
      type: 'object',
      properties: {
        occKey: { type: 'string', description: '发生键 regId|YYYY-MM-DD|HH:MM（qingnang_today 里有）' },
        regId: { type: 'string' }, date: { type: 'string' }, time: { type: 'string' },
        status: { type: 'string', enum: ['taken', 'skip', 'none'], description: 'none=撤销' },
        amount: { type: 'number', description: '实际服用量（缺省=方案剂量；prn 必看）' },
        at: { type: 'number', description: '实际动作时间戳 ms（补记时可指定）' },
      },
    },
  },
  {
    name: 'qingnang_query',
    description: '青囊·查询：scope=stock 药箱库存全表｜refill 补货清单（紧的在前）｜expiry 效期红黄榜（过期/临期批次）｜regimens 用药方案（可按成员）｜profiles 成员档案｜meds 药品目录｜logs 打卡流水（可按日期/成员/药品过滤）｜adherence 依从率（默认近7天）。用户问「布洛芬还有几粒」「哪些药快过期」「该买什么药」时用。',
    inputSchema: {
      type: 'object',
      properties: {
        scope: { type: 'string', enum: ['stock', 'refill', 'expiry', 'regimens', 'profiles', 'meds', 'logs', 'adherence'] },
        profileId: { type: 'string' }, medId: { type: 'string' },
        date: { type: 'string', description: '（logs）YYYY-MM-DD' },
        sinceDate: { type: 'string', description: '（logs）起始日期' },
        days: { type: 'number', description: '（adherence）窗口天数 1-90' },
        all: { type: 'boolean', description: '（expiry）含效期充裕批次' },
      },
      required: ['scope'],
    },
  },
  {
    name: 'qingnang_update',
    description: '青囊·修改：kind+id+patch 部分更新。方案（改剂量/时刻/频次/停用 active:false/延长 endDate）、批次（盘点后改 qty、改效期）、药品（名称/规格/单位）、成员（备注等）。停药建议用 active:false 而非删除（保留历史与依从统计）。',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['profile', 'med', 'batch', 'regimen'] },
        id: { type: 'string' },
        patch: { type: 'object', description: '要改的字段；方案 freq 支持 ' + FREQ_HINT },
      },
      required: ['kind', 'id', 'patch'],
    },
  },
  {
    name: 'qingnang_delete',
    description: '青囊·删除（需 confirm=true）：profile（有方案时需 purge=true 连带删）、med（有引用时拒删）、batch（过期清理用）、regimen（连带清其打卡记录；仅暂停请用 update active:false）。',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['profile', 'med', 'batch', 'regimen'] },
        id: { type: 'string' },
        confirm: { type: 'boolean' },
        purge: { type: 'boolean', description: '（profile）连带删方案与打卡' },
      },
      required: ['kind', 'id', 'confirm'],
    },
  },
];

const HANDLERS = {
  qingnang_today: toolToday,
  qingnang_add: toolAdd,
  qingnang_log: toolLog,
  qingnang_query: toolQuery,
  qingnang_update: toolUpdate,
  qingnang_delete: toolDelete,
};

// ── stdio JSON-RPC 主循环 ────────────────────────────────────────────────────
function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n'); }

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  while (true) {
    const i = buf.indexOf('\n');
    if (i === -1) break;
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch (e) { log('warn', `非 JSON 行：${e.message}`); continue; }
    handleMessage(msg).catch((e) => {
      log('error', `处理异常：${e.stack || e.message}`);
      if (msg && msg.id != null) send({ jsonrpc: '2.0', id: msg.id, result: err(`内部错误：${e.message}`) });
    });
  }
});
process.stdin.on('end', () => process.exit(0));

async function handleMessage(msg) {
  if (msg.method === 'initialize') {
    send({
      jsonrpc: '2.0', id: msg.id,
      result: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      },
    });
    return;
  }
  if (msg.method === 'notifications/initialized') return;
  if (msg.method === 'tools/list') {
    send({ jsonrpc: '2.0', id: msg.id, result: { tools } });
    return;
  }
  if (msg.method === 'tools/call') {
    const name = msg.params && msg.params.name;
    const args = (msg.params && msg.params.arguments) || {};
    const fn = HANDLERS[name];
    if (!fn) {
      send({ jsonrpc: '2.0', id: msg.id, result: err(`未知工具：${name}`) });
      return;
    }
    try {
      const r = await fn(args);
      send({ jsonrpc: '2.0', id: msg.id, result: r });
    } catch (e) {
      log('error', `工具 ${name} 失败：${e.stack || e.message}`);
      send({ jsonrpc: '2.0', id: msg.id, result: err(`${e.message}（若为桥连接问题，请确认 Polaris 正在运行）`) });
    }
    return;
  }
  if (msg.method === 'ping') { send({ jsonrpc: '2.0', id: msg.id, result: {} }); return; }
  if (msg.id != null) send({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `方法不存在：${msg.method}` } });
}

log('info', `qingnang mcp server v${SERVER_VERSION} ready (appConfigDir=${APP_CONFIG_DIR || '未提供'})`);
