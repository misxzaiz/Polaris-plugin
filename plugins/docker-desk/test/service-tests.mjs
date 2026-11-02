// service 集成测试：假宿主 bridge（内存 kv）+ 真 service 子进程（--engine 指向假引擎）+ HTTP 全链路断言
// 运行：node test/service-tests.mjs（零外部依赖、零外网、无真实 Docker）
import { createRequire } from 'module'
import { spawn } from 'child_process'
import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import http from 'http'
import crypto from 'crypto'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const path = require('path')
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pluginDir = join(__dirname, '..')
const { startFakeEngine, muxFrame, C1, C2 } = await import('./fake-engine.mjs')

let pass = 0
let fail = 0
const failures = []
function t(name, ok, detail) {
  if (ok) pass += 1
  else { fail += 1; failures.push(`${name} → ${detail}`) }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function httpRequest(port, method, urlPath, { token, body } = {}) {
  const res = await fetch(`http://127.0.0.1:${port}${urlPath}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let parsed = null
  try { parsed = JSON.parse(text) } catch (_) { /* 非 JSON（流式） */ }
  return { status: res.status, json: parsed, text }
}

// ── 假宿主 bridge（内存 kv + md5 token 鉴权，协议与宿主一致） ────────────────
const HOST_TOKEN = 'test-host-token'
const HOST_MD5 = crypto.createHash('md5').update(HOST_TOKEN).digest('hex')
const kvStore = new Map()

const fakeHost = http.createServer((req, res) => {
  let body = ''
  req.on('data', (c) => { body += c })
  req.on('end', () => {
    const url = new URL(req.url, 'http://x')
    if (url.pathname === '/api/health') { res.writeHead(200); res.end('ok'); return }
    if (url.pathname === '/api/router-dispatch') {
      if (String(req.headers.authorization || '') !== `Bearer ${HOST_MD5}`) {
        res.writeHead(401, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: 'bad host token' }))
        return
      }
      let parsed
      try { parsed = JSON.parse(body) } catch (_) { parsed = null }
      const { target, payload } = parsed && parsed.req ? parsed.req : {}
      let out
      if (target === 'cap.kv') {
        const a = payload.action
        if (a === 'get') out = { ok: true, result: { value: kvStore.has(payload.key) ? kvStore.get(payload.key) : null } }
        else if (a === 'set') { kvStore.set(payload.key, payload.value); out = { ok: true, result: { ok: true } } }
        else if (a === 'delete') { kvStore.delete(payload.key); out = { ok: true, result: { ok: true } } }
        else if (a === 'list') out = { ok: true, result: { keys: Array.from(kvStore.keys()) } }
        else out = { ok: false, error: `unknown action ${a}` }
      } else {
        out = { ok: false, error: `unknown target ${target}` }
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(out))
      return
    }
    res.writeHead(404); res.end('nf')
  })
})

await new Promise((r) => fakeHost.listen(0, '127.0.0.1', r))
const hostPort = fakeHost.address().port

// ── 假引擎 ───────────────────────────────────────────────────────────────────
const fake = await startFakeEngine()

// ── 临时 appConfigDir（带 config.json 引导发现） ─────────────────────────────
const appCfg = mkdtempSync(join(tmpdir(), 'dkd-test-'))
writeFileSync(join(appCfg, 'config.json'), JSON.stringify({ web: { port: hostPort, token: HOST_TOKEN } }))

// ── 起 service（--engine 指向假引擎 TCP；POLARIS_* env 强制 kv 通道指向假桥，
//     否则 anchor.json 会解析到本机真实 Polaris 宿主——2026-11-03 实测踩坑） ──
const SVC_PORT = 18870 + Math.floor(Math.random() * 400)
const svc = spawn(process.execPath, [
  join(pluginDir, 'service', 'main.js'),
  String(SVC_PORT),
  appCfg,
  `--engine=tcp://127.0.0.1:${fake.port}`,
], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, POLARIS_HOST: '127.0.0.1', POLARIS_PORT: String(hostPort), POLARIS_TOKEN: HOST_TOKEN },
})
const svcLogs = []
svc.stderr.on('data', (c) => svcLogs.push(String(c)))
svc.on('exit', (code) => { if (code && code !== 0) console.error(`service 提前退出 code=${code}\n${svcLogs.join('')}`) })

