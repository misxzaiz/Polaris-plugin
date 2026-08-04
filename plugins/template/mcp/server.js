#!/usr/bin/env node
/**
 * Template Vault MCP Server
 * 工具：save_template / render_template / list_templates / list_categories / delete_template
 * 内置种子：拒绝/催办/通知/感谢/请假。
 */
'use strict'
const fs = require('fs')
const path = require('path')
const APP_CONFIG_DIR = process.argv[2] || path.join(__dirname, '.data')
const DATA_DIR = path.join(APP_CONFIG_DIR, 'polaris-template')
const DATA_FILE = path.join(DATA_DIR, 'templates.json')
fs.mkdirSync(DATA_DIR, { recursive: true })

const SEED = [
  { name: '拒绝合作', content: '感谢您联系{{company}}。经评估，目前暂无法推进此合作。祝顺利。\n\n{{your_name}}', category: '邮件' },
  { name: '催办进度', content: '{{name}}你好，{{task}}的进度如何？预计何时完成？', category: '消息' },
  { name: '会议通知', content: '主题：{{topic}}\n时间：{{time}}\n地点：{{location}}\n\n请准时参加。', category: '通知' },
  { name: '感谢回复', content: '{{name}}，感谢您的及时回复，已收到。', category: '消息' },
  { name: '请假申请', content: '尊敬的{{manager}}：\n我因{{reason}}需请假{{days}}天（{{start}}至{{end}}），望批准。', category: '邮件' },
]

function load() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) }
  catch { return { templates: SEED.map((t, i) => ({ id: 't' + (i + 1), ...t })), nextId: SEED.length + 1 } }
}
function save(d) { fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2)) }
let store = load()
function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n') }

function extractVars(content) {
  const set = new Set()
  const re = /\{\{\s*([\w.]+)\s*\}\}/g
  let m
  while ((m = re.exec(content)) !== null) set.add(m[1])
  return [...set]
}

function render(content, vars) {
  return String(content || '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) =>
    (vars && vars[k] !== undefined) ? String(vars[k]) : `{{${k}}}`)
}

const tools = [
  { name: 'save_template', description: '存入消息/邮件模板（支持 {{var}} 变量）。', inputSchema: { type: 'object', properties: { name: { type: 'string' }, content: { type: 'string' }, category: { type: 'string' } }, required: ['name', 'content'] } },
  { name: 'render_template', description: '用变量填充渲染指定模板。返回渲染后文本。', inputSchema: { type: 'object', properties: { name: { type: 'string' }, vars: { type: 'object' } }, required: ['name'] } },
  { name: 'list_templates', description: '列出模板（可按 category 过滤）。', inputSchema: { type: 'object', properties: { category: { type: 'string' } } } },
  { name: 'list_categories', description: '列出所有分类。', inputSchema: { type: 'object', properties: {} } },
  { name: 'delete_template', description: '删除模板。', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } }
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
  if (method === 'initialize') return send({ jsonrpc: '2.0', id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'template-vault', version: '1.0.0' } } })
  if (method === 'tools/list') return send({ jsonrpc: '2.0', id, result: { tools } })
  if (method === 'tools/call') {
    const name = params?.name, args = params?.arguments || {}
    store = load()
    if (name === 'save_template') {
      const t = { id: 't' + (store.nextId++), name: args.name, content: args.content, category: args.category || 'general' }
      store.templates.push(t); save(store)
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `✓ 已存入 ${t.id}：${t.name}（${t.category}，${extractVars(args.content).length} 变量）` }], _meta: { template: t, vars: extractVars(args.content) } } })
    }
    if (name === 'render_template') {
      const t = store.templates.find(x => x.name === args.name)
      if (!t) return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `✗ 未找到模板: ${args.name}` }], isError: true } })
      const rendered = render(t.content, args.vars)
      const vars = extractVars(t.content)
      const missing = vars.filter(v => !args.vars || args.vars[v] === undefined)
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `渲染「${t.name}」：\n\n${rendered}${missing.length ? `\n\n⚠ 未填充: ${missing.join(', ')}` : ''}` }], _meta: { rendered, vars, missing } } })
    }
    if (name === 'list_templates') {
      let list = store.templates
      if (args.category) list = list.filter(t => t.category === args.category)
      const text = list.length ? `共 ${list.length} 个模板：\n\n` + list.map(t => `• ${t.id} [${t.category}] ${t.name}（变量: ${extractVars(t.content).join(',') || '无'}）`).join('\n') : '暂无'
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }], _meta: { templates: list } } })
    }
    if (name === 'list_categories') {
      const counts = {}
      for (const t of store.templates) counts[t.category] = (counts[t.category] || 0) + 1
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: Object.entries(counts).map(([k, v]) => `• ${k} (${v})`).join('\n') }], _meta: { categories: counts } } })
    }
    if (name === 'delete_template') {
      const before = store.templates.length
      store.templates = store.templates.filter(x => x.id !== args.id)
      if (store.templates.length === before) return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: '✗ 未找到' }], isError: true } })
      save(store)
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `✓ 已删除 ${args.id}` }] } })
    }
    return send({ jsonrpc: '2.0', id, error: { code: -32601, message: `未知工具: ${name}` } })
  }
  if (id !== undefined) send({ jsonrpc: '2.0', id, error: { code: -32601, message: `未知方法: ${method}` } })
}
process.on('uncaughtException', (e) => { try { send({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'uncaught: ' + (e && e.message) } }) } catch (_) {} })
