#!/usr/bin/env node
/**
 * Cron Craft MCP Server
 * 工具：build_cron / explain_cron / next_runs
 * 纯 MCP，简化 5 字段 cron（分 时 日 月 周）。
 */
'use strict'
function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n') }

const TEMPLATES = [
  { keys: ['每分钟', 'every minute'], expr: '* * * * *', desc: '每分钟执行' },
  { keys: ['每小时', 'every hour'], expr: '0 * * * *', desc: '每小时整点执行' },
  { keys: ['每天', 'daily', '每日'], expr: '0 0 * * *', desc: '每天 0:00 执行' },
  { keys: ['每周', 'weekly', '每周一'], expr: '0 0 * * 1', desc: '每周一 0:00 执行' },
  { keys: ['每月', 'monthly', '每月1号'], expr: '0 0 1 * *', desc: '每月 1 号 0:00 执行' },
  { keys: ['工作日', 'weekday'], expr: '0 9 * * 1-5', desc: '工作日 9:00 执行' },
  { keys: ['每', 'every'], expr: null, desc: '需具体描述' },
]

function buildCron(intent) {
  const i = String(intent || '').toLowerCase()
  // 每 N 分钟
  const m = i.match(/每\s*(\d+)\s*分钟/) || i.match(/every\s*(\d+)\s*min/)
  if (m) return { expr: `*/${m[1]} * * * *`, desc: `每 ${m[1]} 分钟执行` }
  // 每 N 小时
  const h = i.match(/每\s*(\d+)\s*小时/) || i.match(/every\s*(\d+)\s*hour/)
  if (h) return { expr: `0 */${h[1]} * * *`, desc: `每 ${h[1]} 小时执行` }
  // 每天某时
  const dt = i.match(/每天\s*(\d+)[点:：](\d+)?/) || i.match(/daily\s*(\d+):(\d+)/)
  if (dt) { const h2 = dt[1]; const m2 = dt[2] || '0'; return { expr: `${m2} ${h2} * * *`, desc: `每天 ${h2}:${m2.padStart(2, '0')} 执行` } }
  // 模板匹配
  const t = TEMPLATES.find(x => x.keys.some(k => i.includes(k.toLowerCase())) && x.expr)
  if (t) return { expr: t.expr, desc: t.desc }
  return { expr: '* * * * *', desc: '未能识别意图，默认每分钟。请更具体描述（如"每天9点""每30分钟"）' }
}

const FIELD_NAMES = ['分钟', '小时', '日', '月', '星期']
function explainCron(expr) {
  const parts = String(expr || '').trim().split(/\s+/)
  if (parts.length !== 5) return { error: 'cron 需 5 个字段（分 时 日 月 周）' }
  const lines = parts.map((p, i) => {
    let m = `第 ${i + 1} 字段（${FIELD_NAMES[i]}）：${p} → `
    if (p === '*') m += '任意值'
    else if (p.startsWith('*/')) m += `每 ${p.slice(2)} 个单位`
    else if (p.includes(',')) m += `指定：${p.split(',').join('、')}`
    else if (p.includes('-')) m += `范围：${p}`
    else if (p.includes('/')) { const [a, b] = p.split('/'); m += `从 ${a} 开始每 ${b} 个` }
    else m += `固定值 ${p}`
    return m
  })
  return { explanation: lines.join('\n'), fields: parts }
}

// 简化 cron next：暴力枚举（仅支持 * 数字 */n 数字-n,a）
function parseField(field, min, max) {
  if (field === '*') return null // 任意
  const vals = new Set()
  for (const part of field.split(',')) {
    if (part === '*') return null
    const stepM = part.match(/^\*\/(\d+)$/)
    if (stepM) { const s = +stepM[1]; for (let v = min; v <= max; v += s) vals.add(v); continue }
    const rangeM = part.match(/^(\d+)-(\d+)$/)
    if (rangeM) { for (let v = +rangeM[1]; v <= +rangeM[2]; v++) vals.add(v); continue }
    const rangeStepM = part.match(/^(\d+)-(\d+)\/(\d+)$/)
    if (rangeStepM) { for (let v = +rangeStepM[1]; v <= +rangeStepM[2]; v += +rangeStepM[3]) vals.add(v); continue }
    const n = parseInt(part, 10)
    if (!isNaN(n)) vals.add(n)
  }
  return vals
}

