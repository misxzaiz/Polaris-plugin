#!/usr/bin/env node
/**
 * Polaris 插件商城 MCP Server
 *
 * 提供工具：
 *   - search_plugins(query)        按关键字搜索商城索引
 *   - list_plugins(category?)      列出插件（可按分类过滤）
 *   - get_plugin_detail(id)        获取单个插件详情
 *   - install_plugin(id, scope)   一键安装：返回该插件的 downloadUrl，
 *                                  由 AI / 用户在 Polaris 内触发 installRemotePlugin
 *
 * 索引地址通过环境变量 MARKETPLACE_INDEX 传入（默认指向本仓库 index.json）。
 * JSON-RPC 2.0 over stdin/stdout，与 Polaris MCP 规范一致。
 */
const http = require('http')
const https = require('https')

const INDEX_URL = process.env.MARKETPLACE_INDEX
  || 'https://raw.githubusercontent.com/misxzaiz/Polaris-plugin/main/index.json'

function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n') }

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http
    lib.get(url, { headers: { 'Accept': 'application/json' } }, (res) => {
      let data = ''
      res.on('data', c => { data += c })
      res.on('end', () => {
        try { resolve(JSON.parse(data)) } catch (e) { reject(new Error('解析 JSON 失败: ' + e.message)) }
      })
    }).on('error', reject)
  })
}

let cache = null
let cacheAt = 0
async function getIndex() {
  const now = Date.now()
  if (cache && now - cacheAt < 60000) return cache
  cache = await fetchJson(INDEX_URL)
  cacheAt = now
  return cache
}

const tools = [
  {
    name: 'search_plugins',
    description: '在 Polaris 插件商城按关键字搜索插件（匹配 id/name/description/tags）。',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', description: '搜索关键字' } },
      required: ['query']
    }
  },
  {
    name: 'list_plugins',
    description: '列出 Polaris 插件商城中的插件，可按分类过滤。',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: '可选分类过滤' },
        limit: { type: 'number', description: '返回上限，默认 50' }
      }
    }
  },
  {
    name: 'get_plugin_detail',
    description: '获取某个插件的完整详情（含 downloadUrl / updateUrl / 权限）。',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: '插件 id' } },
      required: ['id']
    }
  },
  {
    name: 'install_plugin',
    description: '一键安装插件：返回该插件的 downloadUrl 与安装指引。Polaris 会用 installRemotePlugin(downloadUrl) 下载安装。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '插件 id' },
        scope: { type: 'string', enum: ['user', 'project'], description: '安装作用域，默认 user' }
      },
      required: ['id']
    }
  }
]

async function handleCall(name, args) {
  const index = await getIndex()
  const plugins = Array.isArray(index.plugins) ? index.plugins : []

  if (name === 'search_plugins') {
    const q = String(args.query || '').toLowerCase()
    const matches = plugins.filter(p => {
      const hay = [p.id, p.name, p.description, (p.tags || []).join(' ')].join(' ').toLowerCase()
      return hay.includes(q)
    })
    return matches.map(p => ({
      id: p.id, name: p.name, version: p.version, description: p.description, category: p.category
    }))
  }

  if (name === 'list_plugins') {
    const cat = args.category
    let list = cat ? plugins.filter(p => p.category === cat) : plugins
    list = list.slice(0, Number(args.limit) || 50)
    return list.map(p => ({
      id: p.id, name: p.name, version: p.version, description: p.description, category: p.category
    }))
  }

  if (name === 'get_plugin_detail') {
    const p = plugins.find(x => x.id === args.id)
    if (!p) return { error: `未找到插件: ${args.id}` }
    return {
      id: p.id, name: p.name, version: p.version, description: p.description,
      author: p.author, category: p.category, tags: p.tags, permissions: p.permissions,
      manifestUrl: p.manifestUrl, downloadUrl: p.downloadUrl, updateUrl: p.updateUrl,
      sha256: p.sha256, readme: p.readme
    }
  }

  if (name === 'install_plugin') {
    const p = plugins.find(x => x.id === args.id)
    if (!p) return { error: `未找到插件: ${args.id}` }
    return {
      id: p.id, name: p.name, version: p.version,
      downloadUrl: p.downloadUrl,
      scope: args.scope || 'user',
      instruction: `在 Polaris 设置 → 插件 → 远程安装，粘贴此 downloadUrl；或让 AI 调用 installRemotePlugin 完成：${p.downloadUrl}`
    }
  }

  return { error: `未知工具: ${name}` }
}

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
    try { msg = JSON.parse(line) } catch { continue }
    if (msg.method === 'initialize') {
      send({ jsonrpc: '2.0', id: msg.id, result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'polaris-marketplace', version: '1.0.0' }
      }})
    } else if (msg.method === 'tools/list') {
      send({ jsonrpc: '2.0', id: msg.id, result: { tools } })
    } else if (msg.method === 'tools/call') {
      const { name, arguments: args } = msg.params || {}
      handleCall(name, args)
        .then(result => send({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] } }))
        .catch(e => send({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: `错误: ${e.message}` }], isError: true } }))
    }
  }
})
