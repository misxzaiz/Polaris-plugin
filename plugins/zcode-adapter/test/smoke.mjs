#!/usr/bin/env node
/**
 * zcode-adapter 冒烟测试（阶段 1遗漏项② 的首个落地样本）
 * spawn server.js → initialize → tools/list → tools/call:discover(fixtures) → tools/call:translate(fixture)
 * 断言：翻译产物 id 带 zcode. 前缀、mcpServers 走 stdio、env 显式降级诊断存在。
 */
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const serverJs = path.join(here, '..', 'mcp', 'server.js')
const rootDir = path.join(here, '..', 'fixtures')
const fixture = path.join(here, '..', 'fixtures', 'showcase', '.zcode-plugin', 'plugin.json')

const proc = spawn(process.execPath, [serverJs], {
  cwd: here,
  env: process.env,
  stdio: ['pipe', 'pipe', 'pipe'],
})
let buffer = ''
const pending = new Map()
let nextId = 1

proc.stdout.setEncoding('utf8')
proc.stdout.on('data', (chunk) => {
  buffer += chunk
  let idx
  while ((idx = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, idx).trim()
    buffer = buffer.slice(idx + 1)
    if (!line) continue
    const msg = JSON.parse(line)
    const resolver = pending.get(msg.id)
    if (resolver) {
      pending.delete(msg.id)
      resolver(msg)
    }
  }
})
proc.stderr.setEncoding('utf8')
proc.stderr.on('data', (c) => process.stderr.write(`[server] ${c}`))

function call(method, params) {
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, (msg) => resolve(msg))
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id)
        reject(new Error(`timeout: ${method}`))
      }
    }, 5000)
    proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
  })
}

const resultText = (m) => m.result?.content?.[0]?.text
const parseResult = (m) => (resultText(m) == null ? m.result : JSON.parse(resultText(m)))
let failed = false
function assert(cond, label) {
  console.log(cond ? `  ✅ ${label}` : `  ❌ ${label}`)
  if (!cond) failed = true
}

try {
  const init = await call('initialize', { capabilities: {} })
  assert(typeof init.result === 'object', 'initialize 握手成功')

  const list = parseResult(await call('tools/list', {}))
  assert(
    Array.isArray(list.tools) && list.tools.map((t) => t.name).join() === 'discover,translate',
    'tools/list 返回 discover,translate',
  )

  const disc = parseResult(await call('tools/call', { name: 'discover', arguments: { rootPath: rootDir } }))
  console.error('[disc]', JSON.stringify(disc).slice(0, 300))
  assert(disc.dialect === 'zcode' && disc.candidates.length === 1, 'discover 发现 1 个 .zcode-plugin 布局')
  assert(disc.candidates[0].manifest?.name === 'my-panel', 'discover 返回 manifest 内容')

  const tr = parseResult(await call('tools/call', { name: 'translate', arguments: { manifestPath: fixture } }))
  assert(tr.plugin && tr.plugin.id.startsWith('zcode.'), `翻译产物 id 带前缀（${tr.plugin?.id}）`)
  assert(tr.plugin?.contributes?.mcpServers?.[0]?.transport === 'stdio', 'mcpServers 翻译为 stdio')
  assert(
    tr.plugin?.contributes?.mcpServers?.[0]?.argsTemplate?.[0] === '{{pluginDir}}/dist/server.mjs',
    `${'${ZCODE_PLUGIN_ROOT}'} → {{pluginDir}} 变量替换成功`,
  )
  assert(tr.plugin?.contributes?.views?.[0]?.panelType === 'zc:my-panel:editor', 'ui.surfaces → panelType 方言命名空间')
  assert(
    (tr.plugin?.contributes?.mcpServers ?? []).every((s) => !('env' in s)),
    'env 不被静默透传（env 字段不存在于产物）',
  )
  assert(
    tr.diagnostics?.some((d) => d.includes('env') && d.includes('显式降级')),
    'env 走显式降级诊断（不静默丢弃）',
  )
} catch (e) {
  console.error(`  ❌ 冒烟异常: ${e.message}`)
  failed = true
} finally {
  proc.kill()
}

process.exit(failed ? 1 : 0)
