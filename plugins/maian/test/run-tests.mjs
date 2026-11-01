#!/usr/bin/env node
'use strict';
/**
 * 脉案离线单测：node test/run-tests.mjs（零依赖零 mock，纯函数行为级）
 * 覆盖：日期/区间工具、成员与记录规范化边界（四指标类型）、分带全档位
 * （血压五态/血糖四时点/体温/体重BMI有无身高）、日键插入覆盖移除、
 * 区间统计与趋势点列、就诊小结结构、导出形状。
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

// 固定「现在」：2026-11-01 本地 10:30
const NOW = new Date(2026, 10, 1, 10, 30).getTime();
const TODAY = '2026-11-01';
const YDAY = '2026-10-31';

// ── 日期/区间工具 ─────────────────────────────────────────────────────────────
t('dayKey/parseDayKey 往返一致', () => {
  eq(core.parseDayKey(core.dayKey(NOW)), new Date(2026, 10, 1).getTime());
});
t('parseDayKey 拒绝 2 月 30 日与垃圾', () => {
  eq(core.parseDayKey('2026-02-30'), null);
  eq(core.parseDayKey('明天'), null);
  eq(core.parseDayKey(''), null);
});
t('dayMinTs = 本地零点+分钟', () => {
  eq(core.dayMinTs(TODAY, 480), new Date(2026, 10, 1, 8, 0).getTime());
  eq(core.dayMinTs('2026-02-30', 0), null);
  eq(core.dayMinTs(TODAY, 1440), null);
});
t('dayDiff 自然日差', () => {
  eq(core.dayDiff(TODAY, YDAY), 1);
  eq(core.dayDiff(YDAY, TODAY), -1);
});
t('rangeDays 含两端/拒绝倒序与超400天', () => {
  eq(core.rangeDays(YDAY, TODAY), [YDAY, TODAY]);
  eq(core.rangeDays(TODAY, YDAY), null);
  eq(core.rangeDays('2020-01-01', TODAY), null);
  eq(core.rangeDays('垃圾', TODAY), null);
});

// ── 成员规范化 ────────────────────────────────────────────────────────────────
t('normalizeMember：名称必填/身高边界/备注裁剪', () => {
  ok(core.normalizeMember({ name: '妈妈' }, null).member);
  eq(core.normalizeMember({ name: '' }, null).error, '成员名称不能为空');
  eq(core.normalizeMember({ name: '妈', heightCm: 30 }, null).error, '身高需在 40-250 cm 之间');
  eq(core.normalizeMember({ name: '妈', heightCm: 999 }, null).error, '身高需在 40-250 cm 之间');
  const r = core.normalizeMember({ name: '妈妈', heightCm: 160.4, note: 'x'.repeat(300) }, null).member;
  eq(r.heightCm, 160);
  eq(r.note.length, 200);
});
t('normalizeMember：更新保留 id/createdAt，updatedAt 前进', () => {
  const base = core.normalizeMember({ name: '妈妈' }, null).member;
  const r = core.normalizeMember({ name: '母亲', heightCm: 158 }, base).member;
  eq(r.id, base.id);
  eq(r.createdAt, base.createdAt);
  ok(r.updatedAt >= base.updatedAt);
  eq(r.heightCm, 158);
});
t('normalizeMember：heightCm 空串清空', () => {
  const base = core.normalizeMember({ name: '妈妈', heightCm: 160 }, null).member;
  const r = core.normalizeMember({ name: '妈妈', heightCm: '' }, base).member;
  eq(r.heightCm, undefined);
});

// ── 记录规范化 ────────────────────────────────────────────────────────────────
t('bp：合法入账 + 心率可选', () => {
  const r = core.normalizeRecord({ profileId: 'p1', kind: 'bp', sys: 152, dia: 95, pulse: 78 }, NOW).record;
  eq(r.sys, 152); eq(r.dia, 95); eq(r.pulse, 78);
  eq(r.src, 'ai');
  ok(r.ts > 0 && r.id);
});
t('bp：sys<=dia 拒绝', () => {
  eq(core.normalizeRecord({ profileId: 'p1', kind: 'bp', sys: 90, dia: 95 }, NOW).error, '收缩压（90）须大于舒张压（95）');
  eq(core.normalizeRecord({ profileId: 'p1', kind: 'bp', sys: 95, dia: 95 }, NOW).error, '收缩压（95）须大于舒张压（95）');
});
t('bp：越界拒绝', () => {
  eq(core.normalizeRecord({ profileId: 'p1', kind: 'bp', sys: 59, dia: 60 }, NOW).error, '收缩压须为 60-260 的整数 mmHg');
  eq(core.normalizeRecord({ profileId: 'p1', kind: 'bp', sys: 261, dia: 60 }, NOW).error, '收缩压须为 60-260 的整数 mmHg');
  eq(core.normalizeRecord({ profileId: 'p1', kind: 'bp', sys: 120, dia: 29 }, NOW).error, '舒张压须为 30-160 的整数 mmHg');
  eq(core.normalizeRecord({ profileId: 'p1', kind: 'bp', sys: 120, dia: 60, pulse: 25 }, NOW).error, '心率须为 30-220 的整数');
});
t('bg：时点缺省 random/白名单外回落 random/越界拒绝', () => {
  eq(core.normalizeRecord({ profileId: 'p1', kind: 'bg', mmol: 6.5 }, NOW).record.slot, 'random');
  eq(core.normalizeRecord({ profileId: 'p1', kind: 'bg', mmol: 6.5, slot: '饭后' }, NOW).record.slot, 'random');
  eq(core.normalizeRecord({ profileId: 'p1', kind: 'bg', mmol: 6.5, slot: 'fasting' }, NOW).record.slot, 'fasting');
  eq(core.normalizeRecord({ profileId: 'p1', kind: 'bg', mmol: 0.5 }, NOW).error, '血糖须为 1.0-40.0 mmol/L');
  eq(core.normalizeRecord({ profileId: 'p1', kind: 'bg', mmol: 40.1 }, NOW).error, '血糖须为 1.0-40.0 mmol/L');
});
t('weight/temp：范围与一位小数', () => {
  eq(core.normalizeRecord({ profileId: 'p1', kind: 'weight', kg: 72.56 }, NOW).record.kg, 72.6);
  eq(core.normalizeRecord({ profileId: 'p1', kind: 'weight', kg: 1.9 }, NOW).error, '体重须为 2.0-300.0 kg');
  eq(core.normalizeRecord({ profileId: 'p1', kind: 'temp', c: 36.55 }, NOW).record.c, 36.6);
  eq(core.normalizeRecord({ profileId: 'p1', kind: 'temp', c: 45 }, NOW).error, '体温须为 33.0-43.0 ℃');
});
t('kind 白名单', () => {
  eq(core.normalizeRecord({ profileId: 'p1', kind: 'heart' }, NOW).error, 'kind 须为 bp/bg/weight/temp');
});
t('缺 profileId 拒绝', () => {
  eq(core.normalizeRecord({ kind: 'bp', sys: 120, dia: 80 }, NOW).error, '缺少成员（profileId）');
});
t('date today/yesterday/自定义 + time 显式', () => {
  eq(core.dayKeyOfTs(core.normalizeRecord({ profileId: 'p1', kind: 'bp', sys: 120, dia: 80 }, NOW).record.ts), TODAY);
  eq(core.dayKeyOfTs(core.normalizeRecord({ profileId: 'p1', kind: 'bp', sys: 120, dia: 80, date: 'yesterday' }, NOW).record.ts), YDAY);
  eq(core.dayKeyOfTs(core.normalizeRecord({ profileId: 'p1', kind: 'bp', sys: 120, dia: 80, date: '2026-10-15' }, NOW).record.ts), '2026-10-15');
  eq(core.fmtTime(core.normalizeRecord({ profileId: 'p1', kind: 'bp', sys: 120, dia: 80, time: '08:05' }, NOW).record.ts), '08:05');
});
t('补记无 time → 归到正午；今天无 time → 当前时刻', () => {
  eq(core.fmtTime(core.normalizeRecord({ profileId: 'p1', kind: 'bp', sys: 120, dia: 80, date: '2026-10-15' }, NOW).record.ts), '12:00');
  eq(core.fmtTime(core.normalizeRecord({ profileId: 'p1', kind: 'bp', sys: 120, dia: 80 }, NOW).record.ts), '10:30');
});
t('非法 time/date 拒绝', () => {
  ok(core.normalizeRecord({ profileId: 'p1', kind: 'bp', sys: 120, dia: 80, time: '25:00' }, NOW).error);
  ok(core.normalizeRecord({ profileId: 'p1', kind: 'bp', sys: 120, dia: 80, time: '8:5' }, NOW).error);
  ok(core.normalizeRecord({ profileId: 'p1', kind: 'bp', sys: 120, dia: 80, date: '明天' }, NOW).error);
});
t('id 透传（幂等 upsert 语义）+ note 裁剪', () => {
  const r = core.normalizeRecord({ id: 'abc', profileId: 'p1', kind: 'bp', sys: 120, dia: 80, note: 'x'.repeat(300) }, NOW).record;
  eq(r.id, 'abc');
  eq(r.note.length, 200);
});
t('src=panel 白名单', () => {
  eq(core.normalizeRecord({ profileId: 'p1', kind: 'bp', sys: 120, dia: 80, src: 'panel' }, NOW).record.src, 'panel');
});

// ── 分带 ──────────────────────────────────────────────────────────────────────
t('bp 分带五态', () => {
  eq(core.bandOf('bp', { sys: 118, dia: 76 }).level, 'green');
  eq(core.bandOf('bp', { sys: 132, dia: 80 }).level, 'yellow');
  eq(core.bandOf('bp', { sys: 120, dia: 86 }).level, 'yellow');
  eq(core.bandOf('bp', { sys: 142, dia: 88 }).level, 'red');
  eq(core.bandOf('bp', { sys: 138, dia: 92 }).level, 'red');
  eq(core.bandOf('bp', { sys: 182, dia: 100 }).level, 'urgent');
  eq(core.bandOf('bp', { sys: 150, dia: 121 }).level, 'urgent');
  eq(core.bandOf('bp', { sys: 88, dia: 55 }).level, 'yellow'); // 偏低
});
t('bg 分带：空腹与餐后口径不同', () => {
  eq(core.bandOf('bg', { mmol: 5.2, slot: 'fasting' }).level, 'green');
  eq(core.bandOf('bg', { mmol: 6.3, slot: 'fasting' }).level, 'yellow');
  eq(core.bandOf('bg', { mmol: 7.1, slot: 'fasting' }).level, 'red');
  eq(core.bandOf('bg', { mmol: 7.5, slot: 'after2h' }).level, 'green'); // 餐后 7.5 属绿
  eq(core.bandOf('bg', { mmol: 9.0, slot: 'after2h' }).level, 'yellow');
  eq(core.bandOf('bg', { mmol: 12.0, slot: 'random' }).level, 'red');
  eq(core.bandOf('bg', { mmol: 3.5, slot: 'fasting' }).level, 'red'); // 低血糖
});
t('bg 边界：6.1 绿 / 7.8 黄 / 11.1 红（含边界值）', () => {
  eq(core.bandOf('bg', { mmol: 6.1, slot: 'fasting' }).level, 'green');
  eq(core.bandOf('bg', { mmol: 7.8, slot: 'after2h' }).level, 'yellow');
  eq(core.bandOf('bg', { mmol: 11.1, slot: 'random' }).level, 'red');
});
t('temp 分带', () => {
  eq(core.bandOf('temp', { c: 36.5 }).level, 'green');
  eq(core.bandOf('temp', { c: 37.3 }).level, 'yellow');
  eq(core.bandOf('temp', { c: 38.0 }).level, 'yellow');
  eq(core.bandOf('temp', { c: 38.1 }).level, 'red');
  eq(core.bandOf('temp', { c: 34.9 }).level, 'red');
});
t('weight：有身高走 BMI（中国标准），无身高不分带', () => {
  // 160cm：50kg→BMI19.5 绿；65kg→25.4 黄；80kg→31.3 红
  eq(core.bandOf('weight', { kg: 50 }, 160).level, 'green');
  eq(core.bandOf('weight', { kg: 65 }, 160).level, 'yellow');
  eq(core.bandOf('weight', { kg: 80 }, 160).level, 'red');
  eq(core.bandOf('weight', { kg: 45 }, 160).level, 'yellow'); // <18.5
  eq(core.bandOf('weight', { kg: 65 }, undefined).level, 'none');
  ok(core.bandOf('weight', { kg: 65 }, 160).bmi === 25.4);
});

// ── 日键数组操作 ──────────────────────────────────────────────────────────────
function bp(ts, sys, dia, id) {
  return { id: id || `r${sys}_${dia}_${ts}`, profileId: 'p1', kind: 'bp', ts, sys, dia, note: '', src: 'ai', at: NOW };
}
t('upsertRecord：按 ts 升序插入，同 id 覆盖不重复', () => {
  const a = bp(NOW, 120, 80);
  const b = bp(NOW - 3600e3, 130, 85);
  let arr = core.upsertRecord([], b);
  arr = core.upsertRecord(arr, a);
  eq(arr.map((r) => r.ts), [NOW - 3600e3, NOW]);
  const c = bp(NOW, 126, 82, a.id);
  arr = core.upsertRecord(arr, c);
  eq(arr.length, 2);
  eq(arr[1].sys, 126);
});
t('upsertRecord：非数组入参容错', () => {
  eq(core.upsertRecord(null, bp(NOW, 120, 80)).length, 1);
});
t('removeRecord：found 语义', () => {
  const a = bp(NOW, 120, 80, 'x1');
  const r = core.removeRecord([a], 'x1');
  ok(r.found && r.arr.length === 0);
  eq(core.removeRecord([a], 'nope').found, false);
  eq(core.removeRecord(null, 'x1').arr, []);
});

// ── 统计与趋势 ────────────────────────────────────────────────────────────────
t('statsFor：字段聚合与 latest/prev', () => {
  const rs = [
    bp(NOW - 3 * 86400e3, 140, 90, 'a'),
    bp(NOW - 2 * 86400e3, 150, 95, 'b'),
    bp(NOW - 86400e3, 130, 85, 'c'),
  ];
  const st = core.statsFor(rs);
  eq(st.count, 3);
  eq(st.fields.sys.avg, 140);
  eq(st.fields.sys.min, 130);
  eq(st.fields.sys.max, 150);
  eq(st.latest.id, 'c');
  eq(st.prev.id, 'b');
  eq(st.bands.green, 0);
});
t('statsFor：分带计数（血糖混合时点）', () => {
  const rs = [
    { id: '1', profileId: 'p1', kind: 'bg', ts: 1, mmol: 5.0, slot: 'fasting', note: '', src: 'ai', at: NOW },
    { id: '2', profileId: 'p1', kind: 'bg', ts: 2, mmol: 6.5, slot: 'fasting', note: '', src: 'ai', at: NOW },
    { id: '3', profileId: 'p1', kind: 'bg', ts: 3, mmol: 9.0, slot: 'after2h', note: '', src: 'ai', at: NOW },
  ];
  const st = core.statsFor(rs);
  eq(st.bands.green, 1);
  eq(st.bands.yellow, 2);
  eq(st.fields.mmol.avg, 6.8);
});
t('trendPoints：bp 双系列 / 其他 value', () => {
  const pts = core.trendPoints([bp(NOW, 140, 90, 'a'), bp(NOW + 1, 130, 85, 'b')]);
  eq(pts.length, 2);
  eq(pts[0].sys, 140);
  eq(pts[0].dia, 90);
  const w = core.trendPoints([{ id: '1', profileId: 'p1', kind: 'weight', ts: 1, kg: 72.5, note: '', src: 'ai', at: NOW }]);
  eq(w[0].value, 72.5);
});

// ── 就诊小结 ──────────────────────────────────────────────────────────────────
t('buildSummary：结构完整（标题/成员/统计/明细表/免责）', () => {
  const member = core.normalizeMember({ id: 'p1', name: '妈妈', heightCm: 160 }, null).member;
  const records = [
    { id: '1', profileId: 'p1', kind: 'bp', ts: core.dayMinTs(TODAY, 480), sys: 152, dia: 95, pulse: 78, note: '服药前', src: 'ai', at: NOW },
    { id: '2', profileId: 'p1', kind: 'bp', ts: core.dayMinTs(TODAY, 1200), sys: 138, dia: 86, note: '', src: 'ai', at: NOW },
    { id: '3', profileId: 'p1', kind: 'bg', ts: core.dayMinTs(TODAY, 540), mmol: 6.5, slot: 'fasting', note: '', src: 'ai', at: NOW },
  ];
  const md = core.buildSummary({ member, from: TODAY, to: TODAY, records });
  ok(md.includes('# 体征记录小结'), '标题');
  ok(md.includes('妈妈') && md.includes('身高 160cm'), '成员行');
  ok(md.includes('## 血压（mmHg）'), '血压小节');
  ok(md.includes('## 血糖（mmol/L）'), '血糖小节');
  ok(md.includes('152/95'), '明细行');
  ok(md.includes('服药前'), '备注进明细');
  ok(md.includes('分带：绿') || md.includes('绿 '), '分带计数');
  ok(md.includes('不构成医疗建议') && md.includes('遵医嘱'), '免责声明');
  ok(md.includes('152/95 · 心率78'), '心率并入数值列');
});
t('buildSummary：空区间不崩且含提示', () => {
  const member = core.normalizeMember({ id: 'p1', name: '妈妈' }, null).member;
  const md = core.buildSummary({ member, from: TODAY, to: TODAY, records: [] });
  ok(md.includes('暂无记录'));
  ok(md.includes('不构成医疗建议'));
});

// ── 导出 ──────────────────────────────────────────────────────────────────────
t('exportAllText 形状', () => {
  const txt = core.exportAllText({
    members: [core.normalizeMember({ id: 'p1', name: '妈妈' }, null).member],
    dayMap: { '2026-11-01': [bp(NOW, 120, 80)] },
  });
  const obj = JSON.parse(txt);
  eq(obj.app, 'maian');
  eq(obj.members.length, 1);
  eq(obj.days['2026-11-01'].length, 1);
});

// ── 汇总 ──────────────────────────────────────────────────────────────────────
const fails = results.filter((r) => !r.pass);
for (const r of results) {
  console.log(`${r.pass ? '  ✓' : '  ✗'} ${r.name}${r.pass ? '' : ` —— ${r.detail}`}`);
}
console.log(`\n${results.length - fails.length}/${results.length} 通过`);
if (fails.length) process.exit(1);
