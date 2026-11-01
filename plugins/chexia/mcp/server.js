#!/usr/bin/env node
'use strict';
/**
 * chexia MCP Server —— 车辖的 AI 工具层（零依赖 stdio）
 *
 * 职责：把 AI 的 tools/call 翻译为对 cap.kv（经 Polaris IPC bridge 自发现）
 * 中 chexia.* 键空间的读写。本进程零外网请求；全家快照（chexia.snapshot）由
 * 后台服务单写维护，本 server 用 core 现算（与面板/服务同源口径）。
 *
 * 工具一览（AI 侧约定：这是「家庭车务记录」，不是维修/保险建议——工具描述与
 * 输出均不推荐商家/产品/维修方案）：
 *   chexia_today   全家今日总览：每辆车里程/日均/能耗(元每公里)/养护红黄/证件红黄榜
 *   chexia_add     建车辆 / 养护项（周期+锚点）/ 证件（支持 carName 按名自动配车）
 *   chexia_log     记流水：energy 补能（里程必填，自动重算期间能耗+养护倒计时）/
 *                  svc 维保（type=maintenance + itemName 命中时自动推进养护项锚点）
 *   chexia_query   查询：cars/items/svcs/docs/energy/cost
 *   chexia_update  改：车辆/养护项/证件/补能/维保（patch 部分更新，normalize merge）
 *   chexia_delete  删（confirm 门；删车需 purge=true 连带其全部流水）
 *
 * 对话式友好层：carName 按名 find-or-create——补能里顺手建档时以首条里程为建档
 * 里程基线（initialOdometer），充电自动判纯电。
 */
const { createKvClient } = require('../service/kvclient');
const core = require('../shared/core');

const SERVER_NAME = 'chexia';
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
  car: (id) => `chexia.car.${id}`,
  carPrefix: 'chexia.car.',
  energy: (id) => `chexia.energy.${id}`,
  energyPrefix: 'chexia.energy.',
  item: (id) => `chexia.item.${id}`,
  itemPrefix: 'chexia.item.',
  svc: (id) => `chexia.svc.${id}`,
  svcPrefix: 'chexia.svc.',
  doc: (id) => `chexia.doc.${id}`,
  docPrefix: 'chexia.doc.',
  settings: 'chexia.settings',
  snapshot: 'chexia.snapshot',
};

function ok(text) {
  return { content: [{ type: 'text', text }], isError: false };
}
function err(text) {
  return { content: [{ type: 'text', text }], isError: true };
}

// ── 数据访问（单次调用内现算；量级=家庭车务，几十实体+几百流水）──────────────
async function listByPrefix(prefix) {
  const keys = await kv.kvKeys();
  const mine = keys.filter((k) => k.startsWith(prefix));
  const out = await Promise.all(mine.map(async (k) => {
    const v = await kv.kvGet(k).catch(() => null);
    return v && typeof v === 'object' && v.id ? v : null;
  }));
  return out.filter(Boolean);
}
const listCars = () => listByPrefix(K.carPrefix);
const listEnergies = () => listByPrefix(K.energyPrefix);
const listItems = () => listByPrefix(K.itemPrefix);
const listSvcs = () => listByPrefix(K.svcPrefix);
const listDocs = () => listByPrefix(K.docPrefix);
async function readSettings() {
  return core.normalizeSettings(await kv.kvGet(K.settings).catch(() => null));
}
async function fullCtx() {
  const [cars, energies, items, svcs, docs, settings] = await Promise.all([
    listCars(), listEnergies(), listItems(), listSvcs(), listDocs(), readSettings(),
  ]);
  return { cars, energies, items, svcs, docs, settings };
}

// ── 按名自动配车（对话式记账的友好层）────────────────────────────────────────
/**
 * carId 优先；否则 carName 精确匹配；都没有时报错。
 * 返回 {car} | {error} | {create:{name, kind}}（由调用方决定建档参数——
 * 补能场景要以首条里程为建档里程，这里拿不到）。
 */
function resolveCarRef(input, cars) {
  const cid = String(input.carId || '').trim();
  if (cid) {
    const hit = cars.find((c) => c.id === cid);
    if (!hit) return { error: `找不到车辆 ${cid}（先 chexia_add kind=car，或改用 carName）` };
    return { car: hit };
  }
  const name = core.clip(input.carName || input.name, 30);
  if (!name) return { error: '需提供 carId 或 carName（如 carName="家里的白SUV"）' };
  const hit = cars.find((c) => c.name === name);
  if (hit) return { car: hit, reused: true };
  const kind = String(input.carKind || '');
  const inferred = String(input.energyKind || '') === 'charge' || kind === 'ev' ? 'ev' : (core.CAR_KINDS.includes(kind) ? kind : 'fuel');
  return { create: { name, kind: inferred } };
}

