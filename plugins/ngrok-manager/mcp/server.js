#!/usr/bin/env node
'use strict'
/**
 * ngrok-manager MCP server (stdio)
 *
 * 工具:
 *   ngrok_start    {port:int, domain?:string, name?:string}  → 隧道对象(含 publicUrl)
 *   ngrok_stop    {target:string(id 或 port)}                → {ok}
 *   ngrok_list    {}                                          → 隧道数组
 *   ngrok_stop_all {}                                         → {ok}
 *
 * 通过 {{pluginDir}}/.port 定位管理器端口。
 * 协议:JSON-RPC 2.0 over stdin/stdout,LF 分隔。
 */

const fs = require('fs')
const path = require('path')
const http = require('http')

const PLUGIN_DIR = process.argv[2] || path.resolve(__dirname, '..')
const PORT_FILE = path.join(PLUGIN_DIR, '.port')

function getMgrPort() {
  try { return parseInt(fs.readFileSync(PORT_FILE, 'utf8').trim(), 10) } catch { return null }
}

function mgrRequest(method, p, body) {
  return new Promise((resolve, reject) => {
    const port = getMgrPort()
    if (!port) return reject(new Error('管理器未启动(.port 不存在)'))
    const opts = { hostname: '127.0.0.1', port, path: p, method, headers: { 'Content-Type': 'application/json' } }
    const req = http.request(opts, (res) => {
      let buf = ''
      res.on('data', c => buf += c)
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(buf || '{}') }) }
        catch { resolve({ status: res.statusCode, data: { raw: buf } }) }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('管理器请求超时')) })
    req.setTimeout(15000)
    if (body) req.write(JSON.stringify(body))
    req.end()
  })
}

const tools = [
  {
    name: 'ngrok_start',
    description: '启动一个 ngrok HTTP 隧道,把本地端口暴露到公网。返回公网 URL。free 计划单进程内可同时多条隧道(共享 session)。',
    inputSchema: {
      type: 'object',
      properties: {
        port: { type: 'integer', description: '本地要转发的端口(1-65555)', minimum: 1, maximum: 65535 },
        domain: { type: 'string', description: '固定保留域名(如 my-app.ngrok-free.app);不填则随机域名' },
        name: { type: 'string', description: '隧道名(可选,默认 tunnel-<port>)' },
      },
      required: ['port'],
    },
  },
  {
    name: 'ngrok_stop',
    description: '停止一个 ngrok 隧道。target 可以是隧道 id 或本地端口。停止会重启 ngrok 进程,其余隧道短暂中断 ~2-3s。',
    inputSchema: {
      type: 'object',
      properties: { target: { type: 'string', description: '隧道 id 或端口号' } },
      required: ['target'],
    },
  },
  {
    name: 'ngrok_list',
    description: '列出当前所有 ngrok 隧道及其公网 URL 和状态。',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'ngrok_stop_all',
    description: '停止所有 ngrok 隧道并退出 ngrok 进程。',
    inputSchema: { type: 'object', properties: {} },
  },
]

function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n') }

async function callTool(name, args) {
  if (name === 'ngrok_start') {
    const r = await mgrRequest('POST', '/tunnels', { port: args.port, domain: args.domain, name: args.name })
    if (r.status >= 400) return { content: [{ type: 'text', text: `✗ 启动失败: ${r.data.error || JSON.stringify(r.data)}` }], isError: true }
    return { content: [{ type: 'text', text: `✓ 隧道已启动\n公网 URL: ${r.data.publicUrl || '(等待分配)'}\n本地: localhost:${r.data.port}\n域名: ${r.data.domain || '随机'}` }] }
  }
  if (name === 'ngrok_stop') {
    const list = await mgrRequest('GET', '/tunnels')
    const t = (list.data || []).find(x => x.id === args.target || String(x.port) === String(args.target))
    if (!t) return { content: [{ type: 'text', text: `✗ 未找到隧道: ${args.target}` }], isError: true }
    const r = await mgrRequest('DELETE', '/tunnels/' + t.id)
    if (r.status >= 400) return { content: [{ type: 'text', text: `✗ 停止失败: ${r.data.error}` }], isError: true }
    return { content: [{ type: 'text', text: `✓ 已停止 ${t.name} (localhost:${t.port})` }] }
  }
  if (name === 'ngrok_list') {
    const r = await mgrRequest('GET', '/tunnels')
    const arr = r.data || []
    if (!arr.length) return { content: [{ type: 'text', text: '(无运行中隧道)' }] }
    const lines = arr.map(t => `• ${t.name}  ${t.publicUrl || '(等待 URL…)'}  → localhost:${t.port}  [${t.status}]${t.domain ? '  固定' : '  随机'}`)
    return { content: [{ type: 'text', text: `ngrok 隧道 (${arr.length}):\n${lines.join('\n')}` }] }
  }
  if (name === 'ngrok_stop_all') {
    const r = await mgrRequest('DELETE', '/tunnels')
    if (r.status >= 400) return { content: [{ type: 'text', text: `✗ 停止失败: ${r.data.error}` }], isError: true }
    return { content: [{ type: 'text', text: '✓ 已停止所有隧道' }] }
  }
  return { content: [{ type: 'text', text: `未知工具: ${name}` }], isError: true }
}

let buf = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', async (chunk) => {
  buf += chunk
  let i
  while ((i = buf.indexOf('\n')) !== -1) {
    const line = buf.slice(0, i).trim()
    buf = buf.slice(i + 1)
    if (!line) continue
    let msg
    try { msg = JSON.parse(line) } catch { continue }
    if (msg.method === 'initialize') {
      send({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'ngrok-manager', version: '1.0.0' } } })
    } else if (msg.method === 'tools/list') {
      send({ jsonrpc: '2.0', id: msg.id, result: { tools } })
    } else if (msg.method === 'tools/call') {
      try {
        const result = await callTool(msg.params.name, msg.params.arguments || {})
        send({ jsonrpc: '2.0', id: msg.id, result })
      } catch (e) {
        send({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: `✗ 错误: ${e.message}` }], isError: true } })
      }
    } else if (msg.method === 'initialized' || msg.method === 'notifications/initialized') {
      // notification, no response
    } else if (msg.id && msg.method) {
      send({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `method not found: ${msg.method}` } })
    }
  }
})
process.stdin.on('end', () => process.exit(0))
