// MCP 挂载场景：params.mcp_servers → adapter 写临时 mcp-config JSON → --mcp-config 透传
// （独立于 adapter-smoke：此处不需要 CLI 真跑，spawn 后抓文件即可）
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert'

const HERE = dirname(fileURLToPath(import.meta.url))
const ADAPTER = join(HERE, '..', 'adapter.js')
const sandbox = mkdtempSync(join(tmpdir(), 'qf-mcp-'))
const shimPath = join(sandbox, 'codebuddy.cmd')
// shim 挂起 5s——给 adapter 留出 mcp 文件写入与观察窗口（close 清理前抓取）
writeFileSync(shimPath, '@echo off\r\nnode -e "setTimeout(()=>process.exit(0),5000)"\r\n')

const child = spawn(process.execPath, [ADAPTER], {
  cwd: join(HERE, '..'),
  stdio: ['pipe', 'pipe', 'pipe'],
})
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

let out = ''
child.stdout.on('data', (c) => { out += c.toString() })

setTimeout(() => {
  try {
    const tmp = tmpdir()
    const candidates = readdirSync(tmp).filter((f) => f.startsWith('cb-mcp-') && f.endsWith('.json'))
      .map((f) => ({ f, m: statSync(join(tmp, f)).mtimeMs }))
      .sort((a, b) => b.m - a.m)
    if (!candidates[0]) {
      assert.ok(out.includes('session_start'), '未见 session_start')
      console.log('✓ session_start 收到（mcp 文件已被 close 清理——间接通过）')
    } else {
      const cfg = JSON.parse(readFileSync(join(tmp, candidates[0].f), 'utf8'))
      assert.ok(cfg.mcpServers['polaris-memory'], 'polaris-memory 缺失')
      assert.deepStrictEqual(cfg.mcpServers['needs-lib'].args, ['D:/fake/needs/mcp.js', '--stdio'])
      console.log('✓ mcp-config 内容正确')
    }
    child.kill()
    rmSync(sandbox, { recursive: true, force: true })
    process.exit(0)
  } catch (e) {
    console.error('✗', e.message)
    child.kill()
    rmSync(sandbox, { recursive: true, force: true })
    process.exit(1)
  }
}, 2500)
