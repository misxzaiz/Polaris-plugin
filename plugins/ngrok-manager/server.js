'use strict'
/**
 * ngrok-manager 管理器服务
 *
 * 单进程多隧道模型:一个 ngrok 进程,配置文件 tunnels: 段驱动。
 * REST API 供面板/MCP 调用。
 *
 * 运行:node server.js <port> <pluginDir>
 *   port      由框架 {{port}} 注入(或缺省,自分配)
 *   pluginDir 插件目录,用于写 config.json/.port/ngrok-tunnels.yml
 *
 * 依赖:仅 Node 内置(fs/http/child_process/crypto)。
 */

const http = require('http')
const fs = require('fs')
const path = require('path')
const { spawn, execFile } = require('child_process')
const os = require('os')

// ---------- args ----------
const PORT = parseInt(process.argv[2], 10) || 0
const PLUGIN_DIR = process.argv[3] || __dirname
const CONFIG_PATH = path.join(PLUGIN_DIR, 'config.json')
const PORT_FILE = path.join(PLUGIN_DIR, '.port')
const TUNNELS_YML = path.join(PLUGIN_DIR, 'ngrok-tunnels.yml')

// ---------- state ----------
/** @type {{id:string,name:string,port:number,domain:string|null,publicUrl:string|null,status:string,startedAt:number}[]} */
let tunnels = []
let ngrokProc = null
let logs = []
const MAX_LOGS = 500
let applying = false
let pollTimer = null

// ---------- config ----------
const DEFAULT_CONFIG = {
  ngrokPath: 'ngrok',           // 优先 PATH;面板可改绝对路径
  defaultDomain: 'dominant-ant-formerly.ngrok-free.app',
  mgrPort: 9870,
}
function loadConfig() {
  try { return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) } }
  catch { return { ...DEFAULT_CONFIG } }
}
function saveConfig(c) {
  try { fs.writeFileSync(CONFIG_PATH, JSON.stringify(c, null, 2)) } catch {}
}
let config = loadConfig()

// ---------- helpers ----------
function log(line) {
  const entry = { t: new Date().toISOString(), ...line }
  logs.push(entry)
  if (logs.length > MAX_LOGS) logs = logs.slice(-MAX_LOGS)
}
function json(res, code, data) {
  const body = JSON.stringify(data)
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
  res.end(body)
}
function readBody(req) {
  return new Promise((resolve) => {
    let buf = ''
    req.on('data', c => buf += c)
    req.on('end', () => {
      try { resolve(buf ? JSON.parse(buf) : {}) } catch { resolve({}) }
    })
    req.on('error', () => resolve({}))
  })
}

// ---------- ngrok path / authtoken discovery ----------
function findGlobalConfigPath() {
  // Windows: %LOCALAPPDATA%\ngrok\ngrok.yml ; Unix: ~/.config/ngrok/ngrok.yml
  if (process.platform === 'win32') {
    const la = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
    return path.join(la, 'ngrok', 'ngrok.yml')
  }
  return path.join(os.homedir(), '.config', 'ngrok', 'ngrok.yml')
}
function readAuthtoken() {
  const p = findGlobalConfigPath()
  try {
    const txt = fs.readFileSync(p, 'utf8')
    const m = txt.match(/authtoken:\s*(\S+)/)
    return m ? m[1] : null
  } catch { return null }
}
function isExeOk(p) {
  try { return fs.existsSync(p) } catch { return false }
}
function resolveNgrokPath() {
  // 1. 配置路径(若非默认 'ngrok' 且存在)
  if (config.ngrokPath && config.ngrokPath !== 'ngrok' && isExeOk(config.ngrokPath)) {
    return config.ngrokPath
  }
  // 2. PATH 'ngrok' — 交给 spawn(shell:true) 解析,返回 'ngrok'
  return config.ngrokPath || 'ngrok'
}
/** 同步验证 ngrok 可执行:spawn <path> --version,超时 3s */
function verifyNgrokExec(ngrokPath) {
  return new Promise((resolve) => {
    let done = false
    const finish = (ok) => { if (!done) { done = true; resolve(ok) } }
    try {
      // shell:true 让 Windows 解析 PATHEXT 与 .bat/.cmd
      const p = spawn(ngrokPath, ['version'], { shell: true, windowsHide: true, timeout: 3000 })
      p.on('error', () => finish(false))
      p.on('exit', (code) => finish(code === 0 || code === null))
      setTimeout(() => { try { p.kill() } catch {}; finish(false) }, 3500)
    } catch { finish(false) }
  })
}
async function checkNgrokReady() {
  const ngrokPath = resolveNgrokPath()
  const pathOk = ngrokPath !== 'ngrok' ? isExeOk(ngrokPath) : await verifyNgrokExec('ngrok')
  const authToken = readAuthtoken()
  return {
    ngrokPath,
    ngrokReady: pathOk,
    authTokenReady: !!authToken,
    authTokenPath: findGlobalConfigPath(),
  }
}

