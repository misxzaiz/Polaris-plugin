#!/usr/bin/env node
/**
 * Personal Hub MCP server（stdio JSON-RPC）
 *
 * 工具契约 1:1 镜像主仓内置版 personal_hub_mcp_server.rs（金标）：
 *   ph_list / ph_create / ph_get / ph_update / ph_delete
 * 数据面：Supabase REST（links 表），配置来自
 *   {appConfigDir}/config.json 的 plugins["personal-hub"]：
 *   { supabaseUrl, supabaseAnonKey, sessionToken, encryptionKey }
 *
 * 字段级加密（description）：AES-128-CBC + PKCS7 + OpenSSL "Salted__" 盐 +
 * EVP_BytesToKey(MD5)，与 crypto-js AES.encrypt 口令模式完全兼容（金标
 * personal_hub_crypto.rs 同格式）。写路径存明文（与金标一致——加密由面板侧
 * 完成），读路径 is_encrypted=true 时解密，失败回占位符。
 */

const https = require('https')
const http = require('http')
const crypto = require('crypto')

const PLUGIN_ID = 'personal-hub'
const SERVER_NAME = 'polaris-ph-mcp'
const SERVER_VERSION = '0.2.0'
const PROTOCOL_VERSION = '2024-11-05'

// 与主仓金标相同的 Supabase 默认配置（用户可在面板/配置中覆盖）
const DEFAULT_SUPABASE_URL = 'https://nynpqrwsautudqblxoir.supabase.co'
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55bnBxcndzYXV0dWRxYmx4b2lyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI3MDkzMDksImV4cCI6MjA3ODI4NTMwOX0.rz79QkbbSEQPsrSdbYYFL-nuV_MwdAWhf4-gQ0j_fz4'

const ENCRYPTED_PLACEHOLDER_NO_KEY = '[已加密 — 需配置密钥]'
const ENCRYPTED_PLACEHOLDER_FAILED = '[解密失败]'

// ── 配置 ─────────────────────────────────────────────────────────────────────

function loadPhConfig(appConfigDir) {
  if (!appConfigDir) return {}
  try {
    const p = require('path').join(appConfigDir, 'config.json')
    const store = JSON.parse(require('fs').readFileSync(p, 'utf8'))
    return store.plugins?.[PLUGIN_ID] || {}
  } catch {
    return {}
  }
}

function makeClient(appConfigDir) {
  const cfg = loadPhConfig(appConfigDir)
  return {
    supabaseUrl: (cfg.supabaseUrl || DEFAULT_SUPABASE_URL).trim().replace(/\/+$/, ''),
    anonKey: (cfg.supabaseAnonKey || DEFAULT_SUPABASE_ANON_KEY).trim(),
    sessionToken: (cfg.sessionToken || '').trim(),
    encryptionKey: (cfg.encryptionKey || '').trim(),
  }
}

// ── 字段级加密（与 crypto-js 口令模式/金标 personal_hub_crypto.rs 兼容） ──────

function evpBytesToKey(passphrase, salt, keyLen = 16, ivLen = 16) {
  const total = keyLen + ivLen
  let prev = Buffer.alloc(0)
  const chunks = []
  while (Buffer.concat(chunks).length < total) {
    const hash = crypto.createHash('md5')
    hash.update(prev)
    hash.update(passphrase)
    hash.update(salt)
    prev = hash.digest()
    chunks.push(prev)
  }
  const all = Buffer.concat(chunks)
  return { key: all.subarray(0, keyLen), iv: all.subarray(keyLen, keyLen + ivLen) }
}

function encryptDescription(plaintext, passphrase) {
  if (!passphrase) return plaintext
  const salt = crypto.randomBytes(8)
  const { key, iv } = evpBytesToKey(Buffer.from(passphrase, 'utf8'), salt)
  const cipher = crypto.createCipheriv('aes-128-cbc', key, iv)
  const ct = Buffer.concat([cipher.update(Buffer.from(plaintext, 'utf8')), cipher.final()])
  return Buffer.concat([Buffer.from('Salted__'), salt, ct]).toString('base64')
}

