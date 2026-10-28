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
const T = core.dayKey(NOW)

function mkPolicy(seed: Record<string, unknown>) {
  return core.normalizePolicy(seed, null).policy as never
}
function mkEv(seed: Record<string, unknown>) {
  return core.normalizeEvent(seed, null).ev as never
}

// 成员
const self = core.normalizeMember({ name: '本人', relation: 'self' }, null).member as never
const wife = core.normalizeMember({ name: '妻子', relation: 'spouse' }, null).member as never
const kid = core.normalizeMember({ name: '大娃', relation: 'child' }, null).member as never
const selfId = (self as { id: string }).id
const wifeId = (wife as { id: string }).id
const kidId = (kid as { id: string }).id

// 保单：宽限期（医疗）/ 黄榜（重疾，nextPay=T+13d）/ 中止期（寿险）/ 等待期（意外）/ 年金
const pGrace = mkPolicy({ name: '好医保', kind: 'medical', insuredId: selfId, company: '人保健康', coverage: 3000000, premium: 233, freq: 'yearly', payYears: 20, startDate: core.addDays(core.addMonths(T, -12), -9) })
const pYellow = mkPolicy({ name: '平安少儿重疾', kind: 'critical', insuredId: kidId, company: '平安人寿', coverage: 500000, premium: 4000, freq: 'yearly', payYears: 20, startDate: core.addDays(core.addMonths(T, -12), 13) })
const pLapse = mkPolicy({ name: '定海柱', kind: 'life', insuredId: selfId, company: '国富', coverage: 1000000, premium: 900, freq: 'yearly', payYears: 30, startDate: core.addDays(core.addMonths(T, -12), -100) })
const pWaiting = mkPolicy({ name: '小蜜蜂', kind: 'accident', insuredId: wifeId, company: '太保', coverage: 200000, premium: 68, freq: 'yearly', startDate: core.addDays(T, -10), waitingDays: 90 })
const pAnnuity = mkPolicy({ name: '养老年金', kind: 'annuity', insuredId: selfId, company: '泰康', premium: 10000, freq: 'yearly', payYears: 10, startDate: core.addDays(core.addMonths(T, -12), 40) })

const evPay = mkEv({ type: 'pay', policyId: (pGrace as { id: string }).id, date: core.addDays(T, -9) })
const evClaim = mkEv({ type: 'claim', policyId: (pGrace as { id: string }).id, date: core.addDays(T, -30), amount: 8000, note: '住院医疗' })

store.set('jinkui.member.' + selfId, self)
store.set('jinkui.member.' + wifeId, wife)
store.set('jinkui.member.' + kidId, kid)
for (const p of [pGrace, pYellow, pLapse, pWaiting, pAnnuity]) {
  store.set(`jinkui.policy.${(p as { id: string }).id}`, p)
}
store.set(`jinkui.ev.${(evPay as { occKey: string }).occKey}`, evPay)
store.set(`jinkui.ev.${(evClaim as { occKey: string }).occKey}`, evClaim)
store.set('jinkui.settings', { graceDays: 60, warnDays: 30 })

// ── stub 宿主 invoke ─────────────────────────────────────────────────────────
;(window as unknown as Record<string, unknown>).__POLARIS_HOST_INVOKE__ = async (cmd: string, args: Record<string, unknown>) => {
  if (cmd !== 'router_dispatch') throw new Error('未知命令 ' + cmd)
  const req = (args.req || {}) as { target: string; payload: { action: string; key?: string; value?: unknown } }
  if (req.target !== 'cap.kv') throw new Error('未知 target ' + req.target)
  const a = req.payload
  if (a.action === 'list') return { ok: true, result: { keys: [...store.keys()] } }
  if (a.action === 'get') return { ok: true, result: { value: store.has(a.key!) ? store.get(a.key!) : null } }
  if (a.action === 'set') { store.set(a.key!, a.value); return { ok: true, result: {} } }
  if (a.action === 'delete') { store.delete(a.key!); return { ok: true, result: {} } }
  throw new Error('未知 action ' + a.action)
}
;(window as unknown as Record<string, unknown>).__HARNESS_STORE__ = store

const root = createRoot(document.getElementById('root')!)
root.render(<Panel pluginId="jinkui" onSendToChat={() => {}} />)
