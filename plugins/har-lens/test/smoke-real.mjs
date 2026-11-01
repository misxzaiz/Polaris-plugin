/**
 * 真桥冒烟（真实宿主 cap.kv + 真实解析）：node test/smoke-real.mjs
 *
 * 前置：Polaris 桌面/Web 宿主正在运行（web 桥可达，kvclient 自发现）。
 * 链路：
 *   0. 预清理：删残留 har.* 键（自清理纪律）
 *   1. 服务起在测试端口 9874 → /__health 200 且 degraded=false（真桥可达）
 *   2. 真实 kv：har.meta 心跳落库（端口 9874）
 *   3. 真实解析：fixture 写临时文件 → cmd open → har.report/har.rows.* 落真库且 URL 已脱敏
 *   4. 真实 kv 信箱：entry 详情无明文密钥
 *   5. 真实落盘：sanitize confirm → *.sanitized.har 存在 + sha256 + 复核归零
 *   6. MCP（真桥）：initialize/tools/list + har_overview 读真库 + har_audit
 *   7. 真实 kv：selftest 全绿（报告落 har.selftest）
 *   8. 收尾自清理：杀进程 + 删全部 har.* 键并核验 + 删临时文件
 * 退出码 0=全绿。任何一步失败如实报告并尝试清理。
 */
import assert from 'node:assert'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const SMOKE_PORT = 9874

const results = []
const t = async (name, fn) => {
  try { await fn(); results.push({ name, pass: true }); }
  catch (e) { results.push({ name, pass: false, detail: e.message }); }
}

// ── 直连真桥的最小客户端（与 kvclient 同款发现+鉴权；只用于清理与断言）────────
function md5(s) { return crypto.createHash('md5').update(String(s)).digest('hex') }
function configCandidates() {
  const cands = []
  for (const anchor of [
    process.env.APPDATA ? path.join(process.env.APPDATA, 'Polaris', 'anchor.json') : '',
    path.join(os.homedir(), '.config', 'Polaris', 'anchor.json'),
    path.join(os.homedir(), '.polaris', 'anchor.json'),
  ]) {
    try {
      const a = JSON.parse(fs.readFileSync(anchor, 'utf8'))
      if (a && typeof a.dataRoot === 'string' && a.dataRoot) cands.push(path.join(a.dataRoot, 'config.json'))
    } catch (_) {}
  }
  if (process.env.APPDATA) cands.push(path.join(process.env.APPDATA, 'Polaris', 'config.json'))
  cands.push(path.join(os.homedir(), '.config', 'Polaris', 'config.json'))
  return cands
}
function loadWebConfig() {
  for (const p of configCandidates()) {
    try {
      const root = JSON.parse(fs.readFileSync(p, 'utf8'))
      const web = root.web || {}
      if (typeof web.port === 'number' && web.port > 0) return { host: '127.0.0.1', port: web.port, token: web.token || '' }
    } catch (_) {}
  }
  return null
}
const WEB = loadWebConfig()
if (!WEB) { console.error('❌ 未找到宿主 web 配置（anchor.json/config.json）——真桥冒烟需要宿主在运行'); process.exit(2) }

function bridgeDispatch(payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ req: { target: 'cap.kv', payload } })
    const req = http.request({
      hostname: WEB.host, port: WEB.port, path: '/api/router-dispatch', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), ...(WEB.token ? { Authorization: `Bearer ${md5(WEB.token)}` } : {}) },
      timeout: 8000,
    }, (res) => {
      let body = ''
      res.on('data', (c) => { body += c })
      res.on('end', () => { try { resolve(JSON.parse(body)) } catch (e) { reject(e) } })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(new Error('bridge timeout')); })
    req.write(data)
    req.end()
  })
}
async function kvSet(k, v) { const r = await bridgeDispatch({ action: 'set', key: k, value: v }); if (r.ok !== true) throw new Error(`kvSet 失败: ${JSON.stringify(r).slice(0, 120)}`) }
async function kvGet(k) { const r = await bridgeDispatch({ action: 'get', key: k }); return r.ok ? (r.result && r.result.value !== undefined ? r.result.value : null) : null }
async function kvDel(k) { await bridgeDispatch({ action: 'delete', key: k }) }

const HAR_KEYS = ['har.meta', 'har.report', 'har.rows.idx', 'har.audit', 'har.diff', 'har.hist', 'har.settings', 'har.cmd', 'har.result', 'har.selftest',
  ...Array.from({ length: 11 }, (_, i) => `har.rows.${i}`)]