function decryptDescription(text, isEncrypted, encryptionKey) {
  if (text === undefined || text === null || text === '') return ''
  if (!isEncrypted) return text
  if (!encryptionKey) return ENCRYPTED_PLACEHOLDER_NO_KEY
  try {
    const data = Buffer.from(String(text).trim(), 'base64')
    const prefix = Buffer.from('Salted__')
    if (data.length < prefix.length + 8 + 16 || !data.subarray(0, 8).equals(prefix)) {
      return ENCRYPTED_PLACEHOLDER_FAILED
    }
    const salt = data.subarray(8, 16)
    const ct = data.subarray(16)
    const { key, iv } = evpBytesToKey(Buffer.from(encryptionKey, 'utf8'), salt)
    const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv)
    const pt = Buffer.concat([decipher.update(ct), decipher.final()])
    return pt.toString('utf8')
  } catch {
    return ENCRYPTED_PLACEHOLDER_FAILED
  }
}

// ── Supabase REST 客户端 ──────────────────────────────────────────────────────

function restRequest(client, method, pathWithQuery, body) {
  return new Promise((resolve, reject) => {
    const url = `${client.supabaseUrl}${pathWithQuery}`
    const lib = url.startsWith('https:') ? https : http
    const headers = {
      apikey: client.anonKey,
      'Content-Type': 'application/json',
    }
    if (client.sessionToken) headers.Authorization = `Bearer ${client.sessionToken}`
    if (method === 'PATCH') headers.Prefer = 'return=representation'
    if (method === 'POST') headers.Prefer = 'return=representation'
    const req = lib.request(url, { method, headers }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(text || 'null'))
          } catch {
            resolve(null)
          }
        } else {
          reject(new Error(`Supabase REST 返回 ${res.statusCode}: ${text.slice(0, 300)}`))
        }
      })
    })
    req.on('error', reject)
    req.setTimeout(15000, () => {
      req.destroy(new Error('Supabase 请求超时（15s）'))
    })
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body))
    req.end()
  })
}

function ensureAuth(client) {
  if (!client.sessionToken) {
    throw new Error('未登录 Personal Hub。请先在个人空间面板中登录，然后重试。')
  }
}

// ── 工具实现（与金标 execute_ph_* 语义一致） ─────────────────────────────────

function buildFilters(args = {}) {
  const filters = []
  if (args.type) filters.push(`type=eq.${args.type}`)
  if (typeof args.completed === 'boolean') filters.push(`completed=eq.${args.completed}`)
  if (typeof args.tags === 'string' && args.tags.trim()) {
    for (const tag of args.tags.split(',')) {
      const t = tag.trim()
      if (t) filters.push(`tags=cs.{"${t}"}`)
    }
  }
  return filters
}

async function executePhList(args, client) {
  ensureAuth(client)
  const params = new URLSearchParams()
  params.set('select', '*')
  for (const f of buildFilters(args)) params.append(f.split('=')[0], f.split('=').slice(1).join('='))
  const sortBy = args.sortBy || 'created_at'
  const sortOrder = args.sortOrder || 'desc'
  params.set('order', `${sortBy}.${sortOrder}`)
  const limit = Math.min(Number(args.limit) || 50, 100)
  params.set('limit', String(limit))
  const qs = params.toString()
  const result = await restRequest(client, 'GET', `/rest/v1/links${qs ? `?${qs}` : ''}`)
  const items = Array.isArray(result) ? result : []
  return {
    structuredContent: { count: items.length, items, hasSessionToken: true },
    content: [{ type: 'text', text: `共 ${items.length} 条记录` }],
  }
}