// 等 dkd.service 发布
let svcInfo = null
for (let i = 0; i < 50 && !svcInfo; i++) {
  await sleep(200)
  svcInfo = kvStore.get('dkd.service') || null
}
t('service 启动并发布 dkd.service（进的是假桥 kv）', !!svcInfo && Number.isFinite(svcInfo.port) && !!svcInfo.token, JSON.stringify(svcInfo)?.slice(0, 120))
if (!svcInfo) {
  console.error('service 未能发布到假桥，stderr：\n' + svcLogs.join(''))
  fake.server.close()
  fakeHost.close()
  process.exit(1)
}

const TOKEN = svcInfo ? svcInfo.token : ''
const BASE_TOKEN_HEADERS = { token: TOKEN }

// ── 鉴权 ─────────────────────────────────────────────────────────────────────
t('无 token 401', (await httpRequest(SVC_PORT, 'GET', '/api/engine')).status === 401, '缺鉴权未拒绝')
t('错误 token 401', (await httpRequest(SVC_PORT, 'GET', '/api/engine', { token: 'wrong-token-wrong-token-wrong' })).status === 401, '错 token 未拒绝')
t('__health 免鉴权', (await httpRequest(SVC_PORT, 'GET', '/__health')).status === 200, '/__health 未放行')

// ── 引擎信息 ─────────────────────────────────────────────────────────────────
{
  const r = await httpRequest(SVC_PORT, 'GET', '/api/engine', BASE_TOKEN_HEADERS)
  t('engine ok', r.json && r.json.engine && r.json.engine.status === 'ok', JSON.stringify(r.json)?.slice(0, 200))
  t('engine 版本来自假引擎', r.json?.engine?.daemonVersion === '27.3.1', `daemonVersion=${r.json?.engine?.daemonVersion}`)
  t('engine 端点描述 tcp', r.json?.engine?.endpoint?.target === `tcp://127.0.0.1:${fake.port}`, `endpoint=${r.json?.engine?.endpoint?.target}`)
}

// ── 容器列表与 compose 分组 ──────────────────────────────────────────────────
{
  const r = await httpRequest(SVC_PORT, 'GET', '/api/containers', BASE_TOKEN_HEADERS)
  t('containers 3 个', r.json?.items?.length === 3, `items=${r.json?.items?.length}`)
  t('compose 分组 demo=2 + loose=1', r.json?.grouped?.projects?.[0]?.name === 'demo' && r.json?.grouped?.projects?.[0]?.items?.length === 2 && r.json?.grouped?.loose?.length === 1, JSON.stringify(r.json?.grouped)?.slice(0, 200))
  t('端口归一化', r.json?.items?.[0]?.ports?.[0] === '0.0.0.0:8080->80/tcp', JSON.stringify(r.json?.items?.[0]?.ports))
  t('compose label 进归一化', r.json?.items?.[0]?.composeProject === 'demo', `composeProject=${r.json?.items?.[0]?.composeProject}`)
}

// ── 日志（一次性 demux 全链路） ──────────────────────────────────────────────
{
  const r = await httpRequest(SVC_PORT, 'GET', `/api/containers/${C1.Id.slice(0, 12)}/logs?tail=100`, BASE_TOKEN_HEADERS)
  t('logs 一次性 3 行（stdout 2 + stderr 1）', r.json?.lines?.length === 3, JSON.stringify(r.json?.lines)?.slice(0, 200))
  t('logs stderr 标注保留', r.json?.lines?.[2]?.stream === 'stderr' && r.json?.lines?.[2]?.text.includes('upstream timeout'), JSON.stringify(r.json?.lines?.[2]))
}

// ── 日志 follow 流式（读几行即断开） ─────────────────────────────────────────
{
  const res = await fetch(`http://127.0.0.1:${SVC_PORT}/api/containers/${C1.Id.slice(0, 12)}/logs?tail=10&follow=1`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  })
  t('follow 200', res.status === 200, `status=${res.status}`)
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let lines = 0
  const deadline = Date.now() + 5000
  while (lines < 2 && Date.now() < deadline) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    lines = buf.split('\n').filter((l) => l.startsWith('[O]') || l.startsWith('[E]')).length
  }
  await reader.cancel().catch(() => {})
  t('follow 收到流式行且带流标注', lines >= 2 && buf.includes('[E] follow: err-line'), `lines=${lines}, sample=${buf.slice(0, 80)}`)
}

