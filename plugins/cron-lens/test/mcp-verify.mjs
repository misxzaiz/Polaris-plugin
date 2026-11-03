/**
 * cron-lens MCP 协议离线验证（node test/mcp-verify.mjs）
 *
 * 纯本地无宿主依赖——stdio JSON-RPC 握手 + 三工具真实调用全离线验证。
 * tools/call 参数平铺 { name, arguments }（exec-sandbox 实证坑：双重包裹会变成
 * "未知工具：undefined"）。
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(HERE, '..');

const mcp = spawn(process.execPath, ['mcp/server.js'], {
  cwd: APP_ROOT,
  stdio: ['pipe', 'pipe', 'pipe'],
});
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
    } catch (_) { /* ignore */ }
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

function text(res) {
  return String(res.result?.content?.[0]?.text || '');
}

// 通知无 id、服务端不回包——只能写不能等（rpc() 会永久挂起）
function notify(method, params) {
  mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
}

const results = [];
function check(name, cond, detail = '') {
  results.push({ name, pass: !!cond });
  console.log(`${cond ? '  ✓' : '  ✖'} ${name}${cond ? '' : ` —— ${detail}`}`);
}

let failed = 0;
let harnessError = false;
try {
  const init = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'verify', version: '0' } });
  check('initialize: serverInfo.name=cron-lens', init.result?.serverInfo?.name === 'cron-lens');
  notify('notifications/initialized', {});

  const list = await rpc('tools/list', {});
  const names = (list.result?.tools || []).map((t) => t.name);
  check('tools/list: 恰好三工具', JSON.stringify(names) === JSON.stringify(['cron_lens_explain', 'cron_lens_next', 'cron_lens_match']), `实际 ${names.join(',')}`);
  check('tools/list: schema 均 required expression', (list.result?.tools || []).every((t) => JSON.stringify(t.inputSchema.required).includes('expression')));

  const ex1 = await rpc('tools/call', { name: 'cron_lens_explain', arguments: { expression: '*/15 * * * *' } });
  check('explain */15: 无错误', ex1.result?.isError === false);
  check('explain */15: 含字段解释', text(ex1).includes('字段解释'), text(ex1).slice(0, 120));
  check('explain */15: 中文解释「每 15 分钟」', text(ex1).includes('每 15 分钟'));

  const ex2 = await rpc('tools/call', { name: 'cron_lens_explain', arguments: { expression: '0 0 30 2 *' } });
  check('explain 2月30: 永不触发警示', text(ex2).includes('永不触发'));

  const ex3 = await rpc('tools/call', { name: 'cron_lens_explain', arguments: { expression: '0 0 1 * 1' } });
  check('explain 日+周: OR 语义警示', text(ex3).includes('「或」'));

  const ex4 = await rpc('tools/call', { name: 'cron_lens_explain', arguments: { expression: 'abc' } });
  check('explain 乱输入: isError 且有原因', ex4.result?.isError === true && text(ex4).length > 0);

  const nx1 = await rpc('tools/call', { name: 'cron_lens_next', arguments: { expression: '0 0 29 2 *', from: '2026-01-01 00:00', count: 1 } });
  check('next 2月29: 落 2028 闰年', text(nx1).includes('2028-02-29'), text(nx1));

  const nx2 = await rpc('tools/call', { name: 'cron_lens_next', arguments: { expression: '*/15 * * * *', from: '1764883200000', count: 3, tzOffsetMinutes: 480 } });
  check('next epoch 起点+偏移: 输出含 UTC+8 与 3 行', text(nx2).includes('UTC+8') && (text(nx2).match(/epoch=/g) || []).length === 3, text(nx2));

  const nx3 = await rpc('tools/call', { name: 'cron_lens_next', arguments: { expression: '0 0 1 * 1', from: '2026-01-01 00:00' } });
  check('next OR 表达式: 头部带警示', text(nx3).startsWith('⚠'), text(nx3).slice(0, 80));

  const mt1 = await rpc('tools/call', { name: 'cron_lens_match', arguments: { expression: '*/15 * * * *', at: ['2026-01-01 00:00', '2026-01-01 00:07'] } });
  check('match: 命中与未命中各一行', text(mt1).includes('命中') && text(mt1).includes('未命中'), text(mt1));
  check('match: 首因=分钟', text(mt1).includes('首因「分钟」'), text(mt1));

  const mt2 = await rpc('tools/call', { name: 'cron_lens_match', arguments: { expression: '*/15 * * * *', at: [] } });
  check('match 空 at: isError', mt2.result?.isError === true);

  const mt3 = await rpc('tools/call', { name: 'cron_lens_match', arguments: { expression: '*/15 * * * *', at: Array.from({ length: 21 }, () => '2026-01-01 00:00') } });
  check('match 超 20 个: isError', mt3.result?.isError === true);

  const bad = await rpc('tools/call', { name: 'cron_lens_no_such', arguments: {} });
  check('未知工具: isError 未知工具', bad.result?.isError === true && text(bad).includes('未知工具'));

  const mth = await rpc('tools/call', { name: 'cron_lens_next', arguments: { expression: '0 9 * * 1-5', from: 'garbage' } });
  check('next 非法 from: isError 且提示格式', mth.result?.isError === true && text(mth).includes('无法识别'));
} catch (e) {
  harnessError = true;
  console.error('  ✖ harness 异常:', e.message);
} finally {
  mcp.kill();
  failed = results.filter((r) => !r.pass).length + (harnessError ? 1 : 0);
  const total = results.length + (harnessError ? 1 : 0);
  console.log(`\nMCP 冒烟: ${total - failed}/${total} 通过`);
  process.exitCode = failed ? 1 : 0;
}
