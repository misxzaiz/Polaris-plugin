#!/usr/bin/env node
/**
 * Prompt Vault MCP Server
 *
 * 工具：
 *   - save_prompt(name, template, tags)     保存 prompt 新版本
 *   - render_prompt(name, vars)             变量注入渲染
 *   - list_prompts(tag?)                    列出 prompt
 *   - diff_versions(name, v1, v2)           对比两版本
 *   - get_prompt(name)                       获取最新版本
 *
 * 存储：appConfigDir（argv[2]）下 polaris-prompt-vault/prompts.json
 * JSON-RPC 2.0 over stdin/stdout。
 */
'use strict'
const fs = require('fs')
const path = require('path')

const APP_CONFIG_DIR = process.argv[2] || path.join(__dirname, '.data')
const DATA_DIR = path.join(APP_CONFIG_DIR, 'polaris-prompt-vault')
const DATA_FILE = path.join(DATA_DIR, 'prompts.json')
fs.mkdirSync(DATA_DIR, { recursive: true })

function load() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) }
  catch { return { prompts: {} } } // name -> { tags, versions: [{version, template, ts}] }
}
function save(d) { fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2)) }
let store = load()

function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n') }

function extractVars(template) {
  const set = new Set()
  const re = /\{\{\s*([\w.]+)\s*\}\}/g
  let m
  while ((m = re.exec(template)) !== null) set.add(m[1])
  return [...set]
}

function render(template, vars) {
  return String(template || '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) =>
    (vars && vars[k] !== undefined) ? String(vars[k]) : `{{${k}}}`)
}

function diffLines(a, b) {
  const la = String(a || '').split(/\r?\n/)
  const lb = String(b || '').split(/\r?\n/)
  const out = []
  const max = Math.max(la.length, lb.length)
  for (let i = 0; i < max; i++) {
    if (la[i] === lb[i]) out.push(`  ${la[i] || ''}`)
    else {
      if (la[i] !== undefined) out.push(`- ${la[i]}`)
      if (lb[i] !== undefined) out.push(`+ ${lb[i]}`)
    }
  }
  return out.join('\n')
}

const tools = [
  {
    name: 'save_prompt',
    description: '保存一个 prompt 模板为新版本（带 {{var}} 占位符）。自动递增版本号、记录时间戳。返回版本号。',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'prompt 名称（如 "summarizer"）' },
        template: { type: 'string', description: 'prompt 模板，支持 {{variable}} 占位符' },
        tags: { type: 'array', items: { type: 'string' }, description: '标签' }
      },
      required: ['name', 'template']
    }
  },
  {
    name: 'render_prompt',
    description: '用变量注入渲染指定 prompt 最新版本。返回渲染后文本与使用的变量。',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'prompt 名称' },
        vars: { type: 'object', description: '变量键值对' }
      },
      required: ['name']
    }
  },
  {
    name: 'list_prompts',
    description: '列出所有 prompt（可按 tag 过滤），含版本数与变量列表。',
    inputSchema: { type: 'object', properties: { tag: { type: 'string' } } }
  },
  {
    name: 'diff_versions',
    description: '对比某 prompt 的两个版本，返回逐行 diff。',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        v1: { type: 'number', description: '版本号 1' },
        v2: { type: 'number', description: '版本号 2' }
      },
      required: ['name', 'v1', 'v2']
    }
  },
  {
    name: 'get_prompt',
    description: '获取某 prompt 最新版本内容。',
    inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] }
  }
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
  if (method === 'initialize') return send({ jsonrpc: '2.0', id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'prompt-vault', version: '1.0.0' } } })
  if (method === 'tools/list') return send({ jsonrpc: '2.0', id, result: { tools } })
  if (method === 'tools/call') {
    const name = params?.name, args = params?.arguments || {}
    store = load() // 每次重新加载，防外部修改
    if (name === 'save_prompt') {
      const p = store.prompts[args.name] || { tags: [], versions: [] }
      const ver = p.versions.length + 1
      p.versions.push({ version: ver, template: args.template, tags: args.tags || p.tags, ts: Date.now() })
      p.tags = args.tags || p.tags
      store.prompts[args.name] = p
      save(store)
      const vars = extractVars(args.template)
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `✓ 已保存「${args.name}」v${ver}（${vars.length} 变量: ${vars.join(', ') || '无'}）` }], _meta: { name: args.name, version: ver, vars } } })
    }
    if (name === 'render_prompt') {
      const p = store.prompts[args.name]
      if (!p) return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `✗ 未找到 prompt: ${args.name}`, }], isError: true } })
      const latest = p.versions[p.versions.length - 1]
      const rendered = render(latest.template, args.vars)
      const vars = extractVars(latest.template)
      const missing = vars.filter(v => !args.vars || args.vars[v] === undefined)
      const text = `渲染「${args.name}」v${latest.version}：\n\n${rendered}${missing.length ? `\n\n⚠ 未提供变量: ${missing.join(', ')}` : ''}`
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }], _meta: { rendered, vars, missing, version: latest.version } } })
    }
    if (name === 'list_prompts') {
      const list = Object.entries(store.prompts)
        .filter(([, p]) => !args.tag || (p.tags || []).includes(args.tag))
        .map(([n, p]) => ({ name: n, tags: p.tags, versions: p.versions.length, vars: extractVars(p.versions[p.versions.length - 1].template) }))
      const text = list.length ? `共 ${list.length} 个 prompt：\n\n` + list.map(p => `• ${p.name} (v${p.versions}, 变量: ${p.vars.join(',') || '无'})`).join('\n') : '暂无 prompt'
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }], _meta: { prompts: list } } })
    }
    if (name === 'diff_versions') {
      const p = store.prompts[args.name]
      if (!p) return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `✗ 未找到 prompt: ${args.name}` }], isError: true } })
      const v1 = p.versions.find(v => v.version === args.v1)
      const v2 = p.versions.find(v => v.version === args.v2)
      if (!v1 || !v2) return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `✗ 版本不存在` }], isError: true } })
      const d = diffLines(v1.template, v2.template)
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `diff ${args.name} v${args.v1} ↔ v${args.v2}：\n\n${d}` }], _meta: { diff: d } } })
    }
    if (name === 'get_prompt') {
      const p = store.prompts[args.name]
      if (!p) return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `✗ 未找到 prompt: ${args.name}` }], isError: true } })
      const latest = p.versions[p.versions.length - 1]
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `「${args.name}」v${latest.version}（${new Date(latest.ts).toLocaleString()}）：\n\n${latest.template}` }], _meta: { prompt: latest } } })
    }
    return send({ jsonrpc: '2.0', id, error: { code: -32601, message: `未知工具: ${name}` } })
  }
  if (id !== undefined) send({ jsonrpc: '2.0', id, error: { code: -32601, message: `未知方法: ${method}` } })
}

process.on('uncaughtException', (e) => { try { send({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'uncaught: ' + (e && e.message) } }) } catch (_) {} })
