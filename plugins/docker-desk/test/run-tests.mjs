// 离线单测：shared/core 自检 + 端点解析 + 静态安全断言（零网络、零子进程）
// 运行：node test/run-tests.mjs
import { createRequire } from 'module'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const __dirname = dirname(fileURLToPath(import.meta.url))
const pluginDir = join(__dirname, '..')
const core = require(join(pluginDir, 'shared', 'core.js'))
const engine = require(join(pluginDir, 'service', 'engine.js'))

let pass = 0
let fail = 0
const failures = []
function t(name, ok, detail) {
  if (ok) pass += 1
  else { fail += 1; failures.push(`${name} → ${detail}`) }
}

// ── core.selfTest（纯逻辑断言 11 项） ────────────────────────────────────────
const st = core.selfTest()
t('core.selfTest 全绿', st.passed === st.total, st.checks.filter((c) => !c.ok).map((c) => `${c.name}: ${c.detail}`).join('; '))

// ── 端点解析 ─────────────────────────────────────────────────────────────────
t('parseEndpoint npipe', (() => {
  const ep = engine.parseEndpoint('npipe:////./pipe/docker_engine')
  return ep && ep.kind === 'npipe' && ep.path === '\\\\.\\pipe\\docker_engine'
})(), `npipe 解析=${JSON.stringify(engine.parseEndpoint('npipe:////./pipe/docker_engine'))}`)
t('parseEndpoint unix', (() => {
  const ep = engine.parseEndpoint('unix:///var/run/docker.sock')
  return ep && ep.kind === 'unix' && ep.path === '/var/run/docker.sock'
})(), 'unix 解析失败')
t('parseEndpoint tcp', (() => {
  const ep = engine.parseEndpoint('tcp://127.0.0.1:2375')
  return ep && ep.kind === 'tcp' && ep.host === '127.0.0.1' && ep.port === 2375
})(), 'tcp 解析失败')
t('parseEndpoint 非法', engine.parseEndpoint('ftp://x') === null, '非法端点未被拒绝')
t('resolveEndpoint 显式参数优先', (() => {
  const ep = engine.resolveEndpoint({ engineArg: 'tcp://10.0.0.1:2375', env: { DOCKER_HOST: 'tcp://10.0.0.2:2376' } })
  return ep.kind === 'tcp' && ep.host === '10.0.0.1'
})(), 'engineArg 应优先于 DOCKER_HOST')
t('resolveEndpoint DOCKER_HOST 次之', (() => {
  const ep = engine.resolveEndpoint({ env: { DOCKER_HOST: 'tcp://10.0.0.2:2376' } })
  return ep.kind === 'tcp' && ep.host === '10.0.0.2'
})(), 'DOCKER_HOST 应生效')
t('resolveEndpoint 平台默认', (() => {
  const ep = engine.resolveEndpoint({ env: {} })
  return process.platform === 'win32' ? ep.kind === 'npipe' : ep.kind === 'unix'
})(), '平台默认端点不符')

// ── 日志 demux 补充（core.selfTest 之外的关键边界） ─────────────────────────
t('demux 空行保留', (() => {
  const payload = Buffer.from('a\n\nb\n')
  const head = Buffer.alloc(8)
  head[0] = 1
  head.writeUInt32BE(payload.length, 4)
  const r = core.demuxAll(Buffer.concat([head, payload]))
  return r.length === 3 && r[1].text === ''
})(), '空行丢失')
t('demux 超长行截断', (() => {
  const payload = Buffer.from('x'.repeat(core.LIMITS.LOG_LINE_CHARS + 500) + '\n')
  const head = Buffer.alloc(8)
  head[0] = 1
  head.writeUInt32BE(payload.length, 4)
  const r = core.demuxAll(Buffer.concat([head, payload]))
  return r.length === 1 && r[0].text.endsWith('…[截断]') && r[0].text.length <= core.LIMITS.LOG_LINE_CHARS + 10
})(), '超长行未截断')
t('demux 尾部无换行成半行', (() => {
  const d = new core.LogDemuxer()
  const payload = Buffer.from('partial line no newline')
  const head = Buffer.alloc(8)
  head[0] = 1
  head.writeUInt32BE(payload.length, 4)
  d.push(Buffer.concat([head, payload]))
  return d.lines.length === 0 // 尚无换行 → 不出整行（流式语义：等下一个 chunk）
})(), '无换行尾行不该立即出整行')

// ── 静态安全断言（源码文本级） ───────────────────────────────────────────────
const mainSrc = readFileSync(join(pluginDir, 'service', 'main.js'), 'utf8')
const mcpSrc = readFileSync(join(pluginDir, 'mcp', 'server.js'), 'utf8')
const engineSrc = readFileSync(join(pluginDir, 'service', 'engine.js'), 'utf8')
const storeSrc = readFileSync(join(pluginDir, 'service', 'store.js'), 'utf8')
const kvSrc = readFileSync(join(pluginDir, 'service', 'kvclient.js'), 'utf8')

t('service 无 fs 依赖（日志/inspect 不落盘的结构保证）', !mainSrc.includes("require('fs')") && !mainSrc.includes('require("fs")'), 'main.js 引用了 fs')
t('mcp 无 fs 依赖', !mcpSrc.includes("require('fs')") && !mcpSrc.includes('require("fs")'), 'mcp/server.js 引用了 fs')
t('service/mcp 无子进程执行', !mainSrc.includes('child_process') && !mcpSrc.includes('child_process'), '不允许 exec')
t('service 只绑 127.0.0.1', mainSrc.includes("listen(PORT, '127.0.0.1',"), '监听地址不是 127.0.0.1')
t('引擎通道不使用 https/TLS（named pipe/unix socket/TCP 明文本机语义）', !engineSrc.includes("require('https')"), 'engine.js 引用了 https')
t('鉴权除外路由只有 /__health', mainSrc.includes("if (p === '/__health')") && mainSrc.includes('timingSafeEqual'), '鉴权豁免面失控')
t('MCP 路由组无写操作（结构只读）', (() => {
  const idx = mainSrc.indexOf('── MCP 通道')
  const mcpSection = idx >= 0 ? mainSrc.slice(idx) : ''
  return mcpSection.length > 500
    && !mcpSection.includes('.startContainer')
    && !mcpSection.includes('.stopContainer')
    && !mcpSection.includes('.restartContainer')
    && !mcpSection.includes('.removeContainer')
    && !mcpSection.includes('.removeImage')
})(), '/mcp/ 路由组里出现了写调用')
t('删除容器有 confirm 校验', mainSrc.includes('confirmMatches(body.confirm') && mainSrc.includes('需要精确输入容器名'), '删除缺 typed confirm')
t('inspect env 有打码（AI 通道）', mainSrc.includes('<masked>') && mcpSrc.includes('showEnv'), 'env 打码缺失')
t('kv 只用 dkd 前缀且走宿主 bridge 协议', storeSrc.includes("KV_SERVICE = 'dkd.service'") && kvSrc.includes('/api/router-dispatch') && kvSrc.includes("target, payload"), 'kv 前缀/桥协议异常')
t('日志上限常量集中管理', mainSrc.includes('core.LIMITS.LOG_LINES_MAX') && mainSrc.includes('core.LIMITS.LOG_STREAM_BYTES'), '日志上限魔法数散落')

console.log(`\n=== run-tests: ${pass} 通过 / ${fail} 失败 ===`)
if (failures.length) {
  for (const f of failures) console.error(`✗ ${f}`)
  process.exit(1)
}
