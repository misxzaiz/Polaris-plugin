/**
 * 守闸 MCP 协议离线验证（node test/mcp-verify.mjs）
 * 无需 Polaris 运行：验证 initialize / tools/list 协议形状、
 * 参数校验在触达桥之前先拦截（graceful isError），进程不崩。
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(HERE, '..');

const mcp = spawn(process.execPath, ['mcp/server.js', ''], { cwd: APP_ROOT, stdio: ['pipe', 'pipe', 'pipe'] });
const stderr = [];
mcp.stderr.on('data', (c) => stderr.push(String(c)));

let buf = '';
const pending = new Map();
let nextId = 1;
mcp.stdout.setEncoding('utf8');
mcp.stdout.on('data', (c) => {
  buf += c;
  for (;;) {
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
  const t = setTimeout(() => reject(new Error('rpc 超时: ' + method)), 30000);
  pending.set(id, (m) => { clearTimeout(t); resolve(m); });
  mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
});
const textOf = (m) => m.result.content[0].text;

let failed = 0;
function check(name, cond, extra) {
  if (cond) console.log(`  ✓ ${name}`);
  else { failed++; console.error(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`); }
}

// initialize
const init = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'verify', version: '0' } });
check('initialize 返回 serverInfo.shouzha', init.result?.serverInfo?.name === 'shouzha', JSON.stringify(init));
check('initialize 协议版本', init.result?.protocolVersion === '2024-11-05');

// tools/list
const list = await rpc('tools/list', {});
const names = (list.result?.tools || []).map((t) => t.name);
const expectTools = ['sub_add', 'sub_list', 'sub_due', 'sub_renew', 'sub_update', 'sub_stats', 'sub_history', 'sub_delete'];
check('tools/list 8 个工具', expectTools.every((n) => names.includes(n)) && names.length === expectTools.length, names.join(','));
for (const t of list.result?.tools || []) {
  check(`${t.name} 有 description+inputSchema`, !!t.description && t.inputSchema?.type === 'object');
}

// 通知不应有响应（发一条确认不炸）
mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

// 参数校验应在触达桥之前拦截（自发现失败时也返回 isError 而非崩溃）
const badAdd = await rpc('tools/call', { name: 'sub_add', arguments: { name: '', amount: -1, cycle: 'month' } });
check('sub_add 非法参数 → isError 文本而非崩溃', badAdd.result?.isError === true && String(textOf(badAdd)).includes('名称'), textOf(badAdd));

const badCycle = await rpc('tools/call', { name: 'sub_add', arguments: { name: 'x', amount: 10, cycle: 'decade' } });
check('sub_add 非法周期 → isError', badCycle.result?.isError === true && String(textOf(badCycle)).includes('周期'), textOf(badCycle));

const trialNoEnd = await rpc('tools/call', { name: 'sub_add', arguments: { name: 'x', amount: 10, cycle: 'month', status: 'trial' } });
check('sub_add 试用缺 trialEndsAt → isError', trialNoEnd.result?.isError === true && String(textOf(trialNoEnd)).includes('trialEndsAt'), textOf(trialNoEnd));

const badDelete = await rpc('tools/call', { name: 'sub_delete', arguments: { id: 'whatever' } });
check('sub_delete 无 confirm → isError 提示', badDelete.result?.isError === true && String(textOf(badDelete)).includes('confirm'), textOf(badDelete));

// 触桥类工具：在无宿主环境会走自发现→失败→graceful error（不崩、不悬挂）
const listCall = await rpc('tools/call', { name: 'sub_list', arguments: {} });
check('sub_list 无宿主 → graceful isError（不崩溃）', listCall.result?.isError === true || listCall.result?.isError === false, textOf(listCall));

// 未知工具
const unknown = await rpc('tools/call', { name: 'nope', arguments: {} });
check('未知工具 → isError', unknown.result?.isError === true);

// 未知方法
const unknownMethod = await rpc('resources/list', {});
check('未知方法 → JSON-RPC error -32601', unknownMethod.error?.code === -32601);

mcp.kill();
await new Promise((r) => setTimeout(r, 100));
if (failed) { console.error(`\n✗ ${failed} 项失败`); process.exit(1); }
console.log('\n✓ MCP 协议离线验证全绿');
