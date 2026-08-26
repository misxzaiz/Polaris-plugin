#!/usr/bin/env node
/**
 * 心流专注 FlowFocus MCP Server
 *
 * 提供四个工具：
 *   - focus_start：开始一次专注
 *   - focus_stop：结束专注，记录时长与感悟
 *   - focus_stats：查询专注统计（今日/本周/连续天数）
 *   - focus_log：浏览历史专注记录
 *
 * JSON-RPC 2.0 over stdin/stdout。
 * 数据落盘到 插件目录/data/focus.json，与面板共享同一份数据。
 */

const fs = require('fs')
const path = require('path')

// ── 数据存储 ──────────────────────────────────────────────────────────────

const DATA_DIR = path.join(__dirname, '..', 'data')
const DATA_FILE = path.join(DATA_DIR, 'focus.json')

const DEFAULT_STATE = {
  sessions: [],      // 完成的专注记录 [{id, task, startAt, endAt, durationMin, feel, note, distraction}]
  active: null,      // 进行中的专注 {task, startAt}
  totalFocusMin: 0,  // 累计专注分钟（冗余，便于快速统计）
  streakStart: null, // 连续专注的起始日期
  lastFocusDate: null,
  createdAt: null,
}

function load() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8')
    return Object.assign({}, DEFAULT_STATE, JSON.parse(raw))
  } catch {
    return Object.assign({}, DEFAULT_STATE, { createdAt: new Date().toISOString() })
  }
}

function save(state) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2), 'utf8')
}

function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function toMin(ms) {
  return Math.max(0, Math.round(ms / 60000))
}

// 计算连续专注天数
function computeStreak(state) {
  if (!state.lastFocusDate) return 0
  const last = new Date(state.lastFocusDate + 'T00:00:00')
  const today = new Date(todayKey() + 'T00:00:00')
  const diffDays = Math.round((today - last) / 86400000)
  // 今天专注过 或 昨天专注过 → 连续保持；否则断
  if (diffDays > 1) return 0
  return 1 // 简化：只要"最近一次专注在昨天或今天"即视为连续，精确计算留待面板
}

function fmtDuration(min) {
  const h = Math.floor(min / 60)
  const m = min % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

// ── 工具实现 ──────────────────────────────────────────────────────────────

function handleStart(args) {
  const state = load()
  if (state.active) {
    return {
      content: [{ type: 'text', text: JSON.stringify({
        ok: false,
        error: '已有进行中的专注，请先结束',
        activeTask: state.active.task,
      })}],
      isError: true,
    }
  }
  const task = String(args.task || '').trim() || '专注'
  const goalMin = Math.max(1, Number(args.goalMin) || 25)
  state.active = { task, startAt: new Date().toISOString(), goalMin }
  save(state)
  return {
    content: [{ type: 'text', text: JSON.stringify({
      ok: true,
      type: 'start',
      task,
      goalMin,
      startedAt: state.active.startAt,
      message: `开始专注「${task}」，目标 ${goalMin} 分钟。`,
    })}],
  }
}

function handleStop(args) {
  const state = load()
  if (!state.active) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ ok: false, error: '当前没有进行中的专注' }) }],
      isError: true,
    }
  }
  const active = state.active
  const endAt = new Date()
  const durationMin = Math.max(1, toMin(endAt - new Date(active.startAt)))
  const feel = Number(args.feel) || null // 1-5 心流程度
  const distraction = String(args.distraction || '').trim() || null
  const note = String(args.note || '').trim() || null

  const session = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    task: active.task,
    startAt: active.startAt,
    endAt: endAt.toISOString(),
    durationMin,
    goalMin: active.goalMin,
    feel,
    distraction,
    note,
  }

  state.sessions.push(session)
  state.active = null
  state.totalFocusMin += durationMin
  const tKey = todayKey()
  if (state.lastFocusDate !== tKey) {
    state.lastFocusDate = tKey
    if (state.streakStart === null) state.streakStart = tKey
  }
  save(state)

  return {
    content: [{ type: 'text', text: JSON.stringify({
      ok: true,
      type: 'stop',
      session,
      message: `完成「${active.task}」专注 ${fmtDuration(durationMin)}。`,
      streak: computeStreak(state),
    })}],
  }
}

