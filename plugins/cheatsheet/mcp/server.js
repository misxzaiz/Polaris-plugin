#!/usr/bin/env node
/**
 * Cheatsheet MCP Server
 * 工具：add_command / search_commands / list_categories / get_command / delete_command
 * 存储：appConfigDir（argv[2]）下 polaris-cheatsheet/commands.json
 * 内置初始命令库（git/vim/docker 常用）。
 */
'use strict'
const fs = require('fs')
const path = require('path')
const APP_CONFIG_DIR = process.argv[2] || path.join(__dirname, '.data')
const DATA_DIR = path.join(APP_CONFIG_DIR, 'polaris-cheatsheet')
const DATA_FILE = path.join(DATA_DIR, 'commands.json')
fs.mkdirSync(DATA_DIR, { recursive: true })

const SEED = [
  { cmd: 'git checkout -b <branch>', desc: '创建并切换到新分支', category: 'git', example: 'git checkout -b feature/x' },
  { cmd: 'git stash', desc: '暂存当前改动', category: 'git', example: 'git stash' },
  { cmd: 'git log --oneline -5', desc: '查看最近5条提交', category: 'git', example: 'git log --oneline -5' },
  { cmd: 'vim %s/old/new/g', desc: '全局替换', category: 'vim', example: ':%s/foo/bar/g' },
  { cmd: 'vim :wq', desc: '保存并退出', category: 'vim', example: ':wq' },
  { cmd: 'docker ps -a', desc: '列出所有容器', category: 'docker', example: 'docker ps -a' },
  { cmd: 'docker logs -f <id>', desc: '跟踪容器日志', category: 'docker', example: 'docker logs -f abc123' },
  { cmd: 'Ctrl+Shift+P', desc: 'VS Code 命令面板', category: 'vscode', example: 'Ctrl+Shift+P' },
  { cmd: 'Ctrl+K Ctrl+C', desc: 'VS Code 注释', category: 'vscode', example: 'Ctrl+K Ctrl+C' },
]

function load() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) }
  catch { return { commands: SEED.map((c, i) => ({ id: 'c' + (i + 1), ...c })), nextId: SEED.length + 1 } }
}
function save(d) { fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2)) }
let store = load()
function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n') }

const tools = [
  { name: 'add_command', description: '添加一条命令/快捷键到速查库。', inputSchema: { type: 'object', properties: { cmd: { type: 'string', description: '命令或快捷键' }, desc: { type: 'string', description: '说明' }, category: { type: 'string', description: '分类（git/vim/docker/excel…）' }, example: { type: 'string' } }, required: ['cmd', 'desc'] } },
  { name: 'search_commands', description: '全文搜索命令速查库（cmd/desc/example）。可按 category 过滤。', inputSchema: { type: 'object', properties: { query: { type: 'string' }, category: { type: 'string' }, limit: { type: 'number' } } } },
  { name: 'list_categories', description: '列出所有分类及各分类条目数。', inputSchema: { type: 'object', properties: {} } },
  { name: 'get_command', description: '按 id 获取单条命令。', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
  { name: 'delete_command', description: '删除一条命令。', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } }
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
  if (method === 'initialize') return send({ jsonrpc: '2.0', id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'cheatsheet', version: '1.0.0' } } })
  if (method === 'tools/list') return send({ jsonrpc: '2.0', id, result: { tools } })
  if (method === 'tools/call') {
    const name = params?.name, args = params?.arguments || {}
    store = load()
    if (name === 'add_command') {
      const c = { id: 'c' + (store.nextId++), cmd: args.cmd, desc: args.desc, category: args.category || 'general', example: args.example || '' }
      store.commands.push(c); save(store)
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `✓ 已添加 ${c.id}：${c.cmd}（${c.category}）` }], _meta: { command: c } } })
    }
    if (name === 'search_commands') {
      const q = String(args.query || '').toLowerCase()
      let list = store.commands
      if (args.category) list = list.filter(c => c.category === args.category)
      if (q) list = list.filter(c => (c.cmd + ' ' + c.desc + ' ' + (c.example || '')).toLowerCase().includes(q))
      const limit = Math.min(args.limit || 20, 50)
      const out = list.slice(0, limit)
      const text = out.length ? `找到 ${out.length} 条：\n\n` + out.map(c => `• [${c.category}] ${c.cmd}\n  ${c.desc}${c.example ? '\n  例: ' + c.example : ''}`).join('\n') : '未找到'
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }], _meta: { results: out, total: list.length } } })
    }
    if (name === 'list_categories') {
      const counts = {}
      for (const c of store.commands) counts[c.category] = (counts[c.category] || 0) + 1
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: Object.entries(counts).map(([k, v]) => `• ${k} (${v})`).join('\n') }], _meta: { categories: counts } } })
    }
    if (name === 'get_command') {
      const c = store.commands.find(x => x.id === args.id)
      if (!c) return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: '✗ 未找到' }], isError: true } })
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `[${c.category}] ${c.cmd}\n\n${c.desc}${c.example ? '\n\n示例: ' + c.example : ''}` }], _meta: { command: c } } })
    }
    if (name === 'delete_command') {
      const before = store.commands.length
      store.commands = store.commands.filter(x => x.id !== args.id)
      if (store.commands.length === before) return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: '✗ 未找到' }], isError: true } })
      save(store)
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `✓ 已删除 ${args.id}` }] } })
    }
    return send({ jsonrpc: '2.0', id, error: { code: -32601, message: `未知工具: ${name}` } })
  }
  if (id !== undefined) send({ jsonrpc: '2.0', id, error: { code: -32601, message: `未知方法: ${method}` } })
}
process.on('uncaughtException', (e) => { try { send({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'uncaught: ' + (e && e.message) } }) } catch (_) {} })
