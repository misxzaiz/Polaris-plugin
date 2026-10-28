/**
 * 守望台 MCP 协议离线验证（node test/mcp-verify.mjs）
 *
 * 无需 Polaris 运行：验证 initialize / tools/list 协议形状、
 * 未知工具 graceful 错误、已知工具在无宿主触达 bridge 前被捕获（不崩）。
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(HERE, '..');

// 无宿主隔离（回归）：曾直接 spawn——本机若有运行中的 Polaris，端口扫描会真连上
// 真宿主：工具真执行、"无宿主 isError"断言失败，还会向真实账本写 +1（测试污染）。
// 现在 env 钉死到一个必拒连的端口（ENV 存在时 server 跳过扫描直用），场景恒为"无宿主"。
const mcp = spawn(process.execPath, ['mcp/server.js', ''], {
  cwd: APP_ROOT,
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, POLARIS_HOST: '127.0.0.1', POLARIS_PORT: '1', POLARIS_TOKEN: '' },
});
const stderr = [];
mcp.stderr.on('data', (c) => stderr.push(String(c)));

let buf = '';
const pending = new Map();
let nextId = 1;
mcp.stdout.setEncoding('utf8');
mcp.stdout.on('data', (c) => {
  buf += c;
  while (true) {
    const i = buf.indexOf('\n');
    if (i === -1) break;
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    const p = pending.get(msg.id);
    if (p) { pending.delete(msg.id); p(msg); }
  }
});
const rpc = (method, params) => new Promise((resolve, reject) => {
  const id = nextId++;
  const t = setTimeout(() => reject(new Error('rpc 超时: ' + method)), 8000);
  pending.set(id, (m) => { clearTimeout(t); resolve(m); });
  mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
});
const textOf = (m) => m.result.content[0].text;

// ── 断言工具 ───────────────────────────────────────────────────────────────
let failed = 0;
const okCount = { n: 0 };
function ok(name) { okCount.n++; console.log(`  ✓ ${name}`); }
function bad(name, detail) { failed++; console.error(`  ✗ ${name}${detail ? '\n    ' + detail : ''}`); }
function eq(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) ok(name); else bad(name, `期望 ${e}，实得 ${a}`);
}

// ── 测试 ───────────────────────────────────────────────────────────────────
const run = async () => {
  // 0) initialize
  const init = await rpc('initialize', {});
  eq('initialize 协议版本', init.result?.protocolVersion?.slice(0, 4), '2024');
  eq('initialize capabilities', init.result?.capabilities, { tools: {} });
  eq('initialize serverInfo.name', init.result?.serverInfo?.name, 'watchtower');
  ok('initialize serverInfo.version 非空: ' + (init.result?.serverInfo?.version || ''));

  // 1) tools/list
  const list = await rpc('tools/list', {});
  const tools = list.result?.tools || [];
  const names = tools.map((t) => t.name);
  const expected = [
    'watchtower_usage_stats',
    'watchtower_plugin',
    'watchtower_report_usage',
    'watchtower_service_status',
    'watchtower_service_start',
    'watchtower_service_stop',
    'watchtower_service_restart',
    'watchtower_cold_plugins',
    'watchtower_uninstall',
  ];
  const missing = expected.filter((n) => !names.includes(n));
  eq(`tools/list 工具数 (${tools.length})`, missing.length, 0);
  for (const t of tools) {
    if (typeof t.description === 'string' && t.description.length > 10) ok(`描述: ${t.name}`);
    else bad(`描述过短: ${t.name}`, String(t.description).slice(0, 40));
    if (t.inputSchema && typeof t.inputSchema === 'object') ok(`schema: ${t.name}`);
    else bad(`缺 inputSchema: ${t.name}`);
  }

  // 2) 未知工具 → isError
  const unknown = await rpc('tools/call', { name: 'nope_xyz', arguments: {} });
  eq('未知工具 isError', unknown.result?.isError, true);
  if (textOf(unknown).includes('未知工具')) ok('未知工具错误文案'); else bad('未知工具错误文案', textOf(unknown));

  // 3) 无宿主时已知工具被捕获（不崩）：resolveEndpoint 端口扫描会失败，最终抛错包成 isError
  const nohost = await rpc('tools/call', { name: 'watchtower_usage_stats', arguments: {} });
  eq('无宿主已知工具被包为 isError', nohost.result?.isError, true);
  if (textOf(nohost).includes('执行失败')) ok('无宿主错误被捕获文案'); else bad('无宿主错误被捕获文案', textOf(nohost));

  // 收尾
  mcp.kill();
  console.log(`\n结果：${okCount.n} 通过，${failed} 失败`);
  process.exit(failed === 0 ? 0 : 1);
};

run().catch((e) => {
  console.error('测试运行失败：', e);
  process.stderr.write(stderr.join(''));
  mcp.kill();
  process.exit(1);
});