async function executePhCreate(args, client) {
  const title = typeof args.title === 'string' ? args.title.trim() : ''
  if (!title) throw new Error('title 不能为空')
  const typ = args.type
  if (!['navigation', 'bookmark', 'todo', 'note'].includes(typ)) {
    throw new Error(`无效的 type: ${typ}，可选值: navigation, bookmark, todo, note`)
  }
  ensureAuth(client)
  const body = { title, type: typ }
  if (typeof args.url === 'string') body.url = args.url
  if (typeof args.description === 'string') body.description = args.description
  if (Array.isArray(args.tags)) {
    const tagStrs = args.tags.map((t) => String(t).trim()).filter(Boolean)
    if (tagStrs.length) body.tags = tagStrs
  }
  if (typeof args.priority === 'string') body.priority = args.priority
  if (typeof args.dueDate === 'string') body.due_date = args.dueDate
  if (typeof args.completed === 'boolean') body.completed = args.completed
  const result = await restRequest(client, 'POST', '/rest/v1/links', body)
  return {
    structuredContent: { item: result, action: 'created' },
    content: [{ type: 'text', text: `已创建 【${title}】(${typ})` }],
  }
}

async function executePhGet(args, client) {
  const id = typeof args.id === 'string' ? args.id.trim() : ''
  if (!id) throw new Error('id 不能为空')
  ensureAuth(client)
  const result = await restRequest(client, 'GET', `/rest/v1/links?id=eq.${encodeURIComponent(id)}&select=*`)
  const items = Array.isArray(result) ? result : []
  if (!items.length) throw new Error(`未找到条目: ${id}`)
  const item = items[0]
  const isEncrypted = item.is_encrypted === true
  const decrypted = decryptDescription(item.description, isEncrypted, client.encryptionKey)
  const itemDisplay = { ...item }
  if (isEncrypted) itemDisplay.description = decrypted
  return {
    structuredContent: { item: itemDisplay, isEncrypted },
    content: [{ type: 'text', text: `【${item.title || ''}】(${item.type || ''})` }],
  }
}

async function executePhUpdate(args, client) {
  const id = typeof args.id === 'string' ? args.id.trim() : ''
  if (!id) throw new Error('id 不能为空')
  ensureAuth(client)
  const body = {}
  if (typeof args.title === 'string') body.title = args.title
  if (typeof args.url === 'string') body.url = args.url
  if (typeof args.description === 'string') body.description = args.description
  if (Array.isArray(args.tags)) {
    const tagStrs = args.tags.map((t) => String(t).trim()).filter(Boolean)
    if (tagStrs.length) body.tags = tagStrs
  }
  if (typeof args.priority === 'string') body.priority = args.priority
  if (typeof args.dueDate === 'string') body.due_date = args.dueDate
  if (typeof args.completed === 'boolean') body.completed = args.completed
  body.updated_at = 'now()'
  const result = await restRequest(client, 'PATCH', `/rest/v1/links?id=eq.${encodeURIComponent(id)}`, body)
  return {
    structuredContent: { item: result, action: 'updated' },
    content: [{ type: 'text', text: `已更新条目: ${id}` }],
  }
}

async function executePhDelete(args, client) {
  const id = typeof args.id === 'string' ? args.id.trim() : ''
  if (!id) throw new Error('id 不能为空')
  ensureAuth(client)
  await restRequest(client, 'DELETE', `/rest/v1/links?id=eq.${encodeURIComponent(id)}`)
  return {
    structuredContent: { id, action: 'deleted' },
    content: [{ type: 'text', text: `已删除条目: ${id}` }],
  }
}

// ── 工具声明（schema 与金标 tools_list 一致） ────────────────────────────────

