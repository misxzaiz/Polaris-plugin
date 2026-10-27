/**
 * 面板渲染 harness（仅开发/验证用，不进安装包）
 *
 * 目的：在没有宿主 shell 的浏览器里加载 dist/panel.js，用 mock 的
 * __POLARIS_HOST_INVOKE__ 喂 canned cap.kv 数据，验证面板可渲染、
 * QR 可生成、Tab 可切换（白屏/Invalid hook call 类问题在此暴露）。
 *
 * 构建：npx esbuild test/harness.tsx --bundle --format=iife
 *       --outfile=test/harness.bundle.js --jsx=automatic
 * 打开：node test/harness-serve.mjs → http://127.0.0.1:19890/harness.html
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import PanelEntry from '../dist/panel.js'

const SETTINGS = { pin: '825110', ttlHours: 72, maxSizeMb: 2048, totalCapMb: 10240 }
const META = {
  version: '0.1.0', pid: 1234, startedAt: Date.now() - 60_000, lastTickAt: Date.now(),
  bridge: '127.0.0.1:9820', degraded: false, port: 9867,
  lanUrl: 'http://192.168.1.100:9867', lanUrls: ['192.168.1.100'],
  dropDir: 'D:/app/polaris-drop', itemCount: 2, storeBytes: 1536, settings: SETTINGS,
}
const ITEMS = [
  { id: 'aaaaaaaaaaaa', name: '相机样张.jpg', size: 2_392_064, at: Date.now() - 300_000, expiresAt: Date.now() + 72 * 3600_000, from: 'phone' },
  { id: 'bbbbbbbbbbbb', name: '季度报表.xlsx', size: 48_128, at: Date.now() - 900_000, expiresAt: Date.now() + 71 * 3600_000, from: 'ai', note: 'AI 投递' },
]
const KV: Record<string, unknown> = {
  'pdrop.meta': META,
  'pdrop.items': { at: Date.now(), items: ITEMS },
  'pdrop.settings': SETTINGS,
  'pdrop.event.1': { type: 'recv', at: Date.now() - 300_000, summary: '手机上传 相机样张.jpg（2.3 MB）' },
}

;(window as unknown as Record<string, unknown>).__POLARIS_HOST_INVOKE__ = async (
  cmd: string, args?: Record<string, unknown>,
) => {
  if (cmd !== 'router_dispatch') throw new Error(`harness: 未知命令 ${cmd}`)
  const req = (args && args.req) as { target: string; payload: Record<string, unknown> }
  const { target, payload } = req
  if (target === 'cap.kv') {
    const action = payload.action as string
    if (action === 'get') return { ok: true, result: { value: KV[payload.key as string] } }
    if (action === 'list') return { ok: true, result: { keys: Object.keys(KV).filter((k) => k.startsWith('pdrop.event.')) } }
    return { ok: true, result: {} }
  }
  if (target === 'cap.pluginServiceManager' && payload.action === 'list_status') {
    return { ok: true, result: [{ pluginId: 'pocket-drop', serviceId: 'drop-service', status: 'running' }] }
  }
  return { ok: true, result: {} }
}

const root = document.getElementById('root')
if (!root) throw new Error('harness: 缺少 #root')
createRoot(root).render(React.createElement(PanelEntry, { pluginId: 'pocket-drop' }))
