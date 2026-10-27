// zcode-bridge HTTP 服务 — 供面板读取并对话 ZCode 会话
//
// 启动参数：node server.js [port] [pluginDir] [appConfigDir]
// 端点：
//   GET  /__health                                    健康检查
//   GET  /api/sessions?limit=                         最近会话列表（读 db.sqlite）
//   GET  /api/ping                                    ZCode app-server 可达性探测
//   GET  /api/session/:id/msgs                       读历史消息（message/part 表）
//   POST /api/chat/create                             新建会话（zcode create）
//   POST /api/chat/resume                             续接历史会话（zcode resume）
//   POST /api/chat/send                              { sessionId, content } → 发送并返回事件游标
//   GET  /api/chat/events?sessionId=&cursor=         拉取该会话增量事件（轮询）
//
// 访问模型：面板（桌面/移动）一律经宿主桥 router_dispatch → cap.http 转发，
// 由桌面后端以回环地址访问本服务。因此只监听 127.0.0.1，不暴露局域网。
//
// 流式通道（2026-10-26）：cap.http 经 reqwest 一次性请求，不支持 SSE 长连接，
// 故对话事件采用「send 返回游标 + 面板轮询 events」增量拉取。事件在
// ZCodeClient 内存缓冲（drainEvents），cursor 递增即增量。
'use strict'

const http = require('http')
const path = require('path')
const os = require('node:os')
const fs = require('fs')
const { DatabaseSync } = require('node:sqlite')

const PORT = parseInt(process.argv[2] || '9862', 10)
const PLUGIN_DIR = process.argv[3] || path.join(__dirname, '..')
const { ZCodeClient, queryDbSessions, resolveProviderConfig } = require(path.join(PLUGIN_DIR, 'mcp', 'zcode-core.js'))

// 插件配置段所在 config.json 路径（宿主启动时经 {{appConfigDir}} 注入）。
// 多候选：显式 env > 命令行参数 > 数据根相对路径（服务 cwd 下）> 家目录。
const CANDIDATE_CONFIGS = [
  process.env.POLARIS_CONFIG_PATH,
  process.argv[4] ? path.join(process.argv[4], 'config.json') : '',
  path.join(__dirname, '..', '..', 'config.json'), // 数据根 <root>/config.json
  path.join(os.homedir(), '.polaris', 'config.json'),
  path.join(os.homedir(), 'config.json'),
].filter(Boolean)
function resolveConfigPath() {
  for (const p of CANDIDATE_CONFIGS) {
    try { if (fs.existsSync(p)) return p } catch {}
  }
  return CANDIDATE_CONFIGS[0] || ''
}
const CONFIG_PATH = resolveConfigPath()

function send(res, code, type, body) {
  res.writeHead(code, { 'Content-Type': type, 'Access-Control-Allow-Origin': '*' })
  res.end(body)
}
function sendJson(res, code, obj) {
  send(res, code, 'application/json', JSON.stringify(obj))
}
function bodyOf(req) {
  return new Promise((resolve) => {
    let chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')) } catch { resolve({}) } })
  })
}

function readSessions(limit) {
  const rows = queryDbSessions({ limit: Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50) })
  if (rows.error) throw new Error(rows.error)
  return rows.map((r) => ({
    sessionId: r.sessionId,
    title: r.title || '',
    taskType: r.taskType || '',
    workspaceId: r.workspaceId || '',
    directory: r.directory || '',
    timeUpdated: r.timeUpdated || '',
  }))
}

// 已落库会话的工作区目录去重列表（供面板工作区下拉）
// 注意：路径分隔符正反斜杠歧义（D:/x 与 D:\x），统一归一为正斜杠再去重。
function readWorkspaces() {
  const dbPath = path.join(os.homedir(), '.zcode', 'cli', 'db', 'db.sqlite')
  const db = new DatabaseSync(dbPath, { readOnly: true })
  try {
    const rows = db
      .prepare(`SELECT DISTINCT directory FROM session WHERE directory IS NOT NULL AND directory != '' ORDER BY directory`)
      .all()
    db.close()
    const seen = new Set()
    const out = []
    for (const { directory: d } of rows) {
      const norm = String(d).replace(/\\/g, '/')
      if (seen.has(norm)) continue
      seen.add(norm)
      out.push(norm)
    }
    return out
  } catch (e) {
    db.close()
    return { error: String((e && e.message) || e) }
  }
}

// 归一化工作区参数：显式传入 > 默认值
function resolveWorkspace(ws) {
  const v = (ws || '').trim()
  return v || DEFAULT_WS
}

