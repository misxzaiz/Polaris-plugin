/**
 * 正则调试台 MCP 协议离线验证（node test/mcp-verify.mjs）
 *
 * 纯本地检测无宿主依赖——initialize/tools/list/未知工具/真实检测全可离线验证。
 * exec-sandbox 同形状（tools/call 参数平铺 { name, arguments }，勿双重包裹）。
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
    } catch (_) { /* ignore */ }
  }
});

function rpc(method, params, timeoutMs = 15000) {
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
  check('initialize: protocolVersion', init.result?.protocolVersion === '2024-11-05');
  check('initialize: serverInfo.name', init.result?.serverInfo?.name === 'regex-desk');
  mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

  const list = await rpc('tools/list', {});
  const names = (list.result?.tools || []).map((t) => t.name);
  check('tools/list: 4 工具', names.length === 4, `实际 ${names.join(',')}`);
  check('tools/list: test', names.includes('regexdesk_test'));
  check('tools/list: redos', names.includes('regexdesk_redos'));
  check('tools/list: explain', names.includes('regexdesk_explain'));
  check('tools/list: replace', names.includes('regexdesk_replace'));

  // test：命名组真实匹配
  const t1 = await rpc('tools/call', { name: 'regexdesk_test', arguments: { pattern: '(?<user>[\\w.-]+)@(?<host>[\\w.]+)', flags: 'g', text: '联系 a@b.com 或 c.d@e.org' } });
  check('test: isError=false', t1.result?.isError === false, text(t1));
  check('test: 命名组渲染', text(t1).includes('user') && text(t1).includes('b.com'), text(t1).slice(0, 150));
  check('test: 匹配 2 处', text(t1).includes('匹配 2 处'));

  // test：语法错误
  const t2 = await rpc('tools/call', { name: 'regexdesk_test', arguments: { pattern: '(?<[', text: 'x' } });
  check('test: 语法错误 isError', t2.result?.isError === true, text(t2));

  // redos：经典 ReDoS 与安全模式
  const r1 = await rpc('tools/call', { name: 'regexdesk_redos', arguments: { pattern: '(a+)+$' } });
  check('redos: (a+)+$ isError=false', r1.result?.isError === false, text(r1));
  check('redos: (a+)+$ 判 high', text(r1).includes('high'), text(r1).slice(0, 200));
  check('redos: (a+)+$ 含阶梯实测', text(r1).includes('阶梯'), text(r1).slice(0, 200));
  const r2 = await rpc('tools/call', { name: 'regexdesk_redos', arguments: { pattern: '[\\w.-]+@[\\w.]+' } });
  check('redos: email 模式 safe', r2.result?.isError === false && text(r2).includes('safe'), text(r2).slice(0, 200));
  check('redos: safe 不做实测', !text(r2).includes('实测阶梯'), text(r2).slice(0, 200));

  // explain：中文解释与语法细节
  const e1 = await rpc('tools/call', { name: 'regexdesk_explain', arguments: { pattern: '(?<user>\\w+)@' } });
  check('explain: isError=false', e1.result?.isError === false, text(e1));
  check('explain: 命名捕获组中文解释', text(e1).includes('命名捕获组「user」'), text(e1).slice(0, 200));

  // replace：计数与结果
  const p1 = await rpc('tools/call', { name: 'regexdesk_replace', arguments: { pattern: '(\\w+)@(\\w+)', flags: 'g', replacement: '$2~$1', text: 'a@b 和 c@d' } });
  check('replace: isError=false', p1.result?.isError === false, text(p1));
  check('replace: 替换 2 处', text(p1).includes('替换 2 处'), text(p1));
  check('replace: 结果正确', text(p1).includes('b~a') && text(p1).includes('d~c'), text(p1));

  // 缺参
  const miss = await rpc('tools/call', { name: 'regexdesk_test', arguments: { pattern: 'a' } });
  check('test: 缺 text isError', miss.result?.isError === true, text(miss));

  // 未知工具
  const unk = await rpc('tools/call', { name: 'regexdesk_nope', arguments: {} });
  check('未知工具 isError', unk.result?.isError === true, text(unk));

  mcp.kill();
} catch (e) {
  console.error('harness 异常:', e.message);
  mcp.kill();
  process.exit(1);
}

const pass = results.filter((r) => r.pass).length;
const fail = results.length - pass;
console.log(`\n结果：${pass} 通过，${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
