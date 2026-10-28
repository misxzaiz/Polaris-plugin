/**
 * 面板浏览器 harness（打包内联 React + 内存版宿主桥，真实渲染 dist 同源代码）
 * 用法：npx esbuild test/harness.tsx --bundle --outfile=test/harness.built.js
 *      然后 test/harness.html 直接打开（或起静态服务）。
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import QimuPanel from '../src/Panel'

// 内存版 cap.kv（面板所有能力面）
const mem = new Map<string, unknown>()
;(window as unknown as Record<string, unknown>).__POLARIS_HOST_INVOKE__ = async (cmd: string, args?: Record<string, unknown>) => {
  if (cmd !== 'router_dispatch') throw new Error('harness 只支持 router_dispatch')
  const req = (args as { req?: { target?: string; payload?: Record<string, unknown> } }).req || {}
  if (req.target !== 'cap.kv') throw new Error('harness 只支持 cap.kv')
  const p = req.payload || {}
  let result: Record<string, unknown> = {}
  if (p.action === 'get') result = { value: (mem.get(String(p.key)) ?? null) }
  else if (p.action === 'set') { mem.set(String(p.key), p.value); result = {} }
  else if (p.action === 'delete') { mem.delete(String(p.key)); result = {} }
  else if (p.action === 'list') result = { keys: [...mem.keys()] }
  else throw new Error('harness 不支持 action: ' + String(p.action))
  // 模拟宿主网络延迟
  await new Promise((r) => setTimeout(r, 60))
  return { msgId: 'h', ok: true, result, error: null }
}

function App() {
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0d1017' }}>
      <QimuPanel pluginId="qimu" onSendToChat={() => {}} />
    </div>
  )
}

const root = createRoot(document.getElementById('root')!)
root.render(<App />)
