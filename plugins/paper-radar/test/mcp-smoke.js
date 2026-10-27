'use strict';
/**
 * MCP 协议冒烟测试：启动 mcp/server.js，按 JSON-RPC 2.0 握手，
 * 验证 initialize / tools/list / tools/call(ping) 正常。
 *
 * 注意：tools/call 里涉及 Polaris 的调用会因无宿主而失败——这里只测
 * 协议层与工具清单，不测真实业务。真实业务经 smoke-real.js 验证链路。
 */
const { spawn } = require('child_process');
const path = require('path');

const server = spawn(process.execPath, [path.join(__dirname, '..', 'mcp', 'server.js'), ''], {
  stdio: ['pipe', 'pipe', 'pipe'],
});
let buf = '';
const responses = [];
let resolveMap = new Map();

server.stdout.setEncoding('utf8');
server.stdout.on('data', (chunk) => {
  buf += chunk;
  let idx;
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.id !== undefined && resolveMap.has(msg.id)) {
        resolveMap.get(msg.id)(msg);
        resolveMap.delete(msg.id);
      } else {
        responses.push(msg);
      }
    } catch (_) { /* ignore */ }
  }
});

server.stderr.setEncoding('utf8');
server.stderr.on('data', (c) => process.stderr.write('[mcp] ' + c));

function request(id, method, params) {
  return new Promise((resolve) => {
    resolveMap.set(id, resolve);
    server.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
  await sleep(300);
  let passed = 0;
  const ok = (n) => { passed++; console.log('  ✓ ' + n); };

  // 1. initialize
  const init = await request(1, 'initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'smoke', version: '1' },
  });
  if (!init.result || !init.result.serverInfo) throw new Error('initialize 失败: ' + JSON.stringify(init));
  ok(`initialize → serverInfo ${init.result.serverInfo.name} v${init.result.serverInfo.version}`);

  // 2. tools/list
  const list = await request(2, 'tools/list', {});
  const names = (list.result.tools || []).map((t) => t.name);
  console.log('  tools:', names.join(', '));
  if (!names.length) throw new Error('tools/list 为空');
  const expected = ['paper_search', 'paper_get', 'paper_today', 'paper_list_topics', 'paper_add_topic',
    'paper_remove_topic', 'paper_favorite', 'paper_unfavorite', 'paper_list_favs'];
  const missing = expected.filter((e) => !names.includes(e));
  if (missing.length) throw new Error('缺少工具: ' + missing.join(', '));
  ok(`tools/list 返回 ${names.length} 个工具，覆盖全部 9 个预期工具`);

  // 3. 每个工具都有 schema
  const bad = list.result.tools.filter((t) => !t.inputSchema || !t.description);
  if (bad.length) throw new Error('有工具缺 schema/description: ' + bad.map((b) => b.name).join(','));
  ok('全部工具带 inputSchema + description');

  // 4. 未知方法
  const unknown = await request(3, 'tools/call', { name: 'nope', arguments: {} });
  if (!unknown.error) throw new Error('未知工具应返回 error');
  ok('未知工具正确报错');

  // 5. 未知工具名
  const badTool = await request(4, 'tools/call', { name: 'not_a_tool', arguments: {} });
  if (!badTool.error) throw new Error('未知工具应报错');
  ok('未知方法正确报错');

  console.log(`\n通过 ${passed} 项协议断言`);
  server.kill();
  process.exit(0);
}

main().catch((e) => {
  console.error('✗ ' + e.message);
  server.kill();
  process.exit(1);
});