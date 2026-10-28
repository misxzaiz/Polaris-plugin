/**
 * 无头渲染 harness 入口：stub 宿主 invoke（内存 cap.kv + 种子）+ stub fetch（服务 API）
 * → 挂载面板。由 harness-run.mjs 在 jsdom 环境加载执行；断言在 harness-run.mjs 侧做。
 */
import { createRoot } from 'react-dom/client'
import Panel from '../src/index'

const store = new Map<string, unknown>()
const NOW = Date.now()

store.set('weibian.settings', {
  roots: ['C:\\Users\\demo\\Documents', 'D:\\notes'],
  extraExcludes: ['隐私'],
  maxDocs: 5000, maxFileMB: 20, maxTextKB: 256,
  includeHidden: false, enabled: true,
})
store.set('weibian.meta', { token: 'harness-token', port: 45990, version: '0.1.0', pid: 1 })
store.set('weibian.stats', {
  v: 1, docs: 42, tokens: 1987, bytes: 52_428_800, roots: 2, maxDocs: 5000,
  scanning: false, pending: 0, lastScanAt: NOW - 60_000, lastScanMs: 8123,
  capped: false, degraded: false,
  errors: [{ path: 'C:\\x\\扫描件.pdf', reason: 'no-text-layer', at: NOW - 60_000 }],
  byExt: { md: 18, pdf: 9, docx: 6, py: 5, html: 4 }, bootAt: NOW - 3_600_000,
})
store.set('weibian.recent', ['缓存 假象', '两总线架构'])

// ── stub 服务 API（fetch 拦截）───────────────────────────────────────────────
const realFetch = globalThis.fetch.bind(globalThis)
;(globalThis as unknown as { fetch: typeof fetch }).fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
  const u = String(url)
  const json = (obj: unknown) => new Response(JSON.stringify(obj), { headers: { 'Content-Type': 'application/json' } })
  if (u.includes('/api/search')) {
    return json({
      ok: true, query: '缓存 假象', total: 1, took: 7,
      results: [{
        id: 'abc123', path: 'C:\\Users\\demo\\Documents\\缓存策略笔记.md', name: '缓存策略笔记.md',
        ext: 'md', cat: 'text', score: 6.66, size: 1024, mtime: NOW - 86_400_000,
        snippet: { text: '定位到缓存命中率只有 50% 的假象问题，根因是流式 usage 双口径混用。', hits: [{ s: 3, e: 5 }, { s: 14, e: 16 }] },
      }],
    })
  }
  if (u.includes('/api/read')) {
    return json({ ok: true, path: 'C:\\Users\\demo\\Documents\\缓存策略笔记.md', total: 300, offset: 0, text: '第一行：缓存策略笔记全文预览 HarnessReadProbe。\n第二行：更多内容。', truncated: false, totalBytes: 1024 })
  }
  if (u.includes('/api/progress')) {
    return json({ ok: true, ...(store.get('weibian.stats') as object) })
  }
  if (u.includes('/api/reindex')) { return json({ ok: true }) }
  if (u.includes('/api/probe')) {
    return json({ ok: true, suggestions: [{ label: '桌面', path: 'C:\\Users\\demo\\Desktop' }], home: 'C:\\Users\\demo', checked: { path: 'D:\\notes2', exists: true, isDir: true } })
  }
  return realFetch(url as string, init)
}) as typeof fetch

// ── stub 宿主 invoke（内存 cap.kv）───────────────────────────────────────────
;(window as unknown as Record<string, unknown>).__POLARIS_HOST_INVOKE__ = async (cmd: string, args: Record<string, unknown>) => {
  if (cmd !== 'router_dispatch') throw new Error('未知命令 ' + cmd)
  const req = (args.req || {}) as { target: string, payload: { action: string, key?: string, value?: unknown } }
  if (req.target !== 'cap.kv') throw new Error('未知 target ' + req.target)
  const a = req.payload
  if (a.action === 'get') return { ok: true, result: { value: store.has(a.key!) ? store.get(a.key!) : null } }
  if (a.action === 'set') { store.set(a.key!, a.value); return { ok: true, result: {} } }
  if (a.action === 'delete') { store.delete(a.key!); return { ok: true, result: {} } }
  if (a.action === 'list') return { ok: true, result: { keys: [...store.keys()] } }
  throw new Error('未知 action ' + a.action)
}

const root = createRoot(document.getElementById('root')!)
root.render(<Panel pluginId="weibian" />)
;(window as unknown as Record<string, unknown>).__HARNESS_STORE__ = store