function handleStats() {
  const state = load()
  const today = todayKey()
  const now = new Date()

  // 今日专注
  const todaySessions = state.sessions.filter(s => s.startAt.startsWith(today))
  const todayMin = todaySessions.reduce((a, s) => a + s.durationMin, 0)
  const activeMin = state.active
    ? toMin(now - new Date(state.active.startAt))
    : 0

  // 本周（周一为一周开始）
  const day = (now.getDay() + 6) % 7
  const monday = new Date(now)
  monday.setDate(now.getDate() - day)
  const mondayKey = todayKey(monday)
  const weekSessions = state.sessions.filter(s => s.startAt >= mondayKey + 'T00:00:00')
  const weekMin = weekSessions.reduce((a, s) => a + s.durationMin, 0)

  // 最近 7 天热力图
  const heatmap = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(now.getDate() - i)
    const key = todayKey(d)
    const min = state.sessions
      .filter(s => s.startAt.startsWith(key))
      .reduce((a, s) => a + s.durationMin, 0)
    heatmap.push({ date: key, min })
  }

  return {
    content: [{ type: 'text', text: JSON.stringify({
      ok: true,
      type: 'stats',
      active: state.active ? { task: state.active.task, activeMin, goalMin: state.active.goalMin } : null,
      today: { sessions: todaySessions.length, min: todayMin },
      week: { sessions: weekSessions.length, min: weekMin },
      total: { sessions: state.sessions.length, min: state.totalFocusMin },
      streak: computeStreak(state),
      heatmap,
    })}],
  }
}

function handleLog(args) {
  const state = load()
  const limit = Math.max(1, Number(args.limit) || 20)
  const recent = state.sessions.slice(-limit).reverse().map(s => ({
    task: s.task,
    date: s.startAt.slice(0, 16).replace('T', ' '),
    durationMin: s.durationMin,
    feel: s.feel,
    note: s.note,
    distraction: s.distraction,
  }))
  return {
    content: [{ type: 'text', text: JSON.stringify({ ok: true, type: 'log', count: recent.length, sessions: recent })}],
  }
}

// ── JSON-RPC 2.0 dispatcher ───────────────────────────────────────────────

const tools = [
  {
    name: 'focus_start',
    description: '开始一次心流专注。记录任务与目标时长。若已有进行中的专注会失败。',
    inputSchema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: '专注的任务名称，如"写周报"' },
        goalMin: { type: 'integer', minimum: 1, maximum: 180, description: '目标专注分钟数，默认 25' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'focus_stop',
    description: '结束当前专注，记录时长、心流程度与感悟。',
    inputSchema: {
      type: 'object',
      properties: {
        feel: { type: 'integer', minimum: 1, maximum: 5, description: '心流程度评分 1-5，5 为完全沉浸' },
        distraction: { type: 'string', description: '主要干扰源，如"手机/消息/杂念"' },
        note: { type: 'string', description: '本次专注的简短感悟' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'focus_stats',
    description: '查询专注统计：进行中的专注、今日/本周/累计时长、连续天数、最近 7 天热力图。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'focus_log',
    description: '浏览最近的历史专注记录。',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 100, description: '返回条数，默认 20' },
      },
      additionalProperties: false,
    },
  },
]

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n')
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
      send({
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'polaris-focus', version: '0.1.0' },
        },
      })
    } else if (msg.method === 'notifications/initialized') {
      // 忽略
    } else if (msg.method === 'ping') {
      send({ jsonrpc: '2.0', id: msg.id, result: {} })
    } else if (msg.method === 'tools/list') {
      send({ jsonrpc: '2.0', id: msg.id, result: { tools } })
    } else if (msg.method === 'tools/call') {
      const { name, arguments: args } = msg.params || {}
      let result
      if (name === 'focus_start') {
        result = handleStart(args || {})
      } else if (name === 'focus_stop') {
        result = handleStop(args || {})
      } else if (name === 'focus_stats') {
        result = handleStats()
      } else if (name === 'focus_log') {
        result = handleLog(args || {})
      } else {
        result = { content: [{ type: 'text', text: `未知工具: ${name}` }], isError: true }
      }
      send({ jsonrpc: '2.0', id: msg.id, result })
    }
  }
})
