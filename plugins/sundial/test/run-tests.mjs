#!/usr/bin/env node
'use strict';
/**
 * 日晷离线单测：node test/run-tests.mjs（零依赖零 mock，纯函数行为级）
 * 坑在这里暴露最便宜：rrule 展开（COUNT/UNTIL/月末/2.29）、ICS 时区换算、
 * 提醒投影抑制、streak 宽限、SSRF 守卫、规范化边界。
 * 日期助手 U/L 一律 1 起月份（2026-10-28 = U(2026,10,28)），与 JS Date 的 0 起月隔离。
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../shared/core.js');

const results = [];
function t(name, fn) {
  try { fn(); results.push({ name, pass: true }); }
  catch (e) { results.push({ name, pass: false, detail: e.message }); }
}
function eq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${label || ''} 期望 ${b} 实得 ${a}`);
}
function ok(cond, label) { if (!cond) throw new Error(label || '断言失败'); }

const DAY = core.DAY_MS;
const U = (y, m, d, hh, mm, ss) => Date.UTC(y, m - 1, d, hh || 0, mm || 0, ss || 0);
const L = (y, m, d, hh, mm) => new Date(y, m - 1, d, hh || 0, mm || 0).getTime();

// ── parseWhen ────────────────────────────────────────────────────────────────
t('parseWhen: 纯日期 → 全天 UTC 零点', () => {
  const r = core.parseWhen('2026-10-28');
  eq(r.allDay, true);
  eq(r.ts, U(2026, 10, 28));
});
t('parseWhen: 拒绝 2 月 30 日', () => { eq(core.parseWhen('2026-02-30'), null); });
t('parseWhen: 日期时间（本机时区）', () => {
  const r = core.parseWhen('2026-10-28 15:00');
  eq(r.allDay, false);
  eq(r.ts, L(2026, 10, 28, 15, 0));
});
t('parseWhen: ISO Z', () => {
  const r = core.parseWhen('2026-10-28T15:00:00Z');
  eq(r.ts, U(2026, 10, 28, 15, 0));
});
t('parseWhen: ISO 带偏移 +08:00', () => {
  const r = core.parseWhen('2026-10-28T15:00:00+08:00');
  eq(r.ts, U(2026, 10, 28, 7, 0));
});
t('parseWhen: epoch ms', () => {
  const r = core.parseWhen(1790000000000);
  eq(r.ts, 1790000000000);
});
t('parseWhen: 垃圾输入 → null', () => {
  eq(core.parseWhen('明天下午'), null);
  eq(core.parseWhen(''), null);
  eq(core.parseWhen('2026-13-01'), null);
});

// ── friendlyRrule ────────────────────────────────────────────────────────────
t('friendlyRrule: 空与不重复', () => {
  eq(core.friendlyRrule('').rrule, '');
  eq(core.friendlyRrule('不重复').rrule, '');
});
t('friendlyRrule: daily/每天/weekdays/工作日', () => {
  eq(core.friendlyRrule('daily').rrule, 'FREQ=DAILY');
  eq(core.friendlyRrule('每天').rrule, 'FREQ=DAILY');
  eq(core.friendlyRrule('每日').rrule, 'FREQ=DAILY');
  eq(core.friendlyRrule('weekdays').rrule, 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR');
  eq(core.friendlyRrule('工作日').rrule, 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR');
});
t('friendlyRrule: weekly:MO,WE 与 每周一、周三 等价', () => {
  eq(core.friendlyRrule('weekly:MO,WE').rrule, 'FREQ=WEEKLY;BYDAY=MO,WE');
  eq(core.friendlyRrule('每周一、周三').rrule, 'FREQ=WEEKLY;BYDAY=MO,WE');
  eq(core.friendlyRrule('每周日').rrule, 'FREQ=WEEKLY;BYDAY=SU');
  eq(core.friendlyRrule('每周').rrule, 'FREQ=WEEKLY');
});
t('friendlyRrule: monthly:15 / 每月15号 / 月末 -1', () => {
  eq(core.friendlyRrule('monthly:15').rrule, 'FREQ=MONTHLY;BYMONTHDAY=15');
  eq(core.friendlyRrule('每月15号').rrule, 'FREQ=MONTHLY;BYMONTHDAY=15');
  eq(core.friendlyRrule('monthly:-1').rrule, 'FREQ=MONTHLY;BYMONTHDAY=-1');
});
t('friendlyRrule: yearly / 每年', () => {
  eq(core.friendlyRrule('yearly').rrule, 'FREQ=YEARLY');
  eq(core.friendlyRrule('每年').rrule, 'FREQ=YEARLY');
});
t('friendlyRrule: COUNT/UNTIL 尾巴透传并 canonical 化', () => {
  eq(core.friendlyRrule('daily;COUNT=3').rrule, 'FREQ=DAILY;COUNT=3');
  eq(core.friendlyRrule('FREQ=DAILY;INTERVAL=2;COUNT=5').rrule, 'FREQ=DAILY;INTERVAL=2;COUNT=5');
  eq(core.friendlyRrule('FREQ=YEARLY;UNTIL=20301231').rrule, 'FREQ=YEARLY;UNTIL=20301231');
});
t('friendlyRrule: 不支持的频率/参数报错', () => {
  ok(core.friendlyRrule('FREQ=HOURLY').error, 'HOURLY 应报错');
  ok(core.friendlyRrule('FREQ=DAILY;BYSETPOS=1').error, 'BYSETPOS 应报错');
});

// ── expandOccurrences（全天：UTC 网格，机器无关）─────────────────────────────
t('展开: 无重复单次 + 窗口外为空', () => {
  const ev = { start: U(2026, 10, 28), allDay: true, durationMin: 1440, rrule: '' };
  eq(core.expandOccurrences(ev, U(2026, 10, 1), U(2026, 10, 30, 23)), [{ start: U(2026, 10, 28), key: 'd20261028' }]);
  eq(core.expandOccurrences(ev, U(2026, 11, 1), U(2026, 11, 30)), []);
});
t('展开: DAILY 全天区间命中（窗口起点与昨日发生结尾重合也算重叠）', () => {
  const ev = { start: U(2026, 10, 1), allDay: true, durationMin: 1440, rrule: 'FREQ=DAILY' };
  const occs = core.expandOccurrences(ev, U(2026, 10, 3), U(2026, 10, 5, 12));
  eq(occs.map((o) => o.key), ['d20261002', 'd20261003', 'd20261004', 'd20261005']);
});
t('展开: INTERVAL=2 隔天', () => {
  const ev = { start: U(2026, 10, 1), allDay: true, durationMin: 1440, rrule: 'FREQ=DAILY;INTERVAL=2' };
  const occs = core.expandOccurrences(ev, U(2026, 10, 1), U(2026, 10, 8));
  eq(occs.map((o) => o.key), ['d20261001', 'd20261003', 'd20261005', 'd20261007']);
});
t('展开: WEEKLY BYDAY=MO,WE 含 dtstart、窗口外不含', () => {
  // 2026-10-07 是周三
  const ev = { start: U(2026, 10, 7), allDay: true, durationMin: 1440, rrule: 'FREQ=WEEKLY;BYDAY=MO,WE' };
  const occs = core.expandOccurrences(ev, U(2026, 10, 1), U(2026, 10, 19, 23));
  eq(occs.map((o) => o.key), ['d20261007', 'd20261012', 'd20261014', 'd20261019']);
});
t('展开: MONTHLY;BYMONTHDAY=15', () => {
  const ev = { start: U(2026, 1, 15), allDay: true, durationMin: 1440, rrule: 'FREQ=MONTHLY;BYMONTHDAY=15' };
  const occs = core.expandOccurrences(ev, U(2026, 1, 1), U(2026, 3, 31));
  eq(occs.map((o) => o.key), ['d20260115', 'd20260215', 'd20260315']);
});
t('展开: MONTHLY;BYMONTHDAY=-1 月末（含 2 月 28 天）', () => {
  const ev = { start: U(2026, 1, 31), allDay: true, durationMin: 1440, rrule: 'FREQ=MONTHLY;BYMONTHDAY=-1' };
  const occs = core.expandOccurrences(ev, U(2026, 1, 1), U(2026, 3, 31));
  eq(occs.map((o) => o.key), ['d20260131', 'd20260228', 'd20260331']);
});
t('展开: YEARLY 2/29 平年跳过', () => {
  const ev = { start: U(2024, 2, 29), allDay: true, durationMin: 1440, rrule: 'FREQ=YEARLY' };
  const occs = core.expandOccurrences(ev, U(2024, 1, 1), U(2029, 12, 31));
  eq(occs.map((o) => o.key), ['d20240229', 'd20280229']);
});
t('展开: COUNT 从 dtstart 计数（窗口中途开始也守约）', () => {
  const ev = { start: U(2026, 10, 1), allDay: true, durationMin: 1440, rrule: 'FREQ=DAILY;COUNT=3' };
  eq(core.expandOccurrences(ev, U(2026, 10, 1), U(2026, 10, 9)).map((o) => o.key), ['d20261001', 'd20261002', 'd20261003']);
  eq(core.expandOccurrences(ev, U(2026, 10, 2, 12), U(2026, 10, 9)).map((o) => o.key), ['d20261002', 'd20261003']);
});
t('展开: UNTIL 截断', () => {
  const ev = { start: U(2026, 10, 1), allDay: true, durationMin: 1440, rrule: 'FREQ=DAILY;UNTIL=20261004' };
  eq(core.expandOccurrences(ev, U(2026, 10, 1), U(2026, 10, 30)).length, 4);
});
t('展开: 500 上限保护', () => {
  const ev = { start: U(2026, 1, 1), allDay: true, durationMin: 1440, rrule: 'FREQ=DAILY' };
  eq(core.expandOccurrences(ev, U(2026, 1, 1), U(2028, 12, 31)).length, 500);
});
t('展开: 多日全天事件按自身时长重叠窗口', () => {
  const ev = { start: U(2026, 10, 1), allDay: true, durationMin: 3 * 1440, rrule: 'FREQ=DAILY' };
  // 每次 3 天：10/1 起的三次分别覆盖 1-3、2-4、3-5，均与 [10/3, 10/3 12:00] 重叠
  const occs = core.expandOccurrences(ev, U(2026, 10, 3), U(2026, 10, 3, 12));
  eq(occs.map((o) => o.key), ['d20261001', 'd20261002', 'd20261003']);
});
t('展开: 按时刻 DAILY（本机时区网格）', () => {
  const ev = { start: L(2026, 10, 1, 9, 0), allDay: false, durationMin: 30, rrule: 'FREQ=DAILY' };
  const occs = core.expandOccurrences(ev, L(2026, 10, 3, 0, 0), L(2026, 10, 4, 23, 0));
  eq(occs.map((o) => o.start), [L(2026, 10, 3, 9, 0), L(2026, 10, 4, 9, 0)]);
});
t('展开: 按时刻窗口按时长重叠（30 分钟事件在 09:00，窗从 09:20 起）', () => {
  const ev = { start: L(2026, 10, 1, 9, 0), allDay: false, durationMin: 30, rrule: '' };
  const occs = core.expandOccurrences(ev, L(2026, 10, 1, 9, 20), L(2026, 10, 1, 10, 0));
  eq(occs.length, 1);
});
t('展开: MONTHLY 第 2 个周二（BYDAY=2TU）', () => {
  const ev = { start: L(2026, 10, 13, 10, 0), allDay: false, durationMin: 60, rrule: 'FREQ=MONTHLY;BYDAY=2TU' };
  const occs = core.expandOccurrences(ev, L(2026, 10, 1, 0, 0), L(2026, 11, 30, 23, 0));
  eq(occs.map((o) => o.start), [L(2026, 10, 13, 10, 0), L(2026, 11, 10, 10, 0)]);
});

// ── 提醒投影 ────────────────────────────────────────────────────────────────
t('提醒: 到期窗口 [remindAt, 开始+30min)', () => {
  const ev = core.normalizeEvent({ title: '取快递', start: '2026-10-28 15:00', remind: [30] }).event;
  const now1 = L(2026, 10, 28, 14, 29);
  const now2 = L(2026, 10, 28, 14, 40);
  const now3 = L(2026, 10, 28, 15, 31);
  eq(core.computeReminders([ev], now1).length, 0);
  const due = core.computeReminders([ev], now2);
  eq(due.length, 1);
  eq(due[0].remindAt, L(2026, 10, 28, 14, 30));
  eq(core.computeReminders([ev], now3).length, 0);
});
t('提醒: rId 形如 eventId|occKey|offset', () => {
  const ev = core.normalizeEvent({ title: 'X', start: '2026-10-28 15:00', remind: [30] }).event;
  const due = core.computeReminders([ev], L(2026, 10, 28, 15, 0));
  eq(due[0].id, `${ev.id}|${String(L(2026, 10, 28, 15, 0))}|30`);
});
t('提醒: ack 抑制（ackAt > remindAt）', () => {
  const ev = core.normalizeEvent({ title: 'X', start: '2026-10-28 15:00', remind: [30] }).event;
  const now = L(2026, 10, 28, 14, 40);
  const r = core.computeReminders([ev], now)[0];
  ok(core.computeReminders([ev], now, { acked: { [r.id]: r.remindAt + 1000 } }).length === 0);
  ok(core.computeReminders([ev], now, { acked: { [r.id]: r.remindAt - 1000 } }).length === 1);
});
t('提醒: 发生 done/skip 抑制', () => {
  const ev = core.normalizeEvent({ title: 'X', start: '2026-10-28 15:00', remind: [30] }).event;
  const now = L(2026, 10, 28, 14, 40);
  ev.done[String(L(2026, 10, 28, 15, 0))] = 'done';
  eq(core.computeReminders([ev], now).length, 0);
});
t('提醒: 全天事件锚定本地 09:00', () => {
  const ev = core.normalizeEvent({ title: 'X', start: '2026-10-28', remind: [0] }).event;
  const due = core.computeReminders([ev], L(2026, 10, 28, 9, 10));
  eq(due.length, 1);
  eq(due[0].remindAt, L(2026, 10, 28, 9, 0));
  eq(core.computeReminders([ev], L(2026, 10, 28, 8, 50)).length, 0);
});
t('提醒: 每日习惯当天到期恰好一条', () => {
  const ev = core.normalizeEvent({ title: '背单词', start: '2026-10-01 21:00', rrule: 'daily', remind: [0], kind: 'habit' }).event;
  const due = core.computeReminders([ev], L(2026, 10, 15, 21, 5));
  eq(due.length, 1);
  eq(due[0].occKey, String(L(2026, 10, 15, 21, 0)));
});
t('提醒: disabled 事件不产生', () => {
  const ev = core.normalizeEvent({ title: 'X', start: '2026-10-28 15:00', remind: [30], enabled: false }).event;
  eq(core.computeReminders([ev], L(2026, 10, 28, 14, 40)).length, 0);
});
t('提醒: 多提醒按 remindAt 排序', () => {
  const ev = core.normalizeEvent({ title: 'X', start: '2026-10-28 15:00', remind: [30, 1440] }).event;
  const due = core.computeReminders([ev], L(2026, 10, 27, 15, 0));
  eq(due.length, 1);
  eq(due[0].offsetMin, 1440);
});

// ── streak / 倒计时 ──────────────────────────────────────────────────────────
t('streak: 昨日连击 + 今天未打卡宽限', () => {
  const ev = core.normalizeEvent({ title: '跑步', start: '2026-10-01 07:00', rrule: 'daily', kind: 'habit' }).event;
  const now = L(2026, 10, 10, 12, 0);
  for (let d = 1; d <= 9; d++) ev.done[String(L(2026, 10, d, 7, 0))] = 'done';
  eq(core.computeStreak(ev, now), 9);
});
t('streak: 今天打卡也计入', () => {
  const ev = core.normalizeEvent({ title: '跑步', start: '2026-10-01 07:00', rrule: 'daily', kind: 'habit' }).event;
  const now = L(2026, 10, 10, 12, 0);
  for (let d = 1; d <= 10; d++) ev.done[String(L(2026, 10, d, 7, 0))] = 'done';
  eq(core.computeStreak(ev, now), 10);
});
t('streak: 中间断档从后段起算', () => {
  const ev = core.normalizeEvent({ title: '跑步', start: '2026-10-01 07:00', rrule: 'daily', kind: 'habit' }).event;
  const now = L(2026, 10, 10, 12, 0);
  for (let d = 1; d <= 9; d++) if (d !== 5) ev.done[String(L(2026, 10, d, 7, 0))] = 'done';
  eq(core.computeStreak(ev, now), 4); // 10-06..10-09
});
t('countdown: 一次性未来事件', () => {
  const ev = core.normalizeEvent({ title: '发布会', start: '2026-12-25', kind: 'countdown' }).event;
  const now = L(2026, 10, 28, 12, 0);
  const c = core.countdownInfo(ev, now);
  eq(c.targetTs, U(2026, 12, 25));
  eq(c.days, Math.ceil((U(2026, 12, 25) - now) / DAY));
});
t('countdown: 每年纪念日给下一次', () => {
  const ev = core.normalizeEvent({ title: '结婚纪念日', start: '2000-05-20', rrule: 'yearly', kind: 'countdown' }).event;
  const c = core.countdownInfo(ev, L(2026, 10, 28, 12, 0));
  eq(c.targetTs, U(2027, 5, 20));
});
t('countdown: 过期一次性 → null', () => {
  const ev = core.normalizeEvent({ title: '已过去的事', start: '2020-01-01', kind: 'countdown' }).event;
  eq(core.countdownInfo(ev, L(2026, 10, 28, 12, 0)), null);
});

// ── normalizeEvent ───────────────────────────────────────────────────────────
t('normalize: 最小载荷默认值', () => {
  const r = core.normalizeEvent({ title: '开会', start: '2026-10-28 15:00' });
  ok(!r.error);
  eq(r.event.kind, 'event');
  eq(r.event.allDay, false);
  eq(r.event.durationMin, 0);
  eq(r.event.rrule, '');
  eq(r.event.source, 'manual');
  eq(r.event.rev, 1);
  ok(r.event.id.length >= 2);
});
t('normalize: 全天默认 1 天时长', () => {
  const r = core.normalizeEvent({ title: '旅行', start: '2026-10-28' });
  eq(r.event.allDay, true);
  eq(r.event.durationMin, 1440);
});
t('normalize: 裁剪与钳制（标题/tags 长度、remind 越界丢弃+去重）', () => {
  const r = core.normalizeEvent({
    title: '字'.repeat(500), start: '2026-10-28 09:00',
    tags: ['a'.repeat(40), 'b', 'c', 'd', 'e', 'f', 'g'],
    remind: [30, 30, -5, 100000, 1440],
  });
  eq(r.event.title.length, 200);
  eq(r.event.tags.length, 5);
  eq(r.event.tags[0].length, 24);
  eq(r.event.remind, [30, 1440]);
});
t('normalize: 校验错误（空标题/坏时间/坏规则）', () => {
  ok(core.normalizeEvent({ title: '  ', start: '2026-10-28' }).error, '空标题应报错');
  ok(core.normalizeEvent({ title: 'X', start: '不是时间' }).error, '坏时间应报错');
  ok(core.normalizeEvent({ title: 'X', start: '2026-10-28', rrule: 'FREQ=HOURLY' }).error, '坏规则应报错');
});
t('normalize: 编辑保留 start 语义并递增 rev', () => {
  const r1 = core.normalizeEvent({ title: 'A', start: '2026-10-28 15:00', remind: [30] });
  const r2 = core.normalizeEvent({ title: 'A2', remind: [10] }, r1.event);
  eq(r2.event.start, r1.event.start);
  eq(r2.event.allDay, false);
  eq(r2.event.remind, [10]);
  eq(r2.event.rev, 2);
  ok(r2.event.updatedAt >= r1.event.updatedAt);
});
t('normalize: done 非法值过滤', () => {
  const r = core.normalizeEvent({ title: 'X', start: '2026-10-28', done: { a: 'done', b: 'bogus', c: 'skip' } });
  eq(r.event.done, { a: 'done', c: 'skip' });
});

// ── ICS ──────────────────────────────────────────────────────────────────────
const ICS_SH = [
  'BEGIN:VCALENDAR',
  'BEGIN:VTIMEZONE',
  'TZID:Asia/Shanghai',
  'BEGIN:STANDARD',
  'DTSTART:19700101T000000',
  'TZOFFSETFROM:+0800',
  'TZOFFSETTO:+0800',
  'END:STANDARD',
  'END:VTIMEZONE',
  'BEGIN:VEVENT',
  'UID:evt-001@polaris',
  'DTSTAMP:20261027T000000Z',
  'DTSTART;TZID=Asia/Shanghai:20261028T093000',
  'DTEND;TZID=Asia/Shanghai:20261028T103000',
  'SUMMARY:周会',
  'LOCATION:3 楼会议室',
  'DESCRIPTION:第一行\\n第二行',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:evt-002@polaris',
  'DTSTAMP:20261027T000000Z',
  'DTSTART;VALUE=DATE:20261101',
  'DTEND;VALUE=DATE:20261103',
  'SUMMARY:出差',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:evt-003@polaris',
  'DTSTAMP:20261027T000000Z',
  'DTSTART:20261105T080000Z',
  'DURATION:PT45M',
  'RRULE:FREQ=DAILY;COUNT=3',
  'SUMMARY:晨读',
  'EXDATE:20261106T080000Z',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:evt-004@polaris',
  'DTSTAMP:20261027T000000Z',
  'DTSTART:20261107T140000Z',
  'SUMMARY:已取消',
  'STATUS:CANCELLED',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:evt-001@polaris',
  'DTSTAMP:20261027T000000Z',
  'RECURRENCE-ID;TZID=Asia/Shanghai:20261104T093000',
  'DTSTART;TZID=Asia/Shanghai:20261104T140000',
  'SUMMARY:周会（改期）',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

t('ICS: TZID（内嵌 VTIMEZONE）换算为正确时刻', () => {
  const r = core.icsToRawEvents(ICS_SH, '测试', Date.now());
  eq(r.count, 4); // 5 个 VEVENT，CANCELLED 不计
  const zhou = r.raws.find((x) => x.uid === 'evt-001@polaris' && !x.rid);
  eq(zhou.start, U(2026, 10, 28, 1, 30)); // 09:30 +08:00
  eq(zhou.durationMin, 60);
  eq(zhou.title, '周会');
  ok(zhou.notes.includes('📍 3 楼会议室'));
  ok(zhou.notes.includes('第二行'));
});
t('ICS: 全天 VALUE=DATE + 排他 DTEND → 按天时长', () => {
  const r = core.icsToRawEvents(ICS_SH, '测试', Date.now());
  const trip = r.raws.find((x) => x.uid === 'evt-002@polaris');
  eq(trip.allDay, true);
  eq(trip.start, U(2026, 11, 1));
  eq(trip.durationMin, 2880); // 11-01 与 11-02 两天
});
t('ICS: UTC Z + DURATION + RRULE + EXDATE', () => {
  const r = core.icsToRawEvents(ICS_SH, '测试', Date.now());
  const morn = r.raws.find((x) => x.uid === 'evt-003@polaris');
  eq(morn.start, U(2026, 11, 5, 8, 0));
  eq(morn.durationMin, 45);
  eq(morn.rrule, 'FREQ=DAILY;COUNT=3');
  eq(r.skipsByUid['evt-003@polaris'], [String(U(2026, 11, 6, 8, 0))]);
});
t('ICS: RECURRENCE-ID 例外实例单次入库并抑制主事件同刻', () => {
  const r = core.icsToRawEvents(ICS_SH, '测试', Date.now());
  const moved = r.raws.find((x) => x.title === '周会（改期）');
  ok(moved, '改期实例应存在');
  eq(moved.start, U(2026, 11, 4, 6, 0)); // 14:00 +08:00
  eq(moved.rrule, '');
  ok(moved.rid, '例外实例应带 rid');
  const skipSet = r.skipsByUid['evt-001@polaris'];
  ok(Array.isArray(skipSet) && skipSet.length >= 1, '应有 RECURRENCE-ID 抑制键');
});
t('planIcsSync: upsert 保留 done/remind，失踪 uid 删除，skip 合入', () => {
  const now = Date.now();
  const r1 = core.icsToRawEvents(ICS_SH, '测试', now);
  const plan1 = core.planIcsSync([], r1.raws, 'cTEST', r1.skipsByUid, now);
  eq(plan1.upserts.length, 4);
  eq(plan1.deletes.length, 0);
  // 例外实例与主事件同 UID：id 必须不同（uid|rid 区分）
  const main = plan1.upserts.find((e) => e.uid === 'evt-001@polaris' && !e.rid);
  const moved = plan1.upserts.find((e) => e.uid === 'evt-001@polaris' && e.rid);
  ok(main && moved && main.id !== moved.id, '同 UID 主/例外 id 应不同');
  main.remind = [30];
  main.done[String(U(2026, 10, 28, 1, 30))] = 'done';
  const plan2 = core.planIcsSync(plan1.upserts, r1.raws, 'cTEST', r1.skipsByUid, now + 1000);
  const main2 = plan2.upserts.find((e) => e.uid === 'evt-001@polaris' && !e.rid);
  eq(main2.id, main.id);
  eq(main2.remind, [30]);
  eq(main2.done[String(U(2026, 10, 28, 1, 30))], 'done');
  eq(main2.rev, 2);
  const morn2 = plan2.upserts.find((e) => e.uid === 'evt-003@polaris');
  eq(morn2.done[String(U(2026, 11, 6, 8, 0))], 'skip');
  // 第二轮源里删掉一个 uid → 出 now-deleted
  const fewer = r1.raws.filter((x) => x.uid !== 'evt-002@polaris');
  const plan3 = core.planIcsSync(plan1.upserts, fewer, 'cTEST', {}, now + 2000);
  ok(plan3.deletes.includes(plan1.upserts.find((e) => e.uid === 'evt-002@polaris').id));
});
t('zoneOffsetAt: 固定偏移表（Asia/Shanghai=480）与未知时区 null', () => {
  eq(core.zoneOffsetAt('Asia/Shanghai', Date.now(), new Map()), 480);
  eq(core.zoneOffsetAt('Mars/Olympus', Date.now(), new Map()), null);
});
t('zoneOffsetAt: VTIMEZONE 美国 NY 夏令时换算（夏 -240 / 冬 -300）', () => {
  const ics = [
    'BEGIN:VCALENDAR',
    'BEGIN:VTIMEZONE',
    'TZID:America/New_York',
    'BEGIN:DAYLIGHT',
    'DTSTART:20070311T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
    'TZOFFSETFROM:-0500',
    'TZOFFSETTO:-0400',
    'END:DAYLIGHT',
    'BEGIN:STANDARD',
    'DTSTART:20071104T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU',
    'TZOFFSETFROM:-0400',
    'TZOFFSETTO:-0500',
    'END:STANDARD',
    'END:VTIMEZONE',
    'END:VCALENDAR',
  ].join('\r\n');
  const { vtimezones } = core.parseIcs(ics);
  eq(core.zoneOffsetAt('America/New_York', U(2026, 7, 15, 12, 0), vtimezones), -240);
  eq(core.zoneOffsetAt('America/New_York', U(2026, 1, 15, 12, 0), vtimezones), -300);
  eq(core.zoneOffsetAt('America/New_York', U(2026, 12, 20, 12, 0), vtimezones), -300);
});
t('ICS: 无 VTIMEZONE 的 DST 时区回落固定偏移表（标准时，如实偏差）', () => {
  const ics = [
    'BEGIN:VCALENDAR', 'BEGIN:VEVENT',
    'UID:x@y', 'DTSTART;TZID=America/New_York:20260715T120000', 'SUMMARY:X',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  const r = core.icsToRawEvents(ics, 'n', Date.now());
  eq(r.raws[0].start, U(2026, 7, 15, 17, 0)); // 12:00 - (-300) = 17:00Z（实际夏令时应 16:00Z，README 已声明）
});
t('ICS: 不支持 RRULE 参数降级单次且 notes 标注', () => {
  const ics = [
    'BEGIN:VCALENDAR', 'BEGIN:VEVENT',
    'UID:r@y', 'DTSTART:20261101T100000Z',
    'RRULE:FREQ=DAILY;BYSETPOS=1;COUNT=5', 'SUMMARY:复杂规则',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  const r = core.icsToRawEvents(ics, 'n', Date.now());
  eq(r.raws[0].rrule, '');
  ok(r.raws[0].notes.includes('单次'), 'notes 应标注降级');
});

// ── 保留策略 / done 裁剪 / 设置 / 订阅规范化 ─────────────────────────────────
t('planRetention: 一次性过期删除、重复事件永留', () => {
  const now = Date.now();
  const old1 = core.normalizeEvent({ title: '旧事', start: now - 400 * DAY }).event;
  const recur = core.normalizeEvent({ title: '习惯', start: now - 400 * DAY, rrule: 'daily' }).event;
  const fresh = core.normalizeEvent({ title: '新事', start: now - DAY }).event;
  const del = core.planRetention([old1, recur, fresh], {}, now);
  ok(del.includes(old1.id) && !del.includes(recur.id) && !del.includes(fresh.id), JSON.stringify(del));
});
t('pruneDoneMap: 超限保留最新', () => {
  const done = {};
  for (let i = 0; i < 500; i++) done[String(1700000000000 + i)] = 'done';
  const pruned = core.pruneDoneMap(done, 400);
  eq(Object.keys(pruned).length, 400);
  ok(pruned[String(1700000000000 + 499)], '最新保留');
  ok(!pruned[String(1700000000000)], '最旧裁掉');
});
t('normalizeSettings: 越界回落与默认', () => {
  const s = core.normalizeSettings({ icsIntervalHours: 9999, retentionDays: -1 });
  eq(s.icsIntervalHours, 168);
  eq(s.retentionDays, 30);
  eq(s.reminderGraceMin, 30);
  eq(core.normalizeSettings(null).icsIntervalHours, 6);
});
t('normalizeIcs: webcal 归一 / 内网拒绝 / id 稳定', () => {
  const r = core.normalizeIcs({ url: 'webcal://example.com/cal.ics', name: '课表' });
  ok(!r.error, r.error || '');
  eq(r.ics.url, 'https://example.com/cal.ics');
  eq(r.ics.id, core.icsIdFor('https://example.com/cal.ics'));
  ok(core.normalizeIcs({ url: 'http://localhost:8080/x.ics' }).error, 'localhost 应拒绝');
  ok(core.normalizeIcs({ url: 'http://192.168.1.5/x.ics' }).error, '内网应拒绝');
});

// ── SSRF / 展示辅助 ──────────────────────────────────────────────────────────
t('isFetchableUrl: 公网放行、内网/环回/元数据拒绝', () => {
  ok(core.isFetchableUrl('https://calendar.google.com/calendar/ical/x/basic.ics'));
  ok(!core.isFetchableUrl('http://127.0.0.1/x'));
  ok(!core.isFetchableUrl('http://10.0.0.1/x'));
  ok(!core.isFetchableUrl('http://172.16.0.1/x'));
  ok(core.isFetchableUrl('http://172.32.0.1/x')); // 172.32 不在 16-31 私网段
  ok(!core.isFetchableUrl('http://169.254.169.254/latest/meta-data'));
  ok(!core.isFetchableUrl('file:///etc/passwd'));
  ok(!core.isFetchableUrl('http://foo.local/x'));
});
t('describeRrule: 中文可读', () => {
  eq(core.describeRrule('FREQ=DAILY'), '每天');
  eq(core.describeRrule('FREQ=WEEKLY;BYDAY=MO,WE'), '每周一、周三');
  eq(core.describeRrule('FREQ=MONTHLY;BYMONTHDAY=15'), '每月 15 日');
  eq(core.describeRrule('FREQ=DAILY;COUNT=5'), '每天，共 5 次');
  eq(core.describeRrule(''), '不重复');
});
t('fmtOccWhen: 全天与按时刻', () => {
  ok(core.fmtOccWhen(U(2026, 10, 28), true, 1440).includes('2026-10-28'));
  ok(core.fmtOccWhen(L(2026, 10, 28, 15, 0), false, 90).includes('15:00'));
  ok(core.fmtOccWhen(L(2026, 10, 28, 15, 0), false, 90).includes('1.5 小时') || core.fmtOccWhen(L(2026, 10, 28, 15, 0), false, 90).includes('90 分钟'));
});

// ── 输出 ─────────────────────────────────────────────────────────────────────
const bad = results.filter((r) => !r.pass);
console.log(results.map((r) => `${r.pass ? '✓' : '✗'} ${r.name}${r.pass ? '' : `\n    ${r.detail}`}`).join('\n'));
console.log(`\n${results.length - bad.length}/${results.length} passed`);
process.exit(bad.length ? 1 : 0);
