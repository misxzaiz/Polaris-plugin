#!/usr/bin/env node
/**
 * Demo ToolProvider Override — MCP Server
 *
 * 覆盖内置 polaris-todo MCP server。所有 todo 工具调用记录到 audit.log，
 * 返回成功（但数据是空的/占位），不真正操作 todo 存储。
 *
 * 覆盖机制：插件声明 capability: "todo" + mcpServerId: "demo-audit-todo"，
 * Polaris 解析时用此 server 替换内置 polaris-todo（server_name 改为 polaris-todo），
 * 因此 SimpleAI 的 mcp__polaris-todo__<tool> 调用会路由到这里。
 *
 * 协议：JSON-RPC 2.0 over stdin/stdout，每行一条 JSON。
 */

const fs = require('fs')
const path = require('path')

const AUDIT_LOG = path.join(__dirname, '..', 'audit.log')

/** 审计日志：追加一行 JSON */
function audit(action, args, result) {
  const entry = JSON.stringify({
    ts: new Date().toISOString(),
    action,
    args,
    result,
  })
  try {
    fs.appendFileSync(AUDIT_LOG, entry + '\n')
  } catch (e) {
    process.stderr.write(`[demo-audit-todo] 写审计日志失败: ${e.message}\n`)
  }
}

/** JSON-RPC 响应 */
function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n')
}

// 内置 polaris-todo 暴露的工具名列表（覆盖后必须同名，否则 SimpleAI 路由不到）
const TOOLS = [
  {
    name: 'list_todos',
    description: '[demo-override] 列出所有 todo（审计版：返回空列表）',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: '按状态过滤（pending/completed/all）' },
      },
    },
  },
  {
    name: 'create_todo',
    description: '[demo-override] 创建 todo（审计版：记录但不落盘）',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'todo 标题' },
        description: { type: 'string', description: 'todo 描述' },
        priority: { type: 'string', enum: ['low', 'medium', 'high'] },
      },
      required: ['title'],
    },
  },
  {
    name: 'update_todo',
    description: '[demo-override] 更新 todo（审计版：记录但不落盘）',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'todo ID' },
        title: { type: 'string' },
        description: { type: 'string' },
        priority: { type: 'string', enum: ['low', 'medium', 'high'] },
      },
      required: ['id'],
    },
  },
  {
    name: 'delete_todo',
    description: '[demo-override] 删除 todo（审计版：记录但不落盘）',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'todo ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'start_todo',
    description: '[demo-override] 开始 todo（审计版：记录但不落盘）',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'todo ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'complete_todo',
    description: '[demo-override] 完成 todo（审计版：记录但不落盘）',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'todo ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'get_workspace_breakdown',
    description: '[demo-override] 获取工作区 todo 概览（审计版：返回空结构）',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
]

/** 工具执行：全部记录审计日志，返回占位结果 */
function executeTool(name, args) {
  // 生成占位 ID
  const fakeId = `demo-${Date.now()}`
  const result = { ok: true, demoOverride: true, id: fakeId, message: `[审计版] 已记录 ${name} 调用（不真正落盘）` }

  switch (name) {
    case 'list_todos':
      return { todos: [], total: 0, message: '[审计版] 返回空 todo 列表（真实存储未操作）' }
    case 'create_todo':
      return { id: fakeId, title: args.title, created: false, message: '[审计版] 已记录创建请求，未真正创建' }
    case 'update_todo':
      return { id: args.id, updated: false, message: '[审计版] 已记录更新请求，未真正更新' }
    case 'delete_todo':
      return { id: args.id, deleted: false, message: '[审计版] 已记录删除请求，未真正删除' }
    case 'start_todo':
      return { id: args.id, started: false, message: '[审计版] 已记录开始请求，未真正开始' }
    case 'complete_todo':
      return { id: args.id, completed: false, message: '[审计版] 已记录完成请求，未真正完成' }
    case 'get_workspace_breakdown':
      return { breakdown: {}, total: 0, message: '[审计版] 返回空概览' }
    default:
      return { error: `Unknown tool: ${name}` }
  }
}

// JSON-RPC 消息处理
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
      process.stderr.write(`[demo-audit-todo] JSON 解析失败: ${e.message}\n`)
      continue
    }

    // JSON-RPC 2.0 分发
    if (msg.method === 'initialize') {
      send({
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'demo-audit-todo', version: '0.1.0' },
        },
      })
    } else if (msg.method === 'tools/list') {
      send({ jsonrpc: '2.0', id: msg.id, result: { tools: TOOLS } })
    } else if (msg.method === 'tools/call') {
      const toolName = msg.params?.name
      const args = msg.params?.arguments || {}
      const result = executeTool(toolName, args)
      audit(toolName, args, result)
      send({
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        },
      })
    } else if (msg.method === 'tools/call' || msg.method === 'shutdown') {
      send({ jsonrpc: '2.0', id: msg.id, result: {} })
    } else if (msg.id !== undefined) {
      // 未知方法但有 id：返回 method not found
      send({
        jsonrpc: '2.0',
        id: msg.id,
        error: { code: -32601, message: `Method not found: ${msg.method}` },
      })
    }
  }
})

process.stdin.on('end', () => {
  process.exit(0)
})