/** 按名建车：补能场景 initialOdometer=首条里程（基线），否则用户给值或缺省 0 */
async function createCar(name, kind, initialOdometer, plate) {
  const r = core.normalizeCar({ name, kind, initialOdometer, plate });
  if (r.error) return { error: r.error };
  await kv.kvSet(K.car(r.car.id), r.car);
  return { car: r.car };
}

const bandTag = (b) => (b === 'overdue' ? '🔴已超' : b === 'expired' ? '🔴已过期' : b === 'due' ? '🟡将到' : b === 'soon' ? '🟡临近' : '🟢');
const daysText = (d) => (d == null ? '' : d <= 0 ? `${-d} 天前` : `${d} 天后`);

// ── 工具实现 ─────────────────────────────────────────────────────────────────
async function toolToday() {
  const c = await fullCtx();
  const now = Date.now();
  if (!c.cars.length) {
    return ok('车辖还没有车辆档案。请用 chexia_add kind=car 建档（如：kind=car, name="家里的白SUV", carKind=fuel, initialOdometer=45000），或引导用户说「记一下我的车，白SUV，现在跑了4万5千公里」。');
  }
  const fam = core.familySnapshot(c.cars, c.energies, c.items, c.svcs, c.docs, now, c.settings);
  const lines = [];
  const hot = fam.cars.flatMap((s) => s.items.filter((i) => i.projection.state !== 'ok').map((i) => `${s.name} ${i.name}`));
  const docsHot = [
    ...fam.cars.flatMap((s) => s.docsDue),
    ...fam.personalDocs,
  ];
  const alerts = [];
  if (docsHot.length) {
    alerts.push(`证件预警 ${docsHot.length} 项：${docsHot.slice(0, 6).map((d) => `${d.carName}${d.carName === '个人' ? '' : '·'}${d.type} ${daysText(d.days)}`).join('；')}${docsHot.length > 6 ? ' 等' : ''}`);
  } else if (c.docs.length) {
    alerts.push('证件全部在有效期内。');
  } else {
    alerts.push('还没有登记任何证件/保险/年检——交强险脱保上路会被扣车，建议先登记（chexia_add kind=doc）。');
  }
  if (hot.length) alerts.push(`养护关注 ${hot.length} 项：${hot.slice(0, 6).join('；')}${hot.length > 6 ? ' 等' : ''}`);
  for (const s of fam.cars) {
    const cons = s.consumption
      ? `${s.consumption.per100}${s.unit}/100km${s.consumption.costPerKm != null ? ` · ${s.consumption.costPerKm} 元/km` : ''}`
      : `暂无法出数（${s.consumptionNote}）`;
    lines.push(`【${s.name}（${core.CAR_KIND_LABELS[s.kind] || s.kind}${s.plate ? ` · ${s.plate}` : ''}）】`);
    lines.push(`  里程表 ${core.fmtNum(s.odometer)} km${s.kmPerDay != null ? ` · 日均约 ${core.fmtNum(s.kmPerDay)} km（${s.rateSource === 'window' ? '近30天' : s.rateSource === 'span' ? '流水推算' : '建档以来'}）` : ''}`);
    lines.push(`  能耗：${cons}`);
    if (s.items.length) {
      for (const it of s.items) {
        const p = it.projection;
        const due = p.state === 'overdue'
          ? (p.axis === 'time' ? `已于 ${p.dueDate} 到期` : `已超 ${core.fmtNum(-p.kmLeft)} km（应于 ${core.fmtNum(p.dueKm)} km）`)
          : p.state === 'due'
            ? (p.axis === 'time' ? `${daysText(p.daysLeftByTime)}到期（${p.dueDate}）` : `还有 ${core.fmtNum(p.kmLeft)} km（${core.fmtNum(p.dueKm)} km 处）`)
            : p.axis === 'time' ? `${daysText(p.daysLeftByTime)}（${p.dueDate}）`
              : p.kmLeft != null ? `还剩 ${core.fmtNum(p.kmLeft)} km` : '';
        lines.push(`  ${bandTag(p.state)} ${it.name}：${due}${p.daysLeftByKm != null && p.state !== 'overdue' ? `（按日均约 ${daysText(p.daysLeftByKm)}）` : ''}`);
      }
    } else {
      lines.push('  养护项：未登记（建议先立机油/滤芯等常规项，chexia_add kind=item）');
    }
    if (s.docsDue.length) {
      for (const d of s.docsDue) lines.push(`  ${bandTag(d.band)} ${d.type}：${d.expiry}（${daysText(d.days)}）`);
    }
    lines.push(`  近 ${s.cost.windowDays} 天费用 ${core.fmtNum(s.cost.total)} 元${s.cost.costPerKm != null ? ` · ${s.cost.costPerKm} 元/km` : ''}`);
  }
  if (fam.personalDocs.length) {
    for (const d of fam.personalDocs) lines.push(`【个人证件】${bandTag(d.band)} ${d.type}：${d.expiry}（${daysText(d.days)}）`);
  }
  return ok(`${alerts.join('\n')}\n\n${lines.join('\n')}\n\n（车辖只做车务记录与提醒，不构成维修/保险建议。）`);
}