// ── 历史消息读取（message / part 表，正文在 part.data JSON）───────────────
function readMessages(sessionId, dbPath = path.join(os.homedir(), '.zcode', 'cli', 'db', 'db.sqlite')) {
  const db = new DatabaseSync(dbPath, { readOnly: true })
  try {
    const rows = db
      .prepare(
        `SELECT m.id AS msg_id, m.data AS msg_data, m.time_created AS msg_at,
                p.id AS part_id, p.data AS part_data, p.time_created AS part_at
         FROM message m
         LEFT JOIN part p ON p.message_id = m.id
         WHERE m.session_id = ?
         ORDER BY m.sequence ASC, p.sequence ASC`
      )
      .all(sessionId)
    db.close()
    const msgs = []
    const byMsg = new Map()
    for (const r of rows) {
      let mdata = {}
      try { mdata = JSON.parse(r.msg_data || '{}') } catch {}
      if (!byMsg.has(r.msg_id)) {
        byMsg.set(r.msg_id, {
          id: r.msg_id,
          role: mdata.role || 'assistant',
          timeCreated: r.msg_at,
          parts: [],
        })
        msgs.push(byMsg.get(r.msg_id))
      }
      if (r.part_id) {
        let pdata = {}
        try { pdata = JSON.parse(r.part_data || '{}') } catch {}
        byMsg.get(r.msg_id).parts.push({
          id: r.part_id,
          type: pdata.type || 'text',
          text: pdata.text || '',
          reasoning: pdata.text && pdata.type === 'reasoning' ? pdata.text : '',
          timeCreated: r.part_at,
        })
      }
    }
    return msgs
  } catch (e) {
    db.close()
    return { error: String((e && e.message) || e) }
  }
}

// ── ZCodeClient 单例（面板对话用；与 MCP 各自独立实例）────────────────────
let client = null
const DEFAULT_WS = 'D:/space/base/Polaris'

function ensureClient() {
  if (client) return client
  client = new ZCodeClient({ workspacePath: DEFAULT_WS })
  return client
}

function workspaceRef(ws) {
  return { workspacePath: ws, workspaceKey: ws }
}

// ── 对话动作 ───────────────────────────────────────────────────────────────
// mode 说明：ZCode 会话模式决定工具执行权限（桌面端标签见括号）——
//   yolo     完全访问：放行一切工具（无条件）
//   guarded  自主模式：按风险分级，低风险自动执行，高风险发 permission 询问并等待应答
//   auto     （预留未实现）工具全拒："Auto mode is reserved but not implemented yet"
//   plan/build/edit  规划/构建/自动编辑模式
// 演进：'auto' 时代码工具全被拒 → 改 'guarded'（2026-10-26）→ 换 'yolo'（2026-10-27）：
// 桥接会话无人值守，本服务/zcode-core 没有 permissionRequested 应答方，guarded 的
// 高风险询问会永远停在「等待确认」挂死 turn（-32010 的另一来源）；yolo 与 ZCode
// 闲时任务场景的官方建议一致（"建议权限切换为完全访问，以减少任务失败率"）。
// 需要收紧时用 ZBRIDGE_DEFAULT_MODE 环境变量覆盖，无需改代码。
const DEFAULT_MODE = process.env.ZBRIDGE_DEFAULT_MODE || 'yolo'

async function doCreate(workspacePath, mode) {
  const c = ensureClient()
  const ws = resolveWorkspace(workspacePath)
  const m = mode || DEFAULT_MODE
  const resp = await c.request('session/create', { workspace: workspaceRef(ws), mode: m })
  if (resp.error) throw new Error(`${resp.error.message || 'create 失败'} (${resp.error.code})`)
  const sessionId = resp.result.sessionId || (resp.result.session && resp.result.session.sessionId)
  if (!sessionId) throw new Error('create 未返回 sessionId')
  return { sessionId, workspacePath: ws, mode: m }
}

async function doResume(sessionId, workspacePath) {
  const c = ensureClient()
  const ws = resolveWorkspace(workspacePath)
  const resp = await c.resume(sessionId, ws)
  // resp 含 { messages: [...] }，面板不需要立即全量，只确认成功
  return { sessionId, resumed: true, workspacePath: ws, messageCount: (resp.messages || []).length }
}

async function doSend(sessionId, content, workspacePath) {
  const c = ensureClient()
  const ws = resolveWorkspace(workspacePath)
  // 冷启动后历史会话需先 resume 激活（幂等：已激活时 app-server 会容错合并）
  if (!c.subscribedSession() || c.subscribedSession() !== sessionId) {
    try { await c.resume(sessionId, ws) } catch (e) { /* 会话可能不存在，交 send 报错 */ }
  }
  // 订阅该会话事件流（幂等：app-server 对重复订阅会合并）
  try { await c.subscribe(sessionId) } catch (e) { /* 订阅失败不阻断 send */ }
  await c.sendMessage(sessionId, content)
  // 返回当前游标，面板从 cursor 之后拉增量
  const { cursor } = c.drainEvents(-1)
  return { sessionId, cursor }
}

