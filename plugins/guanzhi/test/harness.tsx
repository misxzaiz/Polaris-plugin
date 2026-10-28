/**
 * 观止面板渲染 harness（离线，浏览器人工/自动化点检）
 *   npx esbuild test/harness.tsx --bundle --format=iife --outfile=test/harness.js --jsx=automatic
 *   node test/harness-serve.mjs   →  http://127.0.0.1:9898
 * mock 宿主 invoke（内存 cap.kv）+ 罐头数据（覆盖全状态/全体裁/评分/心头好/跨年）。
 */
import * as core from '../shared/guanzhi-core.js'
import { createRoot } from 'react-dom/client'
import GuanzhiPanel from '../src/Panel'

// ── 内存 cap.kv（与 mcp-verify 同款协议）────────────────────────────────────
const store = new Map<string, unknown>()

function seed() {
  const now = Date.now()
  const day = (offset: number) => new Date(now + offset * 86400000)
  const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const mk = (over: Record<string, unknown>) => {
    const w = core.normalizeWork(over, now).work
    store.set(`guanzhi.work.${w.id}`, w)
  }
  // 完成今年各月分布
  mk({ title: '流浪地球2', kind: 'movie', status: 'done', rating: 9, year: 2023, creator: '郭帆', genre: '科幻', finishDate: ymd(day(-20)), note: '太空电梯封神', favorite: true })
  mk({ title: '沙丘', kind: 'movie', status: 'done', rating: 8.5, year: 2021, creator: '维伦纽瓦', finishDate: ymd(day(-40)) })
  mk({ title: '漫长的季节', kind: 'tv', status: 'done', rating: 9.5, year: 2023, finishDate: ymd(day(-60)), note: '往前看，别回头' })
  mk({ title: '长安的荔枝', kind: 'book', status: 'done', rating: 8, year: 2022, creator: '马伯庸', finishDate: ymd(day(-90)) })
  mk({ title: '塞尔达·王国之泪', kind: 'game', status: 'done', rating: 9.5, year: 2023, finishDate: ymd(day(-150)), genre: '开放世界' })
  mk({ title: '去有风的地方', kind: 'tv', status: 'done', rating: 7.5, finishDate: ymd(day(-200)) })
  // 进行中
  mk({ title: '三体', kind: 'book', status: 'active', startDate: ymd(day(-10)), creator: '刘慈欣' })
  mk({ title: '艾尔登法环', kind: 'game', status: 'active', startDate: ymd(day(-3)) })
  // 想看（躺龄不同）
  const old = core.normalizeWork({ title: '沙丘3', kind: 'movie', status: 'wish', createdAt: now - 100 * 86400000 }, now).work
  store.set(`guanzhi.work.${old.id}`, old)
  const wish2 = core.normalizeWork({ title: '奥本海默', kind: 'movie', status: 'wish', createdAt: now - 15 * 86400000 }, now).work
  store.set(`guanzhi.work.${wish2.id}`, wish2)
  // 弃
  mk({ title: '某大数据剧', kind: 'tv', status: 'dropped' })
}
seed()

;(window as unknown as { __POLARIS_HOST_INVOKE__: unknown }).__POLARIS_HOST_INVOKE__ = async (
  cmd: string,
  args: { req?: { target?: string; payload?: { action?: string; key?: string; value?: unknown } } } = {},
) => {
  if (cmd !== 'router_dispatch') throw new Error(`mock 未实现 ${cmd}`)
  const { target, payload } = args.req || {}
  if (target !== 'cap.kv') return { msgId: 'm', ok: false, error: 'mock 仅支持 cap.kv' }
  const { action, key, value } = payload || {}
  if (action === 'get') return { msgId: 'm', ok: true, result: { value: store.has(key!) ? store.get(key!) : null } }
  if (action === 'set') { store.set(key!, value === undefined ? null : value); return { msgId: 'm', ok: true, result: {} } }
  if (action === 'delete') { store.delete(key!); return { msgId: 'm', ok: true, result: {} } }
  if (action === 'list') return { msgId: 'm', ok: true, result: { keys: [...store.keys()] } }
  return { msgId: 'm', ok: false, error: '未知 action' }
}

const root = createRoot(document.getElementById('root')!)
root.render(<GuanzhiPanel pluginId="guanzhi" />)
