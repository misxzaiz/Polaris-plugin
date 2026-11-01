/**
 * 无头渲染 harness 入口：stub 宿主 invoke（内存 cap.kv + 种子数据）→ 挂载面板。
 * 由 harness-run.mjs 在 jsdom 环境加载执行；断言在 harness-run.mjs 侧做。
 * 零 mock 业务逻辑——种子用 shared/core 真实 normalize 合成，快照用 familySnapshot 现算。
 */
import { createRoot } from 'react-dom/client'
import Panel from '../src/index'
import * as core from '../shared/core'

// ── 内存 cap.kv（与真实键空间同构）───────────────────────────────────────────
const store = new Map<string, unknown>()
const NOW = Date.now()
const DAY = 86400000
const dk = (ts: number) => core.dayKey(ts)

const car = core.normalizeCar({ id: 'car1', name: '家里的白SUV', kind: 'fuel', initialOdometer: 45000, plate: '浙A·88888' }, null).car as never
const ev = core.normalizeCar({ id: 'car2', name: '电驴', kind: 'ev', initialOdometer: 1000 }, null).car as never
const e1 = core.normalizeEnergy({ id: 'e1', carId: 'car1', date: dk(NOW - 40 * DAY), odometer: 45300, amount: 40, cost: 320, filled: true }, null, car as never).energy as never
const e2 = core.normalizeEnergy({ id: 'e2', carId: 'car1', date: dk(NOW - 10 * DAY), odometer: 46200, amount: 42.3, cost: 350, filled: true, station: '中石化' }, null, car as never).energy as never
const item = core.normalizeItem({ id: 'it1', carId: 'car1', name: '机油机滤', cycle: { kmInterval: 5000 }, lastOdometer: 45300, lastDate: dk(NOW - 40 * DAY) }, null).item as never
const itemTire = core.normalizeItem({ id: 'it2', carId: 'car1', name: '轮胎换位', cycle: { kmInterval: 10000 }, lastOdometer: 45000 }, null).item as never
const svc = core.normalizeSvc({ id: 'sv1', carId: 'car1', type: 'maintenance', date: dk(NOW - 40 * DAY), odometer: 45300, cost: 480, vendor: '街口修理铺', desc: '小保养换机油机滤', itemName: '机油机滤' }, null).svc as never
const docSoon = core.normalizeDoc({ id: 'doc1', carId: 'car1', type: '交强险', expiry: dk(NOW + 12 * DAY) }, null).doc as never
const docPersonal = core.normalizeDoc({ id: 'doc2', type: '驾驶证', expiry: dk(NOW + 200 * DAY) }, null).doc as never

store.set('chexia.car.car1', car)
store.set('chexia.car.car2', ev)
store.set('chexia.energy.e1', e1)
store.set('chexia.energy.e2', e2)
store.set('chexia.item.it1', item)
store.set('chexia.item.it2', itemTire)
store.set('chexia.svc.sv1', svc)
store.set('chexia.doc.doc1', docSoon)
store.set('chexia.doc.doc2', docPersonal)
store.set('chexia.settings', { docWarnDays: 30, itemWatchKm: 500, itemWatchDays: 14, costWindowDays: 90 })

const cars = [car, ev] as never[]
const energies = [e1, e2] as never[]
const items = [item, itemTire] as never[]
const svcs = [svc] as never[]
const docs = [docSoon, docPersonal] as never[]
const settings = core.normalizeSettings({ docWarnDays: 30, itemWatchKm: 500, itemWatchDays: 14, costWindowDays: 90 })
store.set('chexia.snapshot', core.familySnapshot(cars, energies, items, svcs, docs, NOW, settings))
store.set('chexia.meta', {
  version: '0.1.0', pid: 1, startedAt: NOW, lastTickAt: NOW, bridge: '127.0.0.1:9820', degraded: false,
  counts: { cars: 2, items: 2, docs: 2, energies: 2, svcs: 1 },
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
root.render(<Panel pluginId="chexia" />)
;(window as unknown as Record<string, unknown>).__HARNESS_STORE__ = store
;(window as unknown as Record<string, unknown>).__HARNESS_READY__ = true
console.log('[harness] mounted')
