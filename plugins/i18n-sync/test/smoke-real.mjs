/**
 * 真实桥冒烟：对运行中的生产 Polaris 全链路验证。
 *  1. 自发现真实桥（anchor→config→扫端口）
 *  2. 护栏：kv 已有 i18n.* 业务键（非 smoke 子前缀）→ 拒跑
 *  3. 造临时 locale 夹具 → spawn 真实 service（等 kv meta 心跳）
 *  4. /api/scan → /api/apply → /api/undo 全闭环（127.0.0.1 + token）
 *  5. spawn 真实 mcp/server.js → initialize/tools/list → status/missing/apply/undo
 *  6. finally 清场（杀进程 + 删 smoke 键）
 * 运行：node test/smoke-real.mjs（需本机 Polaris 运行中；service/main.js 与 mcp/server.js 已构建）
 */
import assert from 'node:assert'
import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const pluginDir = path.resolve(here, '..')
const serviceJs = path.join(pluginDir, 'service', 'main.js')
const mcpJs = path.join(pluginDir, 'mcp', 'server.js')
if (!fs.existsSync(serviceJs) || !fs.existsSync(mcpJs)) {
  console.error('✗ 先 npm run build（service/main.js 与 mcp/server.js）')
  process.exit(1)
}

const results = []
const t = (name, fn) => { try { fn(); results.push({ name, pass: true }) } catch (e) { results.push({ name, pass: false, detail: e.message }) } }
const okT = (name) => results.push({ name, pass: true })
const failT = (name, detail) => results.push({ name, pass: false, detail })

// ── 桥自发现（与 service/kvclient 同规则 + 端口上扫兜底：配置端口可能陈旧） ──
const md5 = (s) => crypto.createHash('md5').update(String(s)).digest('hex')

function healthOnce(port) {
  return new Promise((resolve) => {
    const req = http.get({ hostname: '127.0.0.1', port, path: '/api/health', timeout: 1200 }, (res) => {
      res.resume()
      resolve(res.statusCode === 200)
    })
    req.on('error', () => resolve(false))
    req.on('timeout', () => { req.destroy(); resolve(false) })
  })
}

/** 收集 (port, token) 候选：多数据根 config × 端口上扫 25 */
async function findBridge() {
  const configCands = []
  for (const anchor of [
    process.env.APPDATA ? path.join(process.env.APPDATA, 'Polaris-dev', 'anchor.json') : '',
    process.env.APPDATA ? path.join(process.env.APPDATA, 'Polaris', 'anchor.json') : '',
    path.join(os.homedir(), '.config', 'Polaris', 'anchor.json'),
    path.join(os.homedir(), '.polaris', 'anchor.json'),
  ]) {
    try {
      const a = JSON.parse(fs.readFileSync(anchor, 'utf8'))
      if (a && typeof a.dataRoot === 'string') configCands.push(path.join(a.dataRoot, 'config.json'))
    } catch (_) { /* skip */ }
  }
  if (process.env.APPDATA) {
    configCands.push(path.join(process.env.APPDATA, 'Polaris-dev', 'config.json'))
    configCands.push(path.join(process.env.APPDATA, 'Polaris', 'config.json'))
  }
  configCands.push(path.join(os.homedir(), '.config', 'Polaris', 'config.json'), path.join(os.homedir(), '.polaris', 'config.json'))

  const candidates = []
  for (const c of configCands) {
    try {
      const root = JSON.parse(fs.readFileSync(c, 'utf8'))
      const web = root.web || {}
      if (typeof web.port === 'number' && web.port > 0) candidates.push({ port: web.port, token: md5(web.token || '') })
    } catch (_) { /* skip */ }
  }
  // 常见 dev 端口兜底（token 未知 → 靠 candidates 里出现过的 token 逐个试）
  for (const p of [9829, 9827]) candidates.push({ port: p, token: null })

  const tried = new Set()
  for (const cand of candidates) {
    for (let off = 0; off <= 25; off++) {
      const port = cand.port + off
      const key = `${port}:${cand.token || ''}`
      if (tried.has(key)) continue
      tried.add(key)
      if (!(await healthOnce(port))) continue
      const tokens = cand.token ? [cand.token] : [...new Set(candidates.map((c) => c.token).filter(Boolean))]
      for (const token of tokens) {
        try {
          const r = await bridgeDispatch({ host: '127.0.0.1', port, token }, 'cap.kv', { action: 'get', key: 'i18n.smoke.probe' })
          if (r && r.ok !== false) return { host: '127.0.0.1', port, token }
        } catch (_) { /* 试下一组 */ }
      }
    }
  }
  return null
}

