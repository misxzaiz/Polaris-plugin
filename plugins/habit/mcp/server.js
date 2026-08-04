#!/usr/bin/env node
/**
 * Habit Tracker MCP Server
 * 工具：add_habit / check_due / mark_done / list_habits / habit_stats
 */
'use strict'
const http = require('http')
const PORT = parseInt(process.env.HABIT_PORT || '4782', 10)
const HOST = '127.0.0.1'
function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n') }
function apiCall(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null
    const req = http.request({ hostname: HOST, port: PORT, method, path, headers: { 'Content-Type': 'application/json', 'Content-Length': data ? Buffer.byteLength(data) : 0 } }, (res) => { let b = ''; res.on('data', c => { b += c }); res.on('end', () => { try { resolve(JSON.parse(b || '{}')) } catch { resolve({}) } }) })
    req.on('error', reject); if (data) req.write(data); req.end()
  })
}

const tools = [
  { name: 'add_habit', description: '添加一个习惯追踪项。frequency: daily|weekly。', inputSchema: { type: 'object', properties: { name: { type: 'string', description: '习惯名（如"喝水""站立"）' }, frequency: { type: 'string', description: 'daily|weekly', default: 'daily' } }, required: ['name'] } },
  { name: 'check_due', description: '检查当前到期未打卡的习惯，发起交互式询问（ChatCard interaction）。用户在卡片中确认是否完成。', inputSchema: { type: 'object', properties: {} } },
  { name: 'mark_done', description: '标记某习惯今日已打卡。', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
  { name: 'list_habits', description: '列出所有习惯及连续天数。', inputSchema: { type: 'object', properties: {} } },
  { name: 'habit_stats', description: '习惯统计：总数、到期数、平均连续天数。', inputSchema: { type: 'object', properties: {} } }
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
  if (method === 'initialize') return send({ jsonrpc: '2.0', id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'habit-tracker', version: '1.0.0' } } })
  if (method === 'tools/list') return send({ jsonrpc: '2.0', id, result: { tools } })
  if (method === 'tools/call') {
    const name = params?.name, args = params?.arguments || {}
    if (name === 'add_habit') {
      const res = await apiCall('POST', '/habits', { name: args.name, frequency: args.frequency })
      if (res.error) return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `✗ ${res.error}` }], isError: true } })
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `✓ 已添加习惯「${res.name}」(${res.id}, ${res.frequency})` }], _meta: { habit: res } } })
    }
    if (name === 'check_due') {
      const res = await apiCall('GET', '/habits/due')
      const due = res.habits || []
      if (due.length === 0) return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: '当前没有到期习惯，全部完成 ✓' }] } })
      const first = due[0]
      return send({ jsonrpc: '2.0', id, result: {
        content: [{ type: 'text', text: `习惯打卡提醒：${due.map(h => h.name).join('、')} 共 ${due.length} 项到期` }],
        _meta: { dueHabits: due, prompt: `以下习惯到期，请确认是否完成：${due.map(h => h.name).join('、')}` }
      }})
    }
    if (name === 'mark_done') {
      const res = await apiCall('POST', `/habits/${encodeURIComponent(args.id)}/done`, {})
      if (res.error) return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `✗ ${res.error}` }], isError: true } })
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `✓ 「${res.name}」已打卡，连续 ${res.streak} 天` }], _meta: { habit: res } } })
    }
    if (name === 'list_habits') {
      const res = await apiCall('GET', '/habits')
      const text = res.habits?.length ? `共 ${res.habits.length} 个习惯：\n\n` + res.habits.map(h => `• ${h.id} ${h.name} — 连续 ${h.streak || 0} ${h.frequency === 'daily' ? '天' : '周'}${h.lastDone ? `（上次: ${new Date(h.lastDone).toLocaleDateString()})` : '（未开始）'}`).join('\n') : '暂无习惯'
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }], _meta: res } })
    }
    if (name === 'habit_stats') {
      const res = await apiCall('GET', '/stats')
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `习惯统计：\n总数: ${res.total}\n到期: ${res.due}\n总连续天数: ${res.totalStreak}\n平均连续: ${res.avgStreak}` }], _meta: res } })
    }
    return send({ jsonrpc: '2.0', id, error: { code: -32601, message: `未知工具: ${name}` } })
  }
  if (id !== undefined) send({ jsonrpc: '2.0', id, error: { code: -32601, message: `未知方法: ${method}` } })
}
process.on('uncaughtException', (e) => { try { send({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'uncaught: ' + (e && e.message) } }) } catch (_) {} })
