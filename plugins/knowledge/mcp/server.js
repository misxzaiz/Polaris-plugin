#!/usr/bin/env node
/**
 * Knowledge Base MCP Server
 * 工具：add_note / search_notes / get_note / list_tags / delete_note / update_note
 * 存储：appConfigDir（argv[2]）下 polaris-knowledge/notes.json
 */
'use strict'
const fs = require('fs')
const path = require('path')
const APP_CONFIG_DIR = process.argv[2] || path.join(__dirname, '.data')
const DATA_DIR = path.join(APP_CONFIG_DIR, 'polaris-knowledge')
const DATA_FILE = path.join(DATA_DIR, 'notes.json')
fs.mkdirSync(DATA_DIR, { recursive: true })
function load() { try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) } catch { return { notes: [], nextId: 1 } } }
function save(d) { fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2)) }
let store = load()
function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n') }

const tools = [
  { name: 'add_note', description: '存入一条知识笔记（文本/片段），带标签。返回 id。AI 可用此积累知识。', inputSchema: { type: 'object', properties: { text: { type: 'string', description: '笔记内容' }, tags: { type: 'array', items: { type: 'string' }, description: '标签' }, source: { type: 'string', description: '来源（可选）' } }, required: ['text'] } },
  { name: 'search_notes', description: '全文搜索知识库（substring 匹配，可按 tag 过滤）。返回匹配条目。', inputSchema: { type: 'object', properties: { query: { type: 'string', description: '搜索词' }, tag: { type: 'string', description: '可选标签过滤' }, limit: { type: 'number' } } } },
  { name: 'get_note', description: '按 id 获取单条笔记。', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
  { name: 'update_note', description: '更新笔记内容/标签。', inputSchema: { type: 'object', properties: { id: { type: 'string' }, text: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } } }, required: ['id'] } },
  { name: 'delete_note', description: '删除笔记。', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
  { name: 'list_tags', description: '列出所有标签及各标签条目数。', inputSchema: { type: 'object', properties: {} } }
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
  if (method === 'initialize') return send({ jsonrpc: '2.0', id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'knowledge-base', version: '1.0.0' } } })
  if (method === 'tools/list') return send({ jsonrpc: '2.0', id, result: { tools } })
  if (method === 'tools/call') {
    const name = params?.name, args = params?.arguments || {}
    store = load()
    if (name === 'add_note') {
      const note = { id: 'k' + (store.nextId++), text: String(args.text || ''), tags: args.tags || [], source: args.source || '', ts: Date.now() }
      store.notes.push(note); save(store)
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `✓ 已存入 ${note.id}（标签: ${note.tags.join(',') || '无'}）` }], _meta: { note } } })
    }
    if (name === 'search_notes') {
      const q = String(args.query || '').toLowerCase()
      let list = store.notes
      if (args.tag) list = list.filter(n => (n.tags || []).includes(args.tag))
      if (q) list = list.filter(n => n.text.toLowerCase().includes(q))
      const limit = Math.min(args.limit || 20, 50)
      const out = list.slice(-limit).reverse()
      const text = out.length ? `找到 ${out.length} 条：\n\n` + out.map(n => `• ${n.id} [${(n.tags || []).join(',')}] ${n.text.slice(0, 60)}…`).join('\n') : '未找到匹配'
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }], _meta: { results: out, total: list.length } } })
    }
    if (name === 'get_note') {
      const n = store.notes.find(x => x.id === args.id)
      if (!n) return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: '✗ 未找到' }], isError: true } })
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `「${n.id}」[${(n.tags || []).join(',')}]\n\n${n.text}` }], _meta: { note: n } } })
    }
    if (name === 'update_note') {
      const idx = store.notes.findIndex(x => x.id === args.id)
      if (idx === -1) return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: '✗ 未找到' }], isError: true } })
      if (args.text) store.notes[idx].text = args.text
      if (args.tags) store.notes[idx].tags = args.tags
      save(store)
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `✓ 已更新 ${args.id}` }], _meta: { note: store.notes[idx] } } })
    }
    if (name === 'delete_note') {
      const before = store.notes.length
      store.notes = store.notes.filter(x => x.id !== args.id)
      if (store.notes.length === before) return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: '✗ 未找到' }], isError: true } })
      save(store)
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `✓ 已删除 ${args.id}` }] } })
    }
    if (name === 'list_tags') {
      const counts = {}
      for (const n of store.notes) for (const t of (n.tags || [])) counts[t] = (counts[t] || 0) + 1
      const text = Object.keys(counts).length ? `标签（${Object.keys(counts).length}）：\n\n` + Object.entries(counts).map(([t, c]) => `• ${t} (${c})`).join('\n') : '暂无标签'
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }], _meta: { tags: counts } } })
    }
    return send({ jsonrpc: '2.0', id, error: { code: -32601, message: `未知工具: ${name}` } })
  }
  if (id !== undefined) send({ jsonrpc: '2.0', id, error: { code: -32601, message: `未知方法: ${method}` } })
}
process.on('uncaughtException', (e) => { try { send({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'uncaught: ' + (e && e.message) } }) } catch (_) {} })