function bridgeDispatch(bridge, target, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ req: { target, payload } })
    const req = http.request({
      hostname: bridge.host, port: bridge.port, path: '/api/router-dispatch', method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bridge.token}`, 'Content-Length': Buffer.byteLength(body) },
      timeout: 8000,
    }, (res) => {
      let buf = ''
      res.on('data', (c) => { buf += c })
      res.on('end', () => {
        try { resolve(JSON.parse(buf)) } catch (e) { reject(new Error(`桥响应非 JSON：${buf.slice(0, 120)}`)) }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('桥请求超时')) })
    req.write(body)
    req.end()
  })
}

async function kvGet(b, key) {
  const r = await bridgeDispatch(b, 'cap.kv', { action: 'get', key })
  return r && r.ok && r.result && r.result.value !== undefined ? r.result.value : null
}
async function kvSet(b, key, value) { return bridgeDispatch(b, 'cap.kv', { action: 'set', key, value }) }
async function kvDel(b, key) { return bridgeDispatch(b, 'cap.kv', { action: 'delete', key }) }
async function kvKeys(b) {
  const r = await bridgeDispatch(b, 'cap.kv', { action: 'list' })
  return r && r.ok && r.result && Array.isArray(r.result.keys) ? r.result.keys : []
}

async function waitFor(fn, ms, label) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    try { const v = await fn(); if (v) return v } catch (_) { /* retry */ }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`冒烟超时：${label}`)
}

// ── 夹具 ──
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-smoke-fixture-'))
const appConfigTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-smoke-appcfg-'))
fs.writeFileSync(path.join(fixtureRoot, 'zh-cn.json'), '{\n  "login": {\n    "title": "登录到你的账户",\n    "submit": "提交 {name}"\n  }\n}\n', 'utf8')
fs.writeFileSync(path.join(fixtureRoot, 'en.json'), '{\n  "login": {\n    "title": "Sign in to your account"\n  }\n}\n', 'utf8')

const children = []
let bridge = null
const SMOKE_PREFIX = 'i18n.'

async function cleanup() {
  for (const c of children) { try { c.kill() } catch (_) { /* ignore */ } }
  if (bridge) {
    try {
      const keys = await kvKeys(bridge)
      for (const k of keys.filter((k) => k.startsWith(SMOKE_PREFIX))) await kvDel(bridge, k)
    } catch (_) { /* 尽力清理 */ }
  }
  try { fs.rmSync(fixtureRoot, { recursive: true, force: true }) } catch (_) { /* ignore */ }
  try { fs.rmSync(appConfigTmp, { recursive: true, force: true }) } catch (_) { /* ignore */ }
}

function serviceReq(port, token, apiPath, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body || {})
    const req = http.request({
      hostname: '127.0.0.1', port, path: apiPath, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-i18n-sync-token': token, 'Content-Length': Buffer.byteLength(data) },
      timeout: 15000,
    }, (res) => {
      let buf = ''
      res.on('data', (c) => { buf += c })
      res.on('end', () => { try { resolve(JSON.parse(buf)) } catch (e) { reject(new Error(`非 JSON：${buf.slice(0, 120)}`)) } })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('服务请求超时')) })
    req.write(data)
    req.end()
  })
}

function mcpRpc(proc, method, params) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1e9)
    const timer = setTimeout(() => reject(new Error(`MCP RPC 超时：${method}`)), 20000)
    const onChunk = (buf) => {
      let idx
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim()
        const rest = buf.slice(idx + 1)
        if (line) {
          try {
            const msg = JSON.parse(line)
            if (msg.id === id) { proc.stdout.removeListener('data', onChunk); clearTimeout(timer); resolve(msg); return }
          } catch (_) { /* skip */ }
        }
        buf = rest
      }
    }
    let acc = ''
    const wrapper = (chunk) => { acc += chunk; onChunk(acc) }
    proc.stdout.setEncoding('utf8')
    proc.stdout.on('data', wrapper)
    proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
    // 简化：超时兜底由 timer 处理；resolve 后移除监听
    proc.once('exit', () => { clearTimeout(timer); reject(new Error('MCP 进程退出')) })
    void onChunk
  })
}

try {
  // 1. 桥可达
  bridge = await findBridge()
  t('真实桥自发现（anchor→config）', () => { assert.ok(bridge, '未找到 Polaris 桥——请确认本机 Polaris 正在运行') })
  if (!bridge) throw new Error('无桥，中止')
  const health = await bridgeDispatch(bridge, 'cap.kv', { action: 'get', key: 'i18n.smoke.probe' })
  t('真实桥 dispatch 可用（cap.kv get）', () => { assert.ok(health && health.ok !== false, `桥调用失败：${JSON.stringify(health).slice(0, 120)}`) })

  // 2. 护栏：已有真实用户数据 → 拒跑（undo 历史/非空术语表=用户资产；空壳放行）
  const existingUndo = await kvGet(bridge, 'i18n.undo.index')
  const existingGlossary = await kvGet(bridge, 'i18n.glossary')
  t('防误伤护栏：无真实用户数据（undo 历史/术语表）', () => {
    const hasUndo = Array.isArray(existingUndo) && existingUndo.length > 0
    const hasTerms = !!(existingGlossary && existingGlossary.terms && Object.keys(existingGlossary.terms).length)
    assert.ok(!hasUndo && !hasTerms, `发现用户数据（undo=${hasUndo} glossary 条数=${hasTerms ? Object.keys(existingGlossary.terms).length : 0}）——拒跑防误伤`)
  })

  // 3. spawn 真实 service（空闲端口 + 临时 appConfigDir）
  const svcPort = 19870 + Math.floor(Math.random() * 100)
  const svc = spawn('node', [serviceJs, String(svcPort), appConfigTmp], { stdio: ['ignore', 'pipe', 'pipe'] })
  children.push(svc)
  let svcLog = ''
  svc.stderr.on('data', (d) => { svcLog += d })
  const meta = await waitFor(() => kvGet(bridge, 'i18n.meta'), 20000, 'service 写 i18n.meta 心跳')
  t('service 启动并写 meta 心跳（经真实桥）', () => {
    assert.ok(meta && typeof meta.token === 'string' && meta.port === svcPort, `meta 异常：${JSON.stringify(meta)}`)
  })

  // 4. /api/scan 全闭环
  const scan = await serviceReq(svcPort, meta.token, '/api/scan', { dir: fixtureRoot })
  t('service /api/scan：布局识别 + 缺失计数', () => {
    assert.equal(scan.ok, true)
    assert.equal(scan.scan.layout, 'file-per-locale')
    assert.equal(scan.scan.baseLocale, 'zh-cn')
    assert.equal(scan.scan.totals.missing, 1) // login.submit
    assert.ok(!scan.scan.entries, 'entries 不应出现在面板响应')
  })

  // 5. /api/apply（占位符正确）→ 文件真实变化
  const apply = await serviceReq(svcPort, meta.token, '/api/apply', { dir: fixtureRoot, locale: 'en', translations: { 'login.submit': 'Submit {name}' } })
  t('service /api/apply：写入成功 + batchId', () => {
    assert.equal(apply.ok, true, JSON.stringify(apply).slice(0, 200))
    assert.ok(apply.batchId)
    const en = JSON.parse(fs.readFileSync(path.join(fixtureRoot, 'en.json'), 'utf8'))
    assert.equal(en.login.submit, 'Submit {name}')
  })

  // 6. /api/undo → 还原
  const undo = await serviceReq(svcPort, meta.token, '/api/undo', { batchId: apply.batchId })
  t('service /api/undo：恢复原文件', () => {
    assert.equal(undo.ok, true)
    assert.equal(undo.results[0].ok, true)
    const en = JSON.parse(fs.readFileSync(path.join(fixtureRoot, 'en.json'), 'utf8'))
    assert.equal(en.login.submit, undefined)
  })

  // 7. spawn 真实 MCP（真实桥 glossary 读写）
  const mcp = spawn('node', [mcpJs, appConfigTmp], { stdio: ['pipe', 'pipe', 'pipe'] })
  children.push(mcp)
  let mcpBuf = ''
  mcp.stdout.setEncoding('utf8')
  mcp.stderr.setEncoding('utf8')
  const pendingMcp = new Map()
  mcp.stdout.on('data', (chunk) => {
    mcpBuf += chunk
    let idx
    while ((idx = mcpBuf.indexOf('\n')) >= 0) {
      const line = mcpBuf.slice(0, idx).trim()
      mcpBuf = mcpBuf.slice(idx + 1)
      if (!line) continue
      try {
        const msg = JSON.parse(line)
        if (msg.id !== undefined && pendingMcp.has(msg.id)) { pendingMcp.get(msg.id)(msg); pendingMcp.delete(msg.id) }
      } catch (_) { /* skip */ }
    }
  })
  const rpc = (method, params) => new Promise((resolve, reject) => {
    const id = Date.now() % 1e9 + Math.floor(Math.random() * 1000)
    const timer = setTimeout(() => { pendingMcp.delete(id); reject(new Error(`MCP 超时：${method}`)) }, 20000)
    pendingMcp.set(id, (msg) => { clearTimeout(timer); resolve(msg) })
    mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
  })
  const call = async (name, args) => (await rpc('tools/call', { name, arguments: args })).result

  const init = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } })
  t('MCP initialize（真实 bundle 子进程）', () => { assert.equal(init.result.serverInfo.name, 'i18n-sync') })

  const st = await call('i18n_status', { dir: fixtureRoot })
  t('MCP i18n_status：体检报告', () => {
    assert.ok(st.content[0].text.includes('缺失 1'))
    assert.ok(st.content[0].text.includes('login.submit'))
  })

  // glossary 走真实桥 → MCP missing 注入
  await call('i18n_glossary', { action: 'set', terms: { 账户: 'account' } })
  const glossaryKv = await kvGet(bridge, 'i18n.glossary')
  t('MCP glossary 经真实桥落 cap.kv', () => {
    assert.ok(glossaryKv && glossaryKv.terms && glossaryKv.terms['账户'] === 'account', JSON.stringify(glossaryKv))
  })
  const miss = await call('i18n_missing', { dir: fixtureRoot, locale: 'en' })
  t('MCP i18n_missing：工作表 + 真实桥术语表注入', () => {
    assert.ok(miss.content[0].text.includes('账户 → account'))
    assert.ok(miss.content[0].text.includes('提交 {name}'))
  })

  const applyMcp = await call('i18n_apply', { dir: fixtureRoot, locale: 'en', translations: { 'login.submit': 'Submit {name}' }, confirm: true })
  let mcpBatch = ''
  t('MCP i18n_apply：confirm 写入', () => {
    assert.ok(applyMcp.content[0].text.includes('已写入'), applyMcp.content[0].text)
    mcpBatch = /batchId=(\S+)/.exec(applyMcp.content[0].text)[1]
  })
  const undoMcp = await call('i18n_undo', { batchId: mcpBatch, confirm: true })
  t('MCP i18n_undo：恢复', () => {
    assert.ok(undoMcp.content[0].text.includes('✓'))
    const en = JSON.parse(fs.readFileSync(path.join(fixtureRoot, 'en.json'), 'utf8'))
    assert.equal(en.login.submit, undefined)
  })

  // undo 索引经真实桥可见
  const undoIdx = await kvGet(bridge, 'i18n.undo.index')
  t('undo 索引在 cap.kv（面板可读）', () => {
    assert.ok(Array.isArray(undoIdx) && undoIdx.length >= 1, JSON.stringify(undoIdx))
  })
} catch (e) {
  failT('冒烟执行中断', e.stack || e.message)
} finally {
  await cleanup()
}

const bad = results.filter((r) => !r.pass)
console.log(results.map((r) => `${r.pass ? '✓' : '✗'} ${r.name}${r.pass ? '' : `\n    ${r.detail}`}`).join('\n'))
console.log(`\n${results.length - bad.length}/${results.length} 通过`)
process.exit(bad.length ? 1 : 0)
