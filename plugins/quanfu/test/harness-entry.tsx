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

const loanA = core.normalizeLoan({
  id: 'fA', name: '商贷', kind: 'mortgage', method: 'annuity',
  principal: 1000000, annualRate: 3.6, startDate: '2021-03-01', termMonths: 360,
  repricing: { day: '01-01', cycleMonths: 12 }, groupId: 'home', note: '无违约金',
}, null).loan as never
const loanB = core.normalizeLoan({
  id: 'fB', name: '公积金', kind: 'mortgage', method: 'annuity',
  principal: 600000, annualRate: 2.85, startDate: '2021-03-01', termMonths: 360, groupId: 'home',
}, null).loan as never
const evRate = core.normalizeEvent({ type: 'rate', loanId: 'fA', date: '2025-01-01', rate: 3.3, note: '重定价' }, null).ev as never
const evCp = core.normalizeEvent({ type: 'checkpoint', loanId: 'fA', date: core.dayKey(NOW - 3 * core.DAY_MS), amount: 883000 }, null).ev as never

store.set('quanfu.loan.fA', loanA)
store.set('quanfu.loan.fB', loanB)
store.set('quanfu.ev.rate|fA|2025-01-01', evRate)
store.set(`quanfu.ev.${(evCp as { occKey: string }).occKey}`, evCp)
store.set('quanfu.settings', { warnDays: 3, repricingWarnDays: 30, driftWarn: 100 })

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
root.render(<Panel pluginId="quanfu" onSendToChat={() => {}} />)