function nextRuns(expr, count = 5) {
  const parts = String(expr || '').trim().split(/\s+/)
  if (parts.length !== 5) return { error: '需 5 字段' }
  const minute = parseField(parts[0], 0, 59)
  const hour = parseField(parts[1], 0, 23)
  const day = parseField(parts[2], 1, 31)
  const month = parseField(parts[3], 1, 12)
  const week = parseField(parts[4], 0, 6)
  const out = []
  let d = new Date()
  d.setSeconds(0, 0)
  d.setMinutes(d.getMinutes() + 1) // 从下一分钟开始
  let safety = 0
  while (out.length < count && safety < 500000) {
    safety++
    if (month && !month.has(d.getMonth() + 1)) { d.setMonth(d.getMonth() + 1, 1); d.setHours(0, 0, 0, 0); continue }
    if (day && !day.has(d.getDate())) { d.setDate(d.getDate() + 1); d.setHours(0, 0, 0, 0); continue }
    if (week && !week.has(d.getDay())) { d.setDate(d.getDate() + 1); d.setHours(0, 0, 0, 0); continue }
    if (hour && !hour.has(d.getHours())) { d.setHours(d.getHours() + 1, 0, 0, 0); continue }
    if (minute && !minute.has(d.getMinutes())) { d.setMinutes(d.getMinutes() + 1, 0, 0); continue }
    out.push(new Date(d).toISOString())
    d.setMinutes(d.getMinutes() + 1)
  }
  return { runs: out, count: out.length }
}

const tools = [
  { name: 'build_cron', description: '根据自然语言意图生成 cron 表达式（支持"每N分钟""每天N点""工作日"等）。', inputSchema: { type: 'object', properties: { intent: { type: 'string', description: '意图描述（如"每天9点""每30分钟"）' } }, required: ['intent'] } },
  { name: 'explain_cron', description: '逐字段解释 cron 表达式（分时日月周）。', inputSchema: { type: 'object', properties: { expr: { type: 'string', description: 'cron 表达式' } }, required: ['expr'] } },
  { name: 'next_runs', description: '计算 cron 下 N 次触发时间（ISO）。count 默认 5。', inputSchema: { type: 'object', properties: { expr: { type: 'string' }, count: { type: 'number', default: 5 } }, required: ['expr'] } }
]

let buf = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', chunk => {
  buf += chunk
  while (true) {
    const i = buf.indexOf('\n')
    if (i === -1) break
    const line = buf.slice(0, i).trim()
    buf = buf.slice(i + 1)
    if (!line) continue
    let msg
    try { msg = JSON.parse(line) } catch { send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); continue }
    handle(msg).catch(err => send({ jsonrpc: '2.0', id: msg.id ?? null, error: { code: -32603, message: String(err && err.message || err) } }))
  }
})

async function handle(msg) {
  const { method, id, params } = msg
  if (method === 'initialize') return send({ jsonrpc: '2.0', id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'cron-craft', version: '1.0.0' } } })
  if (method === 'tools/list') return send({ jsonrpc: '2.0', id, result: { tools } })
  if (method === 'tools/call') {
    const name = params?.name, args = params?.arguments || {}
    if (name === 'build_cron') {
      const r = buildCron(args.intent)
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `${r.desc}\n\ncron: \`${r.expr}\`` }], _meta: r } })
    }
    if (name === 'explain_cron') {
      const r = explainCron(args.expr)
      if (r.error) return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `✗ ${r.error}` }], isError: true } })
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `「${args.expr}」解释：\n\n${r.explanation}` }], _meta: r } })
    }
    if (name === 'next_runs') {
      const r = nextRuns(args.expr, args.count)
      if (r.error) return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `✗ ${r.error}` }], isError: true } })
      const text = `下次 ${r.count} 次触发：\n\n` + r.runs.map((t, i) => `${i + 1}. ${new Date(t).toLocaleString()}`).join('\n')
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }], _meta: r } })
    }
    return send({ jsonrpc: '2.0', id, error: { code: -32601, message: `未知工具: ${name}` } })
  }
  if (id !== undefined) send({ jsonrpc: '2.0', id, error: { code: -32601, message: `未知方法: ${method}` } })
}
process.on('uncaughtException', (e) => { try { send({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'uncaught: ' + (e && e.message) } }) } catch (_) {} })
