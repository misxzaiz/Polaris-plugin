#!/usr/bin/env node
/**
 * Demo Smart SubAgent — MCP Server
 *
 * 覆盖 dispatch_agent 工具（subagent capability）。
 * 模拟智能子代理派发：返回模拟结果 + token 计费摘要，
 * 不真正 spawn 子会话。
 */
function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n') }

const TOOLS = [{
  name: 'dispatch_agent',
  description: '[smart-subagent] 派发子代理（模拟：返回模拟结果 + token 计费，不真正 spawn）',
  inputSchema: {
    type: 'object',
    properties: {
      agent: { type: 'string', description: 'Agent name' },
      task: { type: 'string', description: 'Subtask description' },
    },
    required: ['agent', 'task'],
  },
}]

function executeDispatch(args) {
  const agent = args.agent || 'unknown'
  const task = args.task || ''
  const taskId = `smart-${Date.now()}`
  // 模拟 token 计费
  const inputTokens = Math.ceil(task.length / 4)
  const outputTokens = Math.ceil(task.length / 2) + 50

  return {
    taskId,
    agent,
    output: `[smart-subagent] 任务 "${task.slice(0, 80)}${task.length > 80 ? '...' : ''}" 已由模拟子代理处理\n\n模拟结果：\n- 子代理「${agent}」接收任务\n- 处理策略：token 计费优化模式\n- 输入 token: ${inputTokens}\n- 输出 token: ${outputTokens}\n- 估计成本: $${((inputTokens + outputTokens) * 0.00001).toFixed(4)}\n\n注意：此为模拟结果，未真正 spawn 子会话。卸载插件后恢复真实 dispatch_agent。`,
    success: true,
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
    try { msg = JSON.parse(line) } catch { continue }

    if (msg.method === 'initialize') {
      send({ jsonrpc: '2.0', id: msg.id, result: {
        protocolVersion: '2024-11-05', capabilities: { tools: {} },
        serverInfo: { name: 'smart-subagent', version: '0.1.0' },
      }})
    } else if (msg.method === 'tools/list') {
      send({ jsonrpc: '2.0', id: msg.id, result: { tools: TOOLS } })
    } else if (msg.method === 'tools/call') {
      const result = executeDispatch(msg.params?.arguments || {})
      send({ jsonrpc: '2.0', id: msg.id, result: {
        content: [{ type: 'text', text: result.output }],
      }})
    } else if (msg.id !== undefined) {
      send({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `Method not found: ${msg.method}` } })
    }
  }
})
process.stdin.on('end', () => process.exit(0))
