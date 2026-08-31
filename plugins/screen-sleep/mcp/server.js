#!/usr/bin/env node
/**
 * Screen Sleep — MCP Server + 本地 HTTP 触发桥
 *
 * 职责（两个面）：
 *  1. MCP 工具（给 AI 引擎用）：monitor_off、monitor_status
 *     走 JSON-RPC 2.0 over stdin/stdout，与 Polaris 的 MCP 协议对齐。
 *  2. 本地 HTTP 触发桥（给面板用）：
 *     MCP 没有「面板直接调工具」的通道，所以 server 在 initialize 时
 *     启动一个绑定 127.0.0.1 的 HTTP 服务。面板 POST /off 即熄屏，
 *     GET /status 取状态。使用固定端口 52311（被占则递增回退）。
 *
 * 熄屏动作本身交给 native/monoff.exe（Rust + Win32 API，PostMessage
 * SC_MONITORPOWER(2) 到所有顶层窗口 + 释放执行状态）。
 *
 * 数据文件：data/state.json 熄屏历史 {lastOffAt, count}
 *
 * 安全：HTTP 只绑定 127.0.0.1，仅本机可访问。
 */

const fs = require('fs')
const path = require('path')
const http = require('http')
const { spawn } = require('child_process')

const PLUGIN_DIR = path.join(__dirname, '..')
const DATA_DIR = path.join(PLUGIN_DIR, 'data')
const NATIVE = path.join(PLUGIN_DIR, 'native', 'monoff.exe')
const STATE_FILE = path.join(DATA_DIR, 'state.json')
const DEFAULT_PORT = 52311

// ── 工具：熄屏 ────────────────────────────────────────────────────────────

function turnOff() {
  return new Promise((resolve) => {
    if (!fs.existsSync(NATIVE)) {
      resolve({ ok: false, error: 'native 二进制不存在: ' + NATIVE })
      return
    }
    const p = spawn(NATIVE, [], { cwd: PLUGIN_DIR, stdio: ['ignore', 'pipe', 'pipe'] })
    let err = ''
    p.stderr.on('data', d => err += d)
    p.on('close', code => {
      recordLastOff()
      if (code === 0) resolve({ ok: true, message: '屏幕已熄灭' })
      else resolve({ ok: false, error: 'monoff.exe 退出码 ' + code, stderr: err })
    })
    p.on('error', e => resolve({ ok: false, error: '无法启动 monoff.exe: ' + e.message }))
  })
}

// ── 状态存储 ──────────────────────────────────────────────────────────────

function loadState() {
  try {
    return Object.assign({ lastOffAt: null, count: 0 }, JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')))
  } catch {
    return { lastOffAt: null, count: 0 }
  }
}
function saveState(s) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2), 'utf8')
}
function recordLastOff() {
  const s = loadState()
  s.lastOffAt = new Date().toISOString()
  s.count += 1
  saveState(s)
}
function readLastOff() {
  return loadState().lastOffAt
}

// ── 本地 HTTP 触发桥 ──────────────────────────────────────────────────────

let httpPort = null

function serve(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  if (req.method === 'POST' && req.url === '/off') {
    let body = ''
    req.on('data', d => body += d)
    req.on('end', async () => {
      const r = await turnOff()
      res.writeHead(r.ok ? 200 : 500, res.headers)
      res.end(JSON.stringify(r))
    })
    return
  }
  if (req.method === 'GET' && req.url === '/status') {
    res.writeHead(200, res.headers)
    res.end(JSON.stringify({
      ok: true,
      port: httpPort,
      lastOffAt: readLastOff(),
      nativeExists: fs.existsSync(NATIVE),
    }))
    return
  }
  res.writeHead(404)
  res.end(JSON.stringify({ ok: false, error: 'not found' }))
}

function listenPort(port) {
  return new Promise((resolve) => {
    const server = http.createServer(serve)
    server.listen(port, '127.0.0.1', () => {
      httpPort = server.address().port
      resolve(server)
    })
  })
}

async function startHttpBridge() {
  // 固定端口 52311，被占则递增（最多试 32 个端口）
  for (let p = DEFAULT_PORT; p < DEFAULT_PORT + 32; p++) {
    try {
      const s = await listenPort(p)
      s.on('error', () => {})
      return p
    } catch {
      continue
    }
  }
  return null
}

// ── MCP 工具 ──────────────────────────────────────────────────────────────

const tools = [
  {
    name: 'monitor_off',
    description: '熄灭电脑显示器（应用程序继续运行）。移动鼠标或按任意键可恢复。Windows 专用。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'monitor_status',
    description: '查询熄屏状态：本地 HTTP 桥端口、上次熄屏时间、native 二进制是否就绪。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
]

async function handleMonitorOff() {
  const r = await turnOff()
  return { content: [{ type: 'text', text: JSON.stringify(r) }] }
}
function handleMonitorStatus() {
  return {
    content: [{ type: 'text', text: JSON.stringify({
      ok: true, port: httpPort, lastOffAt: readLastOff(), nativeExists: fs.existsSync(NATIVE)
    }) }]
  }
}

// ── JSON-RPC 2.0 dispatcher ───────────────────────────────────────────────

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
        jsonrpc: '2.0', id: msg.id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'polaris-screen-sleep', version: '0.1.0' },
        },
      })
      startHttpBridge()
    } else if (msg.method === 'notifications/initialized') {
      // 忽略
    } else if (msg.method === 'ping') {
      send({ jsonrpc: '2.0', id: msg.id, result: {} })
    } else if (msg.method === 'tools/list') {
      send({ jsonrpc: '2.0', id: msg.id, result: { tools } })
    } else if (msg.method === 'tools/call') {
      const { name, arguments: args } = msg.params || {}
      if (name === 'monitor_off') {
        handleMonitorOff().then(r => send({ jsonrpc: '2.0', id: msg.id, result: r }))
        continue
      }
      if (name === 'monitor_status') {
        send({ jsonrpc: '2.0', id: msg.id, result: handleMonitorStatus() })
        continue
      }
      send({ jsonrpc: '2.0', id: msg.id, result: {
        content: [{ type: 'text', text: '未知工具: ' + name }], isError: true }
      })
    }
  }
})