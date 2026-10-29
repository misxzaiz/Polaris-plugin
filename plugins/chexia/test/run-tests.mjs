/**
 * 车辖核心单测（node test/run-tests.mjs，离线）
 * 全部显式合成日期（NOW=2026-10-29 本地正午），不依赖真实时钟。
 * 覆盖：日期工具（月加法月末钳制/闰年）/五类实体归一化/最新里程/日均里程回落链/
 * 期间口径能耗（加满锚定/毛估退化/里程差过小拒绝）/养护投影（km/时间/双周期取紧）/
 * 证件红黄榜/费用透视/单车与全家快照/导出剥离。
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const core = require('../shared/core.js');

// 本地正午合成时间：跨时区稳定落在 2026-10-29
const NOW = new Date(2026, 9, 29, 12, 0, 0).getTime();
const TODAY = '2026-10-29';

let pass = 0; let fail = 0; const failures = [];
function t(name, fn) {
  try { fn(); pass++; console.log(`✓ ${name}`); } catch (e) { fail++; failures.push({ name, e }); console.error(`✗ ${name}\n  ${e.message}`); }
}

const mkCar = (over = {}) => core.normalizeCar({ name: '家里的白SUV', kind: 'fuel', initialOdometer: 45000, ...over }).car;
const mkEnergy = (car, over = {}) => core.normalizeEnergy({ carId: car.id, date: TODAY, odometer: 45300, amount: 40, cost: 320, ...over }, null, car).energy;
const mkItem = (over = {}) => core.normalizeItem(over).item;
const mkSvc = (over = {}) => core.normalizeSvc(over).svc;
const mkDoc = (over = {}) => core.normalizeDoc(over).doc;

// ── 日期工具 ───────────────────────────────────────────────────────────────
t('dayKey 输出本地日期；parseDayKey 拒绝 2 月 30 日', () => {
  assert.equal(core.dayKey(NOW), TODAY);
  assert.equal(core.parseDayKey('2026-02-30'), null);
  assert.equal(core.parseDayKey('2026/10/29'), null);
  assert.ok(core.parseDayKey('2028-02-29') != null, '闰日合法');
});
t('addMonthsStr 月末钳制：1月31日+1月=2月28日；闰年 2028 = 2月29日', () => {
  assert.equal(core.addMonthsStr('2026-01-31', 1), '2026-02-28');
  assert.equal(core.addMonthsStr('2028-01-31', 1), '2028-02-29');
  assert.equal(core.addMonthsStr('2026-01-31', 12), '2027-01-31');
  assert.equal(core.addMonthsStr('bad', 1), null);
});
t('dayDiff / addDaysStr', () => {
  assert.equal(core.dayDiff('2026-10-01', '2026-10-29'), 28);
  assert.equal(core.addDaysStr('2026-10-29', -90), '2026-07-31');
  assert.ok(Number.isNaN(core.dayDiff('bad', TODAY)));
});

// ── 车辆归一化 ──────────────────────────────────────────────────────────────
t('normalizeCar：缺名拒绝；kind 非法回落 fuel；id 按名确定', () => {
  assert.ok(core.normalizeCar({ name: '' }).error.includes('名称'));
  const c1 = mkCar();
  const c2 = mkCar();
  assert.equal(c1.id, c2.id, '同名同 id（find-or-create 幂等）');
  assert.equal(mkCar({ kind: 'truck' }).kind, 'fuel');
  assert.equal(mkCar({ kind: 'ev' }).kind, 'ev');
  assert.equal(mkCar({ initialOdometer: -5 }).initialOdometer, 0);
});
t('normalizeCar：merge 语义（existing 回退）', () => {
  const c1 = mkCar({ plate: '浙A·88888', note: '家用' });
  const merged = core.normalizeCar({ name: '家里的白SUV' }, c1).car;
  assert.equal(merged.plate, '浙A·88888', '未提供的字段回退');
  assert.equal(merged.note, '家用');
  assert.equal(merged.rev, 2, 'rev 自增');
  assert.equal(merged.createdAt, c1.createdAt, 'createdAt 保真');
});
t('unitOf：fuel→L，ev→kWh，phev→L', () => {
  assert.equal(core.unitOf(mkCar({ kind: 'fuel' })), 'L');
  assert.equal(core.unitOf(mkCar({ kind: 'ev' })), 'kWh');
  assert.equal(core.unitOf(mkCar({ kind: 'phev' })), 'L');
});

// ── 补能归一化 ──────────────────────────────────────────────────────────────
t('normalizeEnergy：odometer 必填且不得小于建档里程', () => {
  const car = mkCar();
  assert.ok(core.normalizeEnergy({ carId: car.id, date: TODAY, amount: 40, cost: 300 }, null, car).error.includes('odometer'));
  assert.ok(core.normalizeEnergy({ carId: car.id, date: TODAY, odometer: 44000, amount: 40, cost: 300 }, null, car).error.includes('建档里程'));
  assert.ok(mkEnergy(car, { odometer: 45000.0 }));
  assert.equal(mkEnergy(car, { odometer: 45300.44 }).odometer, 45300.4, '里程 1 位小数');
});
t('normalizeEnergy：amount/cost 校验；kind 按车型缺省；filled 缺省 true', () => {
  const car = mkCar();
  assert.ok(core.normalizeEnergy({ carId: car.id, date: TODAY, odometer: 45100, amount: 0, cost: 300 }, null, car).error.includes('amount'));
  assert.ok(core.normalizeEnergy({ carId: car.id, date: TODAY, odometer: 45100, amount: 40, cost: -1 }, null, car).error.includes('cost'));
  const e = mkEnergy(car, { cost: 320.555 });
  assert.equal(e.cost, 320.56, '金额 2 位小数');
  assert.equal(e.kind, 'fuel');
  const evCar = mkCar({ name: '电驴', kind: 'ev', initialOdometer: 1000 });
  assert.equal(core.normalizeEnergy({ carId: evCar.id, date: TODAY, odometer: 1100, amount: 30, cost: 20 }, null, evCar).energy.kind, 'charge');
  assert.equal(mkEnergy(car, { filled: false }).filled, false);
});
t('normalizeEnergy：日期非法拒绝；merge 回退', () => {
  const car = mkCar();
  assert.ok(core.normalizeEnergy({ carId: car.id, date: '2026/10/01', odometer: 45100, amount: 40, cost: 300 }, null, car).error.includes('日期'));
  const e1 = mkEnergy(car, { note: '中石化' });
  const merged = core.normalizeEnergy({ cost: 330 }, e1, car).energy;
  assert.equal(merged.note, '中石化');
  assert.equal(merged.cost, 330);
});

// ── 养护项归一化 ────────────────────────────────────────────────────────────
t('normalizeItem：周期至少其一；kmInterval<500 拒绝；显式 0 关闭', () => {
  assert.ok(core.normalizeItem({ carId: 'c1', name: '机油' }).error.includes('cycle'));
  assert.ok(core.normalizeItem({ carId: 'c1', name: '机油', cycle: { kmInterval: 300 } }).error.includes('kmInterval'));
  const it = core.normalizeItem({ carId: 'c1', name: '机油', cycle: { kmInterval: 0, monthInterval: 6 }, lastDate: '2026-04-01' }).item;
  assert.equal(it.cycle.kmInterval, undefined, '显式 0 = 关闭该轴');
  assert.equal(it.cycle.monthInterval, 6);
});
t('normalizeItem：锚点要求——km 轴要 lastOdometer，月轴要 lastDate', () => {
  assert.ok(core.normalizeItem({ carId: 'c1', name: '机油', cycle: { kmInterval: 5000 } }).error.includes('lastOdometer'));
  assert.ok(core.normalizeItem({ carId: 'c1', name: '机油', cycle: { monthInterval: 6 } }).error.includes('lastDate'));
  const it = core.normalizeItem({ carId: 'c1', name: '机油', cycle: { kmInterval: 5000 }, lastOdometer: 45000, lastDate: '2026-08-01' }).item;
  assert.equal(it.lastOdometer, 45000);
});
t('normalizeItem：id 按 carId|name 确定（同名配档幂等）', () => {
  const a = mkItem({ carId: 'c1', name: '空调滤芯', cycle: { monthInterval: 12 }, lastDate: TODAY });
  const b = mkItem({ carId: 'c1', name: '空调滤芯', cycle: { monthInterval: 12 }, lastDate: TODAY });
  assert.equal(a.id, b.id);
  const c = mkItem({ carId: 'c2', name: '空调滤芯', cycle: { monthInterval: 12 }, lastDate: TODAY });
  assert.notEqual(a.id, c.id, '跨车不同 id');
});

// ── 维保与证件归一化 ────────────────────────────────────────────────────────
t('normalizeSvc：type 校验；desc 缺省用类型中文名', () => {
  assert.ok(core.normalizeSvc({ carId: 'c1', type: 'washing' }).error.includes('type'));
  const s = mkSvc({ carId: 'c1', type: 'inspection', date: TODAY, cost: 300 });
  assert.equal(s.desc, '年检');
  assert.equal(mkSvc({ carId: 'c1', desc: '换刹车片' }).type, 'maintenance', '缺省 maintenance');
});
t('normalizeDoc：expiry 必填；carId 可空（个人证件）；remindDays 0-365', () => {
  assert.ok(core.normalizeDoc({ type: '交强险' }).error.includes('expiry'));
  const d = mkDoc({ type: '驾驶证', expiry: '2027-10-29' });
  assert.equal(d.carId, '');
  assert.ok(core.normalizeDoc({ type: '年检', expiry: '2027-01-01', remindDays: 400 }).error.includes('remindDays'));
  assert.equal(mkDoc({ type: '年检', expiry: '2027-01-01', remindDays: 15 }).remindDays, 15);
});
t('normalizeSettings：钳制与默认', () => {
  const s = core.normalizeSettings({ docWarnDays: 9999, itemWatchKm: -1 });
  assert.equal(s.docWarnDays, 365);
  assert.equal(s.itemWatchKm, 100);
  assert.deepEqual(core.normalizeSettings(null), { docWarnDays: 30, itemWatchKm: 500, itemWatchDays: 14, costWindowDays: 90 });
});

// ── 里程派生 ────────────────────────────────────────────────────────────────
t('latestOdometer：取补能+维保最大值，回落建档里程', () => {
  const car = mkCar({ initialOdometer: 45000 });
  assert.equal(core.latestOdometer([], [], car), 45000);
  const e1 = mkEnergy(car, { date: '2026-10-01', odometer: 45500, amount: 40, cost: 300 });
  const s1 = mkSvc({ carId: car.id, date: '2026-10-05', odometer: 45800 });
  assert.equal(core.latestOdometer([e1], [s1], car), 45800);
});
t('mileageRate：窗口优先 → 末两条 → 建档回落 → none', () => {
  const car = mkCar({ initialOdometer: 45000, createdAt: NOW - 100 * core.DAY_MS });
  // 窗口内两条：10-01 → 10-28 共 27 天 1500km ≈ 55.6km/天
  const e1 = mkEnergy(car, { date: '2026-10-01', odometer: 45500, amount: 40, cost: 300 });
  const e2 = mkEnergy(car, { date: '2026-10-28', odometer: 47000, amount: 40, cost: 300 });
  const r = core.mileageRate([e1, e2], [], car, NOW);
  assert.equal(r.source, 'window');
  assert.equal(Math.round(r.rate), 56, `rate=${r.rate}`);
  // 窗口外两条（10 月 1 之前的两个旧记录）→ 末两条口径
  const old1 = mkEnergy(car, { date: '2026-05-01', odometer: 45200, amount: 40, cost: 300 });
  const old2 = mkEnergy(car, { date: '2026-06-01', odometer: 45800, amount: 40, cost: 300 });
  const r2v = core.mileageRate([old1, old2], [], car, NOW);
  assert.equal(r2v.source, 'span');
  // 单条 + 建档 100 天 → lifetime：(45500-45000)/100
  const r3 = core.mileageRate([e1], [], car, NOW);
  assert.equal(r3.source, 'lifetime');
  assert.equal(Math.round(r3.rate), 5);
  // 无记录且刚建档 → none
  const fresh = mkCar({ name: '新车', initialOdometer: 100, createdAt: NOW });
  assert.equal(core.mileageRate([], [], fresh, NOW).source, 'none');
});

// ── 期间口径能耗 ────────────────────────────────────────────────────────────
t('periodConsumption：加满锚定法——两次加满之间含中途部分补能', () => {
  const car = mkCar({ name: '锚定车', initialOdometer: 9500 });
  // 8-01 加满(锚A) → 8-15 加半箱 → 8-30 加满(锚B)：锚定窗消耗 = 15 + 30 = 45L / (10500-10000=500km)
  const a = mkEnergy(car, { date: '2026-08-01', odometer: 10000, amount: 40, cost: 320, filled: true });
  const mid = mkEnergy(car, { date: '2026-08-15', odometer: 10250, amount: 15, cost: 120, filled: false });
  const b = mkEnergy(car, { date: '2026-08-30', odometer: 10500, amount: 30, cost: 240, filled: true });
  const r = core.periodConsumption([a, mid, b], car, TODAY, '2026-07-01');
  assert.ok(r.ok, r.reason || '');
  assert.equal(r.estimated, false, '两次加满 → 教科书口径');
  assert.equal(r.per100, 9, `per100=${r.per100}`);
  assert.equal(r.amount, 45);
  assert.ok(Math.abs(r.costPerKm - 680 / 500) < 0.01, `costPerKm=${r.costPerKm}`);
});
t('periodConsumption：无两次加满 → 毛估退化（首条只做锚点）', () => {
  const car = mkCar({ name: '锚定车', initialOdometer: 9500 });
  const a = mkEnergy(car, { date: '2026-08-01', odometer: 10000, amount: 40, cost: 320, filled: true });
  const b = mkEnergy(car, { date: '2026-08-30', odometer: 10500, amount: 30, cost: 240, filled: false });
  const r = core.periodConsumption([a, b], car, TODAY, '2026-07-01');
  assert.ok(r.ok, r.reason || '');
  assert.equal(r.estimated, true, '只有一次加满 → 毛估');
  assert.equal(r.amount, 30, '首条不计入量');
  assert.equal(r.per100, 6);
});
t('periodConsumption：样本不足 / 里程差过小 → 诚实拒绝出数', () => {
  const car = mkCar({ name: '锚定车', initialOdometer: 9500 });
  const single = mkEnergy(car, { date: '2026-08-01', odometer: 10000, amount: 40, cost: 320 });
  const r1v = core.periodConsumption([single], car, TODAY, '2026-07-01');
  assert.equal(r1v.ok, false);
  assert.ok(r1v.reason.includes('样本不足'));
  const a = mkEnergy(car, { date: '2026-09-01', odometer: 10000, amount: 40, cost: 320, filled: true });
  const b = mkEnergy(car, { date: '2026-09-05', odometer: 10020, amount: 40, cost: 320, filled: true });
  const r2v = core.periodConsumption([a, b], car, TODAY, '2026-07-01');
  assert.equal(r2v.ok, false);
  assert.ok(r2v.reason.includes('跨度'), `reason=${r2v.reason}`);
});
t('periodConsumption：电车 charge + kWh 口径', () => {
  const car = mkCar({ name: '电驴', kind: 'ev', initialOdometer: 900 });
  const a = core.normalizeEnergy({ carId: car.id, date: '2026-08-01', odometer: 1000, amount: 50, cost: 30, filled: true }, null, car).energy;
  const b = core.normalizeEnergy({ carId: car.id, date: '2026-08-20', odometer: 1400, amount: 52, cost: 31, filled: true }, null, car).energy;
  const r = core.periodConsumption([a, b], car, TODAY, '2026-07-01');
  assert.ok(r.ok, r.reason || '');
  assert.equal(r.unit, 'kWh');
  assert.equal(r.per100, 13, `per100=${r.per100}`);
});

// ── 养护项投影 ──────────────────────────────────────────────────────────────
t('itemProjection：km 轴——按日均里程换算天数与状态', () => {
  const car = mkCar({ initialOdometer: 45000, createdAt: NOW - 100 * core.DAY_MS });
  const e1 = mkEnergy(car, { date: '2026-10-01', odometer: 45500, amount: 40, cost: 300 });
  const e2 = mkEnergy(car, { date: '2026-10-28', odometer: 47000, amount: 40, cost: 300 });
  // 日均 ~50km。机油：上次 45000，每 5000km → dueKm=50000，kmLeft=3000（约 60 天）→ ok
  const it = mkItem({ carId: car.id, name: '机油机滤', cycle: { kmInterval: 5000 }, lastOdometer: 45000 });
  const p = core.itemProjection(it, car, [e1, e2], [], NOW, null);
  assert.equal(p.dueKm, 50000);
  assert.equal(p.kmLeft, 3000);
  assert.equal(p.state, 'ok');
  // 快到：interval 500km，lastOdometer=46800 → dueKm=47300，kmLeft=300 ≤ itemWatchKm(500) → due
  const it2 = mkItem({ carId: car.id, name: '空调滤芯', cycle: { kmInterval: 500 }, lastOdometer: 46800 });
  const p2 = core.itemProjection(it2, car, [e1, e2], [], NOW, null);
  assert.equal(p2.state, 'due');
  assert.equal(p2.kmLeft, 300);
  // 已超：lastOdometer=42000 → dueKm=47000，kmLeft=0 → overdue
  const it3 = mkItem({ carId: car.id, name: '刹车油', cycle: { kmInterval: 5000 }, lastOdometer: 42000 });
  const p3 = core.itemProjection(it3, car, [e1, e2], [], NOW, null);
  assert.equal(p3.state, 'overdue');
});
t('itemProjection：无日均里程时 kmLeft 有值但 daysLeft=null（诚实）', () => {
  const car = mkCar({ initialOdometer: 45000, createdAt: NOW });
  const it = mkItem({ carId: car.id, name: '轮胎换位', cycle: { kmInterval: 10000 }, lastOdometer: 45000 });
  const p = core.itemProjection(it, car, [], [], NOW, null);
  assert.equal(p.kmLeft, 10000);
  assert.equal(p.daysLeftByKm, null);
  assert.equal(p.state, 'ok');
});
t('itemProjection：时间轴 + 双周期取更紧者', () => {
  const car = mkCar({ initialOdometer: 45000 });
  // 时间轴：上次 2026-04-01 每 6 个月 → due 2026-10-01（-28 天）→ overdue
  const itTime = mkItem({ carId: car.id, name: '防冻液', cycle: { monthInterval: 6 }, lastDate: '2026-04-01' });
  const p1 = core.itemProjection(itTime, car, [], [], NOW, null);
  assert.equal(p1.dueDate, '2026-10-01');
  assert.equal(p1.state, 'overdue');
  // 双周期：km 轴还有 3000km（ok），时间轴 3 天后（due）→ 取紧 = due，axis=time
  const e1 = mkEnergy(car, { date: '2026-10-01', odometer: 45500, amount: 40, cost: 300 });
  const e2 = mkEnergy(car, { date: '2026-10-28', odometer: 47000, amount: 40, cost: 300 });
  const itBoth = mkItem({ carId: car.id, name: '刹车油', cycle: { kmInterval: 5000, monthInterval: 12 }, lastOdometer: 47000, lastDate: '2025-11-10' });
  const p2 = core.itemProjection(itBoth, car, [e1, e2], [], NOW, null);
  assert.equal(p2.state, 'due');
  assert.equal(p2.axis, 'time', `axis=${p2.axis}, daysLeftByTime=${p2.daysLeftByTime}, daysLeftByKm=${p2.daysLeftByKm}`);
  assert.equal(p2.dueDate, '2026-11-10');
});
t('itemProjection：inactive 不投影（调用方过滤；此处验证函数不炸）', () => {
  const car = mkCar({ initialOdometer: 45000 });
  const it = mkItem({ carId: car.id, name: '旧项', cycle: { kmInterval: 5000 }, lastOdometer: 45000, active: false });
  const p = core.itemProjection(it, car, [], [], NOW, null);
  assert.ok(p);
});
t('describeItem 文案', () => {
  const it = mkItem({ carId: 'c1', name: '机油机滤', cycle: { kmInterval: 5000, monthInterval: 6 }, lastOdometer: 45000, lastDate: '2026-08-01' });
  const s = core.describeItem(it);
  assert.ok(s.includes('机油机滤') && s.includes('5000') && s.includes('6 个月') && s.includes('45000'));
});

// ── 证件红黄榜 ──────────────────────────────────────────────────────────────
t('docBands：expired/soon/ok 分层与排序；remindDays 覆盖全局', () => {
  const car = mkCar();
  const d1 = mkDoc({ carId: car.id, type: '年检', expiry: '2026-10-01' });           // 已过期
  const d2 = mkDoc({ carId: car.id, type: '交强险', expiry: '2026-11-10' });          // 12 天 → soon
  const d3 = mkDoc({ carId: car.id, type: '商业险', expiry: '2027-05-01' });          // ok
  const d4 = mkDoc({ type: '驾驶证', expiry: '2026-11-02', remindDays: 7 });          // 个人证件；4 天但 remind 7 → soon
  const rows = core.docBands([d3, d1, d2, d4], [car], NOW, null);
  assert.deepEqual(rows.map((r) => r.band), ['expired', 'soon', 'soon', 'ok']);
  assert.equal(rows[0].carName, car.name);
  assert.equal(rows[1].carName, '个人', 'carId 空 = 个人证件（soon 内按 expiry 排：驾驶证 11-02 在交强险 11-10 前）');
});

// ── 费用透视 ────────────────────────────────────────────────────────────────
t('costBreakdown：月度分桶 / 分类小计 / 元每公里', () => {
  const car = mkCar({ initialOdometer: 45000 });
  const e1 = mkEnergy(car, { date: '2026-10-05', odometer: 45500, amount: 40, cost: 320 });
  const e2 = mkEnergy(car, { date: '2026-10-25', odometer: 46500, amount: 40, cost: 320 });
  const s1 = mkSvc({ carId: car.id, date: '2026-10-15', type: 'maintenance', cost: 500, odometer: 46000 });
  const s2 = mkSvc({ carId: car.id, date: '2026-08-15', type: 'insurance', cost: 3000 });
  const out = core.costBreakdown([e1, e2], [s1, s2], car, TODAY, 90);
  assert.equal(out.energyCost, 640);
  assert.equal(out.serviceCost, 3500);
  assert.equal(out.total, 4140);
  assert.ok(Math.abs(out.costPerKm - 4140 / 1000) < 0.01, `costPerKm=${out.costPerKm}`);
  assert.equal(out.perMonth.length, 2, '8 月与 10 月两桶');
  assert.equal(out.perMonth[0].month, '2026-10');
  assert.equal(out.perMonth[0].insurance, 0, '8 月保险不进 10 月桶');
});

// ── 快照 ────────────────────────────────────────────────────────────────────
t('carSnapshot：字段齐全、养护项按紧急度排序、证件榜只留非 ok', () => {
  const car = mkCar({ initialOdometer: 45000, createdAt: NOW - 100 * core.DAY_MS });
  const e1 = mkEnergy(car, { date: '2026-10-01', odometer: 45500, amount: 40, cost: 300 });
  const e2 = mkEnergy(car, { date: '2026-10-28', odometer: 47000, amount: 40, cost: 300 });
  const itOk = mkItem({ carId: car.id, name: '轮胎换位', cycle: { kmInterval: 10000 }, lastOdometer: 45000 });
  const itDue = mkItem({ carId: car.id, name: '空调滤芯', cycle: { kmInterval: 500 }, lastOdometer: 46800 });
  const doc = mkDoc({ carId: car.id, type: '年检', expiry: '2026-11-15' });
  const snap = core.carSnapshot(car, [e1, e2], [itOk, itDue], [], [doc], NOW, null);
  assert.equal(snap.odometer, 47000);
  assert.equal(snap.unit, 'L');
  assert.equal(snap.items[0].name, '空调滤芯', 'due 在 ok 前');
  assert.equal(snap.docsDue.length, 1);
  assert.ok(snap.consumption && snap.consumption.per100 > 0, '窗口内有两条补能应出数');
});
t('familySnapshot：多车聚合 + 个人证件段', () => {
  const c1 = mkCar();
  const c2 = mkCar({ name: '电驴', kind: 'ev', initialOdometer: 1000 });
  const dPer = mkDoc({ type: '驾驶证', expiry: '2026-11-02' });
  const fam = core.familySnapshot([c1, c2], [], [], [], [dPer], NOW, null);
  assert.equal(fam.cars.length, 2);
  assert.equal(fam.personalDocs.length, 1);
  assert.equal(fam.personalDocs[0].type, '驾驶证');
});

// ── 导出 ────────────────────────────────────────────────────────────────────
t('exportAll：剥离 rev、带免责声明与 kind 标记', () => {
  const car = mkCar();
  const s = JSON.parse(core.exportAll({ cars: [car], energies: [], items: [], svcs: [], docs: [], settings: null }));
  assert.equal(s.kind, 'polaris-chexia');
  assert.ok(s.disclaimer.includes('非维修'));
  assert.equal(s.cars[0].rev, undefined);
  assert.ok(s.exportedAt);
});

// ── 汇总 ────────────────────────────────────────────────────────────────────
console.log(`\n${pass}/${pass + fail} passed`);
if (fail) {
  for (const f of failures) console.error(`FAIL: ${f.name}\n  ${f.e.stack || f.e.message}`);
  process.exit(1);
}
