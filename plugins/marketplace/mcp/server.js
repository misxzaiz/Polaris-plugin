#!/usr/bin/env node
/**
 * Polaris 插件商城 MCP Server
 *
 * 提供工具：
 *   - search_plugins(query)        按关键字搜索商城索引
 *   - list_plugins(category?)      列出插件（可按分类过滤）
 *   - get_plugin_detail(id)        获取单个插件详情（含 versions 历史版本列表）
 *   - list_plugin_versions(id)     列出某个插件的所有历史版本
 *   - install_plugin(id, scope, version?) 一键安装：可选指定版本，
 *                                  默认安装最新版
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
    description: '获取某个插件的完整详情（含 downloadUrl / updateUrl / 权限 / versions 历史版本列表）。',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: '插件 id' } },
      required: ['id']
    }
  },
  {
    name: 'list_plugin_versions',
    description: '列出某个插件的所有历史版本（含版本号、downloadUrl、sha256）。',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: '插件 id' } },
      required: ['id']
    }
  },
  {
    name: 'install_plugin',
    description: '一键安装插件：返回该插件的 downloadUrl 与安装指引。可选 version 参数指定安装历史版本，不传则安装最新版。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '插件 id' },
        version: { type: 'string', description: '可选，指定安装的版本号（如 "0.3.0"）。不传则安装最新版。' },
        scope: { type: 'string', enum: ['user', 'project'], description: '安装作用域，默认 user' }
      },
      required: ['id']
    }
  },
  {
    name: 'list_installed',
    description: '列出本地已安装的 Polaris 插件（含 installPath / 版本 / 来源）。',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'uninstall_plugin',
    description: '卸载已安装的插件。需先通过 list_installed 获取 installPath。',
    inputSchema: {
      type: 'object',
      properties: {
        installPath: { type: 'string', description: '插件安装路径（来自 list_installed）' }
      },
      required: ['installPath']
    }
  },
  {
    name: 'check_plugin_update',
    description: '检查已安装插件是否有新版本（读取其 origin.updateUrl 比对版本）。',
    inputSchema: {
      type: 'object',
      properties: {
        installPath: { type: 'string', description: '插件安装路径' }
      },
      required: ['installPath']
    }
  },
  {
    name: 'apply_plugin_update',
    description: '应用插件更新：下载新版本并替换。需先 installPath。',
    inputSchema: {
      type: 'object',
      properties: {
        installPath: { type: 'string', description: '插件安装路径' }
      },
      required: ['installPath']
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
      id: p.id, name: p.name, version: p.version, description: p.description, category: p.category, tier: p.tier || 'demo'
    }))
  }

  if (name === 'list_plugins') {
    const cat = args.category
    let list = cat ? plugins.filter(p => p.category === cat) : plugins
    list = list.slice(0, Number(args.limit) || 50)
    return list.map(p => ({
      id: p.id, name: p.name, version: p.version, description: p.description, category: p.category, tier: p.tier || 'demo'
    }))
  }

  if (name === 'get_plugin_detail') {
    const p = plugins.find(x => x.id === args.id)
    if (!p) return { error: `未找到插件: ${args.id}` }
    return {
      id: p.id, name: p.name, version: p.version, description: p.description,
      author: p.author, category: p.category, tags: p.tags, tier: p.tier || 'demo', permissions: p.permissions,
      manifestUrl: p.manifestUrl, downloadUrl: p.downloadUrl, updateUrl: p.updateUrl,
      sha256: p.sha256, readme: p.readme,
      versions: p.versions || []
    }
  }

  if (name === 'list_plugin_versions') {
    const p = plugins.find(x => x.id === args.id)
    if (!p) return { error: `未找到插件: ${args.id}` }
    const versions = p.versions || []
    if (versions.length === 0) return { id: p.id, version: p.version, versions: [{ version: p.version, downloadUrl: p.downloadUrl, sha256: p.sha256 }], note: '该插件未记录历史版本，仅返回当前最新版' }
    return { id: p.id, version: p.version, versions }
  }

  if (name === 'install_plugin') {
    const p = plugins.find(x => x.id === args.id)
    if (!p) return { error: `未找到插件: ${args.id}` }

    // 如果指定了版本号，从 versions 中查找对应版本的 downloadUrl
    if (args.version) {
      const versions = p.versions || []
      const target = versions.find(v => v.version === args.version)
      if (!target) return { error: `未找到插件 ${args.id} 的版本 ${args.version}。可用版本：${versions.map(v => v.version).join(', ') || p.version}` }
      return {
        id: p.id, name: p.name, version: target.version, tier: p.tier || 'demo',
        downloadUrl: target.downloadUrl,
        scope: args.scope || 'user',
        instruction: `调用 Polaris 命令 plugin_install_remote，参数 sourceUrl="${target.downloadUrl}"，scope="${args.scope || 'user'}"`
      }
    }

    return {
      id: p.id, name: p.name, version: p.version, tier: p.tier || 'demo',
      downloadUrl: p.downloadUrl,
      scope: args.scope || 'user',
      instruction: `在 Polaris 设置 → 插件 → 远程安装，粘贴此 downloadUrl；或让 AI 调用 installRemotePlugin 完成：${p.downloadUrl}`
    }
  }

  // 以下工具操作本地已装插件。MCP server 为独立 Node 进程，无法直接调用
  // Tauri 命令，因此返回操作指引与所需参数，由面板或 AI 在宿主侧执行。
  if (name === 'list_installed') {
    return {
      note: 'MCP 进程无法直接读取本地已装列表。请在 Polaris 商城面板查看「已装」标签，',
      hint: '或由 AI 引导用户打开 设置 → 插件 查看已装插件及其 installPath。'
    }
  }

  if (name === 'uninstall_plugin') {
    return {
      installPath: args.installPath,
      instruction: `调用 Polaris 命令 plugin_uninstall_local，参数 installPath="${args.installPath}"。面板的「已装」标签提供一键卸载。`
    }
  }

  if (name === 'check_plugin_update') {
    return {
      installPath: args.installPath,
      instruction: `调用 Polaris 命令 plugin_check_update，参数 installPath="${args.installPath}"。返回 updateAvailable/latestVersion/downloadUrl。面板「已装」标签提供一键检查。`
    }
  }

  if (name === 'apply_plugin_update') {
    return {
      installPath: args.installPath,
      instruction: `调用 Polaris 命令 plugin_apply_update，参数 installPath="${args.installPath}"。面板「已装」标签提供一键更新。`
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