async function toolAdd(args) {
  const kind = String(args.kind || '');
  if (kind === 'car') {
    const r = core.normalizeCar({ name: args.name, kind: args.carKind, initialOdometer: args.initialOdometer, plate: args.plate, note: args.note });
    if (r.error) return err(r.error);
    await kv.kvSet(K.car(r.car.id), r.car);
    return ok(`已建档车辆：${r.car.name}（${core.CAR_KIND_LABELS[r.car.kind]}，建档里程 ${core.fmtNum(r.car.initialOdometer)} km，id=${r.car.id}）。建议顺手登记交强险/年检到期日（chexia_add kind=doc）。`);
  }
  if (kind === 'item') {
    const c = await fullCtx();
    const cr = resolveCarRef(args, c.cars);
    if (cr.error) return err(cr.error);
    let car = cr.car;
    if (cr.create) {
      const made = await createCar(cr.create.name, cr.create.kind, Number(args.initialOdometer) || 0, args.plate);
      if (made.error) return err(made.error);
      car = made.car;
    }
    const r = core.normalizeItem({ carId: car.id, name: args.name, cycle: args.cycle, lastOdometer: args.lastOdometer, lastDate: args.lastDate, note: args.note });
    if (r.error) return err(r.error);
    await kv.kvSet(K.item(r.item.id), r.item);
    const p = core.itemProjection(r.item, car, c.energies.filter((e) => e.carId === car.id), c.svcs.filter((s) => s.carId === car.id), Date.now(), c.settings);
    return ok(`已立养护项：${car.name} · ${core.describeItem(r.item)}（itemId=${r.item.id}）。当前状态：${bandTag(p.state)}${p.kmLeft != null ? ` 剩 ${core.fmtNum(p.kmLeft)} km` : ''}${p.dueDate ? ` ${p.dueDate} 到期` : ''}。`);
  }
  if (kind === 'doc') {
    const c = await fullCtx();
    let carId = '';
    let carName = '';
    if (args.carId || args.carName) {
      const cr = resolveCarRef(args, c.cars);
      if (cr.error) return err(cr.error);
      if (cr.create) {
        const made = await createCar(cr.create.name, cr.create.kind, Number(args.initialOdometer) || 0, args.plate);
        if (made.error) return err(made.error);
        carName = made.car.name;
        carId = made.car.id;
      } else {
        carName = cr.car.name;
        carId = cr.car.id;
      }
    }
    const r = core.normalizeDoc({ carId, type: args.type, expiry: args.expiry, remindDays: args.remindDays, note: args.note });
    if (r.error) return err(r.error);
    await kv.kvSet(K.doc(r.doc.id), r.doc);
    const band = core.docBands([r.doc], carId ? c.cars.filter((x) => x.id === carId) : [], Date.now(), c.settings)[0];
    const who = carId ? carName : '个人';
    return ok(`已登记${who}「${r.doc.type}」，到期 ${r.doc.expiry}（${daysText(band.days)}，${bandTag(band.band)}）。到期前 ${r.doc.remindDays ?? c.settings.docWarnDays} 天会进入提醒。`);
  }
  return err(`kind 不合法：${kind}（car/item/doc）`);
}

