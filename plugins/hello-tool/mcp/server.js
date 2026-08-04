#!/usr/bin/env node
// 最小 MCP Server：JSON-RPC 2.0 over stdin/stdout
// 贡献工具：echo(text) -> 原样回显
function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n') }

const tools = [{
  name: 'echo',
  description: '回显输入文本（示例工具）',
  inputSchema: {
    type: 'object',
    properties: { text: { type: 'string', description: '输入文本' } },
    required: ['text']
  }
}]

let buf = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', chunk => {
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
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'hello-tool', version: '1.0.0' }
      }})
    } else if (msg.method === 'tools/list') {
      send({ jsonrpc: '2.0', id: msg.id, result: { tools } })
    } else if (msg.method === 'tools/call') {
      const args = msg.params?.arguments || {}
      send({ jsonrpc: '2.0', id: msg.id, result: {
        content: [{ type: 'text', text: `[hello-tool] echo: ${args.text ?? ''}` }]
      }})
    }
  }
})
