/**
 * harness.tsx —— 面板浏览器目检：mock 宿主 invoke（内存 kv），罐头数据覆盖全部 UI 分支。
 * 构建：npx esbuild test/harness.tsx --bundle --format=iife --outfile=test/harness.js --jsx=automatic
 * 运行：node test/harness-serve.mjs 9833 → http://127.0.0.1:9833/
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import PiaoxiaPanel from '../src/Panel'
import * as core from '../shared/core'

// ── 内存 kv + mock 服务 ─────────────────────────────────────────────────────

const store = new Map<string, unknown>()

function inv(p: Partial<core.Invoice>): core.Invoice {
  return core.normalizeInvoice({ date: '2026-10-10', seller: { name: '某公司' }, ...p } as Partial<core.Invoice>, null)
}
function put(inv0: core.Invoice) { store.set('piaoxia.invoice.' + inv0.id, inv0) }

// 罐头：覆盖 待报销/在途/到账/退回/不报销/保修/逾期/报销单/无号码手录
put(inv({ total: 296.8, number: '24312000000123456789', date: '2026-10-15', seller: { name: '杭州某某餐饮管理有限公司' }, category: 'meal', status: 'pending' }))
put(inv({ total: 73.35, number: '24319000000011234567', date: '2026-10-20', seller: { name: '' }, category: 'transport', status: 'pending' }))
put(inv({ total: 5263, number: '12345678', code: '044032000110', kind: 'e_common', date: '2026-09-30', seller: { name: '上海某某软件技术有限公司' }, status: 'submitted', reimburseId: 'R202610-3', submittedAt: '2026-10-26' }))
put(inv({ total: 11300, number: '24122000000198765432', date: '2026-10-01', seller: { name: '深圳某某电子设备有限公司' }, status: 'settled', settledAt: '2026-10-25', warrantyMonths: 36, purpose: 'warranty' }))
put(inv({ total: 45, number: '', date: '2026-08-01', seller: { name: '张三个体出租车' }, status: 'pending', note: '纸质票' }))
put(inv({ total: 199, number: '24312000000999990001', date: '2026-07-11', seller: { name: '某某酒店' }, status: 'rejected', rejectNote: '抬头开错' }))
put(inv({ total: 88, number: '24312000000999990002', date: '2026-06-01', seller: { name: '某文具店' }, status: 'excluded' }))
const t1 = core.normalizeTitle({ name: '杭州某某网络科技有限公司', taxId: '91330106MA27XW1234', isDefault: true, bank: '某某银行杭州分行', account: '6222000011112222' }, null)
store.set('piaoxia.title.' + t1.id, t1)
store.set('piaoxia.meta', { port: 19871, token: 'harness-token', version: '0.1.0', archiveDir: 'C:/mock/dataroot/piaoxia', lastTickAt: new Date().toISOString() })

// 拦截服务请求：mock /api/probe 与 /api/collect（返回一张「新票」与一张「重复」）
const realFetch = window.fetch.bind(window)
;(window as unknown as { fetch: typeof fetch }).fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input)
  if (url.includes('/api/probe')) {
    return new Response(JSON.stringify({ ok: true, version: '0.1.0-harness', archiveDir: 'C:/mock/dataroot/piaoxia' }), { status: 200 })
  }
  if (url.includes('/api/collect')) {
    const body = JSON.parse(String(init?.body || '{}'))
    const files = body.files || []
    const results = files.map((f: { name: string }, i: number) => {
      if (i === 0) {
        return {
          name: f.name, ok: true, warnings: [], error: '', sha256: 'harness' + i,
          archivedPath: 'C:/mock/dataroot/piaoxia/24312000000888880001.pdf',
          invoice: inv({ total: 158, number: '24312000000888880001', date: '2026-10-28', seller: { name: '某某快餐' } }),
        }
      }
      return {
        name: f.name, ok: true, warnings: [], error: '', sha256: 'dup' + i, archivedPath: '',
        invoice: inv({ total: 296.8, number: '24312000000123456789' }),
      }
    })
    return new Response(JSON.stringify({ ok: true, results }), { status: 200 })
  }
  return realFetch(input as RequestInfo, init)
}

// ── mock 宿主 invoke ───────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

;(window as unknown as { __POLARIS_HOST_INVOKE__: unknown }).__POLARIS_HOST_INVOKE__ = async (
  cmd: string, args?: Record<string, unknown>,
) => {
  await sleep(40)
  if (cmd !== 'router_dispatch') throw new Error('mock 只支持 router_dispatch')
  const req = args?.req as { target: string, payload: { action: string, key?: string, value?: unknown } }
  if (req.target !== 'cap.kv') throw new Error('mock 只支持 cap.kv')
  const p = req.payload
  if (p.action === 'get') return { ok: true, result: { value: store.has(p.key!) ? store.get(p.key!) : null } }
  if (p.action === 'set') { store.set(p.key!, JSON.parse(JSON.stringify(p.value))); return { ok: true, result: { ok: true } } }
  if (p.action === 'delete') { store.delete(p.key!); return { ok: true, result: { ok: true } } }
  if (p.action === 'list') return { ok: true, result: { keys: Array.from(store.keys()) } }
  throw new Error('mock: 未知 action ' + p.action)
}

const root = createRoot(document.getElementById('root')!)
root.render(<PiaoxiaPanel pluginId="piaoxia" onSendToChat={(m) => { console.log('[sendToChat]', m); window.alert('sendToChat: ' + m) }} />)