async function toolLog(args) {
  const kind = String(args.kind || '');
  const c = await fullCtx();
  const now = Date.now();
  const today = core.dayKey(now);
  if (kind === 'energy') {
    const cr = resolveCarRef(args, c.cars);
    if (cr.error) return err(cr.error);
    let car = cr.car;
    let created = false;
    if (cr.create) {
      // 顺手建档：以本次里程表读数为建档基线（首条记录即「从这里开始记」）
      const odo = Number(args.odometer);
      const made = await createCar(cr.create.name, cr.create.kind, Number.isFinite(odo) && odo > 0 ? odo : (Number(args.initialOdometer) || 0), args.plate);
      if (made.error) return err(made.error);
      car = made.car;
      created = true;
    }
    const r = core.normalizeEnergy({ carId: car.id, kind: args.energyKind, date: args.date, odometer: args.odometer, amount: args.amount, cost: args.cost, filled: args.filled, station: args.station, note: args.note }, null, car);
    if (r.error) return err(r.error);
    await kv.kvSet(K.energy(r.energy.id), r.energy);
    const merged = [...c.energies.filter((e) => e.id !== r.energy.id), r.energy];
    const cons = core.periodConsumption(merged, car, today, core.addDaysStr(today, -core.CONS_WINDOW_DAYS));
    const lines = [`已记补能：${car.name} ${r.energy.date} 里程 ${core.fmtNum(r.energy.odometer)} km，${r.energy.amount}${core.unitOf(car)} / ${r.energy.cost} 元${r.energy.filled ? '（加满）' : ''}${created ? `（顺手建档，建档里程=${core.fmtNum(car.initialOdometer)} km）` : ''}`];
    if (cons.ok) {
      lines.push(`近90天期间口径：${cons.per100} ${cons.unit}/100km${cons.estimated ? '（毛估：尚无两次加满，首尾存量相近时更准）' : ''} · ${cons.costPerKm != null ? `${cons.costPerKm} 元/km · ` : ''}窗口 ${cons.since}→${cons.until}（${cons.kmSpan} km）`);
    } else {
      lines.push(`能耗暂无法出数：${cons.reason}。里程表读数是油耗/养护倒计时的生命线，每次都记。`);
    }
    const ownE = merged.filter((e) => e.carId === car.id);
    const ownS = c.svcs.filter((s) => s.carId === car.id);
    const hot = c.items.filter((it) => it.carId === car.id && it.active !== false)
      .map((it) => ({ it, p: core.itemProjection(it, car, ownE, ownS, now, c.settings) }))
      .filter((x) => x.p.state === 'due' || x.p.state === 'overdue')
      .sort((a, b) => ({ overdue: 0, due: 1 })[a.p.state] - ({ overdue: 0, due: 1 })[b.p.state]);
    for (const h of hot) {
      lines.push(`${bandTag(h.p.state)} ${h.it.name}：${h.p.state === 'overdue' ? `已超（应于 ${core.fmtNum(h.p.dueKm)} km / ${h.p.dueDate || ''}）` : `还有 ${core.fmtNum(h.p.kmLeft)} km`}`);
    }
    return ok(lines.join('\n'));
  }
  if (kind === 'svc') {
    const cr = resolveCarRef(args, c.cars);
    if (cr.error) return err(cr.error);
    let car = cr.car;
    if (cr.create) {
      const made = await createCar(cr.create.name, cr.create.kind, Number(args.odometer) || Number(args.initialOdometer) || 0, args.plate);
      if (made.error) return err(made.error);
      car = made.car;
    }
    const r = core.normalizeSvc({ carId: car.id, type: args.svcType, date: args.date, odometer: args.odometer, desc: args.desc, cost: args.cost, vendor: args.vendor, itemName: args.itemName, note: args.note });
    if (r.error) return err(r.error);
    await kv.kvSet(K.svc(r.svc.id), r.svc);
    const lines = [`已记维保：${car.name} ${r.svc.date} ${r.svc.desc}${r.svc.odometer != null ? `（里程 ${core.fmtNum(r.svc.odometer)} km）` : ''}${r.svc.cost != null ? ` · ${r.svc.cost} 元` : ''}${r.svc.vendor ? ` · ${r.svc.vendor}` : ''}（svcId=${r.svc.id}）`];
    // 维保联动锚点：type=maintenance 且 itemName 命中该车养护项时推进（仅当记录更新）
    if (r.svc.type === 'maintenance' && r.svc.itemName) {
      const target = c.items.find((it) => it.carId === car.id && it.name === r.svc.itemName);
      if (!target) {
        lines.push(`（未找到名为「${r.svc.itemName}」的养护项——如需按此周期提醒，请 chexia_add kind=item 立项。）`);
      } else {
        const patch = {};
        let changed = false;
        if (r.svc.odometer != null && (target.lastOdometer === undefined || r.svc.odometer >= target.lastOdometer)) { patch.lastOdometer = r.svc.odometer; changed = true; }
        if (!target.lastDate || r.svc.date >= target.lastDate) { patch.lastDate = r.svc.date; changed = true; }
        if (changed) {
          const u = core.normalizeItem(patch, target);
          if (!u.error) {
            await kv.kvSet(K.item(u.item.id), u.item);
            const ownE = c.energies.filter((e) => e.carId === car.id);
            const ownS = [...c.svcs.filter((s) => s.carId === car.id && s.id !== r.svc.id), r.svc];
            const p = core.itemProjection(u.item, car, ownE, ownS, now, c.settings);
            lines.push(`已推进「${target.name}」锚点 → ${bandTag(p.state)} ${p.kmLeft != null ? `剩 ${core.fmtNum(p.kmLeft)} km` : ''}${p.dueDate ? ` 下次 ${p.dueDate}` : ''}`);
          }
        }
      }
    }
    return ok(lines.join('\n'));
  }
  return err(`kind 不合法：${kind}（energy/svc）`);
}

