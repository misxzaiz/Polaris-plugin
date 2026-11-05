/**
 * LLM 文本切块台 MCP 协议离线验证（node test/mcp-verify.mjs）
 *
 * 纯本地无宿主依赖——协议 + 真实切块语义全离线验证。
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

const LONG_DOC = Array.from({ length: 20 }, (_, i) => `第${i}段：这是一段比较长的测试内容，用来验证切块功能是否正常工作。它包含足够的字符数来超过默认的 token 上限，从而触发多块切分。`).join('\n\n');

try {
  const init = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'verify', version: '0' } });
  check('initialize', init.result?.serverInfo?.name === 'text-chunker');
  mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

  const list = await rpc('tools/list', {});
  const names = (list.result?.tools || []).map((t) => t.name);
  check('tools/list: 2 工具', names.includes('textchunk_split') && names.includes('textchunk_count'));

  // split：多块 + 上限约束
  const split = await rpc('tools/call', { name: 'textchunk_split', arguments: { text: LONG_DOC, maxTokens: 300 } });
  check('split isError=false', split.result?.isError === false, text(split).slice(0, 150));
  check('split 多块', text(split).includes('共 ') && !text(split).includes('共 1 块'), text(split).slice(0, 120));
  check('split 估算声明', text(split).includes('非精确 tokenizer'));

  // count_only：只统计
  const co = await rpc('tools/call', { name: 'textchunk_split', arguments: { text: LONG_DOC, maxTokens: 300, countOnly: true } });
  check('count_only 不返回全文', text(co).includes('各块 tokens') && !text(co).includes('第0段'), text(co).slice(0, 150));

  // count：快速预算
  const count = await rpc('tools/call', { name: 'textchunk_count', arguments: { text: '中文字符测试' } });
  check('count isError=false', count.result?.isError === false, text(count));
  check('count 含估算声明', text(count).includes('非精确'));

  // 短文单块
  const short = await rpc('tools/call', { name: 'textchunk_split', arguments: { text: '短文本' } });
  check('短文单块', text(short).includes('共 1 块'));

  // 缺参 + 未知工具
  const noArgs = await rpc('tools/call', { name: 'textchunk_split', arguments: {} });
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
