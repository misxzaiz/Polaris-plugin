/**
 * 故人 core 逻辑测试（node --test test/run-tests.mjs）
 * 覆盖：日期输入与生日推算（含 02-29 回退）、人物/往来/承诺归一化、
 *       追加幂等与 FIFO 裁剪、闭环裁剪、模糊找人、失联分级、
 *       承诺分期与看板、联系趋势、人情天平、见面简报、设置钳制。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../shared/tether-core.js');

const DAY = core.DAY_MS;
// 固定「今天」= 2026-10-28 15:00 本地
const NOW = new Date(2026, 9, 28, 15, 0).getTime();
const mkPerson = (over = {}) => ({
  id: over.id || 'p1', name: over.name || '张三', createdAt: NOW - 10 * DAY, updatedAt: NOW,
  ...over,
});

// ── 日期 ───────────────────────────────────────────────────────────────────
test('resolveDateInput：today/yesterday/昨天/日期串与非法值', () => {
  assert.equal(core.resolveDateInput('today', NOW), NOW);
  assert.equal(core.resolveDateInput('今天', NOW), NOW);
  assert.equal(core.resolveDateInput('yesterday', NOW), NOW - DAY);
  assert.equal(core.resolveDateInput('昨天', NOW), NOW - DAY);
  assert.equal(core.resolveDateInput(null, NOW), NOW, '缺省=今天');
  const d = core.resolveDateInput('2026-10-01', NOW);
  const got = new Date(d);
  assert.equal(`${got.getFullYear()}-${got.getMonth() + 1}-${got.getDate()}`, '2026-10-1');
  assert.equal(core.resolveDateInput('2026-02-30', NOW), null, '不存在日期拒绝');
  assert.equal(core.resolveDateInput('10月1日', NOW), null);
  assert.equal(core.resolveDateInput('2026-13-01', NOW), null);
});

test('parseBirthday：MM-DD / YYYY-MM-DD / 02-29 / 非法', () => {
  assert.deepEqual(core.parseBirthday('06-15'), { month: 6, day: 15, year: null });
  assert.deepEqual(core.parseBirthday('1990-06-15'), { month: 6, day: 15, year: 1990 });
  assert.deepEqual(core.parseBirthday('02-29'), { month: 2, day: 29, year: null }, '闰日本身合法');
  assert.equal(core.parseBirthday('02-30'), null);
  assert.equal(core.parseBirthday('13-01'), null);
  assert.equal(core.parseBirthday('1990-6-15'), null, '须零填充');
  assert.equal(core.parseBirthday(''), null);
  assert.equal(core.parseBirthday('1899-01-01'), null, '年份范围 1900..2100');
});

test('nextBirthday：今天=0 / 今年已过取明年 / 02-29 平年回退 03-01 / 年龄', () => {
  const nb = core.nextBirthday('10-28', NOW);
  assert.equal(nb.daysUntil, 0, '今天生日');
  assert.ok(nb.date.endsWith('10-28'));
  const past = core.nextBirthday('10-01', NOW);
  assert.equal(past.daysUntil, 338, '10-01 已过 → 2027-10-01（10-28 到次年 10-01 共 338 天）');
  const future = core.nextBirthday('11-05', NOW);
  assert.equal(future.daysUntil, 8);
  const leap = core.nextBirthday('02-29', NOW); // 2027 非闰年
  assert.ok(leap.date.endsWith('03-01'), `平年 02-29 → 03-01，实际 ${leap.date}`);
  const withAge = core.nextBirthday('1990-11-05', NOW);
  assert.equal(withAge.turningAge, 36);
  assert.equal(core.nextBirthday('13-40', NOW), null);
});

// ── 归一化 ─────────────────────────────────────────────────────────────────
test('normalizeSettings：钳制与非法回默认', () => {
  const ok = core.normalizeSettings({ defaultCadenceDays: 7, driftGraceDays: 90, birthdayDays: 1, dueWarnDays: 30 });
  assert.deepEqual(ok.settings, { v: 1, defaultCadenceDays: 7, driftGraceDays: 90, birthdayDays: 1, dueWarnDays: 30 });
  const clamped = core.normalizeSettings({ defaultCadenceDays: 1, driftGraceDays: 999, birthdayDays: 'x', dueWarnDays: 0 }).settings;
  assert.equal(clamped.defaultCadenceDays, 7, '低于下限钳回');
  assert.equal(clamped.driftGraceDays, 90);
  assert.equal(clamped.birthdayDays, 14, '非法回默认');
  assert.equal(clamped.dueWarnDays, 1);
  assert.equal(core.normalizeSettings('x').error.includes('对象'), true);
});

test('normalizePerson：必填/收编/钳制/生日校验', () => {
  const r = core.normalizePerson({ name: '  老王  ', alias: '王总', relation: '客户', tags: ['重要', ' x '.trim(), '', ...Array(10).fill('y')], birthday: '03-15', cadenceDays: 3, contacts: { wechat: ' wy', phone: '' } });
  const p = r.person;
  assert.equal(p.name, '老王');
  assert.equal(p.relation, '客户');
  assert.ok(p.tags.length <= 8, '标签上限 8');
  assert.equal(p.tags[0], '重要');
  assert.equal(p.cadenceDays, 7, '节奏钳到下限 7');
  assert.deepEqual(p.contacts, { wechat: 'wy' }, '空渠道丢弃、去首尾空白');
  assert.equal(core.normalizePerson({ name: '' }).error.includes('名字'), true);
  assert.equal(core.normalizePerson({ name: '李四', birthday: '2月15' }).error.includes('生日'), true);
  assert.equal(core.normalizePerson({ name: '李四', birthday: '02-30' }).error.includes('生日'), true);
  const none = core.normalizePerson({ name: '李四' }).person;
  assert.equal(none.relation, '其他', '关系缺省其他');
  assert.equal(none.cadenceDays, null, '节奏缺省 null（用全局）');
  assert.ok(none.id.startsWith('t'));
});

test('normalizeEvent：contact 收编 channel / favor 必带 direction / note 不带', () => {
  const c = core.normalizeEvent({ personId: 'p1', text: '聊了续约' }).event;
  assert.equal(c.type, 'contact');
  assert.equal(c.channel, '其他', 'channel 缺省其他');
  const c2 = core.normalizeEvent({ personId: 'p1', text: '见面', channel: '吃饭', type: 'contact' }).event;
  assert.equal(c2.channel, '其他', '非法 channel 收编');
  const f = core.normalizeEvent({ personId: 'p1', text: '帮他改简历', type: 'favor', direction: 'gave' }).event;
  assert.equal(f.direction, 'gave');
  assert.equal(core.normalizeEvent({ personId: 'p1', text: 'x', type: 'favor' }).error.includes('direction'), true);
  const n = core.normalizeEvent({ personId: 'p1', text: '喜好：不吃香菜', type: 'note' }).event;
  assert.equal(n.channel, undefined);
  assert.equal(core.normalizeEvent({ personId: '', text: 'x' }).error.includes('personId'), true);
  assert.equal(core.normalizeEvent({ personId: 'p1', text: '  ' }).error.includes('内容'), true);
});

test('normalizePromise：方向必填 / due 校验 / 闭环字段', () => {
  const ok = core.normalizePromise({ personId: 'p1', direction: 'iowe', text: '周五前给方案', due: '2026-10-30' }).promise;
  assert.equal(ok.due, '2026-10-30');
  assert.equal(ok.status, 'open');
  assert.equal(core.normalizePromise({ personId: 'p1', text: 'x', direction: 'wrong' }).error.includes('direction'), true);
  assert.equal(core.normalizePromise({ personId: 'p1', direction: 'iowe', text: 'x', due: '周五' }).error.includes('YYYY-MM-DD'), true);
  const done = core.normalizePromise({ personId: 'p1', direction: 'owedme', text: '等报价', status: 'done' }).promise;
  assert.ok(done.closedAt, '闭环自动补 closedAt');
});

// ── 集合 ───────────────────────────────────────────────────────────────────
test('appendEvents：幂等去重 + 排序 + FIFO 保最新', () => {
  const a = { id: 'e1', at: 300, personId: 'p1', type: 'note', text: 'c' };
  const b = { id: 'e2', at: 100, personId: 'p1', type: 'contact', channel: '微信', text: 'a' };
  const merged = core.appendEvents([], [a, b]);
  assert.deepEqual(merged.map((e) => e.id), ['e2', 'e1'], '按 at 升序');
  const again = core.appendEvents(merged, [{ ...a, text: '改' }]);
  assert.equal(again.length, 2, '同 id 不重复');
  assert.equal(again.find((e) => e.id === 'e1').text, '改', '后写覆盖');
  const many = Array.from({ length: core.MAX_EVENTS + 50 }, (_, i) => ({ id: 'k' + i, at: i, personId: 'p1', type: 'note', text: 'x' }));
  const capped = core.appendEvents([], many);
  assert.equal(capped.length, core.MAX_EVENTS);
  assert.equal(capped[0].id, 'k50', '裁掉最旧');
  assert.equal(capped.at(-1).id, 'k' + (core.MAX_EVENTS + 49));
});

test('trimClosedPromises：只裁闭环，open 保留', () => {
  const byId = {};
  byId['open1'] = { id: 'open1', personId: 'p1', direction: 'iowe', text: 'x', createdAt: 1, status: 'open' };
  for (let i = 0; i < core.MAX_CLOSED_PROMISES + 10; i++) {
    byId['c' + i] = { id: 'c' + i, personId: 'p1', direction: 'iowe', text: 'x', createdAt: 1, status: 'done', closedAt: i };
  }
  const next = core.trimClosedPromises(byId);
  assert.ok(next['open1'], 'open 不裁');
  assert.equal(Object.keys(next).length, core.MAX_CLOSED_PROMISES + 1);
  assert.ok(!next['c0'] && next['c10'], '裁掉 closedAt 最旧');
});

test('findPerson：精确名 / 别名 / 唯一包含 / 多命中 / 短词', () => {
  const people = {
    p1: mkPerson({ id: 'p1', name: '张三', alias: '老张' }),
    p2: mkPerson({ id: 'p2', name: '张伟' }),
    p3: mkPerson({ id: 'p3', name: '李四', alias: '老张头' }),
  };
  assert.equal(core.findPerson('张三', people).person.id, 'p1');
  assert.equal(core.findPerson('老张', people).person.id, 'p1', '精确别名');
  assert.equal(core.findPerson(' 张三 ', people).person.id, 'p1', '容忍空白');
  const amb = core.findPerson('张三', { a: mkPerson({ id: 'a', name: '张三丰' }), b: mkPerson({ id: 'b', name: '张三立' }) });
  assert.equal(amb.ambiguous.length, 2, '无精确命中、两个子串命中 → 要求澄清');
  assert.equal(core.findPerson('张头', { p1: people.p1, p3: people.p3 }).person.id, 'p3', '唯一子串命中别名');
  assert.equal(core.findPerson('张', people), null, '单字符不做包含');
  assert.equal(core.findPerson('张', { only: mkPerson({ id: 'only', name: '张' }) }).person.id, 'only', '单字符仍可精确等值命中');
  assert.equal(core.findPerson('王五', people), null);
  assert.equal(core.findPerson('李', people), null, '单字符即使唯一前缀也不做包含');
});

test('driftList：ok/warn/lost 边界 + 无往来回退建档 + 归档剔除', () => {
  const settings = core.DEFAULT_SETTINGS; // cadence 30 / grace 14
  const people = {
    ok: mkPerson({ id: 'ok', name: '刚联系', createdAt: NOW - 40 * DAY }),
    warn: mkPerson({ id: 'warn', name: '超节奏', createdAt: NOW - 100 * DAY }),
    lost: mkPerson({ id: 'lost', name: '超宽限', createdAt: NOW - 200 * DAY }),
    arch: mkPerson({ id: 'arch', name: '归档人', createdAt: NOW - 200 * DAY, archivedAt: NOW }),
    edge1: mkPerson({ id: 'edge1', name: '边界30', createdAt: NOW - 30 * DAY }),
    edge2: mkPerson({ id: 'edge2', name: '边界44', createdAt: NOW - 44 * DAY }),
  };
  const events = [
    { id: 'e1', at: NOW - 10 * DAY, personId: 'ok', type: 'contact', channel: '微信', text: 'x' },
    { id: 'e2', at: NOW - 35 * DAY, personId: 'warn', type: 'contact', channel: '电话', text: 'x' },
    { id: 'e3', at: NOW - 50 * DAY, personId: 'lost', type: 'contact', channel: '见面', text: 'x' },
    { id: 'e4', at: NOW - 5 * DAY, personId: 'lost', type: 'note', text: '非联系不算' },
  ];
  const list = core.driftList(people, events, settings, NOW);
  const byId = new Map(list.map((d) => [d.personId, d]));
  assert.equal(byId.get('ok').level, 'ok');
  assert.equal(byId.get('ok').daysSince, 10);
  assert.equal(byId.get('warn').level, 'warn');
  assert.equal(byId.get('warn').overdue, 5);
  assert.equal(byId.get('lost').level, 'lost');
  assert.equal(byId.get('lost').daysSince, 50, 'note 不算联系');
  assert.ok(!byId.has('arch'), '归档剔除');
  assert.equal(byId.get('edge1').level, 'ok', 'overdue=0 → ok');
  assert.equal(byId.get('edge2').level, 'warn', 'overdue=14 → warn（≤grace）');
  assert.equal(byId.get('edge2').neverContacted, true, '无往来标 neverContacted');
  assert.ok(byId.get('edge2').text.includes('从未'));
  const lostFirst = list.filter((d) => d.level !== 'ok')[0];
  assert.equal(lostFirst.level, 'lost', '红榜在前');
});

test('personPack / promiseBoard：分组与简报内容', () => {
  const settings = core.DEFAULT_SETTINGS;
  const people = { p1: mkPerson({ name: '王总', relation: '客户', tags: ['重要'], howMet: '展会', cadenceDays: 30 }) };
  const events = [
    { id: 'e1', at: NOW - 40 * DAY, personId: 'p1', type: 'contact', channel: '见面', text: '聊了续约' },
    { id: 'e2', at: NOW - 3 * DAY, personId: 'p1', type: 'favor', direction: 'gave', text: '帮他对接资源' },
  ];
  const promises = {
    a: { id: 'a', personId: 'p1', direction: 'iowe', text: '周五前给方案', due: '2026-10-25', createdAt: NOW - 10 * DAY, status: 'open' },
    b: { id: 'b', personId: 'p1', direction: 'owedme', text: '等他发报价', createdAt: NOW - 20 * DAY, status: 'open' },
    c: { id: 'c', personId: 'p1', direction: 'owedme', text: '旧诺', createdAt: NOW - 60 * DAY, status: 'done', closedAt: NOW - 30 * DAY },
    d: { id: 'd', personId: 'ghost', direction: 'iowe', text: '人已删', createdAt: NOW, status: 'open' },
  };
  const board = core.promiseBoard(promises, people, NOW, settings);
  assert.equal(board.overdue.length, 1);
  assert.equal(board.overdue[0].dueState.label, '逾期 3 天');
  assert.equal(board.openNoDue.length, 2);
  assert.equal(board.openNoDue[0].personName, '王总');
  assert.equal(board.openNoDue.find((x) => x.id === 'd').personName, '（已删除）');
  assert.equal(board.closed.length, 1);

  const pack = core.personPack(people.p1, events, promises, NOW, settings);
  assert.ok(pack.includes('【王总】（客户）'), pack);
  assert.ok(pack.includes('标签：重要'));
  assert.ok(pack.includes('怎么认识：展会'));
  assert.ok(pack.includes('10-28') === false);
  assert.ok(pack.includes('帮他对接资源'), '人情入简报');
  assert.ok(pack.includes('[我许的] 周五前给方案（逾期 3 天）'), pack);
  assert.ok(pack.includes('人情天平：帮了他 1 次'));
  assert.ok(pack.includes('天未联系（节奏 30 天）'), '40-3 天前最近联系=40 天前');
});

test('dueState：今天到期 / 临期窗口 / 无期限', () => {
  const s = { dueWarnDays: 3 };
  assert.equal(core.dueState(undefined, NOW, 3).kind, 'none');
  assert.equal(core.dueState('2026-10-28', NOW, 3).label, '今天到期');
  assert.equal(core.dueState('2026-10-31', NOW, 3).kind, 'dueSoon', '3 天=窗口内');
  assert.equal(core.dueState('2026-11-01', NOW, 3).kind, 'scheduled', '4 天出窗口');
  assert.equal(core.dueState('2026-10-20', NOW, 3).label, '逾期 8 天');
});

test('contactTrend / favorBalance：月度窗口与天平', () => {
  const events = [];
  for (let i = 0; i < 3; i++) events.push({ id: 'a' + i, at: new Date(2026, 9, 2 + i, 12).getTime(), personId: 'p1', type: 'contact', channel: '微信', text: 'x' });
  events.push({ id: 'b', at: new Date(2026, 8, 15, 12).getTime(), personId: 'p1', type: 'contact', channel: '见面', text: 'x' });
  events.push({ id: 'c', at: new Date(2025, 9, 15, 12).getTime(), personId: 'p1', type: 'contact', channel: '见面', text: '出窗' });
  events.push({ id: 'd', at: NOW, personId: 'p2', type: 'favor', direction: 'got', text: 'y' });
  const trend = core.contactTrend(events, 12, NOW);
  assert.equal(trend.length, 12);
  assert.equal(trend.at(-1).month, '2026-10');
  assert.equal(trend.at(-1).count, 3);
  assert.equal(trend.at(-2).month, '2026-09');
  assert.equal(trend.at(-2).count, 1);
  assert.equal(trend[0].month, '2025-11', '12 个月窗口起点');
  assert.equal(trend[0].count, 0, '去年出窗');
  const bal = core.favorBalance(events);
  assert.deepEqual(bal.p2, { gave: 0, got: 1 });
  assert.equal(bal.p1, undefined);
});

test('birthdayUpcoming：窗口过滤与排序', () => {
  const people = {
    p1: mkPerson({ id: 'p1', name: '甲', birthday: '11-05' }),
    p2: mkPerson({ id: 'p2', name: '乙', birthday: '12-25' }),
    p3: mkPerson({ id: 'p3', name: '丙', birthday: '10-28' }),
    p4: mkPerson({ id: 'p4', name: '丁', birthday: 'x' }),
    p5: mkPerson({ id: 'p5', name: '戊', birthday: '01-05', archivedAt: NOW }),
  };
  const list = core.birthdayUpcoming(people, 14, NOW);
  assert.deepEqual(list.map((b) => b.personId), ['p3', 'p1'], '今天在前，乙 12-25 出窗，非法/归档剔除');
  assert.equal(list[0].daysUntil, 0);
});

test('exportAll：结构完整', () => {
  const dump = core.exportAll(core.DEFAULT_SETTINGS, { order: ['p1'], byId: { p1: mkPerson() } }, { byId: {} }, { events: [] });
  assert.equal(dump.app, 'tether');
  assert.ok(dump.exportedAt);
  assert.ok(dump.people.p1);
  assert.deepEqual(dump.journal, []);
});
