/**
 * cron-lens core 逻辑测试（node test/run-tests.mjs，node --test 亦可）
 *
 * 离线、零依赖。覆盖：解析（别名/名字/步长/缩写/归一）/ 错误路径（超界/环形/
 * Quartz L/W#/@reboot）/ OR 语义警示与匹配 / 永不触发与仅闰年 / 触发预报
 * （tz 偏移/间隔守恒/月跳转/次数钳制）/ match 逐字段诊断 / parseFromInput 三形态。
 * 日期锚点全部用 Date 自校验（先断言锚点星期再用于期望），不依赖人记日历。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as core from '../shared/cron-core.js'

const T = (y, mo, d, h = 0, mi = 0) => Date.UTC(y, mo - 1, d, h, mi)
const WD = (y, mo, d) => new Date(T(y, mo, d)).getUTCDay()

test('parse: 基础步长 */15 归一与解释', () => {
  const r = core.parseCron('*/15 * * * *')
  assert.ok(r.ok)
  assert.deepEqual(r.fields.min.values, [0, 15, 30, 45])
  assert.equal(r.normalized, '*/15 * * * *')
  assert.equal(r.warnings.filter((w) => w.level === 'warn').length, 0)
  const minRow = core.describeFields(r).find((x) => x.label === '分钟')
  assert.match(minRow.text, /每 15 分钟/)
  assert.match(minRow.text, /0、15、30、45/)
})

test('parse: @daily 别名展开', () => {
  const r = core.parseCron('@daily')
  assert.ok(r.ok)
  assert.equal(r.aliasUsed, '@daily')
  assert.equal(r.normalized, '0 0 * * *')
  assert.ok(r.warnings.some((w) => w.msg.includes('@daily')))
})

test('parse: 月份与星期英文名', () => {
  const r = core.parseCron('0 0 1 JAN-MAR *')
  assert.ok(r.ok)
  assert.deepEqual(r.fields.month.values, [1, 2, 3])
  const r2 = core.parseCron('0 0 * * MON-FRI')
  assert.ok(r2.ok)
  assert.deepEqual(r2.fields.dow.values, [1, 2, 3, 4, 5])
})

test('parse: 星期 7 归一为 0（周日）并提示', () => {
  const r = core.parseCron('0 0 * * 7')
  assert.ok(r.ok)
  assert.deepEqual(r.fields.dow.values, [0])
  assert.ok(r.warnings.some((w) => w.level === 'info' && w.msg.includes('7')))
})

test('parse: Quartz 的 ? 容忍并按 * 处理', () => {
  const r = core.parseCron('0 0 ? * *')
  assert.ok(r.ok)
  assert.equal(r.domRestricted, false)
  assert.ok(r.warnings.some((w) => w.msg.includes('?')))
})

test('parse: 6 字段首位按秒解析并警示', () => {
  const r = core.parseCron('*/30 * * * * *')
  assert.ok(r.ok)
  assert.equal(r.useSec, true)
  assert.deepEqual(r.fields.sec.values, [0, 30])
  assert.ok(r.warnings.some((w) => w.level === 'warn' && w.msg.includes('秒')))
})

test('parse: 「5/15」缩写按 5-59/15 解释', () => {
  const r = core.parseCron('5/15 * * * *')
  assert.ok(r.ok)
  assert.deepEqual(r.fields.min.values, [5, 20, 35, 50])
  assert.ok(r.warnings.some((w) => w.msg.includes('5-59/15')))
})

test('parse: 范围起点非下界的步长命中提示', () => {
  const r = core.parseCron('3-59/15 * * * *')
  assert.ok(r.ok)
  assert.deepEqual(r.fields.min.values, [3, 18, 33, 48])
  assert.ok(r.notes.some((n) => n.msg.includes('3、18、33、48')))
})

test('parse: 错误路径全覆盖', () => {
  const bads = [
    '61 * * * *',        // 分钟超界
    '*/0 * * * *',       // 步长 0
    '0 0 * *',           // 字段数不足
    '0 0 * * * * *',     // 字段数过多
    '0 0 L * *',         // Quartz 语法
    '1-0 * * * *',       // 环形范围
    '@reboot',           // 无时刻语义
    'hello world',       // 乱输入（两段无法成 5 字段）
    '0 0 0 * *',         // 日字段 0 超界（日从 1 起）
  ]
  for (const bad of bads) {
    const r = core.parseCron(bad)
    assert.equal(r.ok, false, `应拒绝：${bad}`)
    assert.ok(r.error && r.error.length > 0, `应有错误信息：${bad}`)
  }
})

test('语义: 日与周同时受限 → OR 警示 + 匹配按或', () => {
  const r = core.parseCron('0 0 1 * 1')
  assert.ok(r.ok)
  assert.ok(r.domRestricted && r.dowRestricted)
  assert.ok(r.warnings.some((w) => w.level === 'warn' && w.msg.includes('「或」')))
  // 锚点自校验：2026-11-09 必须是周一（事实来自 Date 本身）
  assert.equal(WD(2026, 11, 9), 1)
  // 周一但非 1 号 → 命中（OR）；周二且非 1 号 → 不命中
  const m = core.matchesAt(r, T(2026, 11, 9, 0, 0), 0)
  assert.equal(m.match, true)
  const m2 = core.matchesAt(r, T(2026, 11, 10, 0, 0), 0)
  assert.equal(m2.match, false)
  assert.equal(m2.firstMismatch, '日+星期综合')
})

