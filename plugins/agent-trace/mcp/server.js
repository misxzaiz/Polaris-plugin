#!/usr/bin/env node
/**
 * Agent Trace MCP Server
 * 工具：
 *   - log_call(tool, args, result, ms, error)  记录一次工具调用
 *   - query_traces(filter)                      查询调用记录（tool/error/limit）
 *   - export_traces(format)                     导出 jsonl|csv
 *   - clear_traces()                            清空
 *   - trace_stats()                             统计
 * 存储：appConfigDir（argv[2]）下 polaris-agent-trace/traces.json
 */
'use strict'
const fs = require('fs')
const path = require('path')
const APP_CONFIG_DIR = process.argv[2] || path.join(__dirname, '.data')
const DATA_DIR = path.join(APP_CONFIG_DIR, 'polaris-agent-trace')
const DATA_FILE = path.join(DATA_DIR, 'traces.json')
fs.mkdirSync(DATA_DIR, { recursive: true })
function load() { try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) } catch { return { traces: [] } } }
function save(d) { fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2)) }
let store = load()
function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n') }

const MAX_TRACES = 1000
function summarize(s, n = 200) { const t = typeof s === 'undefined' ? '' : (typeof s === 'string' ? s : JSON.stringify(s)); return t.length > n ? t.slice(0, n) + '…' : t }

const tools = [
  { name: 'log_call', description: '记录一次 MCP 工具调用到追踪日志。AI 在调用其他工具后可调用此工具留痕，便于调试。返回 trace id。', inputSchema: { type: 'object', properties: { tool: { type: 'string', description: '被调用的工具名' }, args: { type: 'object', description: '调用参数' }, result: { description: '返回结果（任意类型）' }, ms: { type: 'number', description: '耗时毫秒' }, error: { type: 'string', description: '错误信息（若有）' } }, required: ['tool'] } },
  { name: 'query_traces', description: '查询追踪记录。filter: {tool?, errorOnly?, limit?}。返回时间线列表。', inputSchema: { type: 'object', properties: { tool: { type: 'string' }, errorOnly: { type: 'boolean' }, limit: { type: 'number' } } } },
  { name: 'export_traces', description: '导出追踪记录为 jsonl 或 csv 字符串。', inputSchema: { type: 'object', properties: { format: { type: 'string', description: 'jsonl|csv' } } } },
  { name: 'clear_traces', description: '清空所有追踪记录。', inputSchema: { type: 'object', properties: {} } },
  { name: 'trace_stats', description: '统计：总调用数、错误数、按工具分组计数、平均耗时。', inputSchema: { type: 'object', properties: {} } }
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
  if (method === 'initialize') return send({ jsonrpc: '2.0', id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'agent-trace', version: '1.0.0' } } })
  if (method === 'tools/list') return send({ jsonrpc: '2.0', id, result: { tools } })
  if (method === 'tools/call') {
    const name = params?.name, args = params?.arguments || {}
    store = load()
    if (name === 'log_call') {
      const tr = { id: 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), ts: Date.now(), tool: args.tool, args: args.args, result: summarize(args.result), ms: args.ms || 0, error: args.error || null }
      store.traces.push(tr)
      if (store.traces.length > MAX_TRACES) store.traces = store.traces.slice(-MAX_TRACES)
      save(store)
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `✓ 已记录 trace ${tr.id}（${args.tool}，${args.ms || 0}ms${args.error ? '，错误' : ''}）` }], _meta: { trace: tr } } })
    }
    if (name === 'query_traces') {
      let list = store.traces
      if (args.tool) list = list.filter(t => t.tool === args.tool)
      if (args.errorOnly) list = list.filter(t => t.error)
      const limit = Math.min(args.limit || 50, 200)
      const out = list.slice(-limit).reverse()
      const text = out.length ? `追踪记录（${out.length} 条）：\n\n` + out.map(t => `${new Date(t.ts).toLocaleTimeString()} [${t.tool}] ${t.ms}ms${t.error ? ' ✗' : ' ✓'} — ${t.error || summarize(t.result, 60)}`).join('\n') : '无记录'
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }], _meta: { traces: out, total: store.traces.length } } })
    }
    if (name === 'export_traces') {
      const fmt = args.format === 'csv' ? 'csv' : 'jsonl'
      let out
      if (fmt === 'jsonl') {
        out = store.traces.map(t => JSON.stringify(t)).join('\n')
      } else {
        const header = 'ts,tool,ms,error,result\n'
        const rows = store.traces.map(t => `${t.ts},"${t.tool}",${t.ms},"${(t.error || '').replace(/"/g, '""')}","${summarize(t.result, 80).replace(/"/g, '""')}"`).join('\n')
        out = header + rows
      }
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: out }], _meta: { format: fmt, count: store.traces.length } } })
    }
    if (name === 'clear_traces') {
      store.traces = []; save(store)
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: '✓ 已清空' }] } })
    }
    if (name === 'trace_stats') {
      const total = store.traces.length
      const errors = store.traces.filter(t => t.error).length
      const byTool = {}
      let totalMs = 0
      for (const t of store.traces) { byTool[t.tool] = (byTool[t.tool] || 0) + 1; totalMs += t.ms || 0 }
      const stats = { total, errors, errorRate: total ? (errors / total * 100).toFixed(1) + '%' : '0%', avgMs: total ? Math.round(totalMs / total) : 0, byTool }
      const text = `追踪统计：\n\n总调用: ${stats.total}\n错误: ${stats.errors} (${stats.errorRate})\n平均耗时: ${stats.avgMs}ms\n\n按工具:\n` + Object.entries(byTool).map(([k, v]) => `  ${k}: ${v}`).join('\n')
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }], _meta: { stats } } })
    }
    return send({ jsonrpc: '2.0', id, error: { code: -32601, message: `未知工具: ${name}` } })
  }
  if (id !== undefined) send({ jsonrpc: '2.0', id, error: { code: -32601, message: `未知方法: ${method}` } })
}
process.on('uncaughtException', (e) => { try { send({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'uncaught: ' + (e && e.message) } }) } catch (_) {} })
