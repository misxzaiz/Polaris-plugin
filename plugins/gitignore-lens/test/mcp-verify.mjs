/**
 * .gitignore 检查器 MCP 协议离线验证（node test/mcp-verify.mjs）
 *
 * 纯本地无宿主依赖——协议 + 真实判定语义全离线验证。
 * tools/call 参数平铺 { name, arguments }（exec-sandbox 实证坑）。
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

const results = [];
function check(name, cond, detail = '') {
  results.push({ name, pass: !!cond });
  console.log(`${cond ? '  ✓' : '  ✖'} ${name}${cond ? '' : ` —— ${detail}`}`);
}

const GI = ['*.log', '!important.log', 'build/', '!build/special.txt', '/root.txt', '**/temp'].join('\n');

try {
  const init = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'verify', version: '0' } });
  check('initialize', init.result?.serverInfo?.name === 'gitignore-lens');
  mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

  const list = await rpc('tools/list', {});
  const names = (list.result?.tools || []).map((t) => t.name);
  check('tools/list: 2 工具', names.includes('gitignorelens_check') && names.includes('gitignorelens_analyze'));

  // check：判定 + 行号 + 经典坑
  const checkRes = await rpc('tools/call', { name: 'gitignorelens_check', arguments: { gitignore: GI, paths: ['a/x.log', 'important.log', 'build/f.txt', 'build/special.txt', 'root.txt', 'sub/root.txt', 'x/y/temp', 'normal.txt'] } });
  check('check isError=false', checkRes.result?.isError === false, text(checkRes).slice(0, 150));
  check('忽略判定（a/x.log）', text(checkRes).includes('🚫 忽略 a/x.log'));
  check('复活判定（important.log）', text(checkRes).includes('✅ 保留 important.log') && text(checkRes).includes('复活'));
  check('父目录排除（build/f.txt）', text(checkRes).includes('整体排除'));
  check('经典坑 trap 标注（build/special.txt）', text(checkRes).includes('negated-under-ignored-dir') && text(checkRes).includes('build/special.txt'));
  check('锚定正确（sub/root.txt 不命中 /root.txt）', text(checkRes).includes('✅ 保留 sub/root.txt'));
  check('双星（x/y/temp）', text(checkRes).includes('🚫 忽略 x/y/temp'));

  // analyze：规则归类 + 坑检测
  const analyze = await rpc('tools/call', { name: 'gitignorelens_analyze', arguments: { gitignore: GI } });
  check('analyze isError=false', analyze.result?.isError === false, text(analyze).slice(0, 150));
  check('analyze 6 条规则', text(analyze).includes('6 条'));
  check('analyze 否定标记', text(analyze).includes('否定!'));
  check('analyze 目录标记', text(analyze).includes('目录/'));
  check('analyze 静态坑检测', text(analyze).includes('静态坑检测') && text(analyze).includes('无效') || text(analyze).includes('压住'));

  // 缺参 + 未知工具
  const noArgs = await rpc('tools/call', { name: 'gitignorelens_check', arguments: { gitignore: GI } });
  check('缺 paths isError', noArgs.result?.isError === true);
  const unknown = await rpc('tools/call', { name: 'nonexistent', arguments: {} });
  check('未知工具 isError', unknown.result?.isError === true);
} catch (e) {
  check('验证全程无异常', false, e.message);
} finally {
  mcp.kill();
}

console.log(`\n结果：${results.filter((r) => r.pass).length} 通过，${results.filter((r) => !r.pass).length} 失败`);
process.exit(results.every((r) => r.pass) ? 0 : 1);
