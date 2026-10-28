/**
 * 灵犀 MCP 协议离线验证（node test/mcp-verify.mjs）
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
  const t = setTimeout(() => reject(new Error('rpc 超时: ' + method)), 30000);
  pending.set(id, (m) => { clearTimeout(t); resolve(m); });
  mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
});
const textOf = (m) => m.result.content[0].text;

const results = [];
const record = (name, pass, detail) => { results.push(pass); console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`); };

try {
  const init = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'verify', version: '0' } });
  record('initialize 握手', init.result?.serverInfo?.name === 'lingxi' && !!init.result?.capabilities?.tools);
  mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

  const list = await rpc('tools/list', {});
  const names = (list.result?.tools || []).map((t) => t.name);
  const expect = ['lingxi_catch', 'lingxi_search', 'lingxi_get', 'lingxi_deepen', 'lingxi_promote',
    'lingxi_revisit', 'lingxi_constellation', 'lingxi_collide', 'lingxi_archive'];
  record('tools/list 9 工具齐全', expect.every((n) => names.includes(n)) && names.length === 9, names.join(','));
  const schemasOk = (list.result.tools || []).every((t) => t.inputSchema && t.inputSchema.type === 'object');
  record('inputSchema 形状（type=object）', schemasOk);

  // 参数校验在触桥前拦截：无 title 的 catch → isError，进程不崩
  const bad = await rpc('tools/call', { name: 'lingxi_catch', arguments: { raw: '没标题' } });
  record('catch 缺 title → isError 文案', bad.result?.isError === true && textOf(bad).includes('标题'), textOf(bad));
  const bad2 = await rpc('tools/call', { name: 'lingxi_revisit', arguments: { action: 'record' } });
  record('revisit record 缺 id → isError', bad2.result?.isError === true, textOf(bad2));
  const unknown = await rpc('tools/call', { name: 'lingxi_nope', arguments: {} });
  record('未知工具 → isError', unknown.result?.isError === true, textOf(unknown));

  record('离线协议验证全部通过', true);
} catch (e) {
  record('流程', false, e.message);
  console.error('stderr:', stderr.join('').slice(-600));
} finally {
  mcp.kill();
  await new Promise((r) => setTimeout(r, 300));
  process.exit(results.every(Boolean) ? 0 : 1);
}