async function toolQuery(args) {
  const scope = String(args.scope || 'cars');
  const c = await fullCtx();
  const now = Date.now();
  if (scope === 'cars') {
    if (!c.cars.length) return ok('还没有车辆档案。');
    const fam = core.familySnapshot(c.cars, c.energies, c.items, c.svcs, c.docs, now, c.settings);
    return ok(fam.cars.map((s) => {
      const cons = s.consumption ? `${s.consumption.per100}${s.unit}/100km` : '能耗暂无法出数';
      const hot = s.items.filter((i) => i.projection.state !== 'ok').length;
      return `[${s.carId}] ${s.name}（${core.CAR_KIND_LABELS[s.kind] || s.kind}${s.plate ? ` · ${s.plate}` : ''}）里程 ${core.fmtNum(s.odometer)} km${s.kmPerDay != null ? ` · 日均 ${core.fmtNum(s.kmPerDay)} km` : ''} · ${cons} · 养护${s.items.length}项（关注${hot}）· 证件预警${s.docsDue.length}`;
    }).join('\n'));
  }
  if (scope === 'items') {
    let items = c.items;
    if (args.carId || args.carName) {
      const cr = resolveCarRef(args, c.cars);
      if (cr.error) return err(cr.error);
      if (cr.create) return ok('该车还没有养护项。');
      items = items.filter((it) => it.carId === cr.car.id);
    }
    if (!items.length) return ok('暂无养护项。');
    const carById = new Map(c.cars.map((x) => [x.id, x]));
    return ok(items.map((it) => {
      const car = carById.get(it.carId);
      const p = it.active === false ? null : core.itemProjection(it, car || null, c.energies, c.svcs, now, c.settings);
      const st = p ? `${bandTag(p.state)}${p.kmLeft != null ? ` 剩${core.fmtNum(p.kmLeft)}km` : ''}${p.dueDate ? ` ${p.dueDate}到期` : ''}` : '（已停用）';
      return `[${it.id}] ${car ? car.name : '?'} · ${core.describeItem(it)} · ${st}${it.note ? ` · ${it.note}` : ''}`;
    }).join('\n'));
  }
  if (scope === 'svcs') {
    let rows = c.svcs;
    if (args.carId || args.carName) {
      const cr = resolveCarRef(args, c.cars);
      if (cr.error) return err(cr.error);
      if (cr.create) return ok('该车还没有维保记录。');
      rows = rows.filter((s) => s.carId === cr.car.id);
    }
    if (args.type) rows = rows.filter((s) => s.type === args.type);
    if (args.sinceDate) rows = rows.filter((s) => s.date >= args.sinceDate);
    rows.sort((a, b) => (a.date < b.date ? 1 : -1));
    if (!rows.length) return ok('该范围没有维保记录。');
    const carById = new Map(c.cars.map((x) => [x.id, x]));
    return ok(rows.slice(0, 80).map((s) => `${s.date} ${carById.get(s.carId) ? carById.get(s.carId).name : '?'} ${s.desc}${s.odometer != null ? ` · ${core.fmtNum(s.odometer)}km` : ''}${s.cost != null ? ` · ${s.cost}元` : ''}${s.vendor ? ` · ${s.vendor}` : ''}（svcId=${s.id}）`).join('\n')
      + (rows.length > 80 ? `\n（仅最近 80 条，共 ${rows.length} 条）` : ''));
  }
  if (scope === 'docs') {
    const rows = core.docBands(c.docs, c.cars, now, c.settings);
    const shown = rows.filter((r) => r.band !== 'ok' || args.all === true);
    if (!shown.length) return ok(c.docs.length ? '证件全部在有效期内。' : '还没有登记任何证件。');
    return ok('证件榜\n' + shown.map((r) => `${bandTag(r.band)} ${r.carName} · ${r.type}：${r.expiry}（${daysText(r.days)}）${r.note ? ` · ${r.note}` : ''}`).join('\n'));
  }
  if (scope === 'energy') {
    let rows = c.energies;
    if (args.carId || args.carName) {
      const cr = resolveCarRef(args, c.cars);
      if (cr.error) return err(cr.error);
      if (cr.create) return ok('该车还没有补能记录。');
      rows = rows.filter((e) => e.carId === cr.car.id);
    }
    if (args.sinceDate) rows = rows.filter((e) => e.date >= args.sinceDate);
    rows.sort((a, b) => (a.date < b.date ? 1 : -1));
    if (!rows.length) return ok('该范围没有补能记录。');
    const carById = new Map(c.cars.map((x) => [x.id, x]));
    const lines = rows.slice(0, 60).map((e) => `${e.date} ${carById.get(e.carId) ? carById.get(e.carId).name : '?'} ${core.fmtNum(e.odometer)}km · ${e.amount}${e.kind === 'charge' ? 'kWh' : 'L'} · ${e.cost}元${e.filled ? ' 加满' : ''}${e.station ? ` · ${e.station}` : ''}（id=${e.id}）`);
    return ok(lines.join('\n') + (rows.length > 60 ? `\n（仅最近 60 条，共 ${rows.length} 条）` : ''));
  }
  if (scope === 'cost') {
    const days = Math.max(30, Math.min(365, Math.floor(Number(args.windowDays) || 90)));
    const targets = (args.carId || args.carName)
      ? (() => {
        const cr = resolveCarRef(args, c.cars);
        return cr.car ? [cr.car] : [];
      })()
      : c.cars;
    if (!targets.length) return ok('没有可统计的车辆。');
    const out = [];
    for (const car of targets) {
      const cb = core.costBreakdown(c.energies, c.svcs, car, core.dayKey(now), days);
      out.push(`【${car.name}】近${days}天合计 ${core.fmtNum(cb.total)} 元（补能 ${core.fmtNum(cb.energyCost)} + 维保 ${core.fmtNum(cb.serviceCost)}）${cb.costPerKm != null ? ` · ${cb.costPerKm} 元/km` : ' · 里程跨度不足，不出元每公里'}\n  月度：${cb.perMonth.map((m) => `${m.month}=${core.fmtNum(m.total)}元`).join('，') || '无'}`);
    }
    return ok(out.join('\n\n') + '\n\n（费用为登记口径汇总，不构成养车成本建议。）');
  }
  return err(`scope 不合法：${scope}（cars/items/svcs/docs/energy/cost）`);
}

