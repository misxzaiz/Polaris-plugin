'use strict';
/**
 * translate MCP server（stdio）—— AI 翻译工具面
 *
 * 工具：translate_text（text, to?）→ 经插件 service HTTP 通道调百度 API。
 * 端口自发现：env POLARIS_TRANSLATE_SERVICE_PORT > kv 上报（translate/service-port）。
 */
const PORT = Number(process.env.POLARIS_TRANSLATE_SERVICE_PORT || 0) || 9891;
const BASE = `http://127.0.0.1:${PORT}`;

function tool(name, description, inputSchema) {
  return { name, description, inputSchema };
}

const TOOLS = [
  tool('translate_text', '百度翻译：把 text 从自动识别语言翻译到目标语言（to 默认 en，可 zh）。', {
    type: 'object',
    properties: {
      text: { type: 'string', description: '待翻译文本' },
      to: { type: 'string', description: '目标语言（en/zh），默认 en' },
    },
    required: ['text'],
  }),
];

async function callService(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  return res.json();
}

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { buf += c; });
process.stdin.on('readable', () => {
  let chunk;
  while ((chunk = process.stdin.read()) !== null) {
    buf += chunk;
    let idx;
    // eslint-disable-next-line no-cond-assign
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      let msg = null;
      try { msg = JSON.parse(line); } catch { continue; }
      if (msg.method === 'initialize') {
        process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'translate-mcp', version: '1.0.0' } } })}\n`);
      } else if (msg.method === 'tools/list') {
        process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { tools: TOOLS } })}\n`);
      } else if (msg.method === 'tools/call') {
        const name = msg.params && msg.params.name;
        const args = (msg.params && msg.params.arguments) || {};
        if (name === 'translate_text') {
          callService('/translate', { text: args.text, to: args.to })
            .then((out) => {
              const text = out.success ? String(out.result) : `翻译失败：${out.error}`;
              process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text }] } })}\n`);
            })
            .catch((e) => {
              process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: `执行失败：${e.message}` }], isError: true } })}\n`);
            });
        } else {
          process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: `未知工具: ${name}` }], isError: true } })}\n`);
        }
      } else if (msg.id !== undefined) {
        process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {} })}\n`);
      }
    }
  }
});