async function sendCmd(op, payload = {}, timeoutMs = 60000) {
  const nonce = `smoke${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  await kvSet('har.cmd', { op, nonce, ...payload, at: Date.now() })
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const r = await kvGet('har.result')
    if (r && r.nonce === nonce) { await kvDel('har.result').catch(() => {}); return r }
    await sleep(700)
  }
  throw new Error(`命令 ${op} 超时无回执`)
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'har-lens-smoke-'))
let svc = null
let mcp = null

// fixture 写真实文件（与 core 同源生成，含已知密钥）
const { createRequire } = await import('node:module')
const require2 = createRequire(import.meta.url)
const core = require2(path.join(PLUGIN_ROOT, 'shared', 'core.js'))
const fixturePath = path.join(tmpDir, 'smoke.har')
fs.writeFileSync(fixturePath, JSON.stringify(core.makeFixtureHar()))

try {
  // 0. 预清理
  for (const k of HAR_KEYS) await kvDel(k).catch(() => {})

  // 1. 服务起 + 健康面
  await t('服务启动 + /__health 200（真桥可达 degraded=false）', async () => {
    svc = spawn(process.execPath, [path.join(PLUGIN_ROOT, 'service', 'main.js'), String(SMOKE_PORT), tmpDir], {
      env: process.env, stdio: ['ignore', 'pipe', 'pipe'],
    })
    let errTail = ''
    svc.stderr.on('data', (c) => { errTail = (errTail + c).slice(-2000) })
    svc.errTail = () => errTail
    const deadline = Date.now() + 20000
    let lastErr = ''
    while (Date.now() < deadline) {
      try {
        const h = await new Promise((resolve, reject) => {
          const req = http.get({ hostname: '127.0.0.1', port: SMOKE_PORT, path: '/__health', timeout: 2000 }, (res) => {
            let b = ''; res.on('data', (c) => { b += c }); res.on('end', () => resolve({ status: res.statusCode, body: b }))
          })
          req.on('error', reject); req.on('timeout', () => { req.destroy(new Error('timeout')) })
        })
        if (h.status === 200) {
          const j = JSON.parse(h.body)
          assert.strictEqual(j.ok, true)
          assert.strictEqual(j.degraded, false, `真桥不可达: ${h.body}`)
          return
        }
        lastErr = h.body
      } catch (e) { lastErr = e.message }
      await sleep(400)
    }
    throw new Error(`健康面未就绪: ${lastErr}\n${errTail}`)
  })

  // 2. meta 心跳落真库
  await t('真实 kv：har.meta 心跳落库（端口 9874）', async () => {
    const deadline = Date.now() + 10000
    while (Date.now() < deadline) {
      const meta = await kvGet('har.meta')
      if (meta && meta.port === SMOKE_PORT) { assert.strictEqual(meta.state, 'idle'); return }
      await sleep(500)
    }
    throw new Error('har.meta 未在时限内落库')
  })

  // 3. 真实解析全链路
  await t('cmd open → har.report/rows 落真库 + 投影已脱敏', async () => {
    const r = await sendCmd('open', { path: fixturePath })
    assert.strictEqual(r.ok, true, `${r.error || ''}\n${svc.errTail()}`)
    assert.strictEqual(r.entryCount, 6)
    const rep = await kvGet('har.report')
    assert.ok(rep && rep.entryCount === 6)
    const rows = await kvGet('har.rows.0')
    assert.ok(Array.isArray(rows) && rows.length === 6)
    assert.ok(rows[0].u.includes('access_token=‹'), `投影未脱敏: ${rows[0].u}`)
    assert.ok(!JSON.stringify(rows).includes('SECRET123'))
    const meta = await kvGet('har.meta')
    assert.strictEqual(meta.state, 'ready')
    assert.ok(meta.activePath === fixturePath)
  })

  // 4. entry 详情
  await t('真实 kv 信箱 entry：详情无明文密钥', async () => {
    const r = await sendCmd('entry', { index: 1 })
    assert.strictEqual(r.ok, true, r.error || '')
    const s = JSON.stringify(r.entry)
    for (const secret of ['hunter2', 'session=abc123']) assert.ok(!s.includes(secret), `详情泄露 ${secret}`)
  })

  // 5. sanitize 真实落盘
  await t('sanitize confirm → *.sanitized.har 真实落盘 + 复核归零', async () => {
    const r = await sendCmd('sanitize', { confirm: true })
    assert.strictEqual(r.ok, true, r.error || '')
    const out = r.outputPath
    assert.ok(fs.existsSync(out) && out.endsWith('smoke.sanitized.har'), out)
    assert.match(r.sha256, /^[0-9a-f]{64}$/)
    assert.strictEqual(r.recheck.auditTotal, 0)
    const outText = fs.readFileSync(out, 'utf8')
    for (const secret of ['SECRET123', 'hunter2', 'sk-proj-']) assert.ok(!outText.includes(secret), `导出泄露 ${secret}`)
    fs.rmSync(out, { force: true })
  })

  // 6. MCP 真子进程（真桥）
  await t('MCP 真子进程：initialize + tools/list（8 工具）+ har_overview 读真库', async () => {
    mcp = spawn(process.execPath, [path.join(PLUGIN_ROOT, 'mcp', 'server.js'), tmpDir], {
      env: process.env, stdio: ['pipe', 'pipe', 'pipe'],
    })
    let buf = ''
    const waiters = []
    mcp.stdout.on('data', (c) => {
      buf += c
      let idx
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim(); buf = buf.slice(idx + 1)
        if (!line) continue
        try {
          const msg = JSON.parse(line)
          const w = waiters.find((x) => x.id === msg.id)
          if (w) { waiters.splice(waiters.indexOf(w), 1); w.resolve(msg) }
        } catch (_) {}
      }
    })
    let errTail = ''
    mcp.stderr.on('data', (c) => { errTail = (errTail + c).slice(-1500) })
    mcp.errTail = () => errTail
    const rpc = (method, params, timeoutMs = 40000) => new Promise((resolve, reject) => {
      const id = 1 + Math.floor(Math.random() * 1e6)
      const timer = setTimeout(() => reject(new Error(`RPC 超时 ${method}\n${errTail}`)), timeoutMs)
      waiters.push({ id, resolve: (m) => { clearTimeout(timer); if (m.error) { clearTimeout(timer); reject(new Error(`RPC 错误: ${JSON.stringify(m.error)}`)) } else resolve(m.result) } })
      mcp.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
    })
    const init = await rpc('initialize', { protocolVersion: '2024-11-05' })
    assert.strictEqual(init.serverInfo.name, 'har-lens')
    const tools = await rpc('tools/list', {})
    assert.strictEqual(tools.tools.length, 8)
    const ov = await rpc('tools/call', { name: 'har_overview', arguments: {} })
    const ovText = ov.content[0].text
    assert.ok(ovText.includes('smoke.har'), `概览未读到真库: ${ovText.slice(0, 200)}`)
    assert.ok(!ovText.includes('SECRET123'))
    const au = await rpc('tools/call', { name: 'har_audit', arguments: {} })
    assert.ok(au.content[0].text.includes('高危'))
  })

  // 7. selftest
  await t('真实 kv：selftest 全绿（报告落 har.selftest）', async () => {
    const r = await sendCmd('selftest', {}, 45000)
    assert.strictEqual(r.ok, true, JSON.stringify(r.report && r.report.checks.filter((c) => !c.pass)))
    const rep = await kvGet('har.selftest')
    assert.ok(rep && rep.allGreen === true)
  })
} catch (e) {
  results.push({ name: '(冒烟夹具异常)', pass: false, detail: e.message })
} finally {
  try { if (mcp) mcp.kill(); } catch (_) {}
  try { if (svc) svc.kill(); } catch (_) {}
  // 收尾自清理：删全部 har.* 键并核验
  for (const k of HAR_KEYS) await kvDel(k).catch(() => {})
  let residue = 0
  for (const k of HAR_KEYS) { if (await kvGet(k) !== null) residue += 1 }
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  console.log(residue === 0 ? '🧹 自清理完成：har.* 键已全部删除' : `⚠️ 残留 ${residue} 个 har.* 键未清干净`)
}

const failed = results.filter((r) => !r.pass)
for (const r of results) console.log(`${r.pass ? '✅' : '❌'} ${r.name}${r.pass ? '' : ` —— ${r.detail}`}`)
console.log(`\n真桥冒烟: ${results.length - failed.length}/${results.length} 通过`)
process.exit(failed.length ? 1 : 0)