async function toolUpdate(args) {
  const kind = String(args.kind || '');
  const id = String(args.id || '').trim();
  if (!id) return err('需提供 id');
  const patch = args.patch && typeof args.patch === 'object' ? args.patch : {};
  const KMAP = { car: K.car, item: K.item, doc: K.doc, energy: K.energy, svc: K.svc };
  const store = KMAP[kind];
  if (!store) return err(`kind 不合法：${kind}（car/item/doc/energy/svc）`);
  const prev = await kv.kvGet(store(id)).catch(() => null);
  if (!prev) return err(`找不到 ${kind} ${id}`);
  const N = { car: core.normalizeCar, item: core.normalizeItem, doc: core.normalizeDoc, energy: core.normalizeEnergy, svc: core.normalizeSvc }[kind];
  const extra = kind === 'energy' ? [prev.carId ? (await listCars()).find((x) => x.id === prev.carId) || null : null] : [];
  const r = N(patch, prev, ...extra);
  if (r.error) return err(r.error);
  const v = r[kind];
  if (!v) return err(`更新结果异常（${kind}）`);
  if (kind === 'item' && v.carId !== prev.carId) return err('养护项不可换车（删了重立）。');
  await kv.kvSet(store(v.id), v);
  const label = kind === 'car'
    ? `${v.name}（${core.CAR_KIND_LABELS[v.kind] || v.kind}${v.plate ? ` · ${v.plate}` : ''}，建档里程 ${core.fmtNum(v.initialOdometer)} km）`
    : (v.name || v.desc || v.type || v.id);
  return ok(`已更新 ${kind}：${label}${kind === 'doc' ? `（到期 ${v.expiry}）` : ''}${kind === 'item' ? ` · ${core.describeItem(v)}` : ''}`);
}

