/**
 * 面板渲染 harness：mock __POLARIS_HOST_INVOKE__（内存 kv + 罐头数据）挂载真面板
 * 用法：esbuild 打包成 iife → harness.html 引用；node test/harness-serve.mjs 起静态服务。
 * confirm 铃接为自动确认（window.confirm = () => true），便于自动化走取消/删除流。
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import Panel from '../src/Panel'

window.confirm = () => true

const DAY = 86400000
const now = Date.now()
const ymd = (offsetDays: number) => {
  const d = new Date(now + offsetDays * DAY)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const subs: Record<string, unknown> = {
  'changqi.sub.a': {
    id: 'a', name: '爱奇艺黄金会员', amount: 25, currency: 'CNY', cycle: 'monthly',
    anchorDate: ymd(0), channel: 'wechat', category: '影视音乐', status: 'active',
    note: '连续包月', createdAt: now - 90 * DAY, updatedAt: now - 5 * DAY,
  },
  'changqi.sub.b': {
    id: 'b', name: 'AI 助手 Pro', amount: 20, currency: 'CNY', cycle: 'monthly',
    anchorDate: ymd(-7), channel: 'card', category: 'AI 订阅', status: 'trial',
    trialEndsAt: ymd(3), note: '体验中，记得评估', createdAt: now - 7 * DAY, updatedAt: now - 2 * DAY,
  },
  'changqi.sub.c': {
    id: 'c', name: '阿里云盘 VIP', amount: 298, currency: 'CNY', cycle: 'yearly',
    anchorDate: ymd(10), channel: 'alipay', category: '云存储', status: 'active',
    createdAt: now - 355 * DAY, updatedAt: now - 10 * DAY,
  },
  'changqi.sub.d': {
    id: 'd', name: '网易云音乐黑胶', amount: 15, currency: 'CNY', cycle: 'monthly',
    anchorDate: ymd(-5), channel: 'apple', category: '影视音乐', status: 'active',
    createdAt: now - 200 * DAY, updatedAt: now - 5 * DAY,
  },
  'changqi.sub.e': {
    id: 'e', name: '旧健身 App', amount: 30, currency: 'CNY', cycle: 'monthly',
    anchorDate: ymd(-40), channel: 'alipay', category: '生活服务', status: 'cancelled',
    note: '已改去跑步', createdAt: now - 300 * DAY, updatedAt: now - 10 * DAY,
  },
}

const store = new Map<string, unknown>(Object.entries({
  'changqi.settings': { schemaVersion: 1, currencySymbol: '¥', remindDays: 3, trialWarnDays: 3 },
  ...subs,
}))

window.__POLARIS_HOST_INVOKE__ = async (_cmd: string, args?: Record<string, unknown>) => {
  const req = (args as { req?: { target?: string; payload?: Record<string, unknown> } })?.req || {}
  const { target, payload } = req
  await new Promise((r) => setTimeout(r, 60))
  if (target !== 'cap.kv') return { msgId: 'x', ok: false, error: `unknown target ${target}` }
  const p = payload || {}
  if (p.action === 'get') return { msgId: 'x', ok: true, result: { value: store.has(String(p.key)) ? store.get(String(p.key)) : null } }
  if (p.action === 'set') { store.set(String(p.key), p.value); return { msgId: 'x', ok: true, result: { id: p.key } } }
  if (p.action === 'delete') { store.delete(String(p.key)); return { msgId: 'x', ok: true, result: { deleted: true } } }
  if (p.action === 'list') return { msgId: 'x', ok: true, result: { keys: [...store.keys()] } }
  return { msgId: 'x', ok: false, error: 'bad action' }
}

const root = createRoot(document.getElementById('root')!)
root.render(<Panel pluginId="changqi" />)
