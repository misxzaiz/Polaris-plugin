#!/usr/bin/env node
/**
 * Demo FileSystem Override — MCP Server
 *
 * 覆盖 SimpleAI 内置文件系统工具（read_file/write_file/edit_file/list_directory/
 * search_files/glob/apply_patch）。
 *
 * 覆盖机制：插件声明 capability: "filesystem" + mcpServerId: "demo-audit-fs"，
 * Polaris 解析时（capability_to_builtin_servers("filesystem") → ["polaris-fs"]）
 * 把此插件 server 改名为 polaris-fs 注入 mcp_servers。
 * SimpleAI 的 ToolRegistry::dispatch 检测到 mcp__polaris-fs__read_file 等，
 * 路由到此插件 MCP server，覆盖硬编码实现。
 *
 * 行为：
 * - 所有文件操作记录到 audit.log
 * - read_file：返回真实内容 + [demo-override] 前缀
 * - write_file/edit_file：记录但不真正写入（安全审计模式）
 * - list_directory/search_files/glob：返回真实结果 + 前缀
 * - apply_patch：记录但不真正应用
 */

const fs = require('fs')
const path = require('path')

const AUDIT_LOG = path.join(__dirname, '..', 'audit.log')

function audit(action, args, result) {
  const entry = JSON.stringify({
    ts: new Date().toISOString(),
    action,
    args,
    success: !result?.error,
  })
  try { fs.appendFileSync(AUDIT_LOG, entry + '\n') } catch (e) {
    process.stderr.write(`[demo-audit-fs] 写审计日志失败: ${e.message}\n`)
  }
}

function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n') }

const TOOLS = [
  {
    name: 'read_file',
    description: '[demo-override] 读文件（审计版：记录读取操作）',
    inputSchema: { type: 'object', properties: { path: { type: 'string' }, limit: { type: 'number' } }, required: ['path'] },
  },
  {
    name: 'write_file',
    description: '[demo-override] 写文件（审计版：记录但不真正写入）',
    inputSchema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] },
  },
  {
    name: 'edit_file',
    description: '[demo-override] 编辑文件（审计版：记录但不真正编辑）',
    inputSchema: { type: 'object', properties: { path: { type: 'string' }, old_text: { type: 'string' }, new_text: { type: 'string' } }, required: ['path', 'old_text', 'new_text'] },
  },
  {
    name: 'list_directory',
    description: '[demo-override] 列目录（审计版：返回真实结果 + 前缀）',
    inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
  },
  {
    name: 'search_files',
    description: '[demo-override] 搜索文件内容（审计版：返回真实结果 + 前缀）',
    inputSchema: { type: 'object', properties: { root: { type: 'string' }, pattern: { type: 'string' } }, required: ['root', 'pattern'] },
  },
  {
    name: 'glob',
    description: '[demo-override] 文件匹配（审计版：返回真实结果 + 前缀）',
    inputSchema: { type: 'object', properties: { root: { type: 'string' }, pattern: { type: 'string' } }, required: ['root', 'pattern'] },
  },
  {
    name: 'apply_patch',
    description: '[demo-override] 应用补丁（审计版：记录但不真正应用）',
    inputSchema: { type: 'object', properties: { path: { type: 'string' }, patch: { type: 'string' } }, required: ['path', 'patch'] },
  },
]

function executeTool(name, args) {
  switch (name) {
    case 'read_file': {
      try {
        const content = fs.readFileSync(args.path, 'utf8')
        const limit = args.limit ? content.slice(0, args.limit) : content
        return { text: `[demo-override] 读取成功（${content.length} 字节）\n${limit}` }
      } catch (e) { return { error: e.message } }
    }
    case 'write_file':
      return { text: `[demo-override] 写入请求已记录（${args.content?.length || 0} 字节），未真正写入` }
    case 'edit_file':
      return { text: `[demo-override] 编辑请求已记录，未真正编辑` }
    case 'list_directory': {
      try {
        const entries = fs.readdirSync(args.path, { withFileTypes: true }).map(e => ({
          name: e.name, type: e.isDirectory() ? 'directory' : 'file',
        }))
        return { text: `[demo-override] 列出 ${entries.length} 个条目\n${JSON.stringify(entries, null, 2)}` }
      } catch (e) { return { error: e.message } }
    }
    case 'search_files':
    case 'glob':
      return { text: `[demo-override] 搜索/glob 已记录，返回空结果（审计模式）` }
    case 'apply_patch':
      return { text: `[demo-override] 补丁请求已记录，未真正应用` }
    default:
      return { error: `Unknown tool: ${name}` }
  }
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
    try { msg = JSON.parse(line) } catch (e) { continue }

    if (msg.method === 'initialize') {
      send({ jsonrpc: '2.0', id: msg.id, result: {
        protocolVersion: '2024-11-05', capabilities: { tools: {} },
        serverInfo: { name: 'demo-audit-fs', version: '0.1.0' },
      }})
    } else if (msg.method === 'tools/list') {
      send({ jsonrpc: '2.0', id: msg.id, result: { tools: TOOLS } })
    } else if (msg.method === 'tools/call') {
      const toolName = msg.params?.name
      const args = msg.params?.arguments || {}
      const result = executeTool(toolName, args)
      audit(toolName, args, result)
      const isError = !!result.error
      send({ jsonrpc: '2.0', id: msg.id, result: {
        content: [{ type: 'text', text: result.error ? `[demo-override] 错误: ${result.error}` : result.text }],
        isError,
      }})
    } else if (msg.id !== undefined) {
      send({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `Method not found: ${msg.method}` } })
    }
  }
})
process.stdin.on('end', () => process.exit(0))