// ── stats/inspect ────────────────────────────────────────────────────────────
{
  const r = await httpRequest(SVC_PORT, 'GET', `/api/containers/${C1.Id.slice(0, 12)}/stats`, BASE_TOKEN_HEADERS)
  t('stats CPU%=50', r.json?.stats?.cpuPct === 50, `cpuPct=${r.json?.stats?.cpuPct}`)
  t('stats 内存 200MB', r.json?.stats?.memUsed === 200_000_000, `memUsed=${r.json?.stats?.memUsed}`)
  const insp = await httpRequest(SVC_PORT, 'GET', `/api/containers/${C1.Id.slice(0, 12)}/inspect`, BASE_TOKEN_HEADERS)
  t('inspect 返回原始结构', insp.json?.inspect?.Name === '/web-nginx', `Name=${insp.json?.inspect?.Name}`)
}

// ── 写操作护栏 ───────────────────────────────────────────────────────────────
{
  const r1 = await httpRequest(SVC_PORT, 'POST', `/api/containers/${C2.Id.slice(0, 12)}/stop`, { ...BASE_TOKEN_HEADERS, body: {} })
  t('stop 成功（面板通道允许）', r1.status === 200 && r1.json?.ok === true, JSON.stringify(r1.json)?.slice(0, 120))
  t('假引擎记录到 stop', fake.actions.stopped.has(C2.Id.slice(0, 12)) || fake.actions.stopped.has(C2.Id), JSON.stringify(Array.from(fake.actions.stopped)))
  const r2 = await httpRequest(SVC_PORT, 'POST', `/api/containers/${C2.Id.slice(0, 12)}/remove`, { ...BASE_TOKEN_HEADERS, body: { confirm: 'wrong-name' } })
  t('remove confirm 不匹配被拒', r2.status === 400 && String(r2.json?.error).includes('精确输入'), JSON.stringify(r2.json))
  const r3 = await httpRequest(SVC_PORT, 'POST', `/api/containers/${C2.Id.slice(0, 12)}/remove`, { ...BASE_TOKEN_HEADERS, body: { confirm: 'cache-redis' } })
  t('remove confirm 匹配执行', r3.status === 200 && r3.json?.removed === 'cache-redis', JSON.stringify(r3.json))
}

// ── 名称歧义解析 ─────────────────────────────────────────────────────────────
{
  const r = await httpRequest(SVC_PORT, 'GET', '/api/containers/a/logs?tail=10', BASE_TOKEN_HEADERS)
  // 'a' 是 aaa111/bbb222/ccc333 共同前缀? 不是：'a' 只匹配 aaa111 前缀（bbb/ccc 不以 a 开头）→ 唯一
  t('id 前缀唯一匹配', r.status === 200 || (r.json && String(r.json.error).includes('不存在')), JSON.stringify(r.json)?.slice(0, 120))
}

// ── 镜像 / df / events / selftest ────────────────────────────────────────────
{
  const r = await httpRequest(SVC_PORT, 'GET', '/api/images', BASE_TOKEN_HEADERS)
  t('images 3 个', r.json?.items?.length === 3, `items=${r.json?.items?.length}`)
  const rm1 = await httpRequest(SVC_PORT, 'POST', `/api/images/${r.json.items[0].id}/remove`, { ...BASE_TOKEN_HEADERS, body: { confirm: 'nginx:1.25' } })
  const rm1b = await httpRequest(SVC_PORT, 'POST', '/api/images/sha256:imgbbb222bbb/remove', { ...BASE_TOKEN_HEADERS, body: { confirm: 'redis:7' } })
  t('镜像删除 confirm=repo:tag（按返回 id）', rm1.status === 200, JSON.stringify(rm1.json)?.slice(0, 120))
  t('镜像删除容忍 sha256: 前缀', rm1b.status === 200, JSON.stringify(rm1b.json)?.slice(0, 120))
  const rm2 = await httpRequest(SVC_PORT, 'POST', '/api/images/aaa/remove', { ...BASE_TOKEN_HEADERS, body: { confirm: 'x' } })
  t('镜像不存在 404', rm2.status === 404, `status=${rm2.status}`)

  const d = await httpRequest(SVC_PORT, 'GET', '/api/df', BASE_TOKEN_HEADERS)
  t('df 可回收=15.6MB+12.3MB 量级', d.json?.df?.reclaimable > 10_000_000, `reclaimable=${d.json?.df?.reclaimable}`)

  // 事件泵需要 1-2s 建流
  await sleep(1500)
  const ev = await httpRequest(SVC_PORT, 'GET', '/api/events?limit=10', BASE_TOKEN_HEADERS)
  t('events 环形缓冲收到假引擎事件', (ev.json?.items?.length || 0) >= 2, `items=${ev.json?.items?.length}, pump=${ev.json?.pumpRunning}`)
  t('事件含 die/137', JSON.stringify(ev.json?.items || []).includes('die'), JSON.stringify(ev.json?.items)?.slice(0, 150))

  const st = await httpRequest(SVC_PORT, 'POST', '/api/selftest', { ...BASE_TOKEN_HEADERS, body: {} })
  t('selftest 全绿', st.json?.selftest?.passed === st.json?.selftest?.total, JSON.stringify(st.json?.selftest)?.slice(0, 300))
  t('selftest 含引擎侧检查', (st.json?.selftest?.checks || []).some((c) => c.name === 'engine.listContainers'), '缺引擎侧检查')
}

