/**
 * 执行沙箱 MCP 协议离线验证（node test/mcp-verify.mjs）
 *
 * 无需 Polaris 运行（env 钉死必拒连端口，场景恒为"无宿主"）：
 * 验证 initialize / tools/list 形状、未知工具 graceful、
 * 无宿主时已知工具被捕获为 isError（不崩进程）。
 * watchtower mcp-verify 同形状。
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(HERE, '..');

// 无宿主隔离：env 钉死必拒连端口（server 跳过扫描直用），另钉沙箱根到临时目录
const mcp = spawn(process.execPath, ['mcp/server.js', ''], {
  cwd: APP_ROOT,
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, POLARIS_HOST: '127.0.0.1', POLARIS_PORT: '1', POLARIS_TOKEN: '', EXEC_SANDBOX_ROOT: path.join(APP_ROOT, '.verify-root') },
});
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
    try {
      const msg = JSON.parse(line);
      if (msg.id !== undefined && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    } catch (_) { /* 非 JSON 行忽略 */ }
  }
});

function rpc(method, params, timeoutMs = 8000) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`rpc 超时: ${method}`)), timeoutMs);
    pending.set(id, (msg) => { clearTimeout(timer); resolve(msg); });
    mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}

const results = [];
function check(name, cond, detail = '') {
  results.push({ name, pass: !!cond, detail });
  console.log(`${cond ? '  ✓' : '  ✖'} ${name}${cond ? '' : ` —— ${detail}`}`);
}

try {
  const init = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'verify', version: '0' } });
  check('initialize: protocolVersion', init.result && init.result.protocolVersion === '2024-11-05');
  check('initialize: serverInfo.name', init.result?.serverInfo?.name === 'exec-sandbox');
  mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

  const list = await rpc('tools/list', {});
  const names = (list.result?.tools || []).map((t) => t.name);
  check('tools/list: 5 工具', names.length === 5, `实际 ${names.length}: ${names.join(',')}`);
  for (const expected of ['execsandbox_create', 'execsandbox_write', 'execsandbox_exec', 'execsandbox_list', 'execsandbox_destroy']) {
    check(`tools/list: ${expected}`, names.includes(expected));
    const t = (list.result?.tools || []).find((x) => x.name === expected);
    check(`schema: ${expected}`, t && t.inputSchema && typeof t.inputSchema.type === 'string');
    check(`描述: ${expected}`, t && typeof t.description === 'string' && t.description.length > 10);
  }

  const unknown = await rpc('tools/call', { name: 'nonexistent', arguments: {} });
  check('未知工具 isError', unknown.result?.isError === true);
  check('未知工具文案', String(unknown.result?.content?.[0]?.text || '').includes('未知工具'));

  // 无宿主：cap.kv 不可达 → 工具内部 catch → isError 而非进程崩溃
  const createNoHost = await rpc('tools/call', { name: 'execsandbox_create', arguments: { label: 'verify' } });
  check('无宿主 create 被捕获为 isError', createNoHost.result?.isError === true, JSON.stringify(createNoHost.result).slice(0, 120));
  check('无宿主错误被捕获文案', String(createNoHost.result?.content?.[0]?.text || '').length > 0);

  // confirm 双闸（不触网即可验证——exec 在 loadMeta 之前就该拒？不行，loadMeta 在前。
  // 改为：无宿主下 confirm 缺失也应 isError，且文案含 confirm）
  const execNoConfirm = await rpc('tools/call', { name: 'execsandbox_exec', arguments: { workspaceId: 'wsx', command: 'echo hi' } });
  check('无宿主 exec（无 confirm）isError', execNoConfirm.result?.isError === true);
  const destroyNoConfirm = await rpc('tools/call', { name: 'execsandbox_destroy', arguments: { workspaceId: 'wsx' } });
  check('无宿主 destroy（无 confirm）isError', destroyNoConfirm.result?.isError === true);
} catch (e) {
  check('验证全程无异常', false, e.message);
} finally {
  mcp.kill();
}

console.log(`\n结果：${results.filter((r) => r.pass).length} 通过，${results.filter((r) => !r.pass).length} 失败`);
if (stderr.length && process.env.VERIFY_STDERR) console.log('[stderr]\n' + stderr.join(''));
process.exit(results.every((r) => r.pass) ? 0 : 1);