// ---------- tunnels.yml generation ----------
function tunnelName(port) {
  // 稳定且唯一:基于端口
  return 'tunnel-' + port
}
function writeTunnelsYml() {
  const authtoken = readAuthtoken()
  if (!authtoken) throw new Error('authtoken 未配置:请先运行 ngrok config add-authtoken <token>')
  const lines = ['version: "3"', 'agent:', `    authtoken: ${authtoken}`, 'tunnels:']
  if (tunnels.length === 0) {
    // 无隧道:不启动 ngrok(避免无效占位进程)
    lines.push('')
  } else {
    for (const t of tunnels) {
      lines.push(`    ${t.name}:`, `        addr: ${t.port}`, '        proto: http')
      if (t.domain) lines.push(`        domain: ${t.domain}`)
    }
  }
  fs.writeFileSync(TUNNELS_YML, lines.join('\n'))
}

// ---------- ngrok process lifecycle ----------
function killTree(pid) {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      // /T 杀整个进程树,/F 强制
      execFile('taskkill', ['/PID', String(pid), '/T', '/F'], () => resolve())
    } else {
      try { process.kill(-pid, 'SIGKILL') } catch {}
      try { process.kill(pid, 'SIGKILL') } catch {}
      resolve()
    }
  })
}

function cleanEnv() {
  // 清代理环境变量(残留致 ngrok 连不上服务器)
  const env = { ...process.env }
  for (const k of ['HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy']) {
    delete env[k]
  }
  return env
}

/** 主动停止标记:applyChanges kill 旧进程时置 true,exit 回调据此不把隧道标记 stopped */
let intentionalKill = false

function spawnNgrok() {
  if (ngrokProc) return
  if (tunnels.length === 0) return  // 无隧道不启动
  const ngrokPath = resolveNgrokPath()
  try { writeTunnelsYml() }
  catch (e) { log({ lvl: 'error', msg: 'writeTunnelsYml failed: ' + e.message }); return }
  const args = ['start', '--all', '--config', TUNNELS_YML, '--log=stdout', '--log-format=json', '--log-level=info']
  log({ lvl: 'info', msg: `spawn: ${ngrokPath} ${args.join(' ')}` })
  const proc = spawn(ngrokPath, args, { env: cleanEnv(), windowsHide: true, shell: true })
  proc.on('error', (e) => {
    log({ lvl: 'error', msg: `spawn failed: ${e.message}` })
    ngrokProc = null
    tunnels.forEach(t => { if (t.status === 'starting') t.status = 'error' })
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
  })
  ngrokProc = proc
  let buf = ''
  proc.stdout.setEncoding('utf8')
  proc.stdout.on('data', (chunk) => {
    buf += chunk
    let i
    while ((i = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, i).trim()
      buf = buf.slice(i + 1)
      if (!line) continue
      try { handleLogLine(JSON.parse(line)) }
      catch { /* 非 JSON,忽略 */ }
    }
  })
  proc.stderr.setEncoding('utf8')
  proc.stderr.on('data', (c) => {
    log({ lvl: 'error', msg: 'stderr: ' + c.toString().trim() })
  })
  proc.on('exit', (code) => {
    log({ lvl: 'warn', msg: `ngrok exited code=${code}` })
    ngrokProc = null
    if (!intentionalKill) {
      // 意外退出:标记隧道为 stopped
      tunnels.forEach(t => { if (t.status === 'running' || t.status === 'starting') t.status = 'stopped' })
    }
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
  })
  // 轮询 :4040/api/tunnels 拿 URL(单进程下 inspect 端口固定 4040)
  startPolling()
}

