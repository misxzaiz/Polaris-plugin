/**
 * 面板渲染 harness：mock __POLARIS_HOST_INVOKE__（内存 kv + 罐头数据）挂载真面板
 * 用法： esbuild 打包成 iife → harness.html 引用；配合 harness-serve.mjs 静态服务。
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import Panel from '../src/Panel'

const DAY = 86400000
const now = Date.now()

const canned: Record<string, unknown> = {
  'tether.settings': { v: 1, defaultCadenceDays: 30, driftGraceDays: 14, birthdayDays: 14, dueWarnDays: 3 },
  'tether.people': {
    v: 1,
    order: ['p1', 'p2', 'p3', 'p4'],
    byId: {
      p1: {
        id: 'p1', name: '张三', alias: '张总', relation: '客户', tags: ['重要客户', '年度合同'],
        howMet: '2023 年行业展会', birthday: '11-05', contacts: { wechat: 'zhang_total', phone: '138xxxx' },
        cadenceDays: 30, note: '喜欢喝茶，忌口香菜', pinned: true, createdAt: now - 90 * DAY, updatedAt: now - 3 * DAY,
      },
      p2: {
        id: 'p2', name: '李四', relation: '朋友', birthday: '1990-06-15', contacts: { wechat: 'lisi' },
        cadenceDays: 7, createdAt: now - 200 * DAY, updatedAt: now - 20 * DAY,
      },
      p3: {
        id: 'p3', name: '王阿姨', relation: '家人', contacts: { phone: '139xxxx' },
        createdAt: now - 60 * DAY, updatedAt: now - 60 * DAY,
      },
      p4: {
        id: 'p4', name: '赵六', relation: '同事', archivedAt: now - 30 * DAY,
        createdAt: now - 120 * DAY, updatedAt: now - 30 * DAY,
      },
    },
  },
  'tether.promises': {
    v: 1,
    byId: {
      a: { id: 'a', personId: 'p1', direction: 'iowe', text: '周五前给方案', due: tomorrowKey(1), createdAt: now - 5 * DAY, status: 'open' },
      b: { id: 'b', personId: 'p1', direction: 'iowe', text: '昨天的报价单', due: yesterdayKey(), createdAt: now - 10 * DAY, status: 'open' },
      c: { id: 'c', personId: 'p2', direction: 'owedme', text: '等他发设计稿', createdAt: now - 20 * DAY, status: 'open' },
      d: { id: 'd', personId: 'p2', direction: 'iowe', text: '帮他修电脑（已完成）', createdAt: now - 40 * DAY, status: 'done', closedAt: now - 30 * DAY, closeNote: '搞定了' },
    },
  },
  'tether.journal': {
    v: 1,
    events: [
      { id: 'e1', at: now - 3 * DAY, personId: 'p1', type: 'contact', channel: '见面', text: '聊了续约，下周出合同初稿' },
      { id: 'e2', at: now - 10 * DAY, personId: 'p1', type: 'favor', direction: 'gave', text: '帮他对接了物流资源' },
      { id: 'e3', at: now - 20 * DAY, personId: 'p2', type: 'contact', channel: '电话', text: '闲聊近况，他在换工作' },
      { id: 'e4', at: now - 15 * DAY, personId: 'p3', type: 'note', text: '血压有点高，提醒她复查' },
      { id: 'e5', at: now - 25 * DAY, personId: 'p2', type: 'favor', direction: 'got', text: '帮我带了特产' },
    ],
  },
}

function tomorrowKey(days: number) {
  const d = new Date(now + days * DAY)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function yesterdayKey() {
  return tomorrowKey(-1)
}

const store = new Map(Object.entries(canned))
;(window as unknown as Record<string, unknown>).__POLARIS_HOST_INVOKE__ = async (
  cmd: string, args?: Record<string, any>,
) => {
  await new Promise((r) => setTimeout(r, 10))
  if (cmd === 'router_dispatch') {
    const { target, payload } = (args as any).req
    if (target === 'cap.kv') {
      const { action, key, value } = payload
      if (action === 'get') return { msgId: 'h', ok: true, result: { value: store.has(key) ? store.get(key) : null } }
      if (action === 'set') { store.set(key, value); return { msgId: 'h', ok: true, result: {} } }
      if (action === 'delete') { store.delete(key); return { msgId: 'h', ok: true, result: {} } }
      if (action === 'list') return { msgId: 'h', ok: true, result: { keys: [...store.keys()] } }
    }
  }
  return { ok: false, error: `mock 不支持 ${cmd}` }
}

const root = createRoot(document.getElementById('root')!)
root.render(<Panel pluginId="tether" />)
