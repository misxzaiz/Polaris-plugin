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

const mama = core.normalizeMember({ id: 'p1', name: '妈妈', heightCm: 160, note: '高血压随访' }, null).member as never
const baba = core.normalizeMember({ id: 'p2', name: '爸爸' }, null).member as never

const rec = (o: Partial<Record<string, unknown>> & { id: string; profileId: string; kind: string; ts: number }) =>
  core.normalizeRecord({ ...o, src: 'panel' }, NOW) as { record: never }

store.set('maian.member.p1', mama)
store.set('maian.member.p2', baba)
store.set(`maian.day.${TODAY}`, [
  rec({ id: 's1', profileId: 'p1', kind: 'bp', ts: core.dayMinTs(TODAY, 480), sys: 152, dia: 95, pulse: 78, note: '服药前' }).record,
  rec({ id: 's2', profileId: 'p2', kind: 'bp', ts: core.dayMinTs(TODAY, 500), sys: 118, dia: 76 }).record,
  rec({ id: 's3', profileId: 'p1', kind: 'bg', ts: core.dayMinTs(TODAY, 540), mmol: 6.5, slot: 'fasting' }).record,
])
const YDAY = core.dayKey(NOW - core.DAY_MS)
store.set(`maian.day.${YDAY}`, [
  rec({ id: 'y1', profileId: 'p1', kind: 'bp', ts: core.dayMinTs(YDAY, 490), sys: 148, dia: 92 }).record,
])

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
root.render(<Panel pluginId="maian" />)
;(window as unknown as Record<string, unknown>).__HARNESS_STORE__ = store
;(window as unknown as Record<string, unknown>).__HARNESS_READY__ = true
console.log('[harness] mounted')