function handleLogLine(l) {
  const entry = { t: l.t || new Date().toISOString(), lvl: l.lvl || 'info', msg: l.msg || '', obj: l.obj, name: l.name, url: l.url, addr: l.addr, err: l.err }
  log(entry)
  if (l.msg === 'started tunnel' && l.url) {
    const t = tunnels.find(x => x.name === l.name)
    if (t) { t.publicUrl = l.url; t.status = 'running' }
  }
  if (l.lvl === 'eror' || l.lvl === 'error') {
    const t = tunnels.find(x => x.name === l.name)
    if (t && t.status === 'starting') t.status = 'error'
  }
}

function startPolling() {
  if (pollTimer) clearInterval(pollTimer)
  let tries = 0
  pollTimer = setInterval(async () => {
    tries++
    if (!ngrokProc || tries > 40) { clearInterval(pollTimer); pollTimer = null; return }
    try {
      const data = await fetchLocal('http://127.0.0.1:4040/api/tunnels')
      const arr = data.tunnels || []
      for (const t of tunnels) {
        if (t.status !== 'starting') continue
        const hit = arr.find(x => x.name === t.name)
        if (hit && hit.public_url) { t.publicUrl = hit.public_url; t.status = 'running' }
      }
      if (tunnels.every(t => t.status !== 'starting')) { clearInterval(pollTimer); pollTimer = null }
    } catch { /* :4040 未就绪,继续 */ }
  }, 500)
}

function fetchLocal(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: 2000 }, (res) => {
      let buf = ''
      res.on('data', c => buf += c)
      res.on('end', () => { try { resolve(JSON.parse(buf)) } catch (e) { reject(e) } })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) })
  })
}

// ---------- apply (增删后重启) ----------
async function applyChanges() {
  // 串行化:若正在 apply,等其完成
  while (applying) await new Promise(r => setTimeout(r, 100))
  applying = true
  log({ lvl: 'warn', msg: 'applyChanges: 重写 ngrok-tunnels.yml + 重启 ngrok' })
  // 停旧进程(主动,exit 回调不标记 stopped)
  if (ngrokProc) {
    const oldPid = ngrokProc.pid
    ngrokProc = null
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
    intentionalKill = true
    await killTree(oldPid)
    await new Promise(r => setTimeout(r, 600)) // 等端口/连接释放
    intentionalKill = false
  }
  // 重置幸存隧道的 URL(重启后会变,需重新匹配)
  tunnels.forEach(t => { if (t.status !== 'stopped') { t.publicUrl = null; t.status = 'starting' } })
  // 清理 stopped 隧道(意外退出残留)
  tunnels = tunnels.filter(t => t.status !== 'stopped')
  // 起新进程
  spawnNgrok()
  // 给 ~10s 让 URL 回填
  let waited = 0
  while (waited < 10000 && tunnels.some(t => t.status === 'starting')) {
    await new Promise(r => setTimeout(r, 300))
    waited += 300
  }
  applying = false
}

