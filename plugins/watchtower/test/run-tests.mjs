/**
 * 守望台 usage-core 逻辑测试（node --test test/run-tests.mjs）
 *
 * 离线、零宿主依赖。覆盖：
 *  - recordUsage 双通道计量（mcp/panel）+ 首次/末次 + 日趋势
 *  - normalizeUsage 脏数据防御
 *  - aggregateWindow / windowStartDay / costOf 加权
 *  - activityOf 活跃分级（active/idle/cold/never）
 *  - summarize 热/冷榜 + totals
 *  - governanceSuggestions 治理建议（冷门+服务在跑 → stop）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as core from '../shared/usage-core.js'

const DAY = core.DAY_MS
const NOW = Date.UTC(2026, 9, 28, 10, 0, 0) // 2026-10-28 10:00 UTC

test('recordUsage: 首次 mcp 调用初始化全字段', () => {
  const rec = core.recordUsage('plug-a', 'mcp', null, NOW)
  assert.equal(rec.count, 1)
  assert.equal(rec.panelOpens, 0)
  assert.equal(rec.firstUsed, NOW)
  assert.equal(rec.lastUsed, NOW)
  assert.deepEqual(rec.trends[core.fmtDay(NOW)], { mcp: 1, panel: 0 })
  assert.equal(rec.pluginId, 'plug-a')
})

test('recordUsage: 连续 mcp + panel 叠加正确分账', () => {
  let rec = core.recordUsage('plug-a', 'mcp', null, NOW)
  rec = core.recordUsage('plug-a', 'mcp', rec, NOW + 1000)
  rec = core.recordUsage('plug-a', 'panel', rec, NOW + 2000)
  rec = core.recordUsage('plug-a', 'mcp', rec, NOW + 3 * DAY) // 隔天
  assert.equal(rec.count, 3)
  assert.equal(rec.panelOpens, 1)
  assert.equal(rec.firstUsed, NOW)
  assert.equal(rec.lastUsed, NOW + 3 * DAY)
  // 两天分开记
  const d1 = core.fmtDay(NOW)
  const d2 = core.fmtDay(NOW + 3 * DAY)
  assert.deepEqual(rec.trends[d1], { mcp: 2, panel: 1 })
  assert.deepEqual(rec.trends[d2], { mcp: 1, panel: 0 })
})

test('recordUsage: 面板打开不清空已存在账本', () => {
  const prev = { pluginId: 'b', count: 5, panelOpens: 2, firstUsed: NOW - DAY, lastUsed: NOW - DAY, trends: {} }
  const rec = core.recordUsage('b', 'panel', prev, NOW)
  assert.equal(rec.count, 5)
  assert.equal(rec.panelOpens, 3)
  assert.equal(rec.lastUsed, NOW)
  assert.equal(rec.firstUsed, NOW - DAY) // 首次保留
})

test('normalizeUsage: 脏数据防御 + 趋势白名单', () => {
  const rec = core.normalizeUsage({ pluginId: 'x', count: '3', panelOpens: -5, firstUsed: 123, trends: { 'bad-date': { mcp: 9 }, '2026-10-01': { mcp: 2, panel: 3 } } })
  assert.equal(rec.count, 3)
  assert.equal(rec.panelOpens, 0)
  assert.equal(rec.firstUsed, 123)
  assert.ok(!('bad-date' in rec.trends))
  assert.deepEqual(rec.trends['2026-10-01'], { mcp: 2, panel: 3 })
  // 非法记录返回 null
  assert.equal(core.normalizeUsage(null), null)
  assert.equal(core.normalizeUsage({ pluginId: 7 }), null)
})

test('windowStartDay / aggregateWindow: 以本地日窗口聚合', () => {
  const rec = core.emptyUsage('a')
  rec.trends['2026-10-20'] = { mcp: 1, panel: 0 } // 8 天前，7 天窗口外
  rec.trends['2026-10-22'] = { mcp: 2, panel: 1 } // 6 天前，范围内
  rec.trends['2026-10-28'] = { mcp: 3, panel: 0 } // 今天
  const w7 = core.aggregateWindow(rec, 7)
  assert.equal(w7.mcp, 5)
  assert.equal(w7.panel, 1)
  assert.equal(w7.total, 6)
  assert.equal(w7.firstDay, '2026-10-22')
  const w30 = core.aggregateWindow(rec, 30)
  assert.equal(w30.total, 7)
})

test('costOf: 工具调用权重大于面板打开', () => {
  const a = core.emptyUsage('a')
  a.trends['2026-10-28'] = { mcp: 2, panel: 0 }
  const b = core.emptyUsage('b')
  b.trends['2026-10-28'] = { mcp: 0, panel: 3 }
  assert.ok(core.costOf(a, 7) > core.costOf(b, 7))
  assert.equal(core.costOf(a, 7), 4) // 2 * 2
})

test('activityOf: 活跃/沉睡/冷门/从未', () => {
  assert.equal(core.activityOf(null), 'never')
  assert.equal(core.activityOf(core.emptyUsage('x')), 'never')
  // 活跃：3 天前用过
  assert.equal(core.activityOf({ ...core.emptyUsage('x'), lastUsed: NOW - 3 * DAY }), 'active')
  // 沉睡：10 天前用过（7 天窗口外，30 天内）
  assert.equal(core.activityOf({ ...core.emptyUsage('x'), lastUsed: NOW - 10 * DAY }), 'idle')
  // 冷门：40 天前用过
  assert.equal(core.activityOf({ ...core.emptyUsage('x'), lastUsed: NOW - 40 * DAY }), 'cold')
})

test('summarize: 热/冷榜 + totals', () => {
  const now = NOW
  const plugins = [
    { id: 'a', name: 'A', builtin: true, contributes: {}, source: {}, origin: {}, version: '1', enabledByDefault: true },
    { id: 'b', name: 'B', builtin: false, contributes: {}, source: {}, origin: {}, version: '1', enabledByDefault: true },
  ]
  const usage = {
    a: core.recordUsage('a', 'mcp', null, now - DAY),
    b: core.recordUsage('b', 'mcp', null, now - 40 * DAY),
  }
  const services = [
    core.normalizeServiceStatus({ serviceId: 's1', pluginId: 'b', state: 'running', port: 8080, pid: 100, restartCount: 0 }),
  ]
  const sum = core.summarize(plugins, usage, services)
  assert.equal(sum.totals.plugins, 2)
  assert.equal(sum.totals.active, 1)
  assert.equal(sum.totals.cold, 1)
  assert.equal(sum.totals.runningServices, 1)
  // 热榜 a 靠前，冷榜 b 靠前
  assert.equal(sum.byActivity[0].plugin.id, 'a')
  assert.equal(sum.byCold[0].plugin.id, 'b')
  // 治理建议：b 冷门且服务在跑 → stop 最高优先级
  assert.ok(sum.suggestions.length >= 1)
  const bSuggestion = sum.suggestions.find((s) => s.pluginId === 'b')
  assert.ok(bSuggestion)
  assert.equal(bSuggestion.suggestion, 'stop')
  assert.ok(bSuggestion.weight >= 90)
})

test('governanceSuggestions: 冷门且有服务 > 冷门无服务', () => {
  const plugins = [
    { id: 'c1', name: 'ColdNoSvc', builtin: false, contributes: {}, source: {}, origin: {}, version: '1', enabledByDefault: true },
    { id: 'c2', name: 'ColdWithSvc', builtin: false, contributes: {}, source: {}, origin: {}, version: '1', enabledByDefault: true },
  ]
  const usage = {}
  for (const p of plugins) usage[p.id] = core.recordUsage(p.id, 'mcp', null, NOW - 60 * DAY)
  const services = [core.normalizeServiceStatus({ serviceId: 's', pluginId: 'c2', state: 'running', restartCount: 0 })]
  const s = core.governanceSuggestions(plugins, usage, services)
  assert.equal(s.length, 2)
  assert.equal(s[0].pluginId, 'c2') // stop 高优在前
  assert.equal(s[0].suggestion, 'stop')
  assert.equal(s[1].pluginId, 'c1')
  assert.equal(s[1].suggestion, 'disable')
})

test('normalizeServiceStatus: 字段归一化 + 缺失返回 null', () => {
  const s = core.normalizeServiceStatus({ serviceId: 'svc', pluginId: 'p', state: 'exited', port: null, restartCount: 3 })
  assert.equal(s.state, 'exited')
  assert.equal(s.restartCount, 3)
  assert.equal(s.port, null)
  assert.equal(core.normalizeServiceStatus(null), null)
  assert.equal(core.normalizeServiceStatus({ serviceId: 'x' }), null)
})

test('normalizePlugin: 未知字段防御', () => {
  const p = core.normalizePlugin({ id: 'k', name: 'K', contributes: { services: [{ id: 's' }] } })
  assert.equal(p.id, 'k')
  assert.ok(core.hasServices(p))
  assert.equal(core.mcpServerCount(p), 0)
  assert.equal(core.normalizePlugin({ name: 'no id' }), null)
})

test('fmtDay / dayStart: 日期边界', () => {
  assert.equal(core.fmtDay(0), '1970-01-01')
  const start = core.dayStart('2026-10-28')
  assert.equal(core.fmtDay(start), '2026-10-28')
  assert.equal(core.fmtDay(start - 1), '2026-10-27')
})