async function toolDelete(args) {
  const kind = String(args.kind || '');
  const id = String(args.id || '').trim();
  if (!id) return err('需提供 id');
  if (args.confirm !== true) return err('删除需显式 confirm=true（不可逆）。');
  if (kind === 'car') {
    const [energies, items, svcs, docs] = await Promise.all([listEnergies(), listItems(), listSvcs(), listDocs()]);
    const own = {
      energies: energies.filter((e) => e.carId === id),
      items: items.filter((it) => it.carId === id),
      svcs: svcs.filter((s) => s.carId === id),
      docs: docs.filter((d) => d.carId === id),
    };
    const total = own.energies.length + own.items.length + own.svcs.length + own.docs.length;
    if (total > 0 && args.purge !== true) {
      return err(`该车名下还有 ${total} 条记录（补能 ${own.energies.length} / 养护项 ${own.items.length} / 维保 ${own.svcs.length} / 证件 ${own.docs.length}）。确认连这些一起删请传 purge=true。`);
    }
    for (const e of own.energies) await kv.kvDel(K.energy(e.id));
    for (const it of own.items) await kv.kvDel(K.item(it.id));
    for (const s of own.svcs) await kv.kvDel(K.svc(s.id));
    for (const d of own.docs) await kv.kvDel(K.doc(d.id));
    await kv.kvDel(K.car(id));
    return ok(`已删除车辆${total ? `及其 ${total} 条记录` : ''}。`);
  }
  if (kind === 'item') {
    const prev = await kv.kvGet(K.item(id)).catch(() => null);
    if (!prev) return err(`找不到养护项 ${id}`);
    await kv.kvDel(K.item(id));
    return ok(`已删除养护项「${prev.name}」（历史维保记录保留，仅不再提醒）。`);
  }
  if (kind === 'doc') {
    const prev = await kv.kvGet(K.doc(id)).catch(() => null);
    if (!prev) return err(`找不到证件 ${id}`);
    await kv.kvDel(K.doc(id));
    return ok(`已删除证件「${prev.type}」。`);
  }
  if (kind === 'energy' || kind === 'svc') {
    const store = kind === 'energy' ? K.energy : K.svc;
    const prev = await kv.kvGet(store(id)).catch(() => null);
    if (!prev) return err(`找不到${kind === 'energy' ? '补能' : '维保'}记录 ${id}`);
    await kv.kvDel(store(id));
    return ok(`已删除${kind === 'energy' ? '补能' : '维保'}记录（${prev.date}）。若该维保曾推进养护项锚点，锚点不自动回退——如需调整请 chexia_update kind=item。`);
  }
  return err(`kind 不合法：${kind}（car/item/doc/energy/svc）`);
}

// ── 工具清单 ─────────────────────────────────────────────────────────────────
const CAR_KIND_HINT = `fuel 燃油｜ev 纯电｜phev 插混`;
const CYCLE_HINT = `{kmInterval:5000} 每5000公里｜{monthInterval:6} 每6个月｜双周期同时给=两者取先到（kmInterval 需 ≥500，monthInterval 需 ≥1）`;

