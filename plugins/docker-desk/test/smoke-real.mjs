// 真桥冒烟：真宿主 Polaris（HTTP bridge）+ 真 service 子进程 + 本机真实引擎状态
// 验证：kv 发布/发现链路、鉴权、引擎缺席时的诚实降级、自检。
// 运行：node test/smoke-real.mjs（需要 Polaris 宿主运行中）
import { createRequire } from 'module'
import { spawn } from 'child_process'
import { tmpdir } from 'os'
import { join } from 'path'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const path = require('path')
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pluginDir = join(__dirname, '..')
const { createKvClient } = require(join(pluginDir, 'service', 'kvclient.js'))

let pass = 0
let fail = 0
const failures = []
function t(name, ok, detail) {
  if (ok) pass += 1
  else { fail += 1; failures.push(`${name} → ${detail}`) }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 桥可达性（kvclient 的自发现；连不上 = 宿主没跑 → 跳过而非失败）
const kv = createKvClient({ appConfigDir: '', log: () => {} })
const probe = await kv.dispatchOk('cap.kv', { action: 'get', key: 'dkd.service' }).then(() => true).catch(() => false)
if (!probe) {
  console.log('=== smoke-real: SKIP（Polaris 宿主未运行；真桥验证待宿主启动后执行） ===')
  process.exit(0)
}
console.log(`[smoke] 真宿主可达: ${JSON.stringify(kv.endpoint())}`)

// 预清理（上次异常退出的残留）
await kv.kvDel('dkd.service').catch(() => {})

// 起真 service（无 --engine：走平台默认端点 → 本机无 Docker → 应诚实报 absent）
const SVC_PORT = 19480 + Math.floor(Math.random() * 100)
const svc = spawn(process.execPath, [join(pluginDir, 'service', 'main.js'), String(SVC_PORT), tmpdir()], {
  stdio: ['pipe', 'pipe', 'pipe'],
})
const svcLogs = []
svc.stderr.on('data', (c) => svcLogs.push(String(c)))

let published = null
for (let i = 0; i < 60 && !published; i++) {
  await sleep(300)
  published = await kv.kvGet('dkd.service').catch(() => null)
}
t('service 发布进真宿主 kv', !!published && Number.isFinite(published.port) && !!published.token, JSON.stringify(published)?.slice(0, 120))
if (!published) {
  console.error('--- service stderr ---\n' + svcLogs.join(''))
  svc.kill('SIGKILL')
  process.exit(1)
}

async function call(method, urlPath, body) {
  const res = await fetch(`http://127.0.0.1:${published.port}${urlPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${published.token}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch (_) { /* stream */ }
  return { status: res.status, json }
}

{
  const r = await call('GET', '/__health')
  t('真桥 /__health', r.status === 200 && r.json?.service === 'docker-desk', JSON.stringify(r.json)?.slice(0, 100))
}
{
  const r = await call('GET', '/api/engine')
  // 本机无 Docker → 必须是结构化的诚实降级，而不是 500
  t('引擎缺席 = status:absent + 可读错误', r.status === 200 && r.json?.engine?.status === 'absent' && typeof r.json?.engine?.error === 'string' && r.json.engine.error.length > 5, JSON.stringify(r.json)?.slice(0, 200))
  t('端点描述可见（named pipe 默认）', r.json?.engine?.endpoint?.target?.includes('docker_engine'), JSON.stringify(r.json?.engine?.endpoint))
}
{
  const r = await call('GET', '/api/containers')
  t('containers 缺席降级 ok:false+error', r.status === 200 && r.json?.ok === false && !!r.json?.error, JSON.stringify(r.json)?.slice(0, 150))
}
{
  const r = await call('GET', '/mcp/status')
  t('MCP status 诚实降级', r.status === 200 && r.json?.engine?.status === 'absent', JSON.stringify(r.json)?.slice(0, 150))
}
{
  const r = await call('POST', '/api/selftest', {})
  const st = r.json?.selftest
  t('selftest 纯逻辑全绿 + 引擎缺席不算失败', r.status === 200 && st && st.passed === st.total && (st.checks || []).some((c) => c.name === 'engine.reachable' && c.ok), JSON.stringify(st)?.slice(0, 300))
}
{
  const r = await call('GET', '/api/containers', undefined)
  t('鉴权对：带 token 才过', r.status !== 401, `status=${r.status}`)
  const r2 = await fetch(`http://127.0.0.1:${published.port}/api/engine`)
  t('真桥无 token 401', r2.status === 401, `status=${r2.status}`)
}

// 优雅下线（stdin 关闭 → kv 注销）
svc.stdin.end()
await sleep(1000)
const after = await kv.kvGet('dkd.service').catch(() => null)
t('下线后真宿主 kv 已注销', !after, JSON.stringify(after)?.slice(0, 100))

console.log(`\n=== smoke-real: ${pass} 通过 / ${fail} 失败 ===`)
if (failures.length) {
  for (const f of failures) console.error(`✗ ${f}`)
  console.error('--- service stderr ---\n' + svcLogs.join(''))
  process.exit(1)
}
process.exit(0)
