/**
 * 面板渲染 harness：mock __POLARIS_HOST_INVOKE__（内存 kv + 罐头作品）挂载真面板
 * 用法：esbuild 打包成 iife → harness.html 引用；node test/harness-serve.mjs 起静态服务。
 * 验证点：三 Tab 挂载/切换、示例载入→识别→预览→本地构建下载（exceljs 浏览器路径）、设置保存。
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import Panel from '../src/Panel'

const store = new Map<string, unknown>(Object.entries({
  'gezhi.settings': { schemaVersion: 1, exportDir: 'D:\\报表', theme: 'indigo' },
  'gezhi.book.demo1': {
    id: 'demo1', file: 'gezhi-20261028-1010-三月采购台账.xlsx', title: '三月采购台账',
    theme: 'indigo', sheetCount: 2, rowCount: 42, ts: Date.now() - 86400000,
    path: 'D:\\报表\\gezhi-20261028-1010-三月采购台账.xlsx',
  },
  'gezhi.book.demo2': {
    id: 'demo2', file: 'gezhi-20261027-1530-值班表.xlsx', title: '值班表',
    theme: 'slate', sheetCount: 1, rowCount: 12, ts: Date.now() - 2 * 86400000,
    path: 'D:\\报表\\gezhi-20261027-1530-值班表.xlsx',
  },
}))

window.__POLARIS_HOST_INVOKE__ = async (_cmd: string, args?: Record<string, unknown>) => {
  const req = (args as { req?: { target?: string; payload?: Record<string, unknown> } })?.req || {}
  const { target, payload } = req
  await new Promise((r) => setTimeout(r, 40))
  if (target !== 'cap.kv') return { msgId: 'x', ok: false, error: `unknown target ${target}` }
  const p = payload || {}
  if (p.action === 'get') return { msgId: 'x', ok: true, result: { value: store.has(String(p.key)) ? store.get(String(p.key)) : null } }
  if (p.action === 'set') { store.set(String(p.key), p.value); return { msgId: 'x', ok: true, result: { id: p.key } } }
  if (p.action === 'delete') { store.delete(String(p.key)); return { msgId: 'x', ok: true, result: { deleted: true } } }
  if (p.action === 'list') return { msgId: 'x', ok: true, result: { keys: [...store.keys()] } }
  return { msgId: 'x', ok: false, error: 'bad action' }
}

// 下载劫持：记录 blob 下载而不真弹（headless 可断言构建成功）
const realCreate = document.createElement.bind(document)
document.createElement = ((tag: string) => {
  const el = realCreate(tag)
  if (tag === 'a') {
    (el as HTMLAnchorElement).click = () => {
      const href = (el as HTMLAnchorElement).href || ''
      window.dispatchEvent(new CustomEvent('harness-download', { detail: { download: (el as HTMLAnchorElement).download, blob: href.startsWith('blob:') } }))
    }
  }
  return el
}) as typeof document.createElement

const root = createRoot(document.getElementById('root')!)
root.render(<Panel pluginId="gezhi" />)