const TOOLS = [
  {
    name: 'ph_list',
    description:
      '列出 Personal Hub 条目（bookmarks/todos/notes/navigation）。支持按类型和完成状态过滤。需要先登录个人空间（在个人空间面板登录）。',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['navigation', 'bookmark', 'todo', 'note'], description: '按类型筛选' },
        completed: { type: 'boolean', description: '按完成状态筛选（仅 todo 类型有效）' },
        tags: { type: 'string', description: '标签关键词（逗号分隔，逻辑 OR）' },
        limit: { type: 'number', description: '返回条数上限，默认 50' },
        sortBy: { type: 'string', description: '排序字段，默认 created_at' },
        sortOrder: { type: 'string', enum: ['asc', 'desc'], description: '排序方向，默认 desc' },
      },
    },
  },
  {
    name: 'ph_create',
    description: '在 Personal Hub 中创建一条新条目。需要先登录个人空间（在个人空间面板登录）。',
    inputSchema: {
      type: 'object',
      required: ['title', 'type'],
      properties: {
        title: { type: 'string', description: '标题' },
        type: { type: 'string', enum: ['navigation', 'bookmark', 'todo', 'note'], description: '条目类型' },
        url: { type: 'string', description: '链接地址（navigation/bookmark 类型必填）' },
        description: { type: 'string', description: '详细描述' },
        tags: { type: 'array', items: { type: 'string' }, description: '标签列表' },
        priority: { type: 'string', description: '优先级' },
        dueDate: { type: 'string', description: '截止日期（ISO 8601）' },
        completed: { type: 'boolean', description: '是否已完成（仅 todo 类型有效）' },
      },
    },
  },
  {
    name: 'ph_get',
    description: '查看 Personal Hub 单条条目的详细信息。需要先登录个人空间。',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'string', description: '条目 ID（UUID）' } },
    },
  },
  {
    name: 'ph_update',
    description: '更新 Personal Hub 中已有的条目。需要先登录个人空间。',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string', description: '条目 ID（UUID）' },
        title: { type: 'string', description: '标题' },
        url: { type: 'string', description: '链接地址' },
        description: { type: 'string', description: '详细描述' },
        tags: { type: 'array', items: { type: 'string' }, description: '标签列表' },
        priority: { type: 'string', description: '优先级' },
        dueDate: { type: 'string', description: '截止日期（ISO 8601）' },
        completed: { type: 'boolean', description: '是否已完成' },
      },
    },
  },
  {
    name: 'ph_delete',
    description: '删除 Personal Hub 中的一条条目。需要先登录个人空间。',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'string', description: '条目 ID（UUID）' } },
    },
  },
]

// ── stdio JSON-RPC 循环 ──────────────────────────────────────────────────────

const appConfigDir = process.argv[2]

function reply(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n')
}
function replyError(id, code, message) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n')
}

async function handleRequest(req) {
  const { id, method, params } = req
  try {
    if (method === 'initialize') {
      reply(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      })
    } else if (method === 'notifications/initialized') {
      // 无需响应
    } else if (method === 'tools/list') {
      reply(id, { tools: TOOLS })
    } else if (method === 'tools/call') {
      const name = params?.name
      const args = params?.arguments || {}
      const client = makeClient(appConfigDir)
      let out
      if (name === 'ph_list') out = await executePhList(args, client)
      else if (name === 'ph_create') out = await executePhCreate(args, client)
      else if (name === 'ph_get') out = await executePhGet(args, client)
      else if (name === 'ph_update') out = await executePhUpdate(args, client)
      else if (name === 'ph_delete') out = await executePhDelete(args, client)
      else throw new Error(`未知工具: ${name}`)
      reply(id, { jsonrpc: '2.0', ...out })
    } else if (method === 'ping') {
      reply(id, {})
    } else {
      replyError(id, -32601, `未知方法: ${method}`)
    }
  } catch (e) {
    reply(id, {
      content: [{ type: 'text', text: `执行失败: ${e.message}` }],
      isError: true,
    })
  }
}

let buf = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (d) => {
  buf += d
  let idx
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx).trim()
    buf = buf.slice(idx + 1)
    if (!line) continue
    try {
      const req = JSON.parse(line)
      handleRequest(req)
    } catch (e) {
      replyError(null, -32700, `JSON 解析失败: ${e.message}`)
    }
  }
})
process.stdin.on('end', () => process.exit(0))
