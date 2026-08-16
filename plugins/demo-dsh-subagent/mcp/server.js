#!/usr/bin/env node
/**
 * Demo DSH SubAgent — MCP Server
 *
 * 覆盖 dispatch_agent 工具，模拟 DSH（DeepSeek Harness）子代理派发。
 * DSH 的 subagent provider 支持 spawn（全新子代理）和 fork（复用历史分支）两种模式。
 * 此 demo 返回模拟响应，不真正调用 DSH CLI（需 `npm install -g @deepseek-ai/dsh`）。
 */
function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n') }

const TOOLS = [{
  name: 'dispatch_agent',
  description: '[dsh-subagent] 通过 DeepSeek Harness spawn/fork provider 派发子代理（模拟）',
  inputSchema: {
    type: 'object',
    properties: {
      agent: { type: 'string', description: 'Agent name' },
      task: { type: 'string', description: 'Subtask description' },
    },
    required: ['agent', 'task'],
  },
}]

function executeDsh(args) {
  const agent = args.agent || 'unknown'
  const task = args.task || ''
  const sessionId = `dsh-${Date.now()}`
  const mode = task.length > 200 ? 'fork' : 'spawn' // 模拟 DSH 模式选择

  return `[dsh-subagent] 已通过 DeepSeek Harness ${mode} provider 派发子代理

DSH 会话 ID: ${sessionId}
Agent: ${agent}
派发模式: ${mode}（spawn=全新子代理 / fork=复用历史分支）
任务摘要: ${task.slice(0, 100)}${task.length > 100 ? '...' : ''}

模拟结果：
- DSH subagent provider 已接收任务
- 子代理在独立会话上下文中运行
- 完成后结果回流到父会话

注意：此为模拟响应。若要使用真实 DSH 子代理，需安装 DSH：
  npm install -g @deepseek-ai/dsh

卸载此插件后恢复内置 dispatch_agent。`
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
        serverInfo: { name: 'dsh-subagent', version: '0.1.0' },
      }})
    } else if (msg.method === 'tools/list') {
      send({ jsonrpc: '2.0', id: msg.id, result: { tools: TOOLS } })
    } else if (msg.method === 'tools/call') {
      const result = executeDsh(msg.params?.arguments || {})
      send({ jsonrpc: '2.0', id: msg.id, result: {
        content: [{ type: 'text', text: result }],
      }})
    } else if (msg.id !== undefined) {
      send({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `Method not found: ${msg.method}` } })
    }
  }
})
process.stdin.on('end', () => process.exit(0))