async function doEvents(sessionId, cursor) {
  const c = ensureClient()
  if (c.subscribedSession() !== sessionId) return { cursor, events: [] }
  const { cursor: next, events } = c.drainEvents(cursor)
  return { cursor: next, events }
}

function doModel(sessionId) {
  const c = ensureClient()
  if (c.subscribedSession() !== sessionId) return { model: null }
  return { model: c.sessionModel() }
}

// ── 路由 ───────────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const url = (req.url || '/').split('?')[0]
  const query = new URL(req.url, 'http://127.0.0.1').searchParams

  try {
    if (url === '/__health') {
      return send(res, 200, 'application/json', JSON.stringify({ status: 'ok', uptime: process.uptime() }))
    }

    if (url === '/api/ping') {
      const zcodeCjs = process.env.ZCODE_CJS || 'D:/app/ZCode/resources/glm/zcode.cjs'
      const provider = resolveProviderConfig()
      return send(res, 200, 'application/json', JSON.stringify({
        zcodeCjsExists: fs.existsSync(zcodeCjs),
        zcodeCjs,
        providerConfigFound: !!provider,
        providerConfig: provider || null,
      }))
    }

    if (url === '/api/sessions') {
      try {
        const rows = readSessions(query.get('limit'))
        return sendJson(res, 200, { ok: true, count: rows.length, sessions: rows })
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: String(e.message || e) })
      }
    }

    const msgsMatch = url.match(/^\/api\/session\/([^/]+)\/msgs$/)
    if (msgsMatch) {
      const sid = msgsMatch[1]
      const rows = readMessages(sid)
      if (rows.error) return sendJson(res, 500, { ok: false, error: rows.error })
      return sendJson(res, 200, { ok: true, count: rows.length, messages: rows })
    }

    if (url === '/api/workspaces') {
      try {
        const ws = readWorkspaces()
        if (ws.error) return sendJson(res, 500, { ok: false, error: ws.error })
        return sendJson(res, 200, { ok: true, count: ws.length, workspaces: ws })
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: String(e.message || e) })
      }
    }

    if (url === '/api/chat/create' && req.method === 'POST') {
      const body = await bodyOf(req)
      try {
        const r = await doCreate(body.workspacePath, body.mode)
        return sendJson(res, 200, { ok: true, ...r })
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: String(e.message || e) })
      }
    }

    if (url === '/api/chat/resume' && req.method === 'POST') {
      const body = await bodyOf(req)
      if (!body.sessionId) return sendJson(res, 400, { ok: false, error: '缺少 sessionId' })
      try {
        const r = await doResume(body.sessionId, body.workspacePath)
        return sendJson(res, 200, { ok: true, ...r })
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: String(e.message || e) })
      }
    }

    if (url === '/api/chat/send' && req.method === 'POST') {
      const body = await bodyOf(req)
      if (!body.sessionId || !body.content || !body.content.trim()) {
        return sendJson(res, 400, { ok: false, error: '缺少 sessionId/content' })
      }
      try {
        const r = await doSend(body.sessionId, body.content.trim(), body.workspacePath)
        return sendJson(res, 200, { ok: true, ...r })
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: String(e.message || e) })
      }
    }

    if (url === '/api/chat/events') {
      const sessionId = query.get('sessionId')
      const cursor = parseInt(query.get('cursor') || '-1', 10)
      if (!sessionId) return sendJson(res, 400, { ok: false, error: '缺少 sessionId' })
      try {
        const r = await doEvents(sessionId, cursor)
        return sendJson(res, 200, { ok: true, ...r })
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: String(e.message || e) })
      }
    }

    if (url === '/api/chat/model') {
      const sessionId = query.get('sessionId')
      if (!sessionId) return sendJson(res, 400, { ok: false, error: '缺少 sessionId' })
      try {
        const r = doModel(sessionId)
        return sendJson(res, 200, { ok: true, ...r })
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: String(e.message || e) })
      }
    }

    send(res, 404, 'text/plain', 'not found')
  } catch (e) {
    sendJson(res, 500, { ok: false, error: String((e && e.message) || e) })
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[zcode-bridge] http server → http://127.0.0.1:${PORT}`)
  process.send?.({ type: 'ready', port: PORT })
})

process.on('SIGTERM', () => server.close(() => process.exit(0)))
process.on('SIGINT', () => server.close(() => process.exit(0)))