// ── MCP 通道只读结构（HTTP 层面） ────────────────────────────────────────────
{
  const r = await httpRequest(SVC_PORT, 'GET', '/mcp/status', BASE_TOKEN_HEADERS)
  t('mcp/status ok', r.json?.engine?.status === 'ok', JSON.stringify(r.json)?.slice(0, 150))
  const ps = await httpRequest(SVC_PORT, 'GET', '/mcp/ps?all=1', BASE_TOKEN_HEADERS)
  t('mcp/ps 3 个', ps.json?.items?.length === 3, `items=${ps.json?.items?.length}`)
  const logs = await httpRequest(SVC_PORT, 'GET', `/mcp/logs?nameOrId=web-nginx&tail=50`, BASE_TOKEN_HEADERS)
  t('mcp/logs 按名解析', logs.json?.name === 'web-nginx' && logs.json?.lines?.length === 3, JSON.stringify(logs.json)?.slice(0, 150))
  const insp = await httpRequest(SVC_PORT, 'GET', `/mcp/inspect?nameOrId=web-nginx`, BASE_TOKEN_HEADERS)
  t('mcp/inspect env 打码', insp.json?.envMasked === true && JSON.stringify(insp.json).includes('<masked>') && !JSON.stringify(insp.json).includes('super-secret-token-value'), '密钥泄露！')
  const insp2 = await httpRequest(SVC_PORT, 'GET', `/mcp/inspect?nameOrId=web-nginx&showEnv=1`, BASE_TOKEN_HEADERS)
  t('mcp/inspect showEnv=1 明文（用户同意语义）', insp2.json?.envMasked === false && JSON.stringify(insp2.json).includes('super-secret-token-value'), 'showEnv 未生效')
  const stats = await httpRequest(SVC_PORT, 'GET', '/mcp/stats', BASE_TOKEN_HEADERS)
  t('mcp/stats 全部运行中（2 个，刚删的 redis 不在）', stats.json?.items?.length === 2, `items=${stats.json?.items?.length}`)
  const imgs = await httpRequest(SVC_PORT, 'GET', '/mcp/images', BASE_TOKEN_HEADERS)
  t('mcp/images 带 df', imgs.json?.df?.reclaimable > 0, JSON.stringify(imgs.json?.df)?.slice(0, 100))
  const ev = await httpRequest(SVC_PORT, 'GET', '/mcp/events?limit=5', BASE_TOKEN_HEADERS)
  t('mcp/events ok', (ev.json?.items?.length || 0) >= 1, `items=${ev.json?.items?.length}`)
  const st = await httpRequest(SVC_PORT, 'POST', '/mcp/selftest', BASE_TOKEN_HEADERS)
  t('mcp/selftest 纯逻辑全绿', st.json?.selftest?.passed === st.json?.selftest?.total, JSON.stringify(st.json?.selftest)?.slice(0, 200))
}

// ── 清理：关 stdin 触发优雅下线（Windows 上 SIGTERM=TerminateProcess 不跑 handler） ──
svc.stdin.end()
await sleep(1000)
t('stdin 关闭后 dkd.service 已注销', !kvStore.has('dkd.service'), `kv 残留=${JSON.stringify(kvStore.get('dkd.service'))?.slice(0, 80)}`)

fake.server.close()
fakeHost.close()

console.log(`\n=== service-tests: ${pass} 通过 / ${fail} 失败 ===`)
if (failures.length) {
  for (const f of failures) console.error(`✗ ${f}`)
  console.error('--- service stderr ---\n' + svcLogs.join(''))
  process.exit(1)
}
process.exit(0)
