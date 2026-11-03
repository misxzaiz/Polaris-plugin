/**
 * URL 调试台 MCP 协议离线验证（node test/mcp-verify.mjs）
 *
 * 纯本地无宿主依赖——协议 + 真实解析语义全离线验证。
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

try {
  const init = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'verify', version: '0' } });
  check('initialize', init.result?.serverInfo?.name === 'url-lens');
  mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

  const list = await rpc('tools/list', {});
  const names = (list.result?.tools || []).map((t) => t.name);
  check('tools/list: 3 工具', names.length === 3 && names.includes('urllens_parse') && names.includes('urllens_build') && names.includes('urllens_decode'), names.join(','));

  // parse：结构 + 重复键警告
  const parse = await rpc('tools/call', { name: 'urllens_parse', arguments: { url: 'https://api.example.com:8443/v1/users?tag=a&tag=b&empty=#top' } });
  check('parse isError=false', parse.result?.isError === false, text(parse));
  check('parse 结构分解', text(parse).includes('api.example.com') && text(parse).includes('8443') && text(parse).includes('/v1/users'));
  check('parse 重复键警告', text(parse).includes('重复键') && text(parse).includes('tag'));
  check('parse 空值标注', text(parse).includes('(空值)'));
  check('parse fragment', text(parse).includes('#top'));

  // parse 非法 URL
  const bad = await rpc('tools/call', { name: 'urllens_parse', arguments: { url: 'not a url' } });
  check('非法 URL isError', bad.result?.isError === true && text(bad).includes('语法错误'));

  // build：重建 + round-trip
  const build = await rpc('tools/call', {
    name: 'urllens_build',
    arguments: { spec: { protocol: 'https', hostname: 'x.com', pathname: '/s', params: [{ name: 'q', value: 'a b&c' }, { name: 'tag', value: 't' }], hash: 'frag' } },
  });
  check('build isError=false', build.result?.isError === false, text(build));
  check('build URL 含编码与 hash', text(build).includes('q=a+b%26c') && text(build).includes('#frag'), text(build));

  // decode：raw vs 解码对照
  const decode = await rpc('tools/call', { name: 'urllens_decode', arguments: { url: 'https://x.com/a%20b/c+d?q=1%2B2&s=x+y' } });
  check('decode isError=false', decode.result?.isError === false, text(decode));
  check('decode raw/decoded 对照（%2B → +）', text(decode).includes('1%2B2') && text(decode).includes('1+2'));
  check('decode + → 空格对照', text(decode).includes('x+y') && text(decode).includes('x y'));
  check('decode 路径 + 字面量标注', text(decode).includes('+ 不转空格'));

  // 缺参 + 未知工具
  const noArgs = await rpc('tools/call', { name: 'urllens_parse', arguments: {} });
  check('缺 url isError', noArgs.result?.isError === true);
  const unknown = await rpc('tools/call', { name: 'nonexistent', arguments: {} });
  check('未知工具 isError', unknown.result?.isError === true);
} catch (e) {
  check('验证全程无异常', false, e.message);
} finally {
  mcp.kill();
}

console.log(`\n结果：${results.filter((r) => r.pass).length} 通过，${results.filter((r) => !r.pass).length} 失败`);
process.exit(results.every((r) => r.pass) ? 0 : 1);
