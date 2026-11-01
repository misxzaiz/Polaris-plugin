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
const YDAY = core.dayKey(NOW - core.DAY_MS)

const cat = (o: { id: string; name: string; group: string; budget?: number; isExtra?: boolean; order?: number }) =>
  core.normalizeCategory(o, null).cat as never
const exp = (o: { id: string; catId: string; amount: number; ts: number; vendorId?: string; note?: string }) =>
  core.normalizeExpense({ ...o, src: 'panel' }, null).expense as never

const project = core.normalizeProject({ name: '世纪花园', house: '3-502', totalBudget: 300000 }, null).project as never
store.set('zhuangxiu.project', project)
const cTile = cat({ name: '瓷砖', group: '泥瓦', budget: 8000, order: 0 })
const cHydro = cat({ name: '水电改造', group: '水电', budget: 15000, order: 1 })
const cExtra = cat({ name: '窗套加固', group: '木工', isExtra: true, order: 2 })
store.set(`zhuangxiu.cat.${(cTile as { id: string }).id}`, cTile)
store.set(`zhuangxiu.cat.${(cHydro as { id: string }).id}`, cHydro)
store.set(`zhuangxiu.cat.${(cExtra as { id: string }).id}`, cExtra)
const vendor = core.normalizeVendor({ name: '张师傅', role: '瓦工', phone: '13800000000' }, null).vendor as never
store.set(`zhuangxiu.ven.${(vendor as { id: string }).id}`, vendor)
store.set('zhuangxiu.exp.e1', exp({ id: 'e1', catId: (cTile as { id: string }).id, amount: 3200, ts: core.dayMinTs(TODAY, 480), vendorId: (vendor as { id: string }).id, note: '80x80 灰砖' }))
store.set('zhuangxiu.exp.e2', exp({ id: 'e2', catId: (cTile as { id: string }).id, amount: 4400, ts: core.dayMinTs(TODAY, 500) }))
store.set('zhuangxiu.exp.e3', exp({ id: 'e3', catId: (cExtra as { id: string }).id, amount: 800, ts: core.dayMinTs(YDAY, 600) }))
const mile1 = core.normalizeMilestone({ id: 'm1', title: '水电验收', date: YDAY }, null).mile as never
const mile2 = core.normalizeMilestone({ id: 'm2', title: '泥瓦验收', date: core.dayKey(NOW + 2 * core.DAY_MS) }, null).mile as never
store.set('zhuangxiu.mile.m1', mile1)
store.set('zhuangxiu.mile.m2', mile2)

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
root.render(<Panel pluginId="zhuangxiu" />)
;(window as unknown as Record<string, unknown>).__HARNESS_STORE__ = store
;(window as unknown as Record<string, unknown>).__HARNESS_READY__ = true
console.log('[harness] mounted')