const tools = [
  {
    name: 'chexia_today',
    description: '车辖·全家今日总览：每辆车的里程表/日均里程/期间油耗电耗（元每公里）/养护项红黄状态/证件（交强险·商业险·年检·驾驶证）红黄榜/近期费用。用户问「车该保养了吗」「保险什么时候到期」「这车百公里多少钱」「机油该换了吗」时用。',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'chexia_add',
    description: '车辖·建档：kind=car 建车辆（name+carKind+initialOdometer 建档里程）；kind=item 立养护项（carName+name+cycle 周期+lastOdometer/lastDate 锚点，如「机油机滤每5000公里，上次46000」）；kind=doc 登记证件/保险/年检到期日（carName 可空=个人证件如驾驶证）。支持 carName 按名自动配车。',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['car', 'item', 'doc'] },
        name: { type: 'string', description: 'car=车辆名；item=养护项名（机油机滤/空调滤芯/轮胎换位…）' },
        carKind: { type: 'string', enum: ['fuel', 'ev', 'phev'], description: '（car）' + CAR_KIND_HINT },
        initialOdometer: { type: 'number', description: '（car）建档里程表读数 km' },
        plate: { type: 'string', description: '（car）车牌，可空' },
        carId: { type: 'string', description: '（item/doc）挂靠车辆 id（或 carName）' },
        carName: { type: 'string', description: '（item/doc）车辆名，不存在时按 carKind/initialOdometer 自动建档' },
        cycle: { type: 'object', description: '（item）' + CYCLE_HINT },
        lastOdometer: { type: 'number', description: '（item）上次保养时里程表读数——km 周期必填' },
        lastDate: { type: 'string', description: '（item）上次保养日期 YYYY-MM-DD——月周期必填' },
        type: { type: 'string', description: '（doc）交强险/商业险/年检/驾驶证/行驶证/其他' },
        expiry: { type: 'string', description: '（doc）到期日 YYYY-MM-DD' },
        remindDays: { type: 'number', description: '（doc）提前提醒天数（缺省用全局设置 30）' },
        note: { type: 'string', description: '备注' },
      },
      required: ['kind'],
    },
  },
  {
    name: 'chexia_log',
    description: '车辖·记流水：kind=energy 补能（carName+odometer 里程表读数必填+amount 升/kWh+cost 元+filled 是否加满；加半箱/充到80%都收，期间口径能算；车不存在会顺手建档并以本次里程为基线）；kind=svc 维保（carName+svcType=maintenance/repair/inspection/insurance/other+date+odometer+cost+vendor+desc；type=maintenance 且 itemName 与养护项同名时自动推进其保养锚点）。用户说「刚加油350块42.3升，里程45230」→ kind=energy。',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['energy', 'svc'] },
        carId: { type: 'string' }, carName: { type: 'string', description: '车辆名（不存在自动建档）' },
        date: { type: 'string', description: 'YYYY-MM-DD，缺省今天' },
        odometer: { type: 'number', description: '里程表读数 km（补能必填；维保选填）' },
        amount: { type: 'number', description: '（energy）本次补能量 L 或 kWh' },
        cost: { type: 'number', description: '本次花费（元）' },
        filled: { type: 'boolean', description: '（energy）是否加满/充满，缺省 true' },
        energyKind: { type: 'string', enum: ['fuel', 'charge'], description: '（energy）缺省按车型：油车 fuel / 电车 charge' },
        station: { type: 'string', description: '（energy）加油站/充电站' },
        svcType: { type: 'string', enum: ['maintenance', 'repair', 'inspection', 'insurance', 'other'], description: '（svc）维保类型' },
        desc: { type: 'string', description: '（svc）做了什么（缺省用类型中文名）' },
        vendor: { type: 'string', description: '（svc）商家/店家' },
        itemName: { type: 'string', description: '（svc）对应养护项名——同名则自动推进其锚点' },
      },
      required: ['kind'],
    },
  },
  {
    name: 'chexia_query',
    description: '车辖·查询：scope=cars 车辆总表｜items 养护项（含倒计时状态）｜svcs 维保流水｜docs 证件红黄榜（all=true 含充裕）｜energy 补能流水（可按车/起始日过滤）｜cost 费用透视（元每公里/月度分桶，windowDays 缺省90）。',
    inputSchema: {
      type: 'object',
      properties: {
        scope: { type: 'string', enum: ['cars', 'items', 'svcs', 'docs', 'energy', 'cost'] },
        carId: { type: 'string' }, carName: { type: 'string' },
        type: { type: 'string', description: '（svcs）maintenance/repair/inspection/insurance/other' },
        sinceDate: { type: 'string', description: '（svcs/energy）起始日期 YYYY-MM-DD' },
        all: { type: 'boolean', description: '（docs）含效期充裕证件' },
        windowDays: { type: 'number', description: '（cost）统计窗口天数 30-365' },
      },
      required: ['scope'],
    },
  },
  {
    name: 'chexia_update',
    description: '车辖·修改：kind+id+patch 部分更新。car（改名/车型/建档里程/车牌）、item（改周期/锚点/停用 active:false）、doc（改到期日/提醒天数）、energy、svc。改证件到期=续保/年检后直接 patch expiry。',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['car', 'item', 'doc', 'energy', 'svc'] },
        id: { type: 'string' },
        patch: { type: 'object', description: '要改的字段' },
      },
      required: ['kind', 'id', 'patch'],
    },
  },
  {
    name: 'chexia_delete',
    description: '车辖·删除（需 confirm=true）：car（名下有记录需 purge=true 连带删）、item（历史维保保留）、doc、energy、svc（曾推进锚点的不自动回退）。',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['car', 'item', 'doc', 'energy', 'svc'] },
        id: { type: 'string' },
        confirm: { type: 'boolean' },
        purge: { type: 'boolean', description: '（car）连带删名下全部记录' },
      },
      required: ['kind', 'id', 'confirm'],
    },
  },
];

const HANDLERS = {
  chexia_today: toolToday,
  chexia_add: toolAdd,
  chexia_log: toolLog,
  chexia_query: toolQuery,
  chexia_update: toolUpdate,
  chexia_delete: toolDelete,
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

log('info', `chexia mcp server v${SERVER_VERSION} ready (appConfigDir=${APP_CONFIG_DIR || '未提供'})`);
