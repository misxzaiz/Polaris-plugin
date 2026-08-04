#!/usr/bin/env node
/**
 * JSON Explorer MCP Server
 * 工具：extract_paths / search_json / get_path
 */
'use strict'
function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n') }

function extractPaths(obj, prefix = '') {
  const paths = []
  if (obj === null || typeof obj !== 'object') return [{ path: prefix || '$', value: obj, type: typeof obj }]
  if (Array.isArray(obj)) {
    if (obj.length === 0) return [{ path: prefix + '[]', value: [], type: 'array' }]
    obj.slice(0, 50).forEach((v, i) => { paths.push(...extractPaths(v, `${prefix}[${i}]`)) })
    return paths
  }
  for (const [k, v] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${k}` : k
    if (v !== null && typeof v === 'object') {
      paths.push({ path: p, type: Array.isArray(v) ? 'array' : 'object', preview: JSON.stringify(v).slice(0, 60) })
      paths.push(...extractPaths(v, p))
    } else {
      paths.push({ path: p, value: v, type: typeof v })
    }
  }
  return paths.slice(0, 200) // 防过载
}

function searchJson(obj, query, prefix = '') {
  const q = String(query || '').toLowerCase()
  const results = []
  function walk(o, p) {
    if (o === null || typeof o !== 'object') return
    if (Array.isArray(o)) { o.slice(0, 100).forEach((v, i) => walk(v, `${p}[${i}]`)); return }
    for (const [k, v] of Object.entries(o)) {
      const np = p ? `${p}.${k}` : k
      if (k.toLowerCase().includes(q) || (typeof v === 'string' && v.toLowerCase().includes(q)) || (typeof v === 'number' && String(v).includes(q))) {
        results.push({ path: np, key: k, value: typeof v === 'object' ? JSON.stringify(v).slice(0, 60) : v })
      }
      if (v && typeof v === 'object') walk(v, np)
    }
  }
  walk(obj, prefix)
  return results.slice(0, 50)
}

function getPath(obj, path) {
  // 支持 a.b[0].c
  const parts = path.replace(/^\$/, '').split(/\.|(\[\d+\])/).filter(Boolean)
  let cur = obj
  for (const part of parts) {
    const idx = part.match(/^\[(\d+)\]$/)
    if (idx) cur = cur?.[+idx[1]]
    else cur = cur?.[part]
    if (cur === undefined) return { error: `路径不存在: ${path}` }
  }
  return { value: cur }
}

const tools = [
  { name: 'extract_paths', description: '提取 JSON 的所有路径与值（最多 200 条）。用于快速了解结构。', inputSchema: { type: 'object', properties: { json: { type: 'string', description: 'JSON 字符串' } }, required: ['json'] } },
  { name: 'search_json', description: '在 JSON 中搜索键或值含 query 的项，返回路径与值。', inputSchema: { type: 'object', properties: { json: { type: 'string', description: 'JSON 字符串' }, query: { type: 'string', description: '搜索词' } }, required: ['json', 'query'] } },
  { name: 'get_path', description: '按路径取值（a.b[0].c 或 $.a.b）。', inputSchema: { type: 'object', properties: { json: { type: 'string' }, path: { type: 'string' } }, required: ['json', 'path'] } }
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
  if (method === 'initialize') return send({ jsonrpc: '2.0', id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'json-explorer', version: '1.0.0' } } })
  if (method === 'tools/list') return send({ jsonrpc: '2.0', id, result: { tools } })
  if (method === 'tools/call') {
    const name = params?.name, args = params?.arguments || {}
    let obj
    try { obj = JSON.parse(args.json) } catch (e) { return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `✗ JSON 解析失败: ${e.message}` }], isError: true } }) }
    if (name === 'extract_paths') {
      const paths = extractPaths(obj)
      const text = `共 ${paths.length} 条路径：\n\n` + paths.map(p => `• ${p.path}${p.value !== undefined ? ` = ${JSON.stringify(p.value).slice(0, 40)}` : ` (${p.type})`}`).join('\n')
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }], _meta: { paths } } })
    }
    if (name === 'search_json') {
      const results = searchJson(obj, args.query)
      const text = results.length ? `找到 ${results.length} 项：\n\n` + results.map(r => `• ${r.path} = ${JSON.stringify(r.value).slice(0, 40)}`).join('\n') : '未找到'
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }], _meta: { results } } })
    }
    if (name === 'get_path') {
      const r = getPath(obj, args.path)
      if (r.error) return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `✗ ${r.error}` }], isError: true } })
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `${args.path} = ${JSON.stringify(r.value, null, 2)}` }], _meta: r } })
    }
    return send({ jsonrpc: '2.0', id, error: { code: -32601, message: `未知工具: ${name}` } })
  }
  if (id !== undefined) send({ jsonrpc: '2.0', id, error: { code: -32601, message: `未知方法: ${method}` } })
}
process.on('uncaughtException', (e) => { try { send({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'uncaught: ' + (e && e.message) } }) } catch (_) {} })
