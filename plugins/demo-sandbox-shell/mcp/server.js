#!/usr/bin/env node
/**
 * Demo Sandbox Shell — MCP Server
 *
 * 沙箱化 shell 执行器：
 * - 限制工作目录：所有命令在 workspacePath 下执行
 * - 禁止网络命令：curl/wget/nc/telnet/ssh 被拦截
 * - 禁止提权：sudo/su/runas 被拦截
 */
const { execSync } = require('child_process')
const path = require('path')

const workspacePath = process.argv[2] || process.cwd()
const isWin = process.platform === 'win32'

const BLOCKED_PATTERNS = [
  /\bcurl\b/i, /\bwget\b/i, /\bnc\b/i, /\btelnet\b/i, /\bssh\b/i, /\bscp\b/i, /\brsync\b/i,
  /\bsudo\b/i, /\bsu\b/, /\brunas\b/i,
]

function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n') }

const TOOLS = [{
  name: 'bash',
  description: '[sandbox] 沙箱化 shell 执行（限制工作目录 + 禁止网络/提权命令）',
  inputSchema: { type: 'object', properties: { command: { type: 'string' }, workdir: { type: 'string' } }, required: ['command'] },
}]

function isBlocked(command) {
  return BLOCKED_PATTERNS.some(p => p.test(command))
}

let buf = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  buf += chunk
  while (true) {
    const i = buf.indexOf('\n')
    if (i === -1) break
    const line = buf.slice(0, i).trim()
    buf = buf.slice(i + 1)
    if (!line) continue
    let msg
    try { msg = JSON.parse(line) } catch { continue }

    if (msg.method === 'initialize') {
      send({ jsonrpc: '2.0', id: msg.id, result: {
        protocolVersion: '2024-11-05', capabilities: { tools: {} },
        serverInfo: { name: 'sandbox-shell', version: '0.1.0' },
      }})
    } else if (msg.method === 'tools/list') {
      send({ jsonrpc: '2.0', id: msg.id, result: { tools: TOOLS } })
    } else if (msg.method === 'tools/call') {
      const args = msg.params?.arguments || {}
      const command = args.command || ''

      if (isBlocked(command)) {
        send({ jsonrpc: '2.0', id: msg.id, result: {
          content: [{ type: 'text', text: `[sandbox] 命令被沙箱拦截（网络/提权命令禁止）：${command}` }],
          isError: true,
        }})
        continue
      }

      try {
        const output = execSync(command, {
          encoding: 'utf8', maxBuffer: 1024 * 1024 * 10, timeout: 60000,
          cwd: workspacePath,
          shell: isWin ? (process.env.ComSpec || 'cmd.exe') : '/bin/sh',
        })
        send({ jsonrpc: '2.0', id: msg.id, result: {
          content: [{ type: 'text', text: `[sandbox] exit=0 (cwd=${workspacePath})\n${output}` }],
        }})
      } catch (e) {
        send({ jsonrpc: '2.0', id: msg.id, result: {
          content: [{ type: 'text', text: `[sandbox] exit=${e.status ?? 1} (cwd=${workspacePath})\n${e.stderr || e.message}` }],
          isError: true,
        }})
      }
    } else if (msg.id !== undefined) {
      send({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `Method not found: ${msg.method}` } })
    }
  }
})
process.stdin.on('end', () => process.exit(0))
