/**
 * 面板渲染 harness：mock __POLARIS_HOST_INVOKE__（内存 kv + 罐头数据）挂载真面板
 * 用法：esbuild 打包成 iife → harness.html 引用；node test/harness-serve.mjs 起静态服务。
 * 罐头覆盖全部 UI 分支：在途面试（近期日程）/ 跟进到期 / 两份 offer 对比 / wish / 被拒。
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import Panel from '../src/Panel'

const DAY = 86400000
const now = Date.now()
const iso = (offsetMs: number) => new Date(now + offsetMs).toISOString()
const dhi = (days: number, h: number, mi: number) => {
  const d = new Date(now + days * DAY)
  d.setHours(h, mi, 0, 0)
  return d.toISOString()
}

const store = new Map<string, unknown>(Object.entries({
  'wenjin.settings': { schemaVersion: 1, followUpDays: 5, remindLeadHours: 24 },
  'wenjin.company.c1': { id: 'c1', name: '星辰科技', industry: '互联网', note: '', createdAt: iso(-30 * DAY), updatedAt: iso(-20 * DAY) },
  'wenjin.company.c2': { id: 'c2', name: '云海信息', industry: '软件', note: '', createdAt: iso(-20 * DAY), updatedAt: iso(-12 * DAY) },
  'wenjin.company.c3': { id: 'c3', name: '极光数据', industry: '大数据', note: '', createdAt: iso(-40 * DAY), updatedAt: iso(-10 * DAY) },
  'wenjin.company.c4': { id: 'c4', name: '蓝湖网络', industry: 'SaaS', note: '', createdAt: iso(-25 * DAY), updatedAt: iso(-8 * DAY) },
  'wenjin.company.c5': { id: 'c5', name: '沧海教育', industry: '教育', note: '', createdAt: iso(-9 * DAY), updatedAt: iso(-9 * DAY) },
  'wenjin.company.c6': { id: 'c6', name: '玄武云', industry: '云计算', note: '', createdAt: iso(-50 * DAY), updatedAt: iso(-18 * DAY) },

  'wenjin.resume.r1': { id: 'r1', label: '版本A-质量方向', content: '# 简历 A\n量化改进……', note: '突出平台指标', createdAt: iso(-30 * DAY), updatedAt: iso(-30 * DAY) },
  'wenjin.resume.r2': { id: 'r2', label: '版本B-全栈通用', content: '', note: '还没写正文', createdAt: iso(-15 * DAY), updatedAt: iso(-15 * DAY) },

  'wenjin.app.a1': {
    id: 'a1', companyId: 'c1', companyName: '星辰科技', title: '前端工程师', channel: 'referral',
    status: 'interview', jd: '负责质量效率平台前端，React + Node。', salaryPosted: '30-45k·15薪',
    location: '北京', resumeId: 'r1', appliedAt: dhi(-20, 9, 0), archived: false,
    note: '内推人：老周', createdAt: iso(-20 * DAY), updatedAt: dhi(-3, 14, 0),
  },
  'wenjin.app.a2': {
    id: 'a2', companyId: 'c2', companyName: '云海信息', title: '后端工程师', channel: 'boss',
    status: 'applied', jd: '', salaryPosted: '25-35k·14薪', location: '上海', resumeId: 'r2',
    appliedAt: dhi(-12, 10, 30), archived: false, note: '', createdAt: iso(-12 * DAY), updatedAt: iso(-12 * DAY),
  },
  'wenjin.app.a3': {
    id: 'a3', companyId: 'c3', companyName: '极光数据', title: '数据分析师', channel: 'website',
    status: 'offered', jd: '', salaryPosted: '28-40k', location: '杭州', resumeId: 'r1',
    appliedAt: dhi(-30, 9, 0), archived: false, note: '', createdAt: iso(-30 * DAY), updatedAt: dhi(-2, 11, 0),
  },
  'wenjin.app.a4': {
    id: 'a4', companyId: 'c4', companyName: '蓝湖网络', title: '测试开发工程师', channel: 'boss',
    status: 'offered', jd: '', salaryPosted: '', location: '深圳', resumeId: '',
    appliedAt: dhi(-25, 15, 0), archived: false, note: '', createdAt: iso(-25 * DAY), updatedAt: dhi(-4, 16, 0),
  },
  'wenjin.app.a5': {
    id: 'a5', companyId: 'c5', companyName: '沧海教育', title: '运营专员', channel: 'other',
    status: 'wish', jd: '', salaryPosted: '', location: '成都', resumeId: '',
    appliedAt: '', archived: false, note: '先观望', createdAt: iso(-9 * DAY), updatedAt: iso(-9 * DAY),
  },
  'wenjin.app.a6': {
    id: 'a6', companyId: 'c6', companyName: '玄武云', title: '运维工程师', channel: 'liepin',
    status: 'rejected', jd: '', salaryPosted: '', location: '', resumeId: '',
    appliedAt: dhi(-22, 9, 0), archived: false, note: '', createdAt: iso(-22 * DAY), updatedAt: dhi(-18, 10, 0),
  },

  'wenjin.event.e1': { id: 'e1', appId: 'a1', type: 'applied', at: dhi(-20, 9, 0), title: '', detail: '老周内推', questions: [], outcome: '', remindAt: '', createdAt: iso(-20 * DAY), updatedAt: iso(-20 * DAY) },
  'wenjin.event.e2': { id: 'e2', appId: 'a1', type: 'screen', at: dhi(-15, 10, 0), title: '', detail: 'HR 初聊，约一面', questions: [], outcome: '', remindAt: '', createdAt: iso(-15 * DAY), updatedAt: iso(-15 * DAY) },
  'wenjin.event.e3': {
    id: 'e3', appId: 'a1', type: 'interview', at: dhi(1, 10, 0), title: '一面',
    detail: '手写防抖 + 项目深挖', questions: ['手写防抖', '介绍质量平台项目', 'React fiber 原理'],
    outcome: '', remindAt: dhi(0, 18, 0), createdAt: dhi(-3, 14, 0), updatedAt: dhi(-3, 14, 0),
  },
  'wenjin.event.e4': { id: 'e4', appId: 'a2', type: 'applied', at: dhi(-12, 10, 30), title: '', detail: 'BOSS 打招呼后投递', questions: [], outcome: '', remindAt: '', createdAt: iso(-12 * DAY), updatedAt: iso(-12 * DAY) },
  'wenjin.event.e5': { id: 'e5', appId: 'a3', type: 'applied', at: dhi(-30, 9, 0), title: '', detail: '', questions: [], outcome: '', remindAt: '', createdAt: iso(-30 * DAY), updatedAt: iso(-30 * DAY) },
  'wenjin.event.e6': { id: 'e6', appId: 'a3', type: 'screen', at: dhi(-20, 11, 0), title: '', detail: '官网投后 HR 主动联系', questions: [], outcome: '', remindAt: '', createdAt: iso(-20 * DAY), updatedAt: iso(-20 * DAY) },
  'wenjin.event.e7': { id: 'e7', appId: 'a3', type: 'interview', at: dhi(-10, 14, 0), title: '业务面', detail: 'SQL + 案例分析', questions: ['分析过最得意的案例'], outcome: 'pass', remindAt: '', createdAt: iso(-10 * DAY), updatedAt: iso(-10 * DAY) },
  'wenjin.event.e8': { id: 'e8', appId: 'a3', type: 'offer', at: dhi(-2, 11, 0), title: '口头 offer', detail: 'HR 电话沟通薪资结构', questions: [], outcome: '', remindAt: '', createdAt: dhi(-2, 11, 0), updatedAt: dhi(-2, 11, 0) },
  'wenjin.event.e9': { id: 'e9', appId: 'a4', type: 'applied', at: dhi(-25, 15, 0), title: '', detail: '', questions: [], outcome: '', remindAt: '', createdAt: iso(-25 * DAY), updatedAt: iso(-25 * DAY) },
  'wenjin.event.e10': { id: 'e10', appId: 'a4', type: 'interview', at: dhi(-8, 15, 0), title: '技术面', detail: '测试平台设计', questions: ['如何设计用例优先级'], outcome: 'pass', remindAt: '', createdAt: iso(-8 * DAY), updatedAt: iso(-8 * DAY) },
  'wenjin.event.e11': { id: 'e11', appId: 'a4', type: 'offer', at: dhi(-4, 16, 0), title: '', detail: '邮件 offer', questions: [], outcome: '', remindAt: '', createdAt: dhi(-4, 16, 0), updatedAt: dhi(-4, 16, 0) },
  'wenjin.event.e12': { id: 'e12', appId: 'a6', type: 'applied', at: dhi(-22, 9, 0), title: '', detail: '', questions: [], outcome: '', remindAt: '', createdAt: iso(-22 * DAY), updatedAt: iso(-22 * DAY) },
  'wenjin.event.e13': { id: 'e13', appId: 'a6', type: 'result', at: dhi(-18, 10, 0), title: '', detail: '简历未过筛', questions: [], outcome: 'fail', remindAt: '', createdAt: dhi(-18, 10, 0), updatedAt: dhi(-18, 10, 0) },

  'wenjin.offer.o3': {
    id: 'o3', appId: 'a3', baseMonthly: 35000, months: 12, bonusMonths: 3, commuteMin: 45,
    remoteDays: 0, stockNote: '期权 0.05%，细节待谈', deadline: dhi(7, 18, 0), note: '',
    createdAt: dhi(-2, 11, 0), updatedAt: dhi(-2, 11, 0),
  },
  'wenjin.offer.o4': {
    id: 'o4', appId: 'a4', baseMonthly: 28000, months: 12, bonusMonths: 2, commuteMin: 15,
    remoteDays: 2, stockNote: '', deadline: dhi(10, 18, 0), note: '',
    createdAt: dhi(-4, 16, 0), updatedAt: dhi(-4, 16, 0),
  },

  'wenjin.meta': { at: iso(0), by: 'harness' },
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

const root = createRoot(document.getElementById('root')!)
root.render(<Panel />)
