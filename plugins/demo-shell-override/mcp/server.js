#!/usr/bin/env node
/**
 * Demo Shell Override — MCP Server
 *
 * 覆盖 SimpleAI 内置 bash 工具（硬编码工具覆盖）。
 *
 * 覆盖机制：插件声明 capability: "shell" + mcpServerId: "demo-audit-shell"，
 * Polaris 解析时（capability_to_builtin_servers("shell") → ["polaris-bash"]）
 * 把此插件 server 改名为 polaris-bash 注入 mcp_servers。
 * SimpleAI 的 ToolRegistry::dispatch("bash", ...) 检测到 mcp_pool 中存在
 * mcp__polaris-bash__bash（虚拟 server 覆盖），路由到此插件 MCP server。
 *
 * 行为：
 * - 拦截危险命令（rm -rf /, del /f /s /q, 格式化等）
 * - 安全命令：调用系统 shell 执行，记录到 audit.log
 * - 返回 stdout/stderr/exit_code
 *
 * 协议：JSON-RPC 2.0 over stdin/stdout，每行一条 JSON。
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const AUDIT_LOG = path.join(__dirname, '..', 'audit.log')

/** 审计日志 */
function audit(command, blocked, result) {
  const entry = JSON.stringify({
    ts: new Date().toISOString(),
    command,
    blocked,
    exitCode: result?.exitCode ?? null,
    error: result?.error ?? null,
  })
  try {
    fs.appendFileSync(AUDIT_LOG, entry + '\n')
  } catch (e) {
    process.stderr.write(`[demo-audit-shell] 写审计日志失败: ${e.message}\n`)
  }
}

/** JSON-RPC 响应 */
function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n')
}

// 危险命令黑名单（正则）
const DANGEROUS_PATTERNS = [
  /rm\s+-rf\s+\/(\s|$)/,                  // rm -rf /
  /rm\s+-rf\s+\/\*/,                      // rm -rf /*
  /rm\s+-rf\s+~/,                          // rm -rf ~
  /del\s+\/[fFsS].*\\[cC]:/i,             // del /f /s /q C:
  /format\s+[cC]:/i,                      // format C:
  /mkfs/i,                                 // mkfs
  /:\(\)\s*\{\s*:\|:&\s*\};:/,            // fork bomb
  /dd\s+if=.*of=\/dev\/[sh]d/i,           // dd 写磁盘
  /\>\s*\/dev\/sd[a-z]/i,                 // 写磁盘设备
]

function isDangerous(command) {
  return DANGEROUS_PATTERNS.some(p => p.test(command))
}

/** 执行 shell 命令（安全命令） */
function executeShell(command, workdir) {
  try {
    const options = {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 10, // 10MB
      timeout: 60000,
      shell: process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : '/bin/sh',
    }
    if (workdir) options.cwd = workdir

    const output = execSync(command, options)
    return {
      stdout: output || '',
      stderr: '',
      exitCode: 0,
    }
  } catch (e) {
    return {
      stdout: e.stdout ? e.stdout.toString() : '',
      stderr: e.stderr ? e.stderr.toString() : (e.message || '执行失败'),
      exitCode: e.status ?? 1,
    }
  }
}

// MCP 工具定义（必须暴露 bash 工具，与内置同名）
const TOOLS = [
  {
    name: 'bash',
    description: '[demo-override] 执行 shell 命令（审计版：记录到 audit.log + 拦截危险命令）。覆盖内置 bash 工具。',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The shell command to execute' },
        workdir: { type: 'string', description: 'Working directory (optional)' },
      },
      required: ['command'],
    },
  },
]

/** JSON-RPC 消息处理 */
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
    try {
      msg = JSON.parse(line)
    } catch (e) {
      process.stderr.write(`[demo-audit-shell] JSON 解析失败: ${e.message}\n`)
      continue
    }

    if (msg.method === 'initialize') {
      send({
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'demo-audit-shell', version: '0.2.0' },
        },
      })
    } else if (msg.method === 'tools/list') {
      send({ jsonrpc: '2.0', id: msg.id, result: { tools: TOOLS } })
    } else if (msg.method === 'tools/call') {
      const toolName = msg.params?.name
      const args = msg.params?.arguments || {}

      if (toolName !== 'bash') {
        send({
          jsonrpc: '2.0',
          id: msg.id,
          result: {
            content: [{ type: 'text', text: `Unknown tool: ${toolName}` }],
            isError: true,
          },
        })
        continue
      }

      const command = args.command || ''
      const workdir = args.workdir

      // 危险命令拦截
      if (isDangerous(command)) {
        const blockMsg = `[demo-override] 危险命令已被拦截：${command}`
        audit(command, true, { error: blockMsg })
        send({
          jsonrpc: '2.0',
          id: msg.id,
          result: {
            content: [{ type: 'text', text: blockMsg }],
            isError: true,
          },
        })
        continue
      }

      // 执行安全命令
      const result = executeShell(command, workdir)
      audit(command, false, result)

      const output = result.stdout + (result.stderr ? `\n[stderr]\n${result.stderr}` : '')
      const text = `[demo-override] exit=${result.exitCode}\n${output}`

      send({
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          content: [{ type: 'text', text }],
          isError: result.exitCode !== 0,
        },
      })
    } else if (msg.method === 'shutdown') {
      send({ jsonrpc: '2.0', id: msg.id, result: {} })
    } else if (msg.id !== undefined) {
      send({
        jsonrpc: '2.0',
        id: msg.id,
        error: { code: -32601, message: `Method not found: ${msg.method}` },
      })
    }
  }
})

process.stdin.on('end', () => process.exit(0))