// ---------- API ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost`)
  const p = url.pathname
  // CORS preflight
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS' }); return res.end() }

  if (req.method === 'GET' && p === '/__health') {
    return json(res, 200, { status: 'ok', uptime: process.uptime(), ...(await checkNgrokReady()), tunnelCount: tunnels.length })
  }
  if (req.method === 'GET' && p === '/config') {
    return json(res, 200, config)
  }
  if (req.method === 'PUT' && p === '/config') {
    const body = await readBody(req)
    config = { ...config, ...body }
    saveConfig(config)
    return json(res, 200, config)
  }
  if (req.method === 'GET' && p === '/tunnels') {
    return json(res, 200, tunnels)
  }
  if (req.method === 'POST' && p === '/tunnels') {
    const body = await readBody(req)
    const port = parseInt(body.port, 10)
    if (!port || port < 1 || port > 65535) return json(res, 400, { error: '端口非法(1-65535)' })
    if (tunnels.some(t => t.port === port)) return json(res, 400, { error: `端口 ${port} 已存在`, tunnel: tunnels.find(t => t.port === port) })
    const domain = body.domain ? String(body.domain).trim() : null
    if (domain && tunnels.some(t => t.domain === domain)) return json(res, 400, { error: `域名 ${domain} 已被占用` })
    const name = body.name || tunnelName(port)
    if (tunnels.some(t => t.name === name)) return json(res, 400, { error: `隧道名 ${name} 已存在` })
    tunnels.push({ id: 't' + Date.now() + Math.random().toString(36).slice(2, 6), name, port, domain, publicUrl: null, status: 'starting', startedAt: Date.now() })
    await applyChanges()
    const t = tunnels.find(x => x.name === name)
    if (!t) return json(res, 502, { error: '隧道启动后消失(可能配置错误)' })
    if (t.status === 'error' || t.status === 'stopped') {
      // 失败:移除并返回错误
      const logsTail = logs.slice(-5).map(l => l.msg).join('; ')
      tunnels = tunnels.filter(x => x.id !== t.id)
      return json(res, 502, { error: `ngrok 启动失败: ${logsTail}` })
    }
    return json(res, 200, t)
  }
  if (req.method === 'DELETE' && p.startsWith('/tunnels/')) {
    const id = p.slice('/tunnels/'.length)
    const before = tunnels.length
    tunnels = tunnels.filter(t => t.id !== id)
    if (tunnels.length === before) return json(res, 404, { error: '未找到隧道' })
    await applyChanges()
    return json(res, 200, { ok: true })
  }
  if (req.method === 'DELETE' && p === '/tunnels') {
    tunnels = []
    if (ngrokProc) {
      intentionalKill = true
      await killTree(ngrokProc.pid)
      intentionalKill = false
      ngrokProc = null
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
    }
    try { fs.unlinkSync(TUNNELS_YML) } catch {}
    return json(res, 200, { ok: true })
  }
  if (req.method === 'GET' && p === '/logs') {
    const limit = parseInt(url.searchParams.get('limit'), 10) || 100
    return json(res, 200, logs.slice(-limit))
  }
  return json(res, 404, { error: 'not found' })
})

// ---------- start ----------
function findFreePort(start) {
  return new Promise((resolve) => {
    const tryP = (p) => {
      const s = http.createServer()
      s.on('error', () => tryP(p + 1))
      s.listen(p, '127.0.0.1', () => { s.close(() => resolve(p)) })
    }
    tryP(start)
  })
}
(async () => {
  let port = PORT
  if (!port) port = await findFreePort(config.mgrPort || 9870)
  server.listen(port, '127.0.0.1', () => {
    fs.writeFileSync(PORT_FILE, String(port))
    log({ lvl: 'info', msg: `manager listening on 127.0.0.1:${port}` })
    console.log(`ngrok-manager: http://127.0.0.1:${port}`)
  })
})()

// 优雅关闭:停 ngrok,清 .port
function cleanup() {
  if (ngrokProc) { killTree(ngrokProc.pid) }
  try { fs.unlinkSync(PORT_FILE) } catch {}
  process.exit(0)
}
process.on('SIGTERM', cleanup)
process.on('SIGINT', cleanup)
