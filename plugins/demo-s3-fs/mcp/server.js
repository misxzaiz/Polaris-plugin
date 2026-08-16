#!/usr/bin/env node
/**
 * Demo S3 FileSystem — MCP Server
 *
 * 模拟 S3 远程文件系统，覆盖 7 个内置 fs 工具。
 * 所有操作返回模拟的 S3 响应（不真正读写本地文件）。
 */
function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n') }

const TOOLS = [
  { name: 'read_file', description: '[s3] 从 S3 读取对象（模拟）', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
  { name: 'write_file', description: '[s3] 上传对象到 S3（模拟）', inputSchema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } },
  { name: 'edit_file', description: '[s3] 编辑 S3 对象（模拟）', inputSchema: { type: 'object', properties: { path: { type: 'string' }, old_text: { type: 'string' }, new_text: { type: 'string' } }, required: ['path', 'old_text', 'new_text'] } },
  { name: 'list_directory', description: '[s3] 列出 S3 bucket 前缀（模拟）', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
  { name: 'search_files', description: '[s3] S3 搜索（模拟）', inputSchema: { type: 'object', properties: { root: { type: 'string' }, pattern: { type: 'string' } }, required: ['root', 'pattern'] } },
  { name: 'glob', description: '[s3] S3 glob（模拟）', inputSchema: { type: 'object', properties: { root: { type: 'string' }, pattern: { type: 'string' } }, required: ['root', 'pattern'] } },
  { name: 'apply_patch', description: '[s3] S3 应用补丁（模拟）', inputSchema: { type: 'object', properties: { path: { type: 'string' }, patch: { type: 'string' } }, required: ['path', 'patch'] } },
]

function executeTool(name, args) {
  switch (name) {
    case 'read_file':
      return `[s3] GET s3://bucket${args.path} → 200 OK\nContent-Length: ${args.path.length}\nETag: "abc123"\n\n[模拟远程内容：${args.path} 的对象数据]`
    case 'write_file':
      return `[s3] PUT s3://bucket${args.path} → 200 OK\n上传成功，对象大小：${args.content?.length || 0} 字节\nETag: "def456"\n版本 ID: v1`
    case 'edit_file':
      return `[s3] 编辑 s3://bucket${args.path} → 已更新对象（版本 v2）`
    case 'list_directory':
      return `[s3] LIST s3://bucket${args.path}/\n对象数: 2\n- ${args.path}/file1.txt (128 bytes)\n- ${args.path}/file2.json (256 bytes)`
    case 'search_files':
    case 'glob':
      return `[s3] 搜索 s3://bucket${args.root}/ pattern=${args.pattern}\n匹配: 0 个对象（模拟空结果）`
    case 'apply_patch':
      return `[s3] 补丁已应用 s3://bucket${args.path} → 版本 v3`
    default:
      return `[s3] 未知工具: ${name}`
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
        serverInfo: { name: 's3-fs', version: '0.1.0' },
      }})
    } else if (msg.method === 'tools/list') {
      send({ jsonrpc: '2.0', id: msg.id, result: { tools: TOOLS } })
    } else if (msg.method === 'tools/call') {
      const result = executeTool(msg.params?.name, msg.params?.arguments || {})
      send({ jsonrpc: '2.0', id: msg.id, result: {
        content: [{ type: 'text', text: result }],
      }})
    } else if (msg.id !== undefined) {
      send({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `Method not found: ${msg.method}` } })
    }
  }
})
process.stdin.on('end', () => process.exit(0))
