/**
 * 纸坊面板渲染 harness（离线，浏览器人工/自动化点检）
 *   npx esbuild test/harness.tsx --bundle --format=iife --outfile=test/harness.js --jsx=automatic --external:react --external:react/jsx-runtime
 *   node test/harness-serve.mjs   →  http://127.0.0.1:9899
 * mock 宿主 invoke（内存 cap.kv）+ 罐头 meta/settings/history；
 * 工作台可真实选文件（服务调用会失败——顺手验证错误路径的呈现）。
 */
import { createRoot } from 'react-dom/client'
import ZhifangPanel from '../src/Panel'

const store = new Map<string, unknown>()

store.set('zhifang.meta', {
  token: 'harness-token', port: 45999, version: '0.1.0',
  bridge: 'ok', startedAt: '2026-10-29T00:00:00Z', lastTickAt: '2026-10-29T01:00:00Z',
})
store.set('zhifang.settings', { outDir: 'C:\\Users\\demo\\Desktop', maxUploadMB: 128, historyCap: 200 })
store.set('zhifang.history.1', {
  id: '1', at: '2026-10-29T01:02:03Z', op: 'merge', source: 'mcp',
  inputs: ['合同A.pdf', '合同B.pdf'],
  outputs: [{ name: '合同A-合并.pdf', path: 'C:\\Users\\demo\\Desktop\\合同A-合并.pdf', size: 847 }],
  pages: 4, ms: 120, ok: true,
})
store.set('zhifang.history.2', {
  id: '2', at: '2026-10-28T09:00:00Z', op: 'text', source: 'panel', inputs: ['scan.pdf'],
  outputs: [], pages: 3, ms: 90, ok: false,
  error: 'scan.pdf 没有可提取的文字层：它很可能是扫描件/图片型 PDF，需要 OCR（本工具不做 OCR）',
})

;(globalThis as unknown as { __POLARIS_HOST_INVOKE__: unknown }).__POLARIS_HOST_INVOKE__ =
  async (cmd: string, args: { req: { target: string, payload: Record<string, unknown> } }) => {
    if (cmd !== 'router_dispatch') throw new Error('unexpected cmd ' + cmd)
    const { target, payload } = args.req
    if (target !== 'cap.kv') throw new Error('unexpected target ' + target)
    if (payload.action === 'get') return { ok: true, result: { value: store.get(String(payload.key)) } }
    if (payload.action === 'set') { store.set(String(payload.key), payload.value); return { ok: true, result: {} } }
    if (payload.action === 'delete') { store.delete(String(payload.key)); return { ok: true, result: {} } }
    if (payload.action === 'list') return { ok: true, result: { keys: [...store.keys()] } }
    throw new Error('unexpected action ' + String(payload.action))
  }

const el = document.getElementById('root') as HTMLElement
createRoot(el).render(<ZhifangPanel pluginId="zhifang" />)
