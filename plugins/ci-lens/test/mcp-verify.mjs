/**
 * CI 体检台 MCP 协议验证（node test/mcp-verify.mjs）
 *
 * 起真实 bundle（mcp/server.js）走 stdio JSON-RPC 全链路：
 * initialize → tools/list → tools/call（lint/scan/rules）→ 错误路径。
 * tools/call 参数平铺 { name, arguments }（exec-sandbox 实证坑）。
 */
import { spawn } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const APP_ROOT = path.resolve(HERE, '..')

const mcp = spawn(process.execPath, ['mcp/server.js'], { cwd: APP_ROOT, stdio: ['pipe', 'pipe', 'pipe'] })
let buf = ''
const pending = new Map()
let nextId = 1
let passed = 0
let failed = 0

mcp.stdout.setEncoding('utf8')
mcp.stdout.on('data', (c) => {
  buf += c
  for (;;) {
    const i = buf.indexOf('\n')
    if (i === -1) break
    const line = buf.slice(0, i).trim()
    buf = buf.slice(i + 1)
    if (!line) continue
    let msg
    try { msg = JSON.parse(line) } catch (_) { continue }
    if (msg.id !== undefined && pending.has(msg.id)) {
      pending.get(msg.id)(msg)
      pending.delete(msg.id)
    }
  }
})
mcp.stderr.setEncoding('utf8')
mcp.stderr.on('data', () => { /* 日志走 stderr，忽略 */ })

function rpc(method, params, timeoutMs = 10000) {
  const id = nextId++
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`rpc 超时: ${method}`)), timeoutMs)
    pending.set(id, (msg) => { clearTimeout(timer); resolve(msg) })
    mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
  })
}

/** 通知无 id 无响应，fire-and-forget（notifications/initialized 不返回任何东西） */
function notify(method, params) {
  mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n')
}

function text(res) { return String(res.result?.content?.[0]?.text || '') }
function isError(res) { return res.result?.isError === true }

function check(name, cond, extra) {
  if (cond) { passed++; console.log(`  ✓ ${name}`) }
  else { failed++; console.error(`  ✗ ${name}${extra ? ' — ' + extra : ''}`) }
}

// 临时夹具目录（体检目标）
const FIX = fs.mkdtempSync(path.join(os.tmpdir(), 'cilens-fx-'))
fs.writeFileSync(path.join(FIX, 'Dockerfile'), 'FROM node\nRUN apt-get update && apt-get install -y git\nCMD ["x"]\nCMD ["y"]\n')
fs.mkdirSync(path.join(FIX, '.github', 'workflows'), { recursive: true })
fs.writeFileSync(
  path.join(FIX, '.github', 'workflows', 'ci.yml'),
  'on: pull_request_target\njobs:\n  b:\n    runs-on: ubunty-latest\n    steps:\n      - run: echo ${{ secrets.github_token }}\n'
)
fs.writeFileSync(path.join(FIX, 'README.md'), '# 不该被扫到\n')

try {
  const init = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'verify', version: '0' } })
  check('initialize 返回 serverInfo=ci-lens', init.result?.serverInfo?.name === 'ci-lens', JSON.stringify(init.result))

  notify('notifications/initialized', {})

  const list = await rpc('tools/list', {})
  const names = (list.result?.tools || []).map((t) => t.name)
  check('tools/list 三工具齐全', ['cil_lint', 'cil_scan', 'cil_rules'].every((n) => names.includes(n)), names.join(','))

  // cil_lint：坏 Dockerfile
  const lint1 = await rpc('tools/call', { name: 'cil_lint', arguments: { text: 'FROM node\nCMD ["a"]\nCMD ["b"]\n' } })
  check('cil_lint 坏 Dockerfile 非 error', !isError(lint1))
  check('cil_lint 报 multiple_cmd', text(lint1).includes('multiple_cmd'), text(lint1).slice(0, 200))
  check('cil_lint 报未钉版本', text(lint1).includes('from_unpinned'))
  check('cil_lint 含评分', /\*\*\d+(\.\d+)?\/10/.test(text(lint1)), text(lint1).slice(0, 200))

  // cil_lint：坏 workflow（auto 识别）
  const lint2 = await rpc('tools/call', { name: 'cil_lint', arguments: { text: 'on: push\njobs:\n  a:\n    runs-on: ubunty-latest\n    steps:\n      - run: echo ${{ secrets.github_token }}\n' } })
  check('cil_lint auto 识别工作流并报 secrets_case', text(lint2).includes('wf_secrets_case'), text(lint2).slice(0, 300))
  check('cil_lint 报 runner 拼写', text(lint2).includes('wf_runner_label'))

  // cil_lint：语法错误工作流不崩溃
  const lint3 = await rpc('tools/call', { name: 'cil_lint', arguments: { text: 'jobs:\n  a:\n    runs-on: [ubuntu-latest\n' } })
  check('cil_lint YAML 语法错误优雅报告', text(lint3).includes('wf_yaml_syntax') || isError(lint3) === false, text(lint3).slice(0, 200))

  // cil_lint：无法识别 → isError
  const lint4 = await rpc('tools/call', { name: 'cil_lint', arguments: { text: 'hello world' } })
  check('cil_lint 无法识别返回 isError', isError(lint4))

  // cil_lint：缺参数 → isError
  const lint5 = await rpc('tools/call', { name: 'cil_lint', arguments: {} })
  check('cil_lint 缺 text 返回 isError', isError(lint5))

  // cil_scan：夹具目录
  const scan1 = await rpc('tools/call', { name: 'cil_scan', arguments: { dir: FIX } })
  check('cil_scan 非 error', !isError(scan1), text(scan1).slice(0, 300))
  check('cil_scan 汇总含文件数', text(scan1).includes('体检文件 2 个'), text(scan1).slice(0, 300))
  check('cil_scan 报 Dockerfile 多 CMD', text(scan1).includes('multiple_cmd'))
  check('cil_scan 报 workflow secrets_case', text(scan1).includes('wf_secrets_case'))
  check('cil_scan 不扫 README', !text(scan1).includes('不该被扫到'))

  // cil_scan：目录不存在 → isError
  const scan2 = await rpc('tools/call', { name: 'cil_scan', arguments: { dir: path.join(FIX, 'nope') } })
  check('cil_scan 目录不存在返回 isError', isError(scan2))

  // cil_rules
  const rules1 = await rpc('tools/call', { name: 'cil_rules', arguments: { kind: 'dockerfile' } })
  check('cil_rules dockerfile 含 from_unpinned', text(rules1).includes('from_unpinned'))
  const rules2 = await rpc('tools/call', { name: 'cil_rules', arguments: {} })
  check('cil_rules 缺省 all 双目录', text(rules2).includes('wf_needs_cycle') && text(rules2).includes('Dockerfile 规则'))

  // 未知工具
  const unk = await rpc('tools/call', { name: 'cil_nope', arguments: {} })
  check('未知工具返回 isError', isError(unk))

  console.log(`\nMCP 验证：${passed} 通过 / ${failed} 失败`)
} catch (e) {
  failed++
  console.error('验证异常：', e.message)
} finally {
  mcp.kill()
  try { fs.rmSync(FIX, { recursive: true, force: true }) } catch { /* 临时目录清理失败不阻塞 */ }
}

process.exit(failed > 0 ? 1 : 0)
