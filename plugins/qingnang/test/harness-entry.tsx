/**
 * 无头渲染 harness 入口：stub 宿主 invoke（内存 cap.kv + 种子数据）→ 挂载面板。
 * 由 harness-run.mjs 在 jsdom 环境加载执行；断言在 harness-run.mjs 侧做。
 */
import { createRoot } from 'react-dom/client'
import Panel from '../src/index'
import * as core from '../shared/core'

// ── 内存 cap.kv（与真实键空间同构）───────────────────────────────────────────
const store = new Map<string, unknown>()
const NOW = Date.now()
const TODAY = core.dayKey(NOW)

const prof = core.normalizeProfile({ id: 'p1', name: '妈妈', note: '高血压' }, null).profile as never
const med = core.normalizeMed({ id: 'm1', name: '氨氯地平', spec: '5mg×24片', unit: '片' }, null).med as never
const batch = core.normalizeBatch({ id: 'b1', medId: 'm1', qty: 24, expiry: '2027-06-01' }, null).batch as never
const reg = core.normalizeRegimen({
  id: 'r1', profileId: 'p1', medId: 'm1', dose: 1, times: ['08:00', '20:00'],
  freq: { type: 'daily' }, startDate: '2026-10-01', note: '遵医嘱',
}, null).regimen as never
const logTaken = core.normalizeLog({ occKey: core.doseOccKey('r1', TODAY, '08:00'), regId: 'r1', date: TODAY, time: '08:00', status: 'taken', at: NOW - 3600_000 }, null, NOW).log as never

store.set('qingnang.profile.p1', prof)
store.set('qingnang.med.m1', med)
store.set('qingnang.batch.b1', batch)
store.set('qingnang.reg.r1', reg)
store.set(`qingnang.log.${core.doseOccKey('r1', TODAY, '08:00')}`, logTaken)
store.set('qingnang.settings', { graceMin: 60, lowDays: 5, expiryWarnDays: 90, soundOn: true })
store.set('qingnang.meta', {
  version: '0.1.0', pid: 1, startedAt: NOW, lastTickAt: NOW, bridge: '127.0.0.1:9820', degraded: false,
  counts: { profiles: 1, meds: 1, batches: 1, regimens: 1, logs: 1 }, doses: 1,
})
store.set('qingnang.doses', {
  at: NOW, date: TODAY,
  items: [{
    occKey: core.doseOccKey('r1', TODAY, '20:00'), profileId: 'p1', profileName: '妈妈',
    medId: 'm1', medName: '氨氯地平', unit: '片', amount: 1, time: '20:00',
    dueTs: new Date(new Date(TODAY).getTime() + 20 * 3600_000).getTime(), state: 'now',
  }],
})
store.set('qingnang.stocks', {
  at: NOW, today: TODAY,
  meds: {
    m1: {
      totalUsable: 23, totalExpired: 0, over: false, lastTakenAt: NOW - 3600_000,
      daysLeft: 12, ratePerDay: 1.8, estimated: false, urgency: 'watch',
      batches: [{ id: 'b1', qty: 24, remaining: 23, expiry: '2027-06-01', expired: false, note: '' }],
    },
  },
  refill: [{ medId: 'm1', name: '氨氯地平', spec: '5mg×24片', unit: '片', remaining: 23, expired: 0, ratePerDay: 1.8, estimated: false, daysLeft: 12, urgency: 'watch' }],
  expiry: [{ batchId: 'b1', medId: 'm1', medName: '氨氯地平', unit: '片', expiry: '2027-06-01', daysLeft: 215, qty: 24, band: 'ok', note: '' }],
  alerts: { dueNow: 1, overdue: 0, lowStock: 0, expiredBatches: 0, soonExpiry: 0 },
})

// ── stub 宿主 invoke ─────────────────────────────────────────────────────────
;(window as unknown as Record<string, unknown>).__POLARIS_HOST_INVOKE__ = async (cmd: string, args: Record<string, unknown>) => {
  if (cmd !== 'router_dispatch') throw new Error('未知命令 ' + cmd)
  const req = (args.req || {}) as { target: string; payload: { action: string; key?: string; value?: unknown } }
  if (req.target !== 'cap.kv') throw new Error('未知 target ' + req.target)
  const a = req.payload
  if (a.action === 'get') return { ok: true, result: { value: store.has(a.key!) ? store.get(a.key!) : null } }
  if (a.action === 'set') { store.set(a.key!, a.value); return { ok: true, result: {} } }
  if (a.action === 'delete') { store.delete(a.key!); return { ok: true, result: {} } }
  if (a.action === 'list') return { ok: true, result: { keys: [...store.keys()] } }
  throw new Error('未知 action ' + a.action)
}

const root = createRoot(document.getElementById('root')!)
root.render(<Panel pluginId="qingnang" />)
;(window as unknown as Record<string, unknown>).__HARNESS_STORE__ = store
;(window as unknown as Record<string, unknown>).__HARNESS_READY__ = true
console.log('[harness] mounted')
