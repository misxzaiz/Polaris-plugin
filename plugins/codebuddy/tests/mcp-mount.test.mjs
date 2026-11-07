// 给冒烟测试补 MCP 挂载场景：params.mcp_servers → adapter 写 --mcp-config 文件
// （单独场景 F：fake-cli 不解析该参数，直接断言 argv 透传与文件生成）
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert'

const HERE = dirname(fileURLToPath(import.meta.url))
const ADAPTER = join(HERE, '..', 'adapter.js')
const sandbox = mkdtempSync(join(tmpdir(), 'qf-mcp-'))
const shimPath = join(sandbox, 'codebuddy.cmd')
writeFileSync(shimPath, '@echo off\r\nnode -e "process.exit(0)"\r\n')

function runAdapter(envExtra) {
  return spawn(process.execPath, [ADAPTER], {
    cwd: join(HERE, '..'),
    env: { ...process.env, ...envExtra },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
}
function collect(child, timeoutMs) {
  return new Promise((resolve, reject) => {
    const frames = []
    const timer = setTimeout(() => reject(new Error('timeout')), timeoutMs)
    let buf = ''
    child.stdout.on('data', (c) => { buf += c.toString() })
    child.on('exit', (code) => { clearTimeout(timer); resolve({ frames, code }) })
    child.on('error', reject)
  })
}

const child = runAdapter({})
child.stdin.write(JSON.stringify({
  id: 1, method: 'start_session',
  params: {
    session_id: 'mcp-test', message: 'hi',
    permission_mode: 'bypassPermissions',
    mcp_servers: [
      { server_name: 'polaris-memory', command: 'node', args: ['D:/fake/memory/server.js'] },
      { server_name: 'needs-lib', command: 'node', args: ['D:/fake/needs/mcp.js', '--stdio'] },
    ],
  },
}) + '\n')

let result = null
child.stdout.on('data', (c) => {
  for (const l of c.toString().split('\n')) {
    try { const o = JSON.parse(l); if (o.id === 1 && o.result) result = o.result } catch {}
  }
})
child.on('exit', () => {
  try {
    // 找 tmp 里最新的 cb-mcp-*.json 验证内容
    const tmp = tmpdir()
    const candidates = readdirSync(tmp).filter(f => f.startsWith('cb-mcp-') && f.endsWith('.json'))
      .map(f => ({ f, m: require('node:fs').statSync(join(tmp, f)).mtimeMs }))
      .sort((a, b) => b.m - a.m)
    assert.ok(candidates.length > 0, '未生成 mcp-config 文件')
    const cfg = JSON.parse(readFileSync(join(tmp, candidates[0].f), 'utf8'))
    assert.ok(cfg.mcpServers['polaris-memory'], 'polaris-memory 缺失')
    assert.deepStrictEqual(cfg.mcpServers['needs-lib'].args, ['D:/fake/needs/mcp.js', '--stdio'])
    console.log('✓ MCP 挂载场景：--mcp-config 文件生成且双 server 结构正确')
    rmSync(sandbox, { recursive: true, force: true })
    process.exit(0)
  } catch (e) {
    console.error('✗', e.message)
    rmSync(sandbox, { recursive: true, force: true })
    process.exit(1)
  }
})
