/**
 * Shell 转义对照台 MCP 协议离线验证（node test/mcp-verify.mjs）
 *
 * 纯本地无宿主依赖——协议 + 真实引用/解析语义全离线验证。
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

const DANGEROUS = 'say $HOME `id` "quoted" | stop';

try {
  const init = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'verify', version: '0' } });
  check('initialize', init.result?.serverInfo?.name === 'shell-escape-lens');
  mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

  const list = await rpc('tools/list', {});
  const names = (list.result?.tools || []).map((t) => t.name);
  check('tools/list: 2 工具', names.includes('shellescape_quote') && names.includes('shellescape_parse'));

  // quote：三 shell 对照 + 特殊字符表
  const quote = await rpc('tools/call', { name: 'shellescape_quote', arguments: { text: DANGEROUS } });
  check('quote isError=false', quote.result?.isError === false, text(quote).slice(0, 150));
  check('quote 三 shell 形态', text(quote).includes('bash:') && text(quote).includes('powershell:') && text(quote).includes('cmd:'));
  check('quote 特殊字符表', text(quote).includes('$') && text(quote).includes('|') && text(quote).includes('语义'));

  // parse：bash 分词还原
  const parse = await rpc('tools/call', { name: 'shellescape_parse', arguments: { line: 'echo "hello world" plain', shell: 'bash' } });
  check('parse isError=false', parse.result?.isError === false, text(parse));
  check('parse 参数还原', text(parse).includes('hello world') && text(parse).includes('3 个参数'));

  // parse：未闭合引号报错
  const unclosed = await rpc('tools/call', { name: 'shellescape_parse', arguments: { line: "echo 'unclosed", shell: 'bash' } });
  check('未闭合引号 isError', unclosed.result?.isError === true && text(unclosed).includes('未闭合'));

  // parse：不支持的 shell
  const badShell = await rpc('tools/call', { name: 'shellescape_parse', arguments: { line: 'x', shell: 'fish' } });
  check('不支持 shell isError', badShell.result?.isError === true && text(badShell).includes('不支持'));

  // 缺参 + 未知工具
  const noArgs = await rpc('tools/call', { name: 'shellescape_quote', arguments: {} });
  check('缺 text isError', noArgs.result?.isError === true);
  const unknown = await rpc('tools/call', { name: 'nonexistent', arguments: {} });
  check('未知工具 isError', unknown.result?.isError === true);
} catch (e) {
  check('验证全程无异常', false, e.message);
} finally {
  mcp.kill();
}

console.log(`\n结果：${results.filter((r) => r.pass).length} 通过，${results.filter((r) => !r.pass).length} 失败`);
process.exit(results.every((r) => r.pass) ? 0 : 1);