test('语义: 永不触发（2 月 30 日）', () => {
  const r = core.parseCron('0 0 30 2 *')
  assert.ok(r.ok)
  assert.ok(r.warnings.some((w) => w.msg.includes('永不触发')))
  const nf = core.nextFires(r, T(2026, 0, 1), 3, 0)
  assert.equal(nf.fires.length, 0)
  assert.ok(nf.neverReason)
})

test('语义: 仅闰年触发（2 月 29）自动落 2028', () => {
  const r = core.parseCron('0 0 29 2 *')
  assert.ok(r.ok)
  assert.ok(r.warnings.some((w) => w.msg.includes('闰年')))
  const nf = core.nextFires(r, T(2026, 0, 1), 1, 0)
  assert.equal(nf.fires.length, 1)
  assert.equal(nf.fires[0].wallText, '2028-02-29 00:00')
})

test('match: 逐字段命中与首因诊断', () => {
  const r = core.parseCron('*/15 * * * *')
  const hit = core.matchesAt(r, T(2026, 11, 4, 9, 45), 0)
  assert.equal(hit.match, true)
  const miss = core.matchesAt(r, T(2026, 11, 4, 9, 44), 0)
  assert.equal(miss.match, false)
  assert.equal(miss.firstMismatch, '分钟')
  const row = miss.checks.find((c) => c.label === '分钟')
  assert.equal(row.value, '44')
  assert.match(row.expect, /0、15、30、45/)
})

test('match: 6 字段秒诊断', () => {
  const r = core.parseCron('30 0 * * * *')
  const hit = core.matchesAt(r, core.parseFromInput('2026-11-04 09:00:30', 0).ms, 0)
  assert.equal(hit.match, true)
  const miss = core.matchesAt(r, core.parseFromInput('2026-11-04 09:00:00', 0).ms, 0)
  assert.equal(miss.match, false)
  assert.equal(miss.firstMismatch, '秒')
})

test('next: 时区偏移（UTC+8 墙钟 9 点 = 绝对 01:00Z）', () => {
  const r = core.parseCron('0 9 * * *')
  const nf = core.nextFires(r, T(2026, 11, 4, 0, 0), 1, 480)
  assert.equal(nf.fires[0].at, T(2026, 11, 4, 1, 0))
  assert.equal(nf.fires[0].wallText, '2026-11-04 09:00')
  assert.equal(core.tzTag(480), 'UTC+8')
  assert.equal(core.tzTag(0), 'UTC')
})

test('next: */15 间隔恒 15 分钟（非平凡产出守恒）', () => {
  const r = core.parseCron('*/15 * * * *')
  const nf = core.nextFires(r, T(2026, 11, 4, 10, 7), 6, 0)
  assert.equal(nf.fires.length, 6)
  for (let i = 1; i < nf.fires.length; i++) {
    assert.equal(nf.fires[i].at - nf.fires[i - 1].at, 15 * 60000)
  }
  assert.ok(Number.isFinite(nf.fires[0].at))
})

test('next: 工作日 9 点跳过周末（锚点自校验）', () => {
  assert.equal(WD(2026, 11, 4), 3) // 2026-11-04 周三（Date 自证）
  const r = core.parseCron('0 9 * * 1-5')
  const nf = core.nextFires(r, T(2026, 11, 4, 10, 0), 3, 0)
  assert.equal(nf.fires[0].wallText, '2026-11-05 09:00') // 周四
  assert.equal(nf.fires[2].wallText, '2026-11-09 09:00') // 跳过周六日到周一
  assert.equal(WD(2026, 11, 9), 1)
})

test('next: 月跳转（11 月的 1 号表达式 → 次年 1 月）', () => {
  const r = core.parseCron('0 0 1 1 *')
  const nf = core.nextFires(r, T(2026, 11, 4), 1, 0)
  assert.equal(nf.fires[0].wallText, '2027-01-01 00:00')
})

test('next: 次数钳制上限 50', () => {
  const r = core.parseCron('* * * * *')
  const nf = core.nextFires(r, T(2026, 11, 4), 60, 0)
  assert.equal(nf.fires.length, 50)
})

test('归一: 0,15,30,45 → */15；0,15,30 保持列表', () => {
  assert.equal(core.parseCron('0,15,30,45 * * * *').normalized, '*/15 * * * *')
  assert.equal(core.parseCron('0,15,30 * * * *').normalized, '0,15,30 * * * *')
})

test('parseFromInput: 三形态与确定性', () => {
  const wall = core.parseFromInput('2026-11-04 09:30', 480)
  assert.equal(wall.ms, T(2026, 11, 4, 1, 30)) // 墙钟按偏移解释
  assert.equal(core.parseFromInput(String(T(2026, 11, 4, 9, 30) / 1000), 0).ms, T(2026, 11, 4, 9, 30)) // 秒→ms
  assert.equal(core.parseFromInput(String(T(2026, 11, 4, 9, 30)), 0).ms, T(2026, 11, 4, 9, 30)) // ms 原样
  assert.equal(core.parseFromInput('2026-11-04T09:30:00Z', 480).ms, T(2026, 11, 4, 9, 30)) // ISO 带字面时区
  assert.ok(core.parseFromInput('garbage', 0).error)
})

test('render: renderExplain/renderNext 文本产出非空且含关键节', () => {
  const r = core.parseCron('0 9 * * 1-5')
  const ex = core.renderExplain(r)
  assert.match(ex, /字段解释/)
  assert.match(ex, /星期（1,2,3,4,5）/)
  const nx = core.renderNext(r, T(2026, 11, 4, 10, 0), 2, 0)
  assert.match(nx.text, /未来 2 次/)
  assert.match(nx.text, /epoch=/)
})
