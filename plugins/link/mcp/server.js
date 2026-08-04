#!/usr/bin/env node
'use strict'
const fs = require('fs')
const path = require('path')
const APP_CONFIG_DIR = process.argv[2] || path.join(__dirname, '.data')
const DATA_DIR = path.join(APP_CONFIG_DIR, 'polaris-link')
const DATA_FILE = path.join(DATA_DIR, 'links.json')
fs.mkdirSync(DATA_DIR, { recursive: true })
function load() { try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) } catch { return { links: [], nextId: 1 } } }
function save(d) { fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2)) }
let store = load()
function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n') }

const tools = [
  { name: 'add_link', description: '存入一个书签。', inputSchema: { type: 'object', properties: { url: { type: 'string' }, title: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } }, desc: { type: 'string' } }, required: ['url', 'title'] } },
  { name: 'search_links', description: '搜索书签（url/title/desc 全文 + tag 过滤）。', inputSchema: { type: 'object', properties: { query: { type: 'string' }, tag: { type: 'string' }, limit: { type: 'number' } } } },
  { name: 'list_tags', description: '列出所有标签及数量。', inputSchema: { type: 'object', properties: {} } },
  { name: 'delete_link', description: '删除书签。', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } }
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
  if (method === 'initialize') return send({ jsonrpc: '2.0', id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'link-vault', version: '1.0.0' } } })
  if (method === 'tools/list') return send({ jsonrpc: '2.0', id, result: { tools } })
  if (method === 'tools/call') {
    const name = params?.name, args = params?.arguments || {}
    store = load()
    if (name === 'add_link') {
      const l = { id: 'l' + (store.nextId++), url: args.url, title: args.title, tags: args.tags || [], desc: args.desc || '', createdAt: Date.now() }
      store.links.push(l); save(store)
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `✓ 已存入 ${l.id}：${l.title}` }], _meta: { link: l } } })
    }
    if (name === 'search_links') {
      const q = String(args.query || '').toLowerCase()
      let list = store.links
      if (args.tag) list = list.filter(l => (l.tags || []).includes(args.tag))
      if (q) list = list.filter(l => (l.url + ' ' + l.title + ' ' + (l.desc || '')).toLowerCase().includes(q))
      const out = list.slice(0, args.limit || 20)
      const text = out.length ? `找到 ${out.length} 个：\n\n` + out.map(l => `• ${l.id} [${(l.tags || []).join(',')}] ${l.title}\n  ${l.url}`).join('\n') : '未找到'
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }], _meta: { results: out } } })
    }
    if (name === 'list_tags') {
      const counts = {}
      for (const l of store.links) for (const t of (l.tags || [])) counts[t] = (counts[t] || 0) + 1
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: Object.entries(counts).map(([k, v]) => `• ${k} (${v})`).join('\n') || '暂无' }], _meta: { tags: counts } } })
    }
    if (name === 'delete_link') {
      const before = store.links.length
      store.links = store.links.filter(x => x.id !== args.id)
      if (store.links.length === before) return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: '✗ 未找到' }], isError: true } })
      save(store)
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `✓ 已删除 ${args.id}` }] } })
    }
    return send({ jsonrpc: '2.0', id, error: { code: -32601, message: `未知工具: ${name}` } })
  }
  if (id !== undefined) send({ jsonrpc: '2.0', id, error: { code: -32601, message: `未知方法: ${method}` } })
}
process.on('uncaughtException', (e) => { try { send({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'uncaught: ' + (e && e.message) } }) } catch (_) {